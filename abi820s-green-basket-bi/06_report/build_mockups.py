#!/usr/bin/env python3
"""
build_mockups.py - renders high-fidelity design mock-ups of the four Power BI report pages (1280 x 720
canvas, same layout, titles and measures as the PBIR report) from live warehouse data. The SQL mirrors
the DAX measure logic. These are DESIGN PROTOTYPES, not Power BI screenshots: replace them with real
screenshots once the .pbix is refreshed (see 04_powerbi/BUILD_GUIDE.md, step 10).
Output: 06_report/figures/mockup_p{1..4}_*.png
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "03_analytics"))
from common import AXIS, FIG, GRID, INK, INK2, MUTED, SERIES, query, setup_style  # noqa: E402

W, H = 1280, 720
PAGE_BG = "#F9F9F7"
GOOD, BAD = "#006300", "#d03b3b"


class Page:
    def __init__(self, title: str, subtitle: str):
        setup_style()
        plt.rcParams.update({"axes.titlesize": 9.5, "font.size": 8, "xtick.labelsize": 7.5, "ytick.labelsize": 7.5})
        self.fig = plt.figure(figsize=(12.8, 7.2), dpi=150)
        self.fig.patch.set_facecolor(PAGE_BG)
        self.fig.text(24 / W, 1 - 22 / H, title, fontsize=15, fontweight="bold", color=INK, va="top")
        self.fig.text(1 - 24 / W, 1 - 26 / H, subtitle, fontsize=8, color=INK2, va="top", ha="right")
        self.fig.text(24 / W, 8 / H, "Design mock-up rendered from the PostgreSQL warehouse (not a Power BI screenshot) - "
                      "layout and titles follow GreenBasket_Agri.Report (some table columns omitted)", fontsize=6.5, color=MUTED)

    def box(self, x, y, w, h, title=None):
        fx, fy, fw, fh = x / W, 1 - (y + h) / H, w / W, h / H
        self.fig.patches.append(FancyBboxPatch((fx, fy), fw, fh, boxstyle="round,pad=0,rounding_size=0.006",
                                               transform=self.fig.transFigure, facecolor="white", edgecolor="#E1E0D9",
                                               linewidth=0.8, zorder=-1))
        if title:
            self.fig.text(fx + 10 / W, fy + fh - 9 / H, title, fontsize=9, fontweight="semibold", color=INK, va="top")
        return fx, fy, fw, fh

    def axes(self, x, y, w, h, title=None, pad=(46, 30, 14, 24)):
        fx, fy, fw, fh = self.box(x, y, w, h, title)
        l, t, r, b = pad
        ax = self.fig.add_axes([fx + l / W, fy + b / H, fw - (l + r) / W, fh - (t + b) / H])
        ax.set_facecolor("white")
        return ax

    def slicer(self, x, y, w, label, value, h=58):
        fx, fy, fw, fh = self.box(x, y, w, h)
        self.fig.text(fx + 10 / W, fy + fh - 10 / H, label, fontsize=7.5, color=INK2, va="top")
        self.fig.text(fx + 10 / W, fy + 12 / H, value, fontsize=9, color=INK, va="bottom")
        self.fig.text(fx + fw - 14 / W, fy + 12 / H, "v", fontsize=8, color=MUTED, va="bottom")

    def card(self, x, y, w, h, label, value, delta=None, good=True):
        fx, fy, fw, fh = self.box(x, y, w, h)
        self.fig.text(fx + 10 / W, fy + fh - 10 / H, label, fontsize=7.5, color=INK2, va="top")
        self.fig.text(fx + 10 / W, fy + fh / 2 - 6 / H, value, fontsize=17 if h > 70 else 13, fontweight="semibold", color=INK, va="center")
        if delta:
            self.fig.text(fx + 10 / W, fy + 8 / H, ("▲ " if good else "▼ ") + delta, fontsize=7.5, color=GOOD if good else BAD, va="bottom")

    def table(self, x, y, w, h, title, df: pd.DataFrame, col_w=None):
        fx, fy, fw, fh = self.box(x, y, w, h, title)
        ncol = len(df.columns)
        col_w = col_w or [1 / ncol] * ncol
        top = fy + fh - 30 / H
        row_h = min(17 / H, (fh - 40 / H) / (len(df) + 1))
        xs = [fx + 10 / W]
        for cw in col_w[:-1]:
            xs.append(xs[-1] + cw * (fw - 20 / W))
        for j, c in enumerate(df.columns):
            self.fig.text(xs[j] + (col_w[j] * (fw - 20 / W) - 4 / W if j else 0), top, c, fontsize=7.2, fontweight="semibold",
                          color=INK2, va="top", ha="right" if j else "left")
        self.fig.add_artist(plt.Line2D([fx + 8 / W, fx + fw - 8 / W], [top - row_h * 0.9] * 2, transform=self.fig.transFigure, color=AXIS, lw=0.6))
        for i, (_, r) in enumerate(df.iterrows(), start=1):
            yy = top - row_h * i - 2 / H
            for j, v in enumerate(r.values):
                self.fig.text(xs[j] + (col_w[j] * (fw - 20 / W) - 4 / W if j else 0), yy, str(v), fontsize=7.2, color=INK,
                              va="top", ha="right" if j else "left")

    def save(self, name):
        path = FIG / name
        self.fig.savefig(path, facecolor=PAGE_BG)
        plt.close(self.fig)
        print("saved", path.name)


def fmt_m(v):
    return f"N$ {v / 1e6:,.1f} m"


def style(ax, ygrid=True):
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.spines["bottom"].set_color(AXIS)
    ax.grid(False, axis="x")
    if ygrid:
        ax.grid(True, axis="y", color=GRID, linewidth=0.6)
    else:
        ax.grid(False, axis="y")
    ax.tick_params(length=0)
    ax.set_axisbelow(True)


# ------------------------------------------------------------------------------------------------ data
def fy_sales(fy: int) -> pd.DataFrame:
    return query(f"""
        SELECT d.year_month, d.fiscal_month_num, c.crop_name, cc.category_name, cu.channel, fa.farm_name, fa.farm_code,
               sum(f.net_revenue_nad)::float8 AS rev, sum(f.cogs_nad)::float8 AS cogs, sum(f.quantity_kg)::float8 AS kg
        FROM mart.fact_sales f JOIN mart.dim_date d ON d.date_key = f.invoice_date_key
        JOIN mart.dim_product p ON p.product_key = f.product_key JOIN mart.dim_crop c ON c.crop_key = p.crop_key
        JOIN mart.dim_crop_category cc ON cc.crop_category_key = c.crop_category_key
        JOIN mart.dim_customer cu ON cu.customer_key = f.customer_key JOIN mart.dim_farm fa ON fa.farm_key = f.farm_key
        WHERE d.fiscal_year = {fy} GROUP BY 1, 2, 3, 4, 5, 6, 7""")


def page1():
    cur, py = fy_sales(2026), fy_sales(2025)
    rev, rev_py = cur.rev.sum(), py.rev.sum()
    gm = 1 - cur.cogs.sum() / rev
    gm_py = 1 - py.cogs.sum() / rev_py
    exp = cur[cur.channel == "Export"].rev.sum() / rev
    exp_py = py[py.channel == "Export"].rev.sum() / rev_py
    yld = query("""SELECT sum(harvested_kg) FILTER (WHERE cycle_status='Completed')/1000/sum(harvested_ha) FILTER (WHERE cycle_status='Completed') AS y,
                          sum(planned_production_kg) FILTER (WHERE cycle_status='Completed')/1000/sum(planted_ha) FILTER (WHERE cycle_status='Completed') AS p
                   FROM mart.fact_crop_cycle WHERE harvest_season_end_date_key = 20250930""").iloc[0]
    stock = query("""SELECT sum(closing_stock_value_nad)::float8 AS v FROM mart.fact_inventory_monthly
                     WHERE snapshot_date_key = (SELECT max(snapshot_date_key) FROM mart.fact_inventory_monthly WHERE snapshot_date_key <= 20260331)""").v[0]
    pg = Page("Green Basket Agriculture - Executive Summary", "Data to 30 Sep 2026  |  Fiscal year FY2026 (Apr 2025 - Mar 2026)")
    for i, (lab, val) in enumerate([("Fiscal year", "FY2026"), ("Management zone", "All"), ("Crop category", "All"), ("Sales channel", "All")]):
        pg.slicer(24 + i * 212, 56, 200, lab, val)
    yv = float(yld.y) / float(yld.p) - 1
    cards = [("Net revenue FYTD", fmt_m(rev), f"{100 * (rev / rev_py - 1):.1f}% vs FY2025", rev >= rev_py),
             ("FYTD growth vs PY", f"{100 * (rev / rev_py - 1):+.1f}%", None, True),
             ("Gross margin %", f"{100 * gm:.1f}%", f"{100 * (gm - gm_py):+.1f} pts vs PY", gm >= gm_py),
             ("Export share", f"{100 * exp:.1f}%", f"{100 * (exp - exp_py):+.1f} pts vs PY", exp >= exp_py),
             ("Yield vs plan (2024/25)", f"{100 * yv:+.1f}%", None, yv >= 0),
             ("Stock value (latest)", fmt_m(stock), None, True)]
    for i, (lab, val, dl, good) in enumerate(cards):
        pg.card(24 + i * 206, 126, 190 if i < 5 else 202, 92, lab, val, dl, good)
    ax = pg.axes(24, 232, 820, 250, "Net revenue by month vs same month last year")
    m_cur = cur.groupby("fiscal_month_num").rev.sum() / 1e6
    m_py = py.groupby("fiscal_month_num").rev.sum() / 1e6
    labels = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]
    ax.plot(range(12), m_cur.values, color=SERIES[0], lw=2, label="Net revenue FY2026")
    ax.plot(range(12), m_py.values, color=SERIES[1], lw=2, label="Same month FY2025")
    ax.set_xticks(range(12), labels)
    ax.set_ylabel("N$ million", color=INK2)
    ax.legend(loc="upper left", fontsize=7, ncol=2)
    ax.annotate(f"Dec peak: N$ {m_cur.max():.0f} m (grape exports)", (int(np.argmax(m_cur.values)), m_cur.max()),
                xytext=(-150, -8), textcoords="offset points", fontsize=7, color=INK2)
    style(ax)
    ax = pg.axes(860, 232, 396, 250, "Net revenue by crop", pad=(84, 30, 40, 36))
    bc = cur.groupby("crop_name").rev.sum().sort_values() / 1e6
    bc.index = [c.replace(" (pearl millet)", "") for c in bc.index]
    ax.barh(bc.index, bc.values, height=0.6, color=SERIES[0])
    for yv_, v in enumerate(bc.values):
        ax.text(v + bc.max() * 0.01, yv_, f"{v:,.0f}", va="center", fontsize=6.8, color=INK2)
    ax.set_xlabel("N$ million", color=INK2)
    style(ax, ygrid=False)
    ax.grid(True, axis="x", color=GRID, linewidth=0.6)
    ax = pg.axes(24, 494, 400, 210, "Net revenue by sales channel", pad=(40, 30, 10, 40))
    ch = cur.groupby("channel").rev.sum().sort_values(ascending=False) / 1e6
    ax.bar(range(len(ch)), ch.values, width=0.55, color=SERIES[0])
    ax.set_xticks(range(len(ch)), [c.replace("Miller/Processor", "Miller").replace("Informal market", "Informal") for c in ch.index], fontsize=7)
    for xi, v in enumerate(ch.values):
        ax.text(xi, v + ch.max() * 0.02, f"{v:,.0f}", ha="center", fontsize=6.8, color=INK2)
    style(ax)
    fs = cur[cur.farm_code != "UNKNOWN"].groupby("farm_name").agg(rev=("rev", "sum"), cogs=("cogs", "sum"))
    fs_py = py[py.farm_code != "UNKNOWN"].groupby("farm_name").rev.sum()
    fs["YoY %"] = (fs.rev / fs_py - 1) * 100
    fs["GM %"] = (1 - fs.cogs / fs.rev) * 100
    fs = fs.sort_values("rev", ascending=False).head(9)
    tab = pd.DataFrame({"Farm": fs.index, "Net revenue": [f"N$ {v / 1e6:,.1f} m" for v in fs.rev],
                        "YoY %": [f"{v:+.1f}%" for v in fs["YoY %"]], "Gross margin %": [f"{v:.1f}%" for v in fs["GM %"]]})
    pg.table(440, 494, 816, 210, "Farm scorecard (top 9 by revenue)", tab, col_w=[0.43, 0.2, 0.17, 0.2])
    pg.save("mockup_p1_executive.png")
    return dict(rev=rev, rev_py=rev_py, gm=gm, exp=exp, yield_vs_plan=yv, stock=stock)


def page2():
    pg = Page("Production & Yield Diagnostics", "Crop: White maize  |  Seasons 2020/21 - 2025/26")
    for i, (lab, val) in enumerate([("Agricultural season", "All"), ("Crop", "White maize"), ("Farm irrigation (as-was)", "All"), ("Management zone", "All")]):
        pg.slicer(24 + i * 212, 56, 200, lab, val)
    cyc = query("""SELECT r.region_name, f.farm_name, f.irrigation_type, c.irrigation_method, d.crop_season_label AS season, c.planted_ha::float8 AS planted_ha,
                          c.harvested_ha::float8 AS harvested_ha, c.harvested_kg::float8 AS kg, c.planned_production_kg::float8 AS plan_kg,
                          c.direct_cost_nad::float8 AS cost, c.cycle_status, f.farm_code
                   FROM mart.fact_crop_cycle c JOIN mart.dim_farm f ON f.farm_key = c.farm_key JOIN mart.dim_region r ON r.region_key = f.region_key
                   JOIN mart.dim_crop cr ON cr.crop_key = c.crop_key JOIN mart.dim_date d ON d.date_key = c.harvest_season_end_date_key
                   WHERE cr.crop_code = 'MZW'""")
    comp = cyc[cyc.cycle_status == "Completed"]
    y_all = comp.kg.sum() / 1000 / comp.harvested_ha.sum()
    bench = query("""SELECT sum(production_t)/sum(area_planted_ha) AS b FROM mart.fact_crop_estimate e JOIN mart.dim_crop c ON c.crop_key = e.crop_key
                     WHERE c.crop_code='MZW' AND e.farming_sector='Commercial'""").b[0]
    failed = cyc[cyc.cycle_status == "Failed"].planted_ha.sum() / cyc.planted_ha.sum()
    pg.card(872, 56, 124, 58, "Yield t/ha", f"{y_all:.2f}")
    pg.card(1004, 56, 124, 58, "Gap vs NSA", f"{y_all - float(bench):+.2f}")
    pg.card(1136, 56, 120, 58, "Failed area", f"{100 * failed:.1f}%")
    g = comp.groupby(["region_name", "farm_name"]).agg(kg=("kg", "sum"), ha=("harvested_ha", "sum"), plan=("plan_kg", "sum"),
                                                       pha=("planted_ha", "sum"), cost=("cost", "sum")).reset_index()
    g["Yield"] = g.kg / 1000 / g.ha
    g["Plan"] = g.plan / 1000 / g.pha
    g["Cost N$/t"] = g.cost / (g.kg / 1000)
    g = g.sort_values(["region_name", "Yield"], ascending=[True, False])
    tab = pd.DataFrame({"Region > Farm": [f"{r} > {f}" for r, f in zip(g.region_name, g.farm_name)], "Yield": g.Yield.map("{:.2f}".format),
                        "Plan": g.Plan.map("{:.2f}".format), "vs plan": ((g.Yield / g.Plan - 1) * 100).map("{:+.1f}%".format),
                        "Cost N$/t": g["Cost N$/t"].map("{:,.0f}".format)})
    pg.table(24, 128, 700, 300, "Yield by region and farm (drill down region > farm)", tab, col_w=[0.52, 0.11, 0.11, 0.12, 0.14])
    ax = pg.axes(740, 128, 516, 300, "Yield by season and block irrigation method", pad=(40, 30, 12, 40))
    piv = comp.groupby(["season", "irrigation_method"]).apply(lambda d: d.kg.sum() / 1000 / d.harvested_ha.sum(), include_groups=False).unstack()
    piv = piv[[c for c in ["Dryland", "Centre pivot", "Flood (canal)", "Drip"] if c in piv.columns]]
    xs = np.arange(len(piv))
    wd = 0.8 / len(piv.columns)
    for j, colname in enumerate(piv.columns):
        ax.bar(xs + (j - (len(piv.columns) - 1) / 2) * wd, piv[colname].values, width=wd * 0.9, color=SERIES[j], label=colname)
    ax.set_xticks(xs, piv.index)
    ax.set_ylabel("t/ha", color=INK2)
    ax.set_ylim(0, np.nanmax(piv.values) * 1.35)
    ax.legend(loc="upper left", fontsize=6.8, ncol=4)
    style(ax)
    ax = pg.axes(24, 440, 610, 264, "Rainfall vs yield by farm and irrigation system", pad=(46, 30, 14, 42))
    rain = query("""SELECT f.farm_code, f.irrigation_type, sum(w.rainfall_mm)::float8 / count(DISTINCT d.crop_season_label) AS rain
                    FROM mart.fact_weather_daily w JOIN mart.dim_farm f ON f.farm_key = w.farm_key
                    JOIN mart.dim_date d ON d.date_key = w.date_key GROUP BY 1, 2""")
    pts = comp.groupby(["farm_code", "irrigation_type"]).apply(lambda d: d.kg.sum() / 1000 / d.harvested_ha.sum(),
                                                               include_groups=False).reset_index(name="y")
    pts = pts.merge(rain, on=["farm_code", "irrigation_type"])
    for j, it in enumerate(piv.columns):
        d = pts[pts.irrigation_type == it]
        ax.scatter(d.rain, d.y, s=46, color=SERIES[j], edgecolor="white", linewidth=1.5, label=it, zorder=3)
    ax.set_xlabel("Rainfall per season at the farm (mm)", color=INK2)
    ax.set_ylabel("t/ha", color=INK2)
    ax.legend(loc="lower left", fontsize=6.8, ncol=2)
    style(ax)
    ax.grid(True, axis="x", color=GRID, linewidth=0.6)
    ax = pg.axes(650, 440, 606, 264, "Harvest tonnes by month", pad=(46, 30, 14, 34))
    hv = query("""SELECT d.month_start_date AS m, sum(h.harvested_kg)/1000 AS t FROM mart.fact_harvest h JOIN mart.dim_date d ON d.date_key = h.harvest_date_key
                  JOIN mart.dim_crop c ON c.crop_key = h.crop_key WHERE c.crop_code = 'MZW' GROUP BY 1 ORDER BY 1""")
    allm = pd.DataFrame({"m": pd.date_range("2021-04-01", "2026-09-01", freq="MS").date})
    hv = allm.merge(hv, on="m", how="left").fillna(0)
    ax.plot(pd.to_datetime(hv.m), hv.t.astype(float), color=SERIES[0], lw=1.8)
    ax.set_ylabel("tonnes", color=INK2)
    style(ax)
    pg.save("mockup_p2_production.png")


def page3():
    pg = Page("Advanced Analytics - Forecast, Segments, Drivers", "Forecast model: Seasonal naive (lowest hold-out WAPE)")
    pg.slicer(24, 56, 300, "Forecast model", "Seasonal naive")
    wape = query("""SELECT sum(abs(actual_net_revenue_nad - forecast_net_revenue_nad))/sum(abs(actual_net_revenue_nad)) AS w
                    FROM mart.fact_forecast_monthly WHERE scenario='Backtest' AND model_name='Seasonal naive'""").w[0]
    pg.card(340, 56, 180, 58, "Hold-out WAPE (category)", f"{100 * float(wape):.1f}%")
    top = query("""WITH c AS (SELECT cu.customer_code, sum(f.net_revenue_nad) r FROM mart.fact_sales f JOIN mart.dim_customer cu ON cu.customer_key=f.customer_key
                   JOIN mart.dim_date d ON d.date_key=f.invoice_date_key WHERE d.fiscal_year=2026 GROUP BY 1)
                   SELECT (SELECT sum(r) FROM (SELECT r FROM c ORDER BY r DESC LIMIT 10) t)/sum(r) AS s FROM c""").s[0]
    pg.card(528, 56, 200, 58, "Top-10 customer share", f"{100 * float(top):.1f}%")
    ax = pg.axes(24, 126, 800, 290, "Net revenue: actual and 12-month forecast with 80% interval", pad=(46, 30, 14, 26))
    act = query("""SELECT d.month_end_date AS m, sum(f.net_revenue_nad)::float8/1e6 AS v FROM mart.fact_sales f JOIN mart.dim_date d ON d.date_key=f.invoice_date_key
                   GROUP BY 1 ORDER BY 1""")
    fc = query("""SELECT d.month_end_date AS m, sum(forecast_net_revenue_nad)::float8/1e6 AS f, sum(lower_80_nad)::float8/1e6 AS lo, sum(upper_80_nad)::float8/1e6 AS hi
                  FROM mart.fact_forecast_monthly x JOIN mart.dim_date d ON d.date_key=x.month_date_key
                  WHERE scenario='Forecast' AND model_name='Seasonal naive' GROUP BY 1 ORDER BY 1""")
    ax.plot(pd.to_datetime(act.m), act.v, color=SERIES[0], lw=1.8, label="Actual")
    ax.fill_between(pd.to_datetime(fc.m), fc.lo, fc.hi, color=SERIES[1], alpha=0.15, lw=0, label="80% interval")
    ax.plot(pd.to_datetime(fc.m), fc.f, color=SERIES[1], lw=1.8, label="Forecast")
    ax.set_ylabel("N$ million", color=INK2)
    ax.legend(loc="upper left", fontsize=7, ncol=3)
    style(ax)
    ax = pg.axes(840, 126, 416, 290, "Key influencers of yield (random forest)", pad=(130, 30, 30, 40))
    imp = query("SELECT feature, importance::float8 AS v FROM mart.yield_driver_importance WHERE importance IS NOT NULL ORDER BY importance")
    ax.barh(imp.feature, imp.v, height=0.55, color=SERIES[0])
    for yv_, v in enumerate(imp.v):
        ax.text(v + imp.v.max() * 0.01, yv_, f"{v:.3f}", va="center", fontsize=6.8, color=INK2)
    ax.set_xlabel("drop in R² when permuted", color=INK2)
    style(ax, ygrid=False)
    seg = query("""SELECT cu.customer_segment AS s, count(DISTINCT cu.customer_code) AS n, sum(f.net_revenue_nad)::float8 AS r,
                          sum(f.net_revenue_nad)::float8/nullif(sum(f.quantity_kg),0) AS p, count(DISTINCT f.invoice_id) AS inv
                   FROM mart.fact_sales f JOIN mart.dim_customer cu ON cu.customer_key=f.customer_key JOIN mart.dim_date d ON d.date_key=f.invoice_date_key
                   WHERE d.fiscal_year=2026 GROUP BY 1 ORDER BY 3 DESC""")
    ax = pg.axes(24, 428, 520, 276, "Net revenue by customer segment (K-means), FY2026", pad=(190, 30, 40, 40))
    s2 = seg.sort_values("r")
    ax.barh(s2.s, s2.r / 1e6, height=0.55, color=SERIES[0])
    for yv_, v in enumerate(s2.r / 1e6):
        ax.text(v + s2.r.max() / 1e6 * 0.01, yv_, f"{v:,.0f}", va="center", fontsize=6.8, color=INK2)
    ax.set_xlabel("N$ million", color=INK2)
    style(ax, ygrid=False)
    tab = pd.DataFrame({"Segment": seg.s, "Customers": seg.n, "Net revenue": [f"N$ {v / 1e6:,.1f} m" for v in seg.r],
                        "N$/kg": seg.p.map("{:.2f}".format), "Invoices": seg.inv.map("{:,}".format)})
    pg.table(560, 428, 696, 276, "Segment profile (FY2026)", tab, col_w=[0.40, 0.13, 0.19, 0.12, 0.16])
    pg.save("mockup_p3_advanced.png")


def recon_text() -> str:
    r = query("SELECT status, count(*) AS n FROM mart.recon_latest GROUP BY 1").set_index("status").n
    return " / ".join(f"{int(r[s])} {s}" for s in ("PASS", "WARN", "FAIL") if s in r.index) + " (latest batch)"


def page4():
    pg = Page("Operations, Inventory & Data Quality", "Latest month-end: 30 Sep 2026")
    pg.slicer(24, 56, 200, "Fiscal year", "FY2027")
    pg.slicer(236, 56, 200, "Farm", "All")
    k = query("""WITH last AS (SELECT max(snapshot_date_key) k FROM mart.fact_inventory_monthly)
                 SELECT (SELECT sum(closing_stock_kg)/1000 FROM mart.fact_inventory_monthly, last WHERE snapshot_date_key = last.k)::float8 AS stock_t,
                        (SELECT sum(quantity_kg)/1000/90 FROM mart.fact_sales WHERE doc_type='INV' AND invoice_date_key > 20260702)::float8 AS daily_t,
                        (SELECT sum(shrinkage_kg)/nullif(sum(received_kg),0) FROM mart.fact_inventory_monthly WHERE snapshot_date_key >= 20260430)::float8 AS shr,
                        (SELECT count(*) FROM mart.fact_sales WHERE is_price_anomaly) AS anom,
                        (SELECT sum(net_revenue_nad) FILTER (WHERE farm_key=-1)/sum(net_revenue_nad) FROM mart.fact_sales)::float8 AS unk""").iloc[0]
    pg.card(448, 56, 150, 58, "Closing stock t", f"{k.stock_t:,.0f}")
    pg.card(606, 56, 150, 58, "Stock cover days", f"{k.stock_t / k.daily_t:,.0f}")
    pg.card(764, 56, 150, 58, "Shrinkage", f"{100 * k.shr:.1f}%")
    pg.card(922, 56, 160, 58, "Price anomalies", f"{int(k.anom)}")
    pg.card(1090, 56, 166, 58, "Unknown-farm revenue", f"{100 * k.unk:.2f}%")
    ax = pg.axes(24, 126, 620, 280, "Closing stock by month (semi-additive)", pad=(46, 30, 14, 26))
    st = query("""SELECT d.month_end_date AS m, sum(closing_stock_kg)::float8/1000 AS t FROM mart.fact_inventory_monthly i
                  JOIN mart.dim_date d ON d.date_key=i.snapshot_date_key GROUP BY 1 ORDER BY 1""")
    ax.plot(pd.to_datetime(st.m), st.t, color=SERIES[0], lw=1.8)
    ax.set_ylim(0, st.t.max() * 1.1)
    ax.set_ylabel("tonnes", color=INK2)
    style(ax)
    ax = pg.axes(660, 126, 596, 280, "Stock received vs dispatched by fiscal quarter", pad=(46, 30, 14, 40))
    fl = query("""SELECT d.fiscal_quarter_label AS q, sum(received_kg)::float8/1000 AS rcv, sum(dispatched_kg)::float8/1000 AS dsp
                  FROM mart.fact_inventory_monthly i JOIN mart.dim_date d ON d.date_key=i.snapshot_date_key GROUP BY 1 ORDER BY 1""").tail(8)
    xs = np.arange(len(fl))
    ax.bar(xs - 0.2, fl.rcv, width=0.38, color=SERIES[0], label="Received t")
    ax.bar(xs + 0.2, fl.dsp, width=0.38, color=SERIES[1], label="Dispatched t")
    ax.set_xticks(xs, [q.replace("FY", "").replace("-F", " ") for q in fl.q], fontsize=6.8)
    ax.set_ylim(0, max(fl.rcv.max(), fl.dsp.max()) * 1.22)
    ax.legend(loc="upper left", fontsize=7, ncol=2)
    style(ax)
    ops = query("""WITH last AS (SELECT max(snapshot_date_key) k FROM mart.fact_inventory_monthly)
                   SELECT f.farm_name AS farm, max(f.irrigation_type_current) AS irr,
                          sum(i.closing_stock_kg) FILTER (WHERE i.snapshot_date_key = (SELECT k FROM last))::float8/1000 AS stock,
                          sum(i.shrinkage_kg) FILTER (WHERE i.snapshot_date_key >= 20260430)::float8 / nullif(sum(i.received_kg) FILTER (WHERE i.snapshot_date_key >= 20260430),0) AS shr
                   FROM mart.fact_inventory_monthly i JOIN mart.dim_farm f ON f.farm_key=i.farm_key GROUP BY 1 ORDER BY 3 DESC NULLS LAST LIMIT 10""")
    corr = query("""SELECT f.farm_name AS farm, count(*) FILTER (WHERE h.is_corrected) AS c FROM mart.fact_harvest h JOIN mart.dim_farm f ON f.farm_key=h.farm_key GROUP BY 1""")
    ops = ops.merge(corr, on="farm", how="left").fillna({"c": 0})
    tab = pd.DataFrame({"Farm": ops.farm, "Irrigation now": ops.irr, "Stock t": ops.stock.fillna(0).map("{:,.0f}".format),
                        "Shrinkage": ops.shr.map(lambda v: "" if pd.isna(v) else f"{100 * v:.1f}%"), "Corrected records": ops.c.astype(int)})
    pg.table(24, 418, 820, 286, "Farm operations detail (FY2027 to date)", tab, col_w=[0.36, 0.2, 0.14, 0.14, 0.16])
    fx, fy_, fw, fh = pg.box(860, 418, 396, 286, "Security & data-quality check")
    rows = [("Signed-in user", "exec@greenbasket.example (Executive role)"), ("Farms visible (RLS)", "14 of 14"),
            ("Revenue awaiting review", f"N$ {query('SELECT sum(net_revenue_nad)::float8 v FROM mart.fact_sales WHERE is_price_anomaly').v[0] / 1e6:,.1f} m"),
            ("Reconciliation checks", recon_text())]
    for i, (a, b) in enumerate(rows):
        pg.fig.text(fx + 12 / W, fy_ + fh - (44 + i * 52) / H, a, fontsize=7.5, color=INK2, va="top")
        pg.fig.text(fx + 12 / W, fy_ + fh - (60 + i * 52) / H, b, fontsize=10, color=INK, va="top", fontweight="semibold")
    pg.save("mockup_p4_operations.png")


if __name__ == "__main__":
    k = page1()
    page2()
    page3()
    page4()
    print({kk: round(v, 4) if isinstance(v, float) else v for kk, v in k.items()})
