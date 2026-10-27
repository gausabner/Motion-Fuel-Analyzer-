#!/usr/bin/env python3
"""
performance_benchmark.py - baseline vs optimised measurements (ABI820S 3.7).

A. Warehouse query latency: 6 representative dashboard / refresh queries, median of 7 timed runs
   (EXPLAIN ANALYZE execution time) WITHOUT and WITH the objects in 02_sql/13_optimisation.sql
   (B-tree + BRIN indexes, aggregate materialised view).
B. Import-model size proxy: the naive model (import every dw column, incl. identifiers and timestamps) vs the
   optimised model (mart views: only needed columns, integer keys) loaded into DuckDB, whose dictionary +
   bit-packing columnar compression is the closest Linux-runnable analogue of VertiPaq; plus the cardinality
   of the largest fact's columns (cardinality drives VertiPaq size).
C. Refresh-extract proxy: wall time and bytes streamed out of PostgreSQL for each import set.
D. Incremental refresh: rows and time for a 10-day refresh partition vs a full fact_encounter refresh.
Power BI-side timings (Performance Analyzer, DAX Studio, VertiPaq Analyzer) must be captured in Power BI
Desktop by the team (04_powerbi/BUILD_GUIDE.md section 7) - this script measures what can be measured outside it.
"""
from __future__ import annotations

import io
import re
import statistics
import sys
import time

import duckdb
import numpy as np
import pandas as pd
import psycopg

from common import DSN, EVIDENCE, INK2, ROOT, SERIES, md_table, save, setup_style, subtitle

QUERIES = {
    "Q1 Monthly ED attendances and % within target per facility, 2025": """
        SELECT d.year_month, cu.facility_key, count(*), avg(e.seen_within_target)
        FROM dw.fact_encounter e JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
        JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
        WHERE e.arrival_date_key BETWEEN 20250101 AND 20251231 GROUP BY 1, 2""",
    "Q2 One facility, one month, by triage (slicer)": """
        SELECT t.triage_code, count(*), avg(e.door_to_doctor_min)
        FROM dw.fact_encounter e JOIN dw.dim_triage t ON t.triage_key = e.triage_key
        WHERE e.care_unit_key IN (SELECT care_unit_key FROM dw.dim_care_unit WHERE unit_code = 'RUN-ED')
          AND e.arrival_date_key BETWEEN 20260301 AND 20260331 GROUP BY 1""",
    "Q3 Ward occupancy for one hospital, one month (drill-down)": """
        SELECT cu.unit_code, sum(c.occupied_beds)::numeric / sum(c.beds_available)
        FROM dw.fact_ward_census_daily c JOIN dw.dim_care_unit cu ON cu.care_unit_key = c.care_unit_key
        WHERE cu.facility_key = (SELECT facility_key FROM dw.dim_facility WHERE facility_code = 'GBH-OSH')
          AND c.census_date_key BETWEEN 20260801 AND 20260831 GROUP BY 1""",
    "Q4 Patient drill-through: all spells of one patient": """
        SELECT f.admission_date_key, f.los_days, f.readmitted_within_30d
        FROM dw.fact_admission f JOIN dw.dim_patient p ON p.patient_key = f.patient_key
        WHERE p.patient_pseudo_id = (SELECT patient_pseudo_id FROM dw.dim_patient WHERE patient_key = 5000)""",
    "Q5 Incremental-refresh partition (last 10 days)": """
        SELECT * FROM mart.v_fact_encounter WHERE arrival_date_key BETWEEN 20260921 AND 20260930""",
    "Q6 Daily ED KPIs by facility x triage (aggregate vs detail)": """
        SELECT a.arrival_date_key, a.facility_key, a.triage_key, sum(a.encounters), sum(a.seen_within_target)
        FROM mart.agg_ed_daily a WHERE a.department_code = 'ED' GROUP BY 1, 2, 3""",
}
Q6_BASELINE = """
        SELECT e.arrival_date_key, cu.facility_key, e.triage_key, count(*), sum(e.seen_within_target)
        FROM dw.fact_encounter e JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
        JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key
        WHERE ep.department_code = 'ED' GROUP BY 1, 2, 3"""
OPT_INDEXES = ["ix_fact_encounter_unit_date", "ix_fact_encounter_diag", "ix_fact_encounter_patient", "brin_fact_encounter_date",
               "ix_fact_admission_unit_date", "ix_fact_admission_patient", "ix_fact_admission_discharge", "ix_fact_census_unit",
               "ix_fact_roster_unit", "ix_fact_surv_cond", "ix_dim_patient_pseudo", "ix_dim_care_unit_code"]
FACT_TABLES = ("fact_encounter", "fact_admission", "fact_ward_census_daily", "agg_ed_daily")


def time_query(conn, sql: str, runs: int = 7) -> tuple[float, str]:
    conn.execute(sql)  # warm-up
    times, plan = [], ""
    for _ in range(runs):
        rows = conn.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) " + sql).fetchall()
        txt = "\n".join(r[0] for r in rows)
        times.append(float(re.search(r"Execution Time: ([\d.]+) ms", txt).group(1)))
        plan = txt
    found = re.findall(r"(Parallel Seq Scan|Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan)(?: using \w+)? on (\w+)", plan)
    scan = "; ".join(sorted({f"{a} on {b}" for a, b in found if b in FACT_TABLES}))
    return statistics.median(times), scan


def drop_optimisation(conn):
    for ix in OPT_INDEXES:
        conn.execute(f"DROP INDEX IF EXISTS dw.{ix}")
    conn.execute("DROP MATERIALIZED VIEW IF EXISTS mart.agg_ed_daily")
    conn.execute("ANALYZE dw.fact_encounter")


def part_a(conn) -> pd.DataFrame:
    drop_optimisation(conn)
    base = {name: time_query(conn, Q6_BASELINE if name.startswith("Q6") else sql) for name, sql in QUERIES.items()}
    conn.execute((ROOT / "02_sql" / "13_optimisation.sql").read_text())
    conn.execute("ANALYZE")
    rows = []
    for name, sql in QUERIES.items():
        opt = time_query(conn, sql)
        rows.append(dict(query=name, baseline_ms=base[name][0], optimised_ms=opt[0], speedup_x=base[name][0] / opt[0],
                         baseline_access=base[name][1], optimised_access=opt[1]))
    return pd.DataFrame(rows)


NAIVE = {  # importing the warehouse tables as they are (every column, identifiers and timestamps included)
    "fact_encounter": "SELECT * FROM dw.fact_encounter", "fact_admission": "SELECT * FROM dw.fact_admission",
    "fact_ward_census": "SELECT * FROM dw.fact_ward_census_daily", "fact_staff_roster": "SELECT * FROM dw.fact_staff_roster",
    "fact_surveillance": "SELECT * FROM dw.fact_surveillance_weekly", "fact_idsr_report": "SELECT * FROM dw.fact_idsr_report",
    "fact_weather": "SELECT * FROM dw.fact_weather_daily", "dim_patient": "SELECT * FROM dw.dim_patient",
    "dim_date": "SELECT * FROM dw.dim_date", "dim_care_unit": "SELECT * FROM dw.dim_care_unit",
    "dim_diagnosis": "SELECT * FROM dw.dim_diagnosis", "dim_facility": "SELECT * FROM dw.dim_facility",
}
OPTIMISED = {
    "fact_encounter": "SELECT * FROM mart.v_fact_encounter", "fact_admission": "SELECT * FROM mart.v_fact_admission",
    "fact_ward_census": "SELECT * FROM mart.v_fact_ward_census", "fact_staff_roster": "SELECT * FROM mart.v_fact_staff_roster",
    "fact_surveillance": "SELECT * FROM mart.v_fact_surveillance", "fact_idsr_report": "SELECT * FROM mart.v_fact_idsr_report",
    "fact_weather": "SELECT * FROM mart.v_fact_weather", "dim_patient": "SELECT * FROM mart.v_dim_patient",
    "dim_date": "SELECT * FROM mart.v_dim_date", "dim_care_unit": "SELECT * FROM mart.v_dim_care_unit",
    "dim_diagnosis": "SELECT * FROM mart.v_dim_diagnosis", "dim_facility": "SELECT * FROM mart.v_dim_facility",
}


def load_set(conn, queries: dict, path) -> tuple[float, int]:
    db = duckdb.connect(str(path))
    t0, nbytes = time.time(), 0
    for name, sql in queries.items():
        buf = io.BytesIO()
        with conn.cursor().copy(f"COPY ({sql}) TO STDOUT WITH (FORMAT csv, HEADER true)") as cp:
            for chunk in cp:
                buf.write(chunk)
        nbytes += buf.tell()
        buf.seek(0)
        df = pd.read_csv(buf, low_memory=False)
        for c in df.columns:  # restore native types so the columnar store compresses them as Power BI would
            if df[c].dtype == object and (c.endswith(("_at", "_ts", "_date")) or c.startswith("scd_effective")):
                df[c] = pd.to_datetime(df[c], errors="coerce", utc=True)
            elif df[c].dtype == object and set(df[c].dropna().unique()) <= {"t", "f"}:
                df[c] = df[c].map({"t": True, "f": False})
        db.register("tmp_df", df)
        db.execute(f"CREATE OR REPLACE TABLE {name} AS SELECT * FROM tmp_df")
        db.unregister("tmp_df")
    elapsed = time.time() - t0
    db.execute("CHECKPOINT")
    db.close()
    return elapsed, nbytes


def column_sizes(path) -> pd.DataFrame:
    db = duckdb.connect(str(path), read_only=True)
    out = []
    for (t,) in db.execute("SELECT table_name FROM duckdb_tables()").fetchall():
        n = db.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        for (c,) in db.execute(f"SELECT column_name FROM duckdb_columns() WHERE table_name = '{t}'").fetchall():
            card = db.execute(f'SELECT approx_count_distinct("{c}") FROM {t}').fetchone()[0]
            out.append(dict(table=t, column=c, rows=n, cardinality=card))
    db.close()
    return pd.DataFrame(out)


def plot_queries(a: pd.DataFrame, full: int):
    """Figure of part A: baseline vs optimised latency per query, labelled with the speed-up."""
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(9, 3.8))
    labels = [q.split(" ", 1)[0] for q in a["query"]]
    x = np.arange(len(labels))
    ax.bar(x - 0.15, a.baseline_ms, width=0.28, color=SERIES[1], label="Baseline (primary keys only)")
    ax.bar(x + 0.15, a.optimised_ms, width=0.28, color=SERIES[0], label="Optimised (13_optimisation.sql)")
    for xi, b, o in zip(x, a.baseline_ms, a.optimised_ms):
        sx = b / o
        ax.text(xi + 0.15, o * 1.15, f"{sx:.0f}x" if sx >= 10 else f"{sx:.1f}x", ha="center", fontsize=8.5, color=INK2)
    ax.set_yscale("log")
    ax.set_xticks(x, labels)
    ax.set_ylabel("Median execution time (ms, log scale)")
    ax.set_title("Warehouse query latency before and after optimisation", loc="left")
    subtitle(ax, f"PostgreSQL 16, {full:,}-row fact_encounter, median of 7 runs; label = speed-up")
    ax.legend(loc="upper left", bbox_to_anchor=(0, -0.12), ncol=2)
    save(fig, "perf_queries.png")


def plot_from_evidence():
    """Redraw the figure from the recorded evidence tables, without timing the queries again."""
    rows = [l.strip("|").split("|") for l in (EVIDENCE / "perf_queries.md").read_text(encoding="utf-8").splitlines()[2:] if l.startswith("|")]
    a = pd.DataFrame({"query": [r[0].strip() for r in rows], "baseline_ms": [float(r[1].replace(",", "")) for r in rows],
                      "speedup_x": [float(r[3].replace(",", "")) for r in rows]})
    a["optimised_ms"] = a.baseline_ms / a.speedup_x          # the printed optimised time is rounded to 0.1 ms
    full = next(int(l.split("|")[2].replace(",", "")) for l in (EVIDENCE / "perf_model.md").read_text(encoding="utf-8").splitlines()
                if l.startswith("| Rows per refresh"))
    setup_style()
    plot_queries(a, full)


def main():
    setup_style()
    import matplotlib.pyplot as plt
    conn = psycopg.connect(DSN, autocommit=True)
    a = part_a(conn)
    at = a.copy()
    at["baseline_ms"] = at.baseline_ms.map(lambda v: f"{v:,.1f}")
    at["optimised_ms"] = at.optimised_ms.map(lambda v: f"{v:,.1f}")
    at["speedup_x"] = at.speedup_x.map(lambda v: f"{v:,.1f}")
    (EVIDENCE / "perf_queries.md").write_text(md_table(at), encoding="utf-8")
    print(a.round(2).to_string(index=False))

    tmp = ROOT / "03_analytics" / "outputs"
    tmp.mkdir(exist_ok=True)
    naive_path, opt_path = tmp / "model_naive.duckdb", tmp / "model_optimised.duckdb"
    for pth in (naive_path, opt_path):
        if pth.exists():
            pth.unlink()
    t_naive, b_naive = load_set(conn, NAIVE, naive_path)
    t_opt, b_opt = load_set(conn, OPTIMISED, opt_path)
    size_naive, size_opt = naive_path.stat().st_size, opt_path.stat().st_size
    cs_naive, cs_opt = column_sizes(naive_path), column_sizes(opt_path)
    fe_n = cs_naive[cs_naive.table == "fact_encounter"].sort_values("cardinality", ascending=False)
    fe_o = cs_opt[cs_opt.table == "fact_encounter"].sort_values("cardinality", ascending=False)
    t0 = time.time()
    full = conn.execute("SELECT count(*) FROM (SELECT * FROM mart.v_fact_encounter) x").fetchone()[0]
    t_full = time.time() - t0
    t0 = time.time()
    inc = conn.execute("SELECT count(*) FROM (SELECT * FROM mart.v_fact_encounter WHERE arrival_date_key BETWEEN 20260921 AND 20260930) x").fetchone()[0]
    t_inc = time.time() - t0
    summary = pd.DataFrame([
        dict(metric="Columns imported (12 tables)", naive=f"{len(cs_naive)}", optimised=f"{len(cs_opt)}"),
        dict(metric="fact_encounter columns", naive=f"{len(fe_n)}", optimised=f"{len(fe_o)}"),
        dict(metric="Columnar store size, all tables (MB, DuckDB proxy for VertiPaq)", naive=f"{size_naive / 2**20:.1f}", optimised=f"{size_opt / 2**20:.1f}"),
        dict(metric="Bytes streamed from PostgreSQL at refresh (MB)", naive=f"{b_naive / 2**20:.1f}", optimised=f"{b_opt / 2**20:.1f}"),
        dict(metric="Extract + load wall time (s)", naive=f"{t_naive:.1f}", optimised=f"{t_opt:.1f}"),
        dict(metric="Highest-cardinality fact_encounter column", naive=f"{fe_n.iloc[0].column} ({fe_n.iloc[0].cardinality:,})",
             optimised=f"{fe_o.iloc[0].column} ({fe_o.iloc[0].cardinality:,})"),
        dict(metric="Rows per refresh: full vs incremental (10-day partition)", naive=f"{full:,}", optimised=f"{inc:,}"),
        dict(metric="Refresh query time: full vs incremental (s)", naive=f"{t_full:.3f}", optimised=f"{t_inc:.3f}"),
    ])
    (EVIDENCE / "perf_model.md").write_text(
        md_table(summary) + "\nfact_encounter columns by cardinality - naive import:\n\n" + md_table(fe_n[["column", "cardinality"]], "{:,.0f}")
        + "\noptimised import (mart.v_fact_encounter):\n\n" + md_table(fe_o[["column", "cardinality"]], "{:,.0f}"), encoding="utf-8")
    print(summary.to_string(index=False))

    plot_queries(a, full)


if __name__ == "__main__":
    if "--plot-only" in sys.argv:
        plot_from_evidence()
    else:
        main()
