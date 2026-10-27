#!/usr/bin/env python3
"""
yield_drivers.py - what drives crop yield? (ABI820S 3.5, technique 3: regression / key influencers)

Unit of analysis: completed field-block crop cycles (dw.fact_crop_cycle, status Completed, harvested area > 0).
Response: ln(yield t/ha) = ln(harvested_kg / 1000 / harvested_ha).
Explanatory variables, all assembled from the warehouse by drill-across on conformed dimensions:
  * irrigation system valid AT PLANTING (dim_farm SCD Type 2 version)         - farm master data
  * dryland x ln(season rain ratio): Nov-Mar rainfall at the farm in the planting season divided
    by the farm's 2020/21-2025/26 mean                                        - NASA POWER weather fact
  * heat days: days with Tmax >= 35 C in the flowering window (45-75 % of the planting-to-harvest span)
  * ln(fertiliser index): fertiliser kg/ha relative to the crop median        - cost ledger (input_qty)
  * crop and farm fixed effects (management quality, soils)
Models: (1) OLS with HC3 robust standard errors (interpretable elasticities); (2) random forest with
permutation importance (non-linear "key influencer" ranking). Evaluation: 5-fold CV and
leave-one-season-out CV (R2, RMSE, MAE on ln-yield and on t/ha).
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, KFold

from common import EVIDENCE, INK2, SERIES, execute, md_table, query, save, setup_style, subtitle

warnings.filterwarnings("ignore")  # rank-deficient folds: farm and irrigation dummies are collinear within some folds


def load() -> pd.DataFrame:
    return query("""
        WITH cyc AS (
            SELECT c.cycle_id, c.block_id, fa.farm_code, cr.crop_code, cr.crop_name, c.irrigation_method AS irrigation_type, c.is_irrigated,
                   dp.full_date AS planting_date, dh.full_date AS first_harvest, c.planted_ha::float8 AS planted_ha,
                   c.harvested_ha::float8 AS harvested_ha, c.harvested_kg::float8 AS harvested_kg,
                   c.fertiliser_kg::float8 AS fertiliser_kg, c.direct_cost_nad::float8 AS direct_cost_nad,
                   CASE WHEN extract(month FROM dp.full_date) >= 10 THEN extract(year FROM dp.full_date)::int
                        ELSE extract(year FROM dp.full_date)::int - 1 END AS plant_season
            FROM dw.fact_crop_cycle c
            JOIN dw.dim_farm fa ON fa.farm_key = c.farm_key
            JOIN dw.dim_crop cr ON cr.crop_key = c.crop_key
            JOIN dw.dim_date dp ON dp.date_key = c.planting_date_key
            JOIN dw.dim_date dh ON dh.date_key = c.first_harvest_date_key
            WHERE c.cycle_status = 'Completed' AND c.harvested_ha > 0 AND c.harvested_kg > 0
        ), rain AS (   -- Nov-Mar rainfall per farm and season, and the farm's mean over all seasons
            SELECT fa.farm_code,
                   CASE WHEN d.month_num >= 10 THEN d.calendar_year ELSE d.calendar_year - 1 END AS season,
                   sum(w.rainfall_mm)::float8 AS rain_mm
            FROM dw.fact_weather_daily w
            JOIN dw.dim_farm fa ON fa.farm_key = w.farm_key
            JOIN dw.dim_date d ON d.date_key = w.date_key
            WHERE d.month_num IN (11, 12, 1, 2, 3)
            GROUP BY 1, 2
        ), rain_n AS (
            SELECT farm_code, season, rain_mm, rain_mm / avg(rain_mm) OVER (PARTITION BY farm_code) AS rain_ratio FROM rain
        )
        SELECT c.*, r.rain_mm, r.rain_ratio,
               (SELECT count(*) FROM dw.fact_weather_daily w JOIN dw.dim_farm fa ON fa.farm_key = w.farm_key
                 JOIN dw.dim_date d ON d.date_key = w.date_key
                 WHERE fa.farm_code = c.farm_code AND w.t_max_c >= 35
                   AND d.full_date BETWEEN c.planting_date + ((c.first_harvest - c.planting_date) * 0.45)::int
                                       AND c.planting_date + ((c.first_harvest - c.planting_date) * 0.75)::int) AS heat_days
        FROM cyc c LEFT JOIN rain_n r ON r.farm_code = c.farm_code AND r.season = c.plant_season""")


def main():
    setup_style()
    df = load()
    df["yield_t_ha"] = df.harvested_kg / 1000 / df.harvested_ha
    df["ln_yield"] = np.log(df.yield_t_ha)
    df["fert_per_ha"] = df.fertiliser_kg / df.planted_ha
    df["fert_index"] = df.fert_per_ha / df.groupby("crop_code").fert_per_ha.transform("median")
    df = df[(df.fert_index > 0) & df.rain_ratio.notna()].copy()
    df["ln_fert_index"] = np.log(df.fert_index)
    df["dryland"] = (~df.is_irrigated).astype(int)
    df["dry_x_ln_rain"] = df.dryland * np.log(df.rain_ratio)
    df["irrigation"] = pd.Categorical(df.irrigation_type, categories=["Dryland", "Centre pivot", "Drip", "Drip + shade-net", "Flood (canal)"])
    df["harvest_season"] = [d.year if d.month >= 10 else d.year - 1 for d in pd.to_datetime(df.first_harvest)]

    # ---------------- (1) OLS with crop and farm fixed effects, HC3 robust errors
    f = "ln_yield ~ C(crop_code) + C(farm_code) + C(irrigation, Treatment('Dryland')) + dry_x_ln_rain + heat_days + ln_fert_index"
    ols = smf.ols(f, data=df).fit(cov_type="HC3")
    keep = [k for k in ols.params.index if not k.startswith(("C(crop_code)", "C(farm_code)", "Intercept"))]
    coef = pd.DataFrame({"term": keep, "coef": ols.params[keep].values, "std_err": ols.bse[keep].values,
                         "p_value": ols.pvalues[keep].values})
    coef["effect_pct"] = (np.exp(coef.coef) - 1) * 100
    coef["term"] = (coef.term.str.replace(r"C\(irrigation, Treatment\('Dryland'\)\)\[T\.", "Irrigation: ", regex=True)
                    .str.replace("]", "", regex=False).str.replace("dry_x_ln_rain", "Dryland x ln(rain ratio)")
                    .str.replace("heat_days", "Heat days (Tmax >= 35 C, flowering)").str.replace("ln_fert_index", "ln(fertiliser index)"))
    truth = {"Dryland x ln(rain ratio)": "~0.77 elasticity (f = 0.15 + 0.85 r^0.9)",
             "Heat days (Tmax >= 35 C, flowering)": "-0.2 % to -0.7 % per day by crop",
             "ln(fertiliser index)": "+0.2 to +0.3 elasticity"}
    coef["generator_truth"] = coef.term.map(truth).fillna("")

    # ---------------- (2) random forest + permutation importance; CV schemes
    X = pd.get_dummies(df[["crop_code", "irrigation_type", "farm_code"]], drop_first=False).astype(float)
    X["dryland"] = df.dryland
    X["rain_ratio"] = df.rain_ratio
    X["heat_days"] = df.heat_days
    X["fert_index"] = df.fert_index
    y = df.ln_yield.to_numpy()
    rf = RandomForestRegressor(n_estimators=400, min_samples_leaf=3, random_state=42, n_jobs=-1)
    cv_rows = []
    for scheme, splitter, groups in (("5-fold random CV", KFold(5, shuffle=True, random_state=42), None),
                                     ("Leave-one-season-out", GroupKFold(n_splits=df.harvest_season.nunique()), df.harvest_season)):
        for model_name in ("OLS fixed effects", "Random forest"):
            pred = np.zeros_like(y)
            for tr, te in splitter.split(X, y, groups):
                if model_name == "Random forest":
                    pred[te] = RandomForestRegressor(n_estimators=400, min_samples_leaf=3, random_state=42, n_jobs=-1).fit(X.iloc[tr], y[tr]).predict(X.iloc[te])
                else:
                    m = smf.ols(f, data=df.iloc[tr]).fit()
                    pred[te] = m.predict(df.iloc[te])
            cv_rows.append(dict(scheme=scheme, model=model_name, R2_ln=r2_score(y, pred), RMSE_ln=np.sqrt(mean_squared_error(y, pred)),
                                MAE_t_ha=mean_absolute_error(np.exp(y), np.exp(pred)),
                                MAPE_pct=np.mean(np.abs(np.exp(pred) / np.exp(y) - 1)) * 100))
    cv = pd.DataFrame(cv_rows)
    rf.fit(X, y)
    # permutation importance on grouped features (one-hot blocks permuted together)
    groups = {"Crop": [c for c in X if c.startswith("crop_code_")], "Irrigation system": [c for c in X if c.startswith("irrigation_type_")] + ["dryland"],
              "Farm (management, soils)": [c for c in X if c.startswith("farm_code_")], "Season rainfall": ["rain_ratio"],
              "Heat days": ["heat_days"], "Fertiliser rate": ["fert_index"]}
    rng = np.random.default_rng(7)
    base = r2_score(y, rf.predict(X))
    imp = []
    for gname, cols in groups.items():
        drops = []
        for _ in range(20):
            Xp = X.copy()
            perm = rng.permutation(len(Xp))
            Xp[cols] = Xp[cols].to_numpy()[perm]
            drops.append(base - r2_score(y, rf.predict(Xp)))
        imp.append(dict(feature=gname, importance=float(np.mean(drops)), sd=float(np.std(drops))))
    imp = pd.DataFrame(imp).sort_values("importance", ascending=False)
    imp["rank"] = range(1, len(imp) + 1)

    execute("DELETE FROM dw.yield_driver_importance")
    rows = [("Random forest (permutation importance)", r.feature, round(r.importance, 4), None, None, int(r["rank"])) for _, r in imp.iterrows()]
    rows += [("OLS log-yield, crop+farm fixed effects", r.term[:40], None, round(r.coef, 4), round(r.p_value, 6), i + 1)
             for i, (_, r) in enumerate(coef.iterrows())]
    execute("""INSERT INTO dw.yield_driver_importance (model_name, feature, importance, coefficient, p_value, rank_order)
               VALUES (%s,%s,%s,%s,%s,%s)""", rows)

    # ---------------- evidence
    crop_mean = df.groupby("crop_code").ln_yield.transform("mean")
    within_r2 = 1 - np.sum(ols.resid ** 2) / np.sum((df.ln_yield - crop_mean) ** 2)
    contrast = (df[df.crop_code.isin(["MZW", "WML"])].groupby(["crop_name", "dryland"]).yield_t_ha.mean().unstack())
    contrast.columns = ["irrigated_t_ha", "dryland_t_ha"]
    contrast["ratio"] = contrast.irrigated_t_ha / contrast.dryland_t_ha
    (EVIDENCE / "yield_ols.md").write_text(
        f"n = {int(ols.nobs)} completed field-block cycles; R2 = {ols.rsquared:.3f} (adj. {ols.rsquared_adj:.3f}) - dominated by "
        f"between-crop differences; within-crop R2 = {within_r2:.3f}. Robust (HC3) standard errors; crop and farm fixed effects "
        f"not shown.\n\n" + md_table(coef.round(4), floatfmt="{:,.4f}") + "\nCrop-specific irrigation contrast (mean t/ha, all farms):\n\n" +
        md_table(contrast.reset_index().round(2)))
    print("within-crop R2", round(within_r2, 3))
    print(contrast.round(2))
    (EVIDENCE / "yield_cv.md").write_text(md_table(cv.round(3), floatfmt="{:,.3f}"))
    (EVIDENCE / "yield_importance.md").write_text(md_table(imp.round(4), floatfmt="{:,.4f}"))
    dm = df[(df.crop_code == "MZW") & (df.dryland == 1)]
    dmt = dm.groupby("harvest_season").agg(blocks=("block_id", "size"), mean_rain_ratio=("rain_ratio", "mean"),
                                           mean_yield_t_ha=("yield_t_ha", "mean")).reset_index().round(2)
    dmt["harvest_season"] = dmt.harvest_season.map(lambda y: f"{int(y)}/{str(int(y) + 1)[-2:]}")  # season start year 2023 -> 2023/24
    (EVIDENCE / "yield_dryland_maize.md").write_text(md_table(dmt.rename(columns={"harvest_season": "season"})))

    # ---------------- figures
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6.4, 3.9))
    # within-farm (fixed-effects) slope: demean ln(yield) and ln(rain ratio) by farm, one common elasticity
    d = dm.assign(lx=np.log(dm.rain_ratio), ly=np.log(dm.yield_t_ha))
    gx, gy = d.groupby("farm_code").lx.transform("mean"), d.groupby("farm_code").ly.transform("mean")
    b_fe = float(((d.lx - gx) * (d.ly - gy)).sum() / ((d.lx - gx) ** 2).sum())
    for i, (fc, g) in enumerate(sorted(d.groupby("farm_code"), key=lambda t: t[0])):
        ax.scatter(g.rain_ratio, g.yield_t_ha, s=26, color=SERIES[i], edgecolor="#fcfcfb", linewidth=1, label=fc, zorder=3)
        xs = np.linspace(g.rain_ratio.min(), g.rain_ratio.max(), 30)
        a_f = g.ly.mean() - b_fe * g.lx.mean()
        ax.plot(xs, np.exp(a_f) * xs ** b_fe, color=SERIES[i], linewidth=1.6)
    ax.text(0.99, 0.04, f"within-farm elasticity = {b_fe:.2f}", transform=ax.transAxes, ha="right", color=INK2, fontsize=9)
    ax.set_xlabel("season rainfall / farm average (Nov-Mar)")
    ax.set_ylabel("yield, t/ha")
    ax.legend(loc="upper left", ncol=2, fontsize=8)
    ax.set_title("Dryland maize yield rises with season rainfall on every farm")
    subtitle(ax, f"{len(dm)} completed dryland maize blocks, 2021/22-2025/26; lines share one slope (farm fixed effects)")
    ax.grid(True, axis="both")
    save(fig, "fig_yield_rain.png")

    fig, ax = plt.subplots(figsize=(6.4, 3.4))
    ii = imp.sort_values("importance")
    ax.barh(ii.feature, ii.importance, height=0.5, color=SERIES[0])
    for yv, v in enumerate(ii.importance):
        ax.text(v + 0.005, yv, f"{v:.3f}", va="center", fontsize=8, color=INK2)
    ax.set_xlabel("drop in R2 when the feature is permuted")
    ax.set_title("Key influencers of crop yield (random forest)")
    subtitle(ax, "permutation importance, one-hot groups permuted together")
    ax.grid(True, axis="x")
    ax.grid(False, axis="y")
    save(fig, "fig_yield_importance.png")
    print(ols.summary().tables[0])
    print(coef.round(4).to_string(index=False))
    print(cv.round(3).to_string(index=False))
    print(imp.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
