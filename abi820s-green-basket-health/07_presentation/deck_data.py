#!/usr/bin/env python3
"""
deck_data.py - pulls every number shown in the presentation from the warehouse and the evidence tables into
deck_data.json, so the slides (built by build_presentation.js) never carry hand-typed figures and always match
the report.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
EVID = ROOT / "06_report" / "evidence"
sys.path.insert(0, str(ROOT / "03_analytics"))
sys.path.insert(0, str(ROOT / "04_powerbi"))
from common import query  # noqa: E402
import model_spec as S  # noqa: E402

NE = ["GBH-RUN", "GBH-KAT", "GBC-NKU"]   # north-east malaria facilities (forecasting series)


def md_rows(name: str) -> list[dict]:
    """Rows of the first Markdown table in an evidence file, as dicts of stripped strings."""
    lines = [l for l in (EVID / name).read_text(encoding="utf-8").splitlines() if l.startswith("|")]
    head = [c.strip() for c in lines[0].strip("|").split("|")]
    return [dict(zip(head, (c.strip() for c in l.strip("|").split("|")))) for l in lines[2:]]


def num(s: str) -> float:
    return float(re.sub(r"[^0-9.\-]", "", s))


def wrap_calculate(expr: str, width: int = 64) -> str:
    """Break one-line CALCULATE ( a, b, c ) calls longer than width into one argument per line (whitespace only)."""
    out = []
    for line in expr.splitlines():
        body = line.strip()
        if len(line) <= width or not (body.startswith("CALCULATE ( ") and body.endswith(" )")):
            out.append(line)
            continue
        pad = line[: len(line) - len(line.lstrip())]
        args, depth, cur = [], 0, ""
        for ch in body[len("CALCULATE ( "):-2]:
            depth += ch in "(["
            depth -= ch in ")]"
            if ch == "," and depth == 0:
                args.append(cur.strip())
                cur = ""
            else:
                cur += ch
        args.append(cur.strip())
        out.append(pad + "CALCULATE (")
        out += [pad + "    " + a + ("," if i < len(args) - 1 else "") for i, a in enumerate(args)]
        out.append(pad + ")")
    return "\n".join(out)


def main():
    d = {}
    # slide 2: ED access trend (main extract, cut-off 30 September 2026) and what profiling found
    k = query("""SELECT d.calendar_year AS y, count(*) FILTER (WHERE ep.department_code = 'ED') AS ed,
                        round(100.0 * sum(e.seen_within_target) / nullif(count(e.seen_within_target), 0), 1)::float8 AS seen,
                        round(100.0 * avg(e.is_lwbs) FILTER (WHERE ep.department_code = 'ED'), 1)::float8 AS lwbs
                 FROM dw.fact_encounter e JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
                 JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key
                 WHERE d.full_date <= DATE '2026-09-30' GROUP BY 1 ORDER BY 1""")
    d["access"] = [{"year": int(r.y), "ed": int(r.ed), "seen": r.seen, "lwbs": r.lwbs} for r in k.itertuples()]
    hits = query("""SELECT rule_code, count(*) AS n FROM audit.dq_issue_log WHERE batch_id = 1 GROUP BY 1""")
    h = dict(zip(hits.rule_code, hits.n.astype(int)))
    sp = query("SELECT count(DISTINCT condition) AS n FROM stg.idsr_raw").n[0]
    d["problems"] = {"duplicates": h.get("EN01", 0), "superseded_spells": h.get("AD01", 0), "condition_spellings": int(sp),
                     "x10_beds": h.get("WC02", 0)}
    # slide 5: SCD2 business effect - Rundu medical ward occupancy against the beds it had, and against today's beds
    occ = query("""SELECT d.year_month AS m, 100.0 * sum(c.occupied_beds) / sum(c.beds_available) AS as_was,
                          100.0 * sum(c.occupied_beds) / (count(*) * (SELECT bed_complement FROM dw.dim_care_unit
                                                                   WHERE unit_code = 'RUN-MED1' AND scd_is_current)) AS as_is
                   FROM dw.fact_ward_census_daily c JOIN dw.dim_care_unit cu ON cu.care_unit_key = c.care_unit_key
                   JOIN dw.dim_date d ON d.date_key = c.census_date_key
                   WHERE cu.unit_code = 'RUN-MED1' AND d.full_date BETWEEN DATE '2024-07-01' AND DATE '2026-09-30'
                   GROUP BY 1 ORDER BY 1""")
    d["rundu_occ"] = [{"m": r.m, "as_was": round(float(r.as_was), 1), "as_is": round(float(r.as_is), 1)} for r in occ.itertuples()]
    beds = query("""SELECT scd_version AS v, bed_complement AS b, scd_effective_from AS f FROM dw.dim_care_unit
                    WHERE unit_code = 'RUN-MED1' ORDER BY 1""")
    d["rundu_beds"] = [{"version": int(r.v), "beds": int(r.b), "from": str(r.f)} for r in beds.itertuples()]
    scd = md_rows("ev_scd2_summary.md")
    d["scd2"] = {r["dimension"]: {"keys": int(num(r["natural_keys"])), "versions": int(num(r["versions"]))} for r in scd}
    # slide 6: data quality
    dims = query("""SELECT r.dq_dimension AS dim, count(*) AS n FROM audit.dq_issue_log l
                    JOIN audit.dq_rule r ON r.rule_code = l.rule_code WHERE l.batch_id = 1 GROUP BY 1 ORDER BY 2 DESC""")
    d["dq_dims"] = [{"dim": r.dim, "n": int(r.n)} for r in dims.itertuples()]
    d["dq_rules"] = int(query("SELECT count(*) AS n FROM audit.dq_rule").n[0])
    first = (EVID / "dq_rule_validation.md").read_text(encoding="utf-8").splitlines()[0]
    m = re.search(r"([\d,]+) of ([\d,]+) injected records found.*?(\d+) false positives", first)
    d["dq_validation"] = {"found": int(num(m.group(1))), "injected": int(num(m.group(2))), "false_positives": int(m.group(3))}
    # slide 7: reconciliation of the latest batch
    rec = query("SELECT status, count(*) AS n FROM mart.v_recon_latest GROUP BY 1")
    d["recon"] = {r.status: int(r.n) for r in rec.itertuples()}
    d["recon_warn"] = [{"code": r["check_code"], "name": r["check_name"]} for r in md_rows("ev_recon.md") if r["status"] == "WARN"]
    # slide 8: semantic model and the RLS test matrix
    d["model"] = {"tables": len(S.TABLES), "measures": len(S.MEASURES), "relationships": len(S.RELATIONSHIPS), "roles": len(S.ROLES),
                  "folders": len({m[1] for m in S.MEASURES})}
    m = next(m for m in S.MEASURES if m[0] == "Malaria Cases Epi-YTD")
    d["dax"] = {"name": m[0], "code": f"{m[0]} =\n" + wrap_calculate(m[4])}
    d["rls"] = [{"upn": r["Other user (UPN)"], "role": r["Role"], "facilities": r["Visible Facilities"],
                 "ed2025": r["ED Attendances 2025"], "mal2025": r["Malaria cases, epi year 2025"]}
                for r in md_rows("pbi_row-level_security_test_matrix.md")]
    # slide 10: what drives waits
    import ed_wait_drivers as ew  # noqa: E402 - same data and banding as the report figure
    import pandas as pd
    df = ew.load()
    df["band"] = pd.cut(df.arrivals_per_doctor, [0, 4, 6, 8, 10, 12, 16, 100], labels=["<4", "4-6", "6-8", "8-10", "10-12", "12-16", "16+"])
    tg = df[df.triage == "YELLOW"].groupby("band", observed=True).door_to_doctor_min.median()
    d["load_curve"] = [{"band": str(b), "median": round(float(v), 1)} for b, v in tg.items()]
    d["ols"] = [{"driver": r["driver"], "effect": r["effect_pct"], "ci": r["95 % CI"]} for r in md_rows("ew_ols_effects.md")]
    d["intervention"] = [{"facility": r["facility"], "year": int(r["calendar_year"]), "seen": float(r["pct_seen_within_target"]),
                          "lwbs": float(r["lwbs_pct"]), "doctors": float(r["avg_day_shift_doctors"]), "ed": int(num(r["ed_attendances"]))}
                         for r in md_rows("ev_intervention.md")]
    # slide 11: malaria early warning
    mal = query("""SELECT d.epi_week_label AS w, count(*) AS n FROM dw.fact_encounter e
                   JOIN dw.dim_diagnosis dx ON dx.diagnosis_key = e.diagnosis_key
                   JOIN dw.dim_condition c ON c.condition_key = dx.condition_key AND c.condition_code = 'MAL'
                   JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
                   JOIN dw.dim_facility f ON f.facility_key = cu.facility_key AND f.facility_code = ANY(%(ne)s)
                   JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
                   WHERE d.full_date BETWEEN DATE '2022-01-03' AND DATE '2026-09-27' GROUP BY 1 ORDER BY 1""", {"ne": NE})
    d["malaria_weekly"] = [{"w": r.w.strip(), "n": int(r.n)} for r in mal.itertuples()]
    peaks = {}
    for r in d["malaria_weekly"]:
        y = r["w"][:4]
        if y in ("2025", "2026") and r["n"] > peaks.get(y, {"n": -1})["n"]:
            peaks[y] = r
    d["malaria_peaks"] = {y: p["w"] for y, p in peaks.items()}
    d["malaria_alerts"] = md_rows("ob_malaria_first_alert.md")
    wk = lambda w: int(w[-2:])
    d["warning_weeks"] = {y: [wk(peaks[y]["w"]) - wk(r[f"first alert {y}"]) for r in d["malaria_alerts"]] for y in ("2025", "2026")}
    d["sarimax_rain"] = next(r["estimate"] for r in md_rows("fc_sarimax_terms.md") if r["term"].startswith("log"))
    d["wape_h1"] = next(r["h = 1 wk"] for r in md_rows("fc_wape_by_horizon.md") if r["model"].startswith("Holt"))
    # slide 12: readmissions and outbreaks
    d["calibration"] = [{"decile": int(r["decile"]), "pred": num(r["mean_predicted"]), "obs": num(r["observed"])} for r in md_rows("rm_calibration.md")]
    best = max(md_rows("rm_metrics.md"), key=lambda r: float(r["ROC AUC"]))
    d["readmission"] = {"model": best["model"], "auc": float(best["ROC AUC"]), "capture_top20": num(best["recall at top 20 %"])}
    calls = query("""SELECT round(0.2 * count(*)) AS n FROM dw.fact_admission a JOIN dw.dim_date d ON d.date_key = a.discharge_date_key
                     WHERE a.readmission_eligible = 1 AND d.calendar_year = 2025""")
    d["readmission"]["calls_per_year"] = int(calls.n[0])
    d["outbreaks"] = [{"method": r["method"], "detected": r["outbreaks_detected"], "delay": r["median_delay_weeks"],
                       "false_per_100": r["false_alerts_per_100_weeks"]} for r in md_rows("ob_summary.md")]
    # slide 13: performance
    d["perf"] = [{"q": r["query"].split(" ")[0], "label": r["query"][3:], "base": float(r["baseline_ms"]),
                  # the printed optimised time is rounded to 0.1 ms (0.0 for the fastest query); derive it from the speed-up
                  "opt": round(float(r["baseline_ms"]) / float(r["speedup_x"]), 3),
                  "x": float(r["speedup_x"])} for r in md_rows("perf_queries.md")]
    pm = {r["metric"]: r for r in md_rows("perf_model.md")}
    size = pm["Columnar store size, all tables (MB, DuckDB proxy for VertiPaq)"]
    rows = pm["Rows per refresh: full vs incremental (10-day partition)"]
    d["perf_model"] = {"size_naive": float(size["naive"]), "size_opt": float(size["optimised"]),
                       "rows_full": int(num(rows["naive"])), "rows_incr": int(num(rows["optimised"]))}
    # slide 14: inpatient flow baseline for the recommendations
    inp = {int(r["calendar_year"]): r for r in md_rows("ev_kpi_inpatient.md")}
    sv = {r["epi_year"]: r for r in md_rows("ev_kpi_surveillance.md")}
    d["idsr_2025"] = {"completeness": float(sv["2025"]["completeness_pct"]), "timeliness": float(sv["2025"]["timeliness_pct"])}
    d["inpatient_2025"] = {"before_noon": float(inp[2025]["discharged_before_noon_pct"]), "occupancy": float(inp[2025]["bed_occupancy_pct"]),
                           "readmission": float(inp[2025]["readmission_30d_pct"])}
    out = HERE / "deck_data.json"
    out.write_text(json.dumps(d, indent=1), encoding="utf-8")
    print("wrote", out, {k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in d.items()})


if __name__ == "__main__":
    main()
