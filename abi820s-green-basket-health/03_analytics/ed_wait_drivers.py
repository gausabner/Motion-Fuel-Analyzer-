#!/usr/bin/env python3
"""
ed_wait_drivers.py - Technique 4: regression / key-influencer analysis of ED waiting time (ABI820S 3.5).

Business question BQ1: what drives door-to-doctor time in the emergency departments - and which levers
(doctor staffing per arrival, bed occupancy / access block, shift) can management actually pull?

Data     : ED attendances triaged ORANGE / YELLOW / GREEN with a valid door-to-doctor time (dw.fact_encounter),
           drilled across through conformed dimensions to the e-roster (doctors on duty in the arrival shift)
           and the ward census (hospital bed occupancy on the arrival day).
Models   : M1 OLS on log(door-to-doctor minutes) with facility fixed effects and HC3 robust standard errors
           (effects read as % change in waiting time); M2 gradient-boosted trees with permutation importance
           on a hold-out year (the same idea as the Power BI Key Influencers visual).
Outputs  : figures ew_*.png, evidence ew_*.md, table mart.analytics_ed_drivers.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance

from common import EVIDENCE, SERIES, md_table, query, save, setup_style, subtitle, write_table


def load() -> pd.DataFrame:
    df = query("""
        WITH shift_load AS (
            SELECT cu.facility_key, e.arrival_date_key - CASE WHEN e.arrival_hour_key < 7 THEN 1 ELSE 0 END AS shift_date_key,
                   CASE WHEN e.arrival_hour_key BETWEEN 7 AND 18 THEN 1 ELSE 2 END AS shift_key, count(*) AS arrivals
            FROM dw.fact_encounter e JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
            WHERE cu.unit_type = 'Emergency department' GROUP BY 1, 2, 3),
        occ AS (
            SELECT cu.facility_key, c.census_date_key, sum(c.occupied_beds)::numeric / nullif(sum(c.beds_available), 0) AS occupancy
            FROM dw.fact_ward_census_daily c JOIN dw.dim_care_unit cu ON cu.care_unit_key = c.care_unit_key GROUP BY 1, 2),
        docs AS (
            SELECT cu.facility_key, r.roster_date_key, r.shift_key, r.doctors_on_duty
            FROM dw.fact_staff_roster r JOIN dw.dim_care_unit cu ON cu.care_unit_key = r.care_unit_key
            WHERE cu.unit_type = 'Emergency department')
        SELECT e.door_to_doctor_min, t.triage_code AS triage, f.facility_short_name AS facility, d.calendar_year AS year,
               d.is_weekend, d.is_malaria_season, (e.arrival_hour_key NOT BETWEEN 7 AND 18) AS night,
               sl.arrivals, dc.doctors_on_duty, o.occupancy
        FROM dw.fact_encounter e
        JOIN dw.dim_triage t ON t.triage_key = e.triage_key AND t.triage_code IN ('ORANGE', 'YELLOW', 'GREEN')
        JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key AND cu.unit_type = 'Emergency department'
        JOIN dw.dim_facility f ON f.facility_key = cu.facility_key
        JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
        JOIN shift_load sl ON sl.facility_key = cu.facility_key
             AND sl.shift_date_key = e.arrival_date_key - CASE WHEN e.arrival_hour_key < 7 THEN 1 ELSE 0 END
             AND sl.shift_key = CASE WHEN e.arrival_hour_key BETWEEN 7 AND 18 THEN 1 ELSE 2 END
        LEFT JOIN docs dc ON dc.facility_key = cu.facility_key AND dc.roster_date_key = sl.shift_date_key AND dc.shift_key = sl.shift_key
        LEFT JOIN occ o ON o.facility_key = cu.facility_key AND o.census_date_key = e.arrival_date_key
        WHERE e.door_to_doctor_min > 0 AND d.full_date >= DATE '2022-01-02'
        ORDER BY e.encounter_id""")   # fixed row order, so the seeded samples below are identical on every rebuild
    df = df.dropna(subset=["doctors_on_duty", "occupancy"]).copy()
    for c in ("door_to_doctor_min", "arrivals", "doctors_on_duty", "occupancy"):
        df[c] = df[c].astype(float)
    df["arrivals_per_doctor"] = df.arrivals / df.doctors_on_duty
    df["occupancy_pct"] = 100 * df.occupancy
    df["log_wait"] = np.log(df.door_to_doctor_min)
    for c in ("is_weekend", "is_malaria_season", "night"):
        df[c] = df[c].astype(int)
    return df


def main():
    setup_style()
    import matplotlib.pyplot as plt
    df = load()
    sample = df.sample(n=min(150000, len(df)), random_state=20261028)
    ols = smf.ols("log_wait ~ C(triage, Treatment('GREEN')) + arrivals_per_doctor + occupancy_pct + night + is_weekend"
                  " + is_malaria_season + C(facility)", data=sample).fit(cov_type="HC3")
    terms = {
        "arrivals_per_doctor": "+1 arrival per doctor in the shift",
        "occupancy_pct": "+10 points hospital bed occupancy",
        "night": "Night shift (19:00-07:00)",
        "is_weekend": "Weekend",
        "is_malaria_season": "Malaria season (Jan-May)",
        "C(triage, Treatment('GREEN'))[T.ORANGE]": "Triage ORANGE vs GREEN",
        "C(triage, Treatment('GREEN'))[T.YELLOW]": "Triage YELLOW vs GREEN",
    }
    rows = []
    for k, label in terms.items():
        b, se, p = ols.params[k], ols.bse[k], ols.pvalues[k]
        scale = 10 if k == "occupancy_pct" else 1
        rows.append(dict(driver=label, effect_pct=100 * (np.exp(scale * b) - 1),
                         ci_low=100 * (np.exp(scale * (b - 1.96 * se)) - 1), ci_high=100 * (np.exp(scale * (b + 1.96 * se)) - 1),
                         p_value=p))
    eff = pd.DataFrame(rows)
    # gradient boosting + permutation importance (train <= 2024, test 2025-2026)
    feats = ["triage_n", "arrivals_per_doctor", "occupancy_pct", "night", "is_weekend", "is_malaria_season", "facility_n"]
    df["triage_n"] = df.triage.map({"ORANGE": 0, "YELLOW": 1, "GREEN": 2})
    df["facility_n"] = df.facility.astype("category").cat.codes
    tr = df[df.year <= 2024].sample(n=min(120000, int((df.year <= 2024).sum())), random_state=1)
    te = df[df.year >= 2025].sample(n=min(40000, int((df.year >= 2025).sum())), random_state=2)
    gbm = HistGradientBoostingRegressor(max_iter=250, learning_rate=0.06, random_state=20261028).fit(tr[feats], tr.log_wait)
    r2_test = gbm.score(te[feats], te.log_wait)
    pi = permutation_importance(gbm, te[feats], te.log_wait, n_repeats=5, random_state=3)
    names = {"triage_n": "Triage category", "arrivals_per_doctor": "Arrivals per doctor (shift)",
             "occupancy_pct": "Hospital bed occupancy", "night": "Night shift", "is_weekend": "Weekend",
             "is_malaria_season": "Malaria season", "facility_n": "Facility"}
    imp = pd.DataFrame({"driver": [names[f] for f in feats], "importance": pi.importances_mean}).sort_values("importance", ascending=False)
    imp["share"] = imp.importance / imp.importance.sum()

    # ---- evidence
    et = eff.copy()
    et["effect_pct"] = et.effect_pct.map(lambda v: f"{v:+.1f} %")
    et["95 % CI"] = [f"{a:+.1f} to {b:+.1f} %" for a, b in zip(eff.ci_low, eff.ci_high)]
    et["p_value"] = et.p_value.map(lambda v: "< 0.001" if v < 0.001 else f"{v:.3f}")
    et = et[["driver", "effect_pct", "95 % CI", "p_value"]]
    (EVIDENCE / "ew_ols_effects.md").write_text(md_table(et), encoding="utf-8")
    it = imp.copy()
    it["importance"] = it.importance.map(lambda v: f"{v:.3f}")
    it["share"] = it.share.map(lambda v: f"{100 * v:.1f} %")
    (EVIDENCE / "ew_importance.md").write_text(md_table(it), encoding="utf-8")
    (EVIDENCE / "ew_summary.md").write_text(
        f"OLS: n = {int(ols.nobs):,} ED attendances (ORANGE/YELLOW/GREEN), adjusted R2 = {ols.rsquared_adj:.3f}; "
        f"gradient boosting trained on 2022-2024 ({len(tr):,} rows) explains R2 = {r2_test:.3f} of log waiting time "
        f"in 2025-2026 ({len(te):,} rows). Median arrivals per doctor per shift: {df.arrivals_per_doctor.median():.1f}; "
        f"median hospital occupancy: {df.occupancy_pct.median():.0f} %.\n", encoding="utf-8")

    # ---- figures
    fig, ax = plt.subplots(figsize=(9.5, 4.2))
    e2 = eff[~eff.driver.str.startswith("Triage")].sort_values("effect_pct")
    ax.barh(e2.driver, e2.effect_pct, color=[SERIES[1] if v > 0 else SERIES[0] for v in e2.effect_pct], height=0.55)
    ax.errorbar(e2.effect_pct, e2.driver, xerr=[e2.effect_pct - e2.ci_low, e2.ci_high - e2.effect_pct], fmt="none",
                ecolor="#3d3c39", elinewidth=1, capsize=3)
    ax.axvline(0, color="#3d3c39", lw=1)
    ax.set_xlabel("% change in door-to-doctor time (95 % CI)")
    ax.set_title("What lengthens ED waits? (OLS on log waiting time)", loc="left")
    subtitle(ax, "Adjusted for triage category and facility; HC3 robust confidence intervals")
    ax.grid(axis="x", color="#e1e0d9")
    ax.grid(axis="y", visible=False)
    save(fig, "ew_effects.png")

    fig, ax = plt.subplots(figsize=(9.5, 3.8))
    df["apd_band"] = pd.cut(df.arrivals_per_doctor, [0, 4, 6, 8, 10, 12, 16, 100],
                            labels=["<4", "4-6", "6-8", "8-10", "10-12", "12-16", "16+"])
    tg = df[df.triage == "YELLOW"].groupby("apd_band", observed=True).door_to_doctor_min.median()
    ax.plot(range(len(tg)), tg.values, color=SERIES[0], lw=2, marker="o", ms=7)
    ax.set_xticks(range(len(tg)), tg.index)
    ax.axhline(60, color=SERIES[1], lw=1.2, ls="--")
    ax.text(len(tg) - 1, 61, "YELLOW target 60 min", color=SERIES[1], ha="right", va="bottom", fontsize=8.5)
    ax.set_xlabel("Arrivals per doctor on duty in the shift")
    ax.set_ylabel("Median door-to-doctor (min)")
    ax.set_title("Median wait for urgent patients triples as the load per doctor rises", loc="left")
    subtitle(ax, "YELLOW (urgent) patients, all EDs, 2022-2026; the steepest rise is above 12 arrivals per doctor per 12-hour shift")
    save(fig, "ew_load_curve.png")

    write_table(eff.assign(model="OLS log waiting time"), "mart.analytics_ed_drivers",
                {"driver": "text", "effect_pct": "numeric", "ci_low": "numeric", "ci_high": "numeric", "p_value": "numeric", "model": "text"})
    print(ols.summary().tables[1])
    print(eff.to_string(index=False))
    print(imp.to_string(index=False), r2_test)
    print(tg)


if __name__ == "__main__":
    main()
