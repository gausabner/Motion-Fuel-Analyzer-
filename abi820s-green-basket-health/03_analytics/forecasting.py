#!/usr/bin/env python3
"""
forecasting.py - Technique 1: time-series forecasting of weekly malaria cases (ABI820S 3.5).

Business question BQ4: how many malaria attendances should the north-east facilities (Rundu, Katima Mulilo,
Nkurenkuru) expect in the next 4 weeks, so that surge beds, staff and rapid diagnostic tests can be planned?

Series   : weekly confirmed-malaria attendances (ICD-10 B50-B54) at the three north-east facilities, from the
           PAS clinical record (complete; IDSR returns have missing weeks and agree within 0.1 %, check R08).
Exogenous: NASA POWER rainfall at the same facilities, summed over weeks t-4 .. t-8 (known 4 weeks ahead,
           matching the mosquito breeding + incubation lag).
Models   : M1 seasonal naive (same week last year), M2 Holt-Winters exponential smoothing (log scale,
           additive trend and 52-week seasonality), M3 dynamic regression SARIMAX(1,0,1) on log cases with
           lagged rainfall and two Fourier pairs for the annual cycle.
Design   : rolling-origin evaluation over the last 52 weeks (2025-W40 .. 2026-W39), refit every 4 weeks,
           horizons 1-4 weeks. Metrics: MAE, RMSE, WAPE, MASE (scaled by in-sample seasonal-naive MAE),
           80 % prediction-interval coverage.
Outputs  : 06_report/figures/fc_*.png, 06_report/evidence/fc_*.md, table mart.analytics_malaria_forecast.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX

from common import EVIDENCE, INK2, MUTED, SERIES, GRID, md_table, query, save, setup_style, subtitle, write_table

warnings.filterwarnings("ignore")
NE = ("GBH-RUN", "GBH-KAT", "GBC-NKU")
H = 4                # forecast horizon (weeks)
TEST_WEEKS = 52
REFIT_EVERY = 4
Z80 = 1.2816


def load() -> pd.DataFrame:
    cases = query("""
        SELECT d.epi_week_start AS week, count(*) AS cases
        FROM dw.fact_encounter e
        JOIN dw.dim_diagnosis dx ON dx.diagnosis_key = e.diagnosis_key
        JOIN dw.dim_condition c ON c.condition_key = dx.condition_key AND c.condition_code = 'MAL'
        JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
        JOIN dw.dim_facility f ON f.facility_key = cu.facility_key AND f.facility_code = ANY(%(ne)s)
        JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
        WHERE d.full_date BETWEEN DATE '2022-01-03' AND DATE '2026-09-27'
        GROUP BY 1 ORDER BY 1""", {"ne": list(NE)})
    rain = query("""
        SELECT d.epi_week_start AS week, avg(w.rainfall_mm) * 7 AS rain_mm
        FROM dw.fact_weather_daily w
        JOIN dw.dim_facility f ON f.facility_key = w.facility_key AND f.facility_code = ANY(%(ne)s)
        JOIN dw.dim_date d ON d.date_key = w.weather_date_key
        GROUP BY 1 ORDER BY 1""", {"ne": list(NE)})
    df = rain.merge(cases, on="week", how="left")
    df["week"] = pd.to_datetime(df.week)
    df = df.set_index("week").asfreq("W-MON")
    df["rain_mm"] = df.rain_mm.astype(float).interpolate()
    # rainfall 4-8 weeks earlier (known at forecast time for horizons up to 4 weeks)
    df["rain_lag48"] = sum(df.rain_mm.shift(k) for k in range(4, 9))
    df = df[(df.index >= "2022-01-03") & (df.index <= "2026-09-21")]   # last complete epi week = 2026-W39
    df["cases"] = df.cases.astype(float)
    return df


def fourier(index: pd.DatetimeIndex, k: int = 2) -> pd.DataFrame:
    t = index.isocalendar().week.values.astype(float)
    cols = {}
    for i in range(1, k + 1):
        cols[f"s{i}"] = np.sin(2 * np.pi * i * t / 52.18)
        cols[f"c{i}"] = np.cos(2 * np.pi * i * t / 52.18)
    return pd.DataFrame(cols, index=index)


def exog(df: pd.DataFrame) -> pd.DataFrame:
    x = fourier(df.index)
    x["lrain"] = np.log1p(df.rain_lag48.values)
    return x


def fit_predict(train: pd.DataFrame, future_idx: pd.DatetimeIndex, future_rain: np.ndarray):
    """Return dict model -> (mean, lower80, upper80) arrays for the future index."""
    y = train.cases.values
    out = {}
    # M1 seasonal naive with in-sample residual spread for the interval
    snaive = np.array([train.cases.get(i - pd.Timedelta(weeks=52), np.nan) for i in future_idx])
    resid = (train.cases - train.cases.shift(52)).dropna()
    s = resid.std()
    out["Seasonal naive"] = (snaive, np.maximum(snaive - Z80 * s, 0), snaive + Z80 * s)
    # M2 Holt-Winters on log1p
    hw = ExponentialSmoothing(np.log1p(y), trend="add", damped_trend=True, seasonal="add", seasonal_periods=52,
                              initialization_method="estimated").fit(optimized=True)
    m = hw.forecast(len(future_idx))
    sd = np.std(hw.resid[52:])
    out["Holt-Winters (ETS)"] = (np.expm1(m), np.expm1(m - Z80 * sd), np.expm1(m + Z80 * sd))
    # M3 SARIMAX dynamic regression
    xtr = exog(train)
    fut = pd.DataFrame(index=future_idx)
    fut["rain_lag48"] = future_rain
    xfu = fourier(future_idx)
    xfu["lrain"] = np.log1p(future_rain)
    mod = SARIMAX(np.log1p(y), exog=xtr.values, order=(1, 0, 1), trend="c").fit(disp=False, maxiter=200)
    fc = mod.get_forecast(len(future_idx), exog=xfu.values)
    mu = fc.predicted_mean
    ci = fc.conf_int(alpha=0.2)
    out["SARIMAX + rainfall"] = (np.expm1(mu), np.expm1(ci[:, 0]), np.expm1(ci[:, 1]))
    return out, mod


def rolling_origin(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    n = len(df)
    first = n - TEST_WEEKS
    for origin in range(first, n, REFIT_EVERY):
        train = df.iloc[:origin]
        fut = df.iloc[origin:min(origin + H, n)]
        preds, _ = fit_predict(train, fut.index, fut.rain_lag48.values)
        for model, (mu, lo, hi) in preds.items():
            for h, (wk, y, p, l_, u) in enumerate(zip(fut.index, fut.cases.values, mu, lo, hi), start=1):
                rows.append(dict(model=model, origin=df.index[origin - 1], week=wk, h=h, actual=y, forecast=p, lo=l_, hi=u))
    return pd.DataFrame(rows)


def metrics(res: pd.DataFrame, df: pd.DataFrame) -> pd.DataFrame:
    train = df.iloc[:len(df) - TEST_WEEKS].cases
    scale = (train - train.shift(52)).abs().dropna().mean()
    out = []
    for model, g in res.groupby("model", sort=False):
        e = g.forecast - g.actual
        out.append(dict(model=model, n_forecasts=len(g), MAE=e.abs().mean(), RMSE=np.sqrt((e ** 2).mean()),
                        WAPE=e.abs().sum() / g.actual.sum(), MASE=e.abs().mean() / scale,
                        coverage_80=((g.actual >= g.lo) & (g.actual <= g.hi)).mean()))
    m = pd.DataFrame(out)
    return m


def main():
    setup_style()
    import matplotlib.pyplot as plt
    df = load()
    res = rolling_origin(df)
    m = metrics(res, df)
    by_h = res.assign(ae=(res.forecast - res.actual).abs()).groupby(["model", "h"]).apply(
        lambda g: g.ae.sum() / g.actual.sum(), include_groups=False).unstack("h")
    best = m.sort_values("WAPE").iloc[0].model
    # final fit on all data, forecast the next 13 weeks (rainfall known 4 weeks ahead, climatology after that)
    future_idx = pd.date_range(df.index[-1] + pd.Timedelta(weeks=1), periods=13, freq="W-MON")
    rain_known = [sum(df.rain_mm.get(w - pd.Timedelta(weeks=k), np.nan) for k in range(4, 9)) for w in future_idx]
    clim = df.groupby(df.index.isocalendar().week).rain_lag48.mean()
    future_rain = np.array([r if not np.isnan(r) else clim.get(w.isocalendar()[1], clim.mean())
                            for r, w in zip(rain_known, future_idx)])
    preds, sarimax = fit_predict(df, future_idx, future_rain)
    mu, lo, hi = preds[best]
    fwd = pd.DataFrame({"week": future_idx, "forecast": mu, "lo": lo, "hi": hi})

    # ---- evidence tables
    mt = m.copy()
    for c in ("WAPE", "coverage_80"):
        mt[c] = mt[c].map(lambda v: f"{100 * v:.1f} %")
    mt["MAE"] = mt.MAE.map(lambda v: f"{v:.1f}")
    mt["RMSE"] = mt.RMSE.map(lambda v: f"{v:.1f}")
    mt["MASE"] = mt.MASE.map(lambda v: f"{v:.2f}")
    (EVIDENCE / "fc_metrics.md").write_text(md_table(mt), encoding="utf-8")
    bh = by_h.reset_index()
    bh.columns = ["model"] + [f"h = {c} wk" for c in bh.columns[1:]]
    for c in bh.columns[1:]:
        bh[c] = bh[c].map(lambda v: f"{100 * v:.1f} %")
    (EVIDENCE / "fc_wape_by_horizon.md").write_text(md_table(bh), encoding="utf-8")
    params = sarimax.params
    names = ["const"] + list(exog(df).columns) + ["ar.L1", "ma.L1", "sigma2"]
    coef = pd.DataFrame({"term": names, "estimate": params, "p_value": sarimax.pvalues})
    coef = coef[coef.term.isin(["lrain", "ar.L1", "ma.L1"])]
    coef["term"] = coef.term.map({"lrain": "log(1 + rainfall 4-8 weeks earlier)", "ar.L1": "AR(1)", "ma.L1": "MA(1)"})
    coef["estimate"] = coef.estimate.map(lambda v: f"{v:.3f}")
    coef["p_value"] = coef.p_value.map(lambda v: "< 0.001" if v < 0.001 else f"{v:.3f}")
    (EVIDENCE / "fc_sarimax_terms.md").write_text(md_table(coef), encoding="utf-8")
    fw = fwd.copy()
    fw["week"] = fw.week.dt.strftime("%G-W%V")
    for c in ("forecast", "lo", "hi"):
        fw[c] = fw[c].round(0).astype(int)
    fw.columns = ["epi week", "forecast", "lower 80 %", "upper 80 %"]
    (EVIDENCE / "fc_forward.md").write_text(md_table(fw.head(8)), encoding="utf-8")
    season = df.groupby(df.index.year).cases.sum().astype(int)
    (EVIDENCE / "fc_summary.md").write_text(
        f"Best model by WAPE: **{best}**. Series: {len(df)} weeks; test: last {TEST_WEEKS} weeks, "
        f"{len(res[res.model == best])} rolling-origin forecasts per model. Annual totals: "
        + ", ".join(f"{y}: {v:,}" for y, v in season.items()) + ".\n", encoding="utf-8")

    # ---- figures
    colors = {"Seasonal naive": SERIES[3], "Holt-Winters (ETS)": SERIES[1], "SARIMAX + rainfall": SERIES[0]}
    fig, ax = plt.subplots(figsize=(10, 4.2))
    ax.plot(df.index, df.cases, color="#3d3c39", lw=1.6, label="Actual (PAS, B50-B54)")
    h1 = res[res.h == 1]
    for model, g in h1.groupby("model", sort=False):
        ax.plot(g.week, g.forecast, color=colors[model], lw=1.8, label=f"{model} (1-week ahead)")
    ax.axvspan(df.index[-TEST_WEEKS], df.index[-1], color=GRID, alpha=0.5, lw=0, zorder=-1)
    ax.text(df.index[-TEST_WEEKS], ax.get_ylim()[1] * 0.95, "  test period (rolling origin)", color=INK2, fontsize=8.5, va="top")
    ax.set_title("Weekly malaria attendances, north-east facilities", loc="left")
    subtitle(ax, "Rundu, Katima Mulilo and Nkurenkuru combined; 1-week-ahead forecasts in the test year")
    ax.set_ylabel("Attendances per week")
    ax.legend(loc="upper left", ncols=2, fontsize=8.5)
    ax.margins(x=0.01)
    save(fig, "fc_malaria_backtest.png")

    fig, ax = plt.subplots(figsize=(10, 3.6))
    hist = df[df.index >= "2025-01-01"]
    ax.plot(hist.index, hist.cases, color="#3d3c39", lw=1.6, label="Actual")
    ax.plot(fwd.week, fwd.forecast, color=colors[best], lw=2, label=f"Forecast ({best})")
    ax.fill_between(fwd.week, fwd.lo, fwd.hi, color=colors[best], alpha=0.18, lw=0, label="80 % prediction interval")
    ax.set_title("Malaria outlook for the next 13 weeks", loc="left")
    subtitle(ax, "Low season until the rains: the model expects the next upswing only after the November-December rains")
    ax.set_ylabel("Attendances per week")
    ax.legend(loc="upper right", fontsize=8.5)
    save(fig, "fc_malaria_forward.png")

    fig, ax = plt.subplots(figsize=(10, 3.4))
    ax2_data = df.rain_lag48
    ax.plot(df.index, ax2_data, color=SERIES[0], lw=1.4)
    ax.set_title("Rainfall 4-8 weeks earlier (exogenous driver)", loc="left")
    subtitle(ax, "Sum of the NASA POWER rainfall at the three facilities, weeks t-4 to t-8 (mm); shown separately - no dual axis")
    ax.set_ylabel("mm")
    save(fig, "fc_rain_driver.png")

    # ---- mart table for Power BI (back-test + forward forecast)
    bt = res[(res.model == best) & (res.h == 1)][["week", "actual", "forecast", "lo", "hi"]].assign(kind="Back-test (1 week ahead)")
    fwd2 = fwd.assign(actual=np.nan, kind="Forecast")
    hist2 = df[["cases"]].reset_index().rename(columns={"cases": "actual"}).assign(forecast=np.nan, lo=np.nan, hi=np.nan, kind="Actual")
    out = pd.concat([hist2, bt, fwd2], ignore_index=True)
    out["week_date_key"] = out.week.dt.strftime("%Y%m%d").astype(int)
    out["model"] = best
    write_table(out, "mart.analytics_malaria_forecast",
                {"week_date_key": "integer", "kind": "text", "model": "text", "actual": "numeric", "forecast": "numeric",
                 "lo": "numeric", "hi": "numeric"})
    print(m.to_string(index=False))
    print(by_h)
    print(fwd)


if __name__ == "__main__":
    main()
