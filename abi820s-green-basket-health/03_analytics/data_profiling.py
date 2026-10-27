#!/usr/bin/env python3
"""
data_profiling.py - profiles every landed source BEFORE cleansing (ABI820S 3.3: missing values, duplicates,
outliers, inconsistent formats) and summarises how each issue was handled (rules in audit.dq_rule).
Reads the raw landing tables (stg.*_raw) so that the profile describes exactly what the pipeline received.
Outputs: 06_report/evidence/prof_*.md and 06_report/figures/prof_dq_issues.png
"""
from __future__ import annotations

import pandas as pd

from common import EVIDENCE, SERIES, md_table, query, save, setup_style, subtitle

CHECKS = {
    "PAS attendances (stg.encounter_raw)": """
        SELECT count(*) AS rows, count(DISTINCT encounter_id) AS distinct_keys,
               count(*) - count(DISTINCT encounter_id) AS duplicate_rows,
               round(100.0 * avg((nullif(btrim(triage_category), '') IS NULL AND department = 'ED')::int), 2) AS pct_missing_triage_ed,
               round(100.0 * avg((nullif(btrim(patient_id), '') IS NULL)::int), 3) AS pct_missing_patient,
               round(100.0 * avg((nullif(btrim(seen_datetime), '') IS NULL)::int), 2) AS pct_missing_seen_time,
               count(*) FILTER (WHERE arrival_datetime ~ '^[0-9]{2}/') AS dayfirst_timestamps,
               count(*) FILTER (WHERE primary_icd10 !~ '^[A-Z][0-9]{2}(\\.[0-9])?$') AS nonstandard_icd_codes,
               count(DISTINCT disposition) AS distinct_disposition_spellings
        FROM stg.encounter_raw WHERE batch_id = 1""",
    "PAS inpatient spells (stg.spell_raw)": """
        SELECT count(*) AS rows, count(DISTINCT admission_id) AS distinct_keys, count(*) - count(DISTINCT admission_id) AS duplicate_rows,
               round(100.0 * avg((nullif(btrim(discharge_datetime), '') IS NULL)::int), 2) AS pct_missing_discharge,
               round(100.0 * avg((nullif(btrim(principal_icd10), '') IS NULL)::int), 2) AS pct_missing_diagnosis,
               count(DISTINCT admission_method) AS distinct_method_spellings, count(DISTINCT ward_code) AS distinct_ward_spellings
        FROM stg.spell_raw WHERE batch_id = 1""",
    "Patient index (stg.patient_raw)": """
        SELECT count(*) AS rows, count(DISTINCT patient_id) AS distinct_keys, count(*) - count(DISTINCT patient_id) AS duplicate_rows,
               count(DISTINCT sex) AS distinct_sex_spellings, count(DISTINCT payer_class) AS distinct_payer_spellings,
               count(DISTINCT residence_region) AS distinct_region_spellings,
               count(*) FILTER (WHERE birth_year !~ '^(19|20)[0-9]{2}$' OR birth_year::text > '2026') AS implausible_birth_years
        FROM stg.patient_raw WHERE batch_id = 1""",
    "Ward census (stg.census_raw)": """
        SELECT count(*) AS rows, count(DISTINCT (census_date, ward_code)) AS distinct_keys,
               count(*) - count(DISTINCT (census_date, ward_code)) AS duplicate_rows,
               count(*) FILTER (WHERE nullif(occupied_midnight, '') IS NULL OR occupied_midnight LIKE '-%') AS blank_or_negative,
               max(etl.fn_num(occupied_midnight)) AS max_occupied_value
        FROM stg.census_raw WHERE batch_id = 1""",
    "E-roster (stg.roster_raw)": """
        SELECT count(*) AS rows, count(DISTINCT (roster_date, unit_code, upper(left(shift, 1)))) AS distinct_keys,
               count(*) - count(DISTINCT (roster_date, unit_code, upper(left(shift, 1)))) AS duplicate_rows,
               count(DISTINCT shift) AS distinct_shift_spellings, count(*) FILTER (WHERE rn_hours LIKE '-%') AS negative_hours
        FROM stg.roster_raw WHERE batch_id = 1""",
    "IDSR returns (stg.idsr_raw)": """
        SELECT count(*) AS rows, count(DISTINCT condition) AS distinct_condition_spellings,
               count(*) FILTER (WHERE epi_week ~ '^W') AS weeks_in_w_slash_format,
               count(*) FILTER (WHERE cases_under5 LIKE '-%' OR cases_5plus LIKE '-%') AS negative_counts,
               count(*) FILTER (WHERE etl.fn_num(tests_positive) > etl.fn_num(tests_done)) AS positives_gt_tests
        FROM stg.idsr_raw WHERE batch_id = 1""",
}


def main():
    setup_style()
    import matplotlib.pyplot as plt
    out = []
    for name, sql in CHECKS.items():
        r = query(sql).iloc[0].to_dict()
        out.append("**" + name + "** - " + "; ".join(f"{k.replace('_', ' ')}: {v:,}" if isinstance(v, (int, float)) and not isinstance(v, bool)
                                               else f"{k.replace('_', ' ')}: {v}" for k, v in r.items()))
    (EVIDENCE / "prof_sources.md").write_text("\n\n".join(f"- {o}" for o in out) + "\n", encoding="utf-8")
    # outliers: door-to-doctor and length of stay distributions on the raw timestamps (ISO rows only)
    q = query("""
        SELECT percentile_cont(ARRAY[0.5, 0.9, 0.99, 0.999]) WITHIN GROUP (ORDER BY m) AS p, max(m) AS max_min, min(m) AS min_min
        FROM (SELECT extract(epoch FROM etl.fn_parse_ts(seen_datetime) - etl.fn_parse_ts(arrival_datetime)) / 60 AS m
              FROM stg.encounter_raw WHERE batch_id = 1 AND seen_datetime IS NOT NULL) x""").iloc[0]
    (EVIDENCE / "prof_outliers.md").write_text(
        f"Door-to-doctor minutes on raw timestamps: median {q.p[0]:.0f}, P90 {q.p[1]:.0f}, P99 {q.p[2]:.0f}, P99.9 {q.p[3]:.0f}; "
        f"minimum {q.min_min:,.0f} (negative = seen before arrival, EN05) and maximum {q.max_min:,.0f} (> 24 h, EN06).\n", encoding="utf-8")
    # issues by rule and action
    dq = query("""SELECT r.rule_code, r.dq_dimension, r.action, count(l.issue_id) AS hits
                  FROM audit.dq_rule r LEFT JOIN audit.dq_issue_log l ON l.rule_code = r.rule_code AND l.batch_id = 1
                  GROUP BY 1, 2, 3 ORDER BY 1""")
    by_dim = dq.groupby("dq_dimension").hits.sum().sort_values()
    fig, ax = plt.subplots(figsize=(9, 3.6))
    ax.barh(by_dim.index, by_dim.values, color=SERIES[0], height=0.55)
    for y, v in enumerate(by_dim.values):
        ax.text(v, y, f" {v:,}", va="center", fontsize=9, color="#3d3c39")
    ax.set_xscale("symlog", linthresh=100)
    ax.set_xlabel("Rule hits in the full load (log scale above 100)")
    ax.set_title("Data-quality issues found, by quality dimension", loc="left")
    subtitle(ax, f"{int(dq.hits.sum()):,} row-level issues logged by {int((dq.hits > 0).sum())} of {len(dq)} rules (batch 1)")
    ax.grid(axis="x", color="#e1e0d9")
    ax.grid(axis="y", visible=False)
    save(fig, "prof_dq_issues.png")
    (EVIDENCE / "prof_by_dimension.md").write_text(md_table(by_dim.reset_index().rename(columns={"dq_dimension": "DQ dimension", "hits": "issues"}), "{:,.0f}"), encoding="utf-8")
    print("\n".join(out))
    print(by_dim)


if __name__ == "__main__":
    main()
