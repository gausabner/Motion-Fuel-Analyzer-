#!/usr/bin/env python3
"""
outbreak_detection.py - Technique 3: anomaly (outbreak) detection on IDSR weekly surveillance (ABI820S 3.5).

Business question BQ3: can GBHS detect unusual increases of priority conditions early enough to respond
(within 1-2 weeks of onset), without drowning surveillance officers in false alarms?

Data     : dw.fact_surveillance_weekly (cases per facility x epi week x condition, 9 IDSR conditions).
Methods  : M1 EARS C2 - alert when x_t > mean + 3 SD of weeks t-8 .. t-2 (1-week guard band), SD floored at 1;
           M2 one-sided CUSUM on the C2 standardised residuals (k = 1, h = 2.5; reset after an alert);
           M3 seasonal historical limits for malaria - alert when x_t > mean + 2 SD of the same epi week
              +/- 2 weeks in previous years (WHO-style malaria epidemic threshold; needs >= 2 prior years).
           All alerts additionally require >= 3 cases in the week (minimum-count rule).
Truth    : 12 outbreaks injected by the generator (generator_manifest.json -> truth.outbreaks): facility,
           condition, start week and duration.
Metrics  : sensitivity (outbreaks with >= 1 alert during the outbreak), median weeks from onset to first
           alert, false alerts per 100 facility-condition-weeks outside outbreak windows (non-malaria
           conditions), positive predictive value of alerts.
Outputs  : figures ob_*.png, evidence ob_*.md, table mart.analytics_outbreak_alerts (Power BI page 4).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import EVIDENCE, ROOT, SERIES, md_table, query, save, setup_style, subtitle, write_table

MIN_CASES = 3


def load() -> pd.DataFrame:
    df = query("""
        SELECT d.epi_week_start AS week, d.epi_week_label, f.facility_code, f.facility_short_name AS facility,
               c.condition_code, c.condition_name, coalesce(s.cases_total, 0) AS cases
        FROM dw.fact_surveillance_weekly s
        JOIN dw.dim_date d ON d.date_key = s.epi_week_date_key
        JOIN dw.dim_facility f ON f.facility_key = s.facility_key
        JOIN dw.dim_condition c ON c.condition_key = s.condition_key""")
    df["week"] = pd.to_datetime(df.week)
    # complete grid: missing reports are treated as missing (not zero) - the series is re-indexed and gaps skipped
    grid = pd.MultiIndex.from_product([sorted(df.facility_code.unique()), sorted(df.condition_code.unique()),
                                       pd.date_range(df.week.min(), df.week.max(), freq="W-MON")],
                                      names=["facility_code", "condition_code", "week"])
    full = df.set_index(["facility_code", "condition_code", "week"]).reindex(grid)
    full["cases"] = full.cases.astype(float)
    return full.reset_index()


def ears_c2(x: pd.Series) -> pd.DataFrame:
    base = x.shift(2).rolling(7, min_periods=5)
    mu, sd = base.mean(), base.std().clip(lower=1.0)
    z = (x - mu) / sd
    alert = (z > 3) & (x >= MIN_CASES)
    return pd.DataFrame({"expected": mu, "threshold": mu + 3 * sd, "z": z, "alert": alert})


def cusum(z: pd.Series, k: float = 1.0, h: float = 2.5, x: pd.Series | None = None) -> pd.Series:
    s, out = 0.0, []
    for zi, xi in zip(z.values, x.values):
        if np.isnan(zi):
            out.append(False)
            continue
        s = max(0.0, s + zi - k)
        fire = s > h and xi >= MIN_CASES
        out.append(fire)
        if fire:
            s = 0.0
    return pd.Series(out, index=z.index)


def historical_limits(g: pd.DataFrame) -> pd.DataFrame:
    g = g.copy()
    g["epiw"] = g.week.dt.isocalendar().week.astype(int)
    g["epiy"] = g.week.dt.isocalendar().year.astype(int)
    exp, thr = [], []
    for _, r in g.iterrows():
        prev = g[(g.epiy < r.epiy) & (g.epiw.sub(r.epiw).abs() <= 2)]
        if prev.epiy.nunique() < 2:
            exp.append(np.nan)
            thr.append(np.nan)
        else:
            exp.append(prev.cases.mean())
            thr.append(prev.cases.mean() + 2 * prev.cases.std())
    g["expected_hl"], g["threshold_hl"] = exp, thr
    g["alert_hl"] = (g.cases > g.threshold_hl) & (g.cases >= MIN_CASES)
    return g


def main():
    setup_style()
    import matplotlib.pyplot as plt
    df = load()
    truth = json.loads((ROOT / "01_data/raw/generator_manifest.json").read_text())["truth"]["outbreaks"]
    parts = []
    for (fac, cond), g in df.groupby(["facility_code", "condition_code"], sort=False):
        g = g.sort_values("week").copy()
        c2 = ears_c2(g.cases)
        g = pd.concat([g, c2], axis=1)
        g["alert_cusum"] = cusum(g.z, x=g.cases)
        if cond == "MAL":
            g = historical_limits(g)
        parts.append(g)
    res = pd.concat(parts, ignore_index=True)
    res["alert_c2"] = res.alert.fillna(False).astype(bool)
    res["alert_cusum"] = res.alert_cusum.fillna(False).astype(bool)
    res["alert_hl"] = res.get("alert_hl", False)
    res["alert_hl"] = res.alert_hl.fillna(False).astype(bool)

    # --- evaluation against injected outbreaks
    res["in_outbreak"] = False
    rows = []
    for ob in truth:
        start = pd.Timestamp(ob["start_date"])
        end = start + pd.Timedelta(weeks=ob["weeks"] - 1)
        m = (res.facility_code == ob["facility_code"]) & (res.condition_code == ob["condition"]) & (res.week >= start) & (res.week <= end)
        res.loc[m, "in_outbreak"] = True
        sub = res[m].sort_values("week")
        row = dict(outbreak=ob["outbreak_id"], facility=ob["facility_code"], condition=ob["condition"], start=ob["start_week"],
                   weeks=ob["weeks"], extra_cases=ob["extra_cases_expected"])
        for method, col in (("EARS C2", "alert_c2"), ("CUSUM", "alert_cusum")):
            hits = sub[sub[col]]
            row[f"{method} detected"] = "yes" if len(hits) else "no"
            row[f"{method} delay (wk)"] = int((hits.week.iloc[0] - start).days // 7) if len(hits) else None
        rows.append(row)
    ev = pd.DataFrame(rows)
    outside = res[~res.in_outbreak & (res.condition_code != "MAL") & res.cases.notna()]
    summary = []
    for method, col in (("EARS C2", "alert_c2"), ("CUSUM", "alert_cusum")):
        det = (ev[f"{method} detected"] == "yes")
        all_alerts = res[res[col] & (res.condition_code != "MAL")]
        summary.append(dict(method=method, outbreaks_detected=f"{det.sum()} / {len(ev)}",
                            sensitivity=det.mean(), median_delay_weeks=ev.loc[det, f"{method} delay (wk)"].median(),
                            false_alerts_per_100_weeks=100 * outside[col].sum() / len(outside),
                            ppv=all_alerts.in_outbreak.mean() if len(all_alerts) else np.nan))
    summ = pd.DataFrame(summary)
    # malaria upsurge detection with historical limits (north-east facilities)
    mal = res[(res.condition_code == "MAL") & res.facility_code.isin(["GBH-RUN", "GBH-KAT", "GBC-NKU"])]
    first_alert = (mal[mal.alert_hl].assign(y=mal.week.dt.isocalendar().year)
                   .groupby(["facility", "y"]).week.min().unstack("y"))

    # --- evidence
    st = summ.copy()
    st["sensitivity"] = st.sensitivity.map(lambda v: f"{100 * v:.0f} %")
    st["ppv"] = st.ppv.map(lambda v: f"{100 * v:.0f} %")
    st["false_alerts_per_100_weeks"] = st.false_alerts_per_100_weeks.map(lambda v: f"{v:.2f}")
    st["median_delay_weeks"] = st.median_delay_weeks.map(lambda v: f"{v:.1f}")
    (EVIDENCE / "ob_summary.md").write_text(md_table(st), encoding="utf-8")
    evt = ev.copy()
    for c in evt.columns:
        if "delay" in c:
            evt[c] = evt[c].map(lambda v: "" if pd.isna(v) else str(int(v)))
    (EVIDENCE / "ob_events.md").write_text(md_table(evt), encoding="utf-8")
    fa = first_alert.copy()
    for c in fa.columns:
        fa[c] = fa[c].map(lambda v: "" if pd.isna(v) else v.strftime("%G-W%V"))
    fa = fa.reset_index()
    fa.columns = ["facility"] + [f"first alert {c}" for c in fa.columns[1:]]
    (EVIDENCE / "ob_malaria_first_alert.md").write_text(md_table(fa), encoding="utf-8")

    # --- figures: one detected outbreak, and the malaria historical limits
    ob = next(o for o in truth if o["outbreak_id"] == "OB07")
    g = res[(res.facility_code == ob["facility_code"]) & (res.condition_code == ob["condition"])]
    g = g[(g.week >= "2023-10-01") & (g.week <= "2024-09-30")]
    fig, ax = plt.subplots(figsize=(10, 3.8))
    ax.bar(g.week, g.cases, width=5, color=SERIES[0], label="Weekly cases (IDSR)")
    ax.plot(g.week, g.threshold, color=SERIES[1], lw=1.8, label="EARS C2 threshold (mean + 3 SD of weeks t-8..t-2)")
    al = g[g.alert_c2]
    ax.scatter(al.week, al.cases + 0.6, marker="v", s=55, color="#3d3c39", zorder=3, label="Alert")
    start = pd.Timestamp(ob["start_date"])
    ax.axvspan(start, start + pd.Timedelta(weeks=ob["weeks"]), color="#e1e0d9", alpha=0.6, lw=0, zorder=-1)
    ax.set_title(f"Measles at Rundu: injected outbreak {ob['start_week']} ({ob['weeks']} weeks, shaded)", loc="left")
    subtitle(ax, "The first alert fires in the outbreak's opening weeks; the rest of the year produces no false alarm")
    ax.set_ylabel("Cases per week")
    ax.legend(loc="upper right", fontsize=8.5)
    save(fig, "ob_measles_rundu.png")

    g = res[(res.facility_code == "GBH-KAT") & (res.condition_code == "MAL")].sort_values("week")
    fig, ax = plt.subplots(figsize=(10, 3.8))
    ax.plot(g.week, g.cases, color="#3d3c39", lw=1.5, label="Weekly malaria cases (Katima Mulilo)")
    ax.plot(g.week, g.threshold_hl, color=SERIES[1], lw=1.8, label="Epidemic threshold: mean + 2 SD, same weeks, previous years")
    al = g[g.alert_hl]
    ax.scatter(al.week, al.cases, s=14, color=SERIES[1], zorder=3, label="Above threshold")
    ax.set_title("Malaria upsurge detection with historical limits", loc="left")
    subtitle(ax, "Thresholds need two prior seasons, so they start in 2024; the 2025 and 2026 upsurges cross them early in the season")
    ax.set_ylabel("Cases per week")
    ax.legend(loc="upper left", fontsize=8.5)
    save(fig, "ob_malaria_threshold.png")

    # --- mart table for Power BI (alerts only, plus expected values for context)
    out = res[res.alert_c2 | res.alert_cusum | res.alert_hl].copy()
    out["method"] = np.where(out.alert_hl & ~out.alert_c2, "Historical limits",
                             np.where(out.alert_c2, "EARS C2", "CUSUM"))
    out["week_date_key"] = out.week.dt.strftime("%Y%m%d").astype(int)
    out["expected"] = np.where(out.method == "Historical limits", out.expected_hl, out.expected)
    out["threshold_value"] = np.where(out.method == "Historical limits", out.threshold_hl, out.threshold)
    fac = query("SELECT facility_key, facility_code FROM dw.dim_facility")
    cond = query("SELECT condition_key, condition_code FROM dw.dim_condition")
    out = out.merge(fac, on="facility_code").merge(cond, on="condition_code")
    out["is_injected_outbreak"] = out.in_outbreak
    write_table(out, "mart.analytics_outbreak_alerts",
                {"week_date_key": "integer", "facility_key": "integer", "condition_key": "integer", "method": "text",
                 "cases": "numeric", "expected": "numeric", "threshold_value": "numeric", "is_injected_outbreak": "boolean"})
    print(summ.to_string(index=False))
    print(ev.to_string(index=False))
    print(first_alert)


if __name__ == "__main__":
    main()
