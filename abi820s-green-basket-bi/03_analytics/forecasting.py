#!/usr/bin/env python3
"""
forecasting.py - monthly net-revenue forecasting by crop category (ABI820S 3.5, technique 1).

Method
  * Series: monthly net revenue (N$) per crop category from dw.fact_sales, Apr 2021 - Sep 2026 (66 months).
  * Back-test: train Apr 2021 - Sep 2025 (54 months), hold out Oct 2025 - Sep 2026 (12 months).
  * Models: (1) seasonal naive benchmark, (2) ETS(A,Ad,A) with prediction intervals, (3) SARIMA(1,0,0)(0,1,1)12
    with drift. Transformation rule: model log1p(revenue) when the series has no near-zero months (variance
    stabilising, multiplicative seasonality); otherwise (Fruit: zero revenue outside the grape season) the raw scale.
  * Metrics: MAE, RMSE, MAPE (where actuals are not near zero), WAPE, MASE (scaled by the in-sample
    seasonal-naive MAE, Hyndman & Koehler 2006) and empirical coverage of the 80 % / 95 % intervals.
  * The best model per category (lowest hold-out WAPE) is refitted on all 66 months and forecasts
    Oct 2026 - Sep 2027. All back-test and forward rows are written to dw.fact_forecast_monthly.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.exponential_smoothing.ets import ETSModel
from statsmodels.tsa.statespace.sarimax import SARIMAX

from common import EVIDENCE, INK2, MUTED, SERIES, execute, md_table, query, save, setup_style, subtitle

warnings.filterwarnings("ignore")
H = 12
CATS = ["Cereals & grains", "Vegetables", "Fruit"]


def load() -> pd.DataFrame:
    df = query("""
        SELECT d.month_end_date AS month, cc.category_name AS category, cc.crop_category_key AS cat_key,
               sum(f.net_revenue_nad)::float8 AS rev
        FROM dw.fact_sales f
        JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
        JOIN dw.dim_product p ON p.product_key = f.product_key
        JOIN dw.dim_crop c ON c.crop_key = p.crop_key
        JOIN dw.dim_crop_category cc ON cc.crop_category_key = c.crop_category_key
        GROUP BY 1, 2, 3 ORDER BY 1, 2""")
    df["month"] = pd.to_datetime(df.month)
    return df


def seasonal_naive(train: np.ndarray, h: int):
    reps = int(np.ceil(h / 12))
    fc = np.tile(train[-12:], reps)[:h]
    resid = train[12:] - train[:-12]
    sd = resid.std(ddof=1)
    k = np.sqrt(np.floor(np.arange(h) / 12) + 1)  # seasonal-naive variance grows with whole seasons
    return fc, fc - 1.2816 * sd * k, fc + 1.2816 * sd * k, fc - 1.96 * sd * k, fc + 1.96 * sd * k


def use_log(train: np.ndarray) -> bool:
    return bool(train.min() > 0.05 * train.mean())


def _as_series(train: np.ndarray) -> pd.Series:
    idx = pd.date_range("2021-04-30", periods=len(train), freq="ME")
    vals = np.log1p(np.maximum(train, 0)) if use_log(train) else np.asarray(train, dtype=float)
    return pd.Series(vals, index=idx)


def _back(train: np.ndarray):
    return (lambda v: np.expm1(np.asarray(v))) if use_log(train) else (lambda v: np.asarray(v))


def ets(train: np.ndarray, h: int):
    y = _as_series(train)
    m = ETSModel(y, error="add", trend="add", damped_trend=True, seasonal="add", seasonal_periods=12).fit(disp=False)
    pr = m.get_prediction(start=len(y), end=len(y) + h - 1)
    f80 = pr.summary_frame(alpha=0.20)
    f95 = pr.summary_frame(alpha=0.05)
    back = _back(train)
    return (back(f80["mean"]), back(f80["pi_lower"]), back(f80["pi_upper"]),
            back(f95["pi_lower"]), back(f95["pi_upper"]))


def sarima(train: np.ndarray, h: int):
    y = _as_series(train)
    m = SARIMAX(y, order=(1, 0, 0), seasonal_order=(0, 1, 1, 12), trend="c").fit(disp=False)
    fc = m.get_forecast(h)
    c80 = np.asarray(fc.conf_int(alpha=0.20))
    c95 = np.asarray(fc.conf_int(alpha=0.05))
    back = _back(train)
    return (back(fc.predicted_mean), back(c80[:, 0]), back(c80[:, 1]), back(c95[:, 0]), back(c95[:, 1]))


MODELS = {"Seasonal naive": seasonal_naive, "ETS(A,Ad,A)": ets, "SARIMA(1,0,0)(0,1,1)12": sarima}


def metrics(y, f, lo80, hi80, lo95, hi95, train):
    e = y - f
    mae = np.mean(np.abs(e))
    rmse = np.sqrt(np.mean(e ** 2))
    mask = y > 0.05 * np.mean(train)  # MAPE is undefined/explosive for near-zero (off-season) months
    mape = np.mean(np.abs(e[mask] / y[mask])) * 100 if mask.any() else np.nan
    wape = np.sum(np.abs(e)) / np.sum(np.abs(y)) * 100
    scale = np.mean(np.abs(train[12:] - train[:-12]))
    mase = mae / scale
    cov80 = np.mean((y >= lo80) & (y <= hi80)) * 100
    cov95 = np.mean((y >= lo95) & (y <= hi95)) * 100
    return dict(MAE_Nm=mae / 1e6, RMSE_Nm=rmse / 1e6, MAPE_pct=mape, WAPE_pct=wape, MASE=mase,
                cov80_pct=cov80, cov95_pct=cov95, mape_months=int(mask.sum()))


def main():
    setup_style()
    df = load()
    wide = df.pivot(index="month", columns="category", values="rev").fillna(0)[CATS]
    keys = df.drop_duplicates("category").set_index("category").cat_key.to_dict()
    months = wide.index
    train_idx, test_idx = months[:-H], months[-H:]
    future = pd.date_range(months[-1] + pd.offsets.MonthEnd(1), periods=H, freq="ME")

    rows, out_rows, best = [], [], {}
    backtests = {}
    for cat in CATS + ["Division total"]:
        series = wide.sum(axis=1).to_numpy() if cat == "Division total" else wide[cat].to_numpy()
        train, test = series[:-H], series[-H:]
        for name, fn in MODELS.items():
            f, lo80, hi80, lo95, hi95 = fn(train, H)
            lo80, lo95 = np.maximum(lo80, 0), np.maximum(lo95, 0)
            m = metrics(test, f, lo80, hi80, lo95, hi95, train)
            rows.append(dict(category=cat, model=name, scale="log1p" if (use_log(train) and name != "Seasonal naive") else "raw", **m))
            backtests[(cat, name)] = (f, lo80, hi80, lo95, hi95)
            if cat != "Division total":
                for i, mth in enumerate(test_idx):
                    out_rows.append((int(mth.strftime("%Y%m%d")), keys[cat], name, "Backtest", float(test[i]), float(f[i]),
                                     float(lo80[i]), float(hi80[i]), float(lo95[i]), float(hi95[i])))
    res = pd.DataFrame(rows)
    for cat in CATS + ["Division total"]:
        sub = res[res.category == cat].sort_values("WAPE_pct")
        best[cat] = sub.iloc[0].model

    # forward forecast with every model refitted on all data (best model flagged in the report)
    fwd = {}
    for cat in CATS + ["Division total"]:
        series = wide.sum(axis=1).to_numpy() if cat == "Division total" else wide[cat].to_numpy()
        for name, fn in MODELS.items():
            f, lo80, hi80, lo95, hi95 = fn(series, H)
            lo80, lo95 = np.maximum(lo80, 0), np.maximum(lo95, 0)
            fwd[(cat, name)] = (f, lo80, hi80, lo95, hi95)
            if cat != "Division total":
                for i, mth in enumerate(future):
                    out_rows.append((int(mth.strftime("%Y%m%d")), keys[cat], name, "Forecast", None, float(f[i]),
                                     float(lo80[i]), float(hi80[i]), float(lo95[i]), float(hi95[i])))

    execute("DELETE FROM dw.fact_forecast_monthly")
    execute("""INSERT INTO dw.fact_forecast_monthly (month_date_key, crop_category_key, model_name, scenario,
               actual_net_revenue_nad, forecast_net_revenue_nad, lower_80_nad, upper_80_nad, lower_95_nad, upper_95_nad)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [tuple(round(v, 2) if isinstance(v, float) else v for v in r) for r in out_rows])

    # ---------------- evidence tables
    show = res.copy()
    show["best"] = [("**best**" if best[c] == m else "") for c, m in zip(show.category, show.model)]
    (EVIDENCE / "forecast_metrics.md").write_text(md_table(show.round(2)))
    tot_name = best["Division total"]
    f, lo80, hi80, lo95, hi95 = fwd[("Division total", tot_name)]
    nxt = pd.DataFrame({"month": future.strftime("%Y-%m"), "forecast_Nm": f / 1e6, "lo80_Nm": lo80 / 1e6,
                        "hi80_Nm": hi80 / 1e6, "lo95_Nm": lo95 / 1e6, "hi95_Nm": hi95 / 1e6})
    (EVIDENCE / "forecast_next12.md").write_text(
        f"Model: {tot_name} (lowest hold-out WAPE for the division total)\n\n" + md_table(nxt.round(1)) +
        f"\nForecast Oct 2026 - Sep 2027 total: N$ {f.sum() / 1e6:,.1f} m "
        f"(sum of point forecasts; FY2027 H2 Oct 2026 - Mar 2027 = N$ {f[:6].sum() / 1e6:,.1f} m)\n")

    # ---------------- figure 1: back-test + forward forecast for the division total
    import matplotlib.pyplot as plt
    total = wide.sum(axis=1)
    fig, ax = plt.subplots(figsize=(10, 4.2))
    ax.plot(total.index, total.values / 1e6, color=SERIES[0], label="Actual net revenue")
    bf, blo80, bhi80, blo95, bhi95 = backtests[("Division total", tot_name)]
    ax.plot(test_idx, bf / 1e6, color=SERIES[1], label=f"Back-test forecast ({tot_name})")
    ax.fill_between(future, lo95 / 1e6, hi95 / 1e6, color=SERIES[1], alpha=0.10, linewidth=0, label="95% interval")
    ax.fill_between(future, lo80 / 1e6, hi80 / 1e6, color=SERIES[1], alpha=0.18, linewidth=0, label="80% interval")
    ax.plot(future, f / 1e6, color=SERIES[1], linestyle=(0, (4, 2)), label="Forward forecast")
    ax.axvline(test_idx[0], color=MUTED, linewidth=1)
    ax.text(test_idx[0], ax.get_ylim()[1] * 0.97, "  hold-out starts Oct 2025", color=INK2, fontsize=8, va="top")
    ax.set_ylabel("N$ million per month")
    ax.set_title("Monthly net revenue: actual, 12-month back-test and forward forecast")
    subtitle(ax, "Division total; grape harvest drives the Nov-Jan peaks")
    ax.legend(loc="upper left", ncol=3, bbox_to_anchor=(0, -0.12))
    save(fig, "fig_forecast_total.png")

    # ---------------- figure 2: hold-out WAPE by model and category (grouped bars)
    fig, ax = plt.subplots(figsize=(8, 3.6))
    cats = CATS + ["Division total"]
    x = np.arange(len(cats))
    width = 0.22
    for j, name in enumerate(MODELS):
        vals = [res[(res.category == c) & (res.model == name)].WAPE_pct.iloc[0] for c in cats]
        ax.bar(x + (j - 1) * (width + 0.02), vals, width=width, color=SERIES[j], label=name)
        for xi, v in zip(x + (j - 1) * (width + 0.02), vals):
            ax.text(xi, v + 0.6, f"{v:.0f}", ha="center", fontsize=8, color=INK2)
    ax.set_xticks(x, cats)
    ax.set_ylabel("Hold-out WAPE (%) - lower is better")
    ax.set_title("Forecast accuracy on the 12-month hold-out (Oct 2025 - Sep 2026)")
    ax.legend(loc="upper left", ncol=3, bbox_to_anchor=(0, -0.1))
    save(fig, "fig_forecast_wape.png")
    print(res.round(2).to_string(index=False))
    print("best:", best)
    print(nxt.round(1).to_string(index=False))


if __name__ == "__main__":
    main()
