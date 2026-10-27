#!/usr/bin/env python3
"""
run_pipeline.py - Green Basket Health Services BI pipeline orchestrator (source -> staging -> warehouse).

Steps
  1. (--create-db) create database + login roles             00_create_database.sql
  2. build schemas, staging, warehouse, ETL code, views     01..10 *.sql
  3. EXTRACT: land every raw file as text in stg.*_raw       (COPY, one audit row per file)
  4. TRANSFORM + LOAD: CALL etl.sp_run_load(batch)          (05..07; same code for full and delta)
  5. RECONCILE: CALL etl.sp_reconcile(batch)                 (08)
  6. post-load optimisation (indexes, BRIN, aggregate)      (13)
  7. (--with-delta) day-2 incremental batch (1 Oct 2026): new attendances, discharge milestones,
     SCD2 versions, inferred-member completion, late IDSR reports

Usage (Windows / macOS / Linux, PostgreSQL 14+):
  pip install "psycopg[binary]" pandas openpyxl
  python run_pipeline.py --dsn "postgresql://postgres:<password>@localhost:5432/gbhs_health_dw" --create-db --with-delta
"""
from __future__ import annotations

import argparse
import csv
import gzip
import re
import sys
import time
from pathlib import Path

import pandas as pd
import psycopg

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "01_data" / "raw"
DELTA = RAW / "delta_2026-10-01"
SQL_BUILD = ["01_ddl_schemas_audit.sql", "02_ddl_staging_ref.sql", "03_ddl_warehouse.sql", "04_etl_functions.sql",
             "05_etl_transform.sql", "06_etl_load_dimensions.sql", "07_etl_load_facts.sql", "08_reconciliation.sql",
             "09_mart_views.sql", "10_security_grants.sql"]
DB_NAME = "gbhs_health_dw"


def log(msg: str):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def open_text(path: Path):
    return gzip.open(path, "rt", newline="", encoding="utf-8") if path.suffix == ".gz" else open(path, newline="", encoding="utf-8")


def copy_rows(conn, table: str, cols: list[str], rows) -> int:
    n = 0
    with conn.cursor() as cur:
        with cur.copy(f"COPY {table} ({', '.join(cols)}) FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
                n += 1
    return n


def log_extract(conn, batch: int, name: str, target: str, n: int, t0: float):
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO audit.etl_step_log (batch_id, step_name, target_table, rows_in, rows_out, rows_rejected, started_at, message)
                       VALUES (%s, %s, %s, %s, %s, 0, now() - make_interval(secs => %s), 'extract (raw text landing)')""",
                    (batch, f"extract {name}", target, n, n, time.time() - t0))


def none_if_nan(v):
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    s = str(v)
    return None if s in ("nan", "NaT", "None") else s


# --------------------------------------------------------------------------- extract
def extract_csv(conn, batch, path: Path, table: str, cols: list[str]):
    """Land a CSV (optionally gzipped) as text. Empty cells become NULL; nothing else is changed."""
    t0 = time.time()
    with open_text(path) as fh:
        reader = csv.reader(fh)
        header = next(reader)
        idx = [header.index(c) for c in cols]
        rows = ([path.name, i + 1] + [r[j] if r[j] != "" else None for j in idx] + [batch] for i, r in enumerate(reader))
        n = copy_rows(conn, table, ["source_file", "row_num"] + cols + ["batch_id"], rows)
    log_extract(conn, batch, path.name, table, n, t0)
    return n


def extract_master(conn, batch, path: Path, extract_name: str):
    t0 = time.time()
    # keep_default_na=False: pandas would otherwise turn strings such as "NA" or "N/A" into nulls (landing must be lossless)
    xl = pd.read_excel(path, sheet_name=None, dtype=str, keep_default_na=False, na_values=[""])
    total = 0

    def land(sheet, table, cols):
        nonlocal total
        if sheet not in xl:
            return
        df = xl[sheet]
        rows = [[extract_name, i + 1] + [none_if_nan(r.get(c)) for c in cols] + [batch]
                for i, r in enumerate(df.to_dict("records"))]
        total += copy_rows(conn, table, ["extract_name", "row_num"] + cols + ["batch_id"], rows)

    land("Regions", "stg.md_regions_raw", ["region_code", "region_name", "zone", "malaria_stratum", "known_aliases"])
    land("Facilities", "stg.md_facilities_raw", ["facility_code", "facility_name", "facility_type", "region", "town", "latitude",
                                                 "longitude", "elevation_m", "has_emergency_department", "catchment_share_pct",
                                                 "opened_date", "ownership"])
    land("Care_Units", "stg.md_units_raw", ["unit_code", "facility_code", "unit_name", "unit_type", "specialty", "bed_complement", "active"])
    land("Unit_History", "stg.md_unit_history_raw", ["change_id", "unit_code", "attribute", "old_value", "new_value", "effective_date",
                                                     "approved_by_role"])
    land("Triage_Scale", "stg.md_triage_raw", ["triage_code", "triage_label", "priority", "target_minutes", "target_text", "colour_hex"])
    land("ICD10_Codes", "stg.md_icd_raw", ["icd10_code", "icd10_title", "chapter", "chapter_range", "chapter_title", "block_range",
                                           "block_title", "severity_class", "default_specialty", "is_chronic_condition",
                                           "idsr_condition_code"])
    land("IDSR_Conditions", "stg.md_conditions_raw", ["condition_code", "condition_name", "idsr_category", "notification",
                                                      "alert_threshold", "icd10_codes", "known_aliases"])
    land("Payer_Classes", "stg.md_payers_raw", ["payer_code", "payer_name", "payer_group", "known_aliases"])
    land("Code_Mappings", "stg.md_code_map_raw", ["code_type", "source_value", "standard_code", "standard_description"])
    log_extract(conn, batch, path.name, "stg.md_*_raw", total, t0)


ENC_COLS = ["encounter_id", "facility_code", "department", "patient_id", "arrival_datetime", "triage_datetime", "triage_category",
            "seen_datetime", "departure_datetime", "arrival_mode", "disposition", "primary_icd10"]
SPELL_COLS = ["admission_id", "facility_code", "ward_code", "patient_id", "admission_datetime", "discharge_datetime",
              "admission_method", "discharge_status", "principal_icd10", "ed_encounter_id", "last_updated"]
PAT_COLS = ["patient_id", "sex", "birth_year", "residence_region", "payer_class", "registration_date", "last_updated"]
CHG_COLS = ["change_id", "patient_id", "attribute", "old_value", "new_value", "effective_date", "captured_at"]
CEN_COLS = ["census_date", "ward_code", "beds_closed", "occupied_midnight", "admissions", "discharges", "deaths", "submitted_at"]
ROS_COLS = ["roster_date", "unit_code", "shift", "planned_nurse_hours", "rn_hours", "en_hours", "doctor_hours", "overtime_hours",
            "agency_hours", "sick_leave_hours", "nurses_on_duty", "doctors_on_duty"]
IDSR_COLS = ["facility_code", "epi_week", "condition", "cases_under5", "cases_5plus", "deaths_under5", "deaths_5plus", "tests_done",
             "tests_positive", "submitted_at", "report_version"]


def extract_nsa(conn, batch, path: Path):
    t0 = time.time()
    rows = []
    with open(path, newline="", encoding="utf-8") as fh:
        for i, r in enumerate(csv.reader(fh)):
            if not r:
                continue
            rows.append([path.name, i + 1, r[0], r[1] if len(r) > 1 and r[1] != "" else None, batch])
    n = copy_rows(conn, "stg.nsa_census_raw", ["source_file", "row_num", "region_txt", "population_txt", "batch_id"], rows)
    log_extract(conn, batch, path.name, "stg.nsa_census_raw", n, t0)


def extract_weather(conn, batch):
    for path in sorted((RAW / "external/nasa_power").glob("POWER_Point_Daily_*.json")):
        t0 = time.time()
        fac = re.search(r"POWER_Point_Daily_(.+)\.json$", path.name).group(1)
        with conn.cursor() as cur:
            cur.execute("INSERT INTO stg.weather_json_raw (source_file, facility_code, payload, batch_id) VALUES (%s, %s, %s::jsonb, %s)",
                        (path.name, fac, path.read_text(encoding="utf-8"), batch))
        log_extract(conn, batch, path.name, "stg.weather_json_raw", 1, t0)


def extract_full(conn, batch):
    extract_master(conn, batch, RAW / "internal/master_data/GBHS_Master_Data.xlsx", "main")
    extract_csv(conn, batch, RAW / "internal/pas/pas_patient_index.csv.gz", "stg.patient_raw", PAT_COLS)
    extract_csv(conn, batch, RAW / "internal/pas/pas_patient_changes.csv.gz", "stg.patient_change_raw", CHG_COLS)
    for p in sorted((RAW / "internal/pas").glob("pas_ed_opd_encounters_*.csv.gz")):
        extract_csv(conn, batch, p, "stg.encounter_raw", ENC_COLS)
    extract_csv(conn, batch, RAW / "internal/pas/pas_inpatient_spells.csv.gz", "stg.spell_raw", SPELL_COLS)
    extract_csv(conn, batch, RAW / "internal/wards/ward_midnight_census.csv", "stg.census_raw", CEN_COLS)
    extract_csv(conn, batch, RAW / "internal/roster/eroster_shift_summary.csv.gz", "stg.roster_raw", ROS_COLS)
    extract_csv(conn, batch, RAW / "internal/idsr/idsr_weekly_returns.csv", "stg.idsr_raw", IDSR_COLS)
    extract_nsa(conn, batch, RAW / "external/nsa/nsa_census2023_population_by_region.csv")
    extract_weather(conn, batch)


def extract_delta(conn, batch):
    extract_master(conn, batch, DELTA / "GBHS_Master_Data_delta_20261001.xlsx", "delta")
    extract_csv(conn, batch, DELTA / "pas_patient_index_delta_20261001.csv", "stg.patient_raw", PAT_COLS)
    extract_csv(conn, batch, DELTA / "pas_patient_changes_delta_20261001.csv", "stg.patient_change_raw", CHG_COLS)
    extract_csv(conn, batch, DELTA / "pas_ed_opd_encounters_20261001.csv", "stg.encounter_raw", ENC_COLS)
    extract_csv(conn, batch, DELTA / "pas_inpatient_spells_20261001.csv", "stg.spell_raw", SPELL_COLS)
    extract_csv(conn, batch, DELTA / "ward_midnight_census_20261001.csv", "stg.census_raw", CEN_COLS)
    extract_csv(conn, batch, DELTA / "eroster_shift_summary_20261001.csv", "stg.roster_raw", ROS_COLS)
    extract_csv(conn, batch, DELTA / "idsr_weekly_returns_late_20261001.csv", "stg.idsr_raw", IDSR_COLS)


# --------------------------------------------------------------------------- main
def run_sql_file(conn, path: Path):
    with conn.cursor() as cur:
        cur.execute(path.read_text(encoding="utf-8"))


def create_database(dsn: str):
    m = re.match(r"^(postgres(?:ql)?://[^/]+)/([^?]+)", dsn)
    admin_dsn = m.group(1) + "/postgres"
    with psycopg.connect(admin_dsn, autocommit=True) as c:
        if not c.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,)).fetchone():
            c.execute(f"CREATE DATABASE {DB_NAME} ENCODING 'UTF8' TEMPLATE template0")
            log(f"created database {DB_NAME}")
        for role, pw in (("gbhs_etl_loader", "change-me-etl"), ("gbhs_pbi_reader", "change-me-reader")):
            if not c.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)).fetchone():
                c.execute(f"CREATE ROLE {role} LOGIN PASSWORD '{pw}'")
        c.execute(f"GRANT CONNECT ON DATABASE {DB_NAME} TO gbhs_etl_loader, gbhs_pbi_reader")


def print_table(conn, sql: str, title: str):
    with conn.cursor() as cur:
        cur.execute(sql)
        df = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
    print(f"\n=== {title} ===")
    with pd.option_context("display.max_rows", 200, "display.max_colwidth", 90, "display.width", 250):
        print(df.to_string(index=False))


def run_batch(conn, kind: str, description: str, cutoff: str, extractor):
    batch = conn.execute("SELECT etl.fn_start_batch(%s, %s, %s::timestamp)", (kind, description, cutoff)).fetchone()[0]
    log(f"batch {batch} ({kind}): extract")
    conn.autocommit = False
    try:
        extractor(conn, batch)
        conn.commit()
        log(f"batch {batch}: transform + load (CALL etl.sp_run_load)")
        conn.execute("CALL etl.sp_run_load(%s)", (batch,))
        conn.commit()
        log(f"batch {batch}: reconcile")
        conn.execute("CALL etl.sp_reconcile(%s)", (batch,))
        conn.execute("CALL etl.sp_finish_batch(%s, 'SUCCEEDED')", (batch,))
        conn.commit()
    except Exception:
        conn.rollback()
        conn.execute("CALL etl.sp_finish_batch(%s, 'FAILED')", (batch,))
        conn.commit()
        raise
    finally:
        conn.autocommit = True
    return batch


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dsn", default=f"postgresql://postgres:postgres@localhost:5432/{DB_NAME}")
    ap.add_argument("--create-db", action="store_true")
    ap.add_argument("--with-delta", action="store_true", help="also run the day-2 incremental batch (1 October 2026)")
    args = ap.parse_args()

    if args.create_db:
        create_database(args.dsn)
    t_all = time.time()
    with psycopg.connect(args.dsn, autocommit=True) as conn:
        for f in SQL_BUILD:
            log(f"build  {f}")
            run_sql_file(conn, HERE / f)
        batch = run_batch(conn, "FULL", "Full rebuild from raw extracts (cut-off 2026-09-30)", "2026-09-30 23:59:59", extract_full)
        log("post-load: indexes, BRIN, aggregate table (13_optimisation.sql)")
        run_sql_file(conn, HERE / "13_optimisation.sql")
        conn.execute("ANALYZE")
        print_table(conn, f"""SELECT step_name, target_table, rows_in, rows_out, rows_rejected, duration_ms, coalesce(message,'') AS message
                              FROM audit.etl_step_log WHERE batch_id = {batch} AND step_name NOT LIKE 'extract %%' ORDER BY step_id""",
                    f"Batch {batch} transform/load steps")
        print_table(conn, f"SELECT check_code, check_name, source_value, target_value, status FROM audit.recon_result WHERE batch_id = {batch} ORDER BY recon_id",
                    f"Batch {batch} reconciliation")
        if args.with_delta:
            delta = run_batch(conn, "INCREMENTAL", "Day-2 delta 2026-10-01 (attendances, spells, census, roster, IDSR, master data)",
                              "2026-10-01 23:59:59", extract_delta)
            conn.execute("REFRESH MATERIALIZED VIEW mart.agg_ed_daily")
            conn.execute("ANALYZE")
            print_table(conn, f"""SELECT step_name, rows_in, rows_out, rows_rejected, coalesce(message,'') AS message FROM audit.etl_step_log
                                  WHERE batch_id = {delta} AND step_name NOT LIKE 'extract %%' ORDER BY step_id""",
                        f"Batch {delta} (incremental) steps")
            print_table(conn, f"SELECT check_code, check_name, source_value, target_value, status FROM audit.recon_result WHERE batch_id = {delta} ORDER BY recon_id",
                        f"Batch {delta} reconciliation")
    log(f"pipeline finished in {time.time() - t_all:.1f} s")


if __name__ == "__main__":
    sys.exit(main())
