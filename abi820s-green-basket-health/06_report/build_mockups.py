#!/usr/bin/env python3
"""
build_mockups.py - renders high-fidelity design mock-ups of the GBHS Power BI report pages (1280 x 720 canvas,
same layout, titles and measures as GBHS_Health.Report) from the warehouse mart views. The SQL mirrors the DAX
measure logic (see 04_powerbi/expected_values.py). These are DESIGN PROTOTYPES, not Power BI screenshots:
replace them with real screenshots once the .pbix is refreshed (04_powerbi/BUILD_GUIDE.md, step 9).
Output: 06_report/figures/mockup_p{1..6}_*.png
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
import matplotlib.ticker  # noqa: F401  (used for axis formatters)
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
ED = "JOIN mart.v_dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key AND ep.department_code = 'ED'"
MAL = "JOIN mart.v_dim_condition k ON k.condition_key = s.condition_key AND k.condition_code = 'MAL'"


class Page:
    def __init__(self, title: str, subtitle: str, w: int = W, h: int = H, footer=True):
        setup_style()
        plt.rcParams.update({"axes.titlesize": 9.5, "font.size": 8, "xtick.labelsize": 7.5, "ytick.labelsize": 7.5})
        self.w, self.h = w, h
        self.fig = plt.figure(figsize=(w / 100, h / 100), dpi=150)
        self.fig.patch.set_facecolor(PAGE_BG)
        if title:
            self.fig.text(24 / w, 1 - 22 / h, title, fontsize=15, fontweight="bold", color=INK, va="top")
        if subtitle:
            self.fig.text(1 - 24 / w, 1 - 26 / h, subtitle, fontsize=8, color=INK2, va="top", ha="right")
        if footer:
            self.fig.text(24 / w, 8 / h, "Design mock-up rendered from the PostgreSQL mart views (not a Power BI screenshot) - "
                          "layout, titles and measures follow GBHS_Health.Report", fontsize=6.5, color=MUTED)

    def box(self, x, y, w, h, title=None):
        fx, fy, fw, fh = x / self.w, 1 - (y + h) / self.h, w / self.w, h / self.h
        self.fig.patches.append(FancyBboxPatch((fx, fy), fw, fh, boxstyle="round,pad=0,rounding_size=0.006",
                                               transform=self.fig.transFigure, facecolor="white", edgecolor="#E1E0D9",
                                               linewidth=0.8, zorder=-1))
        if title:
            self.fig.text(fx + 10 / self.w, fy + fh - 9 / self.h, title, fontsize=9, fontweight="semibold", color=INK, va="top")
        return fx, fy, fw, fh

    def axes(self, x, y, w, h, title=None, pad=(46, 30, 14, 24)):
        fx, fy, fw, fh = self.box(x, y, w, h, title)
        l, t, r, b = pad
        ax = self.fig.add_axes([fx + l / self.w, fy + b / self.h, fw - (l + r) / self.w, fh - (t + b) / self.h])
        ax.set_facecolor("white")
        return ax

    def slicer(self, x, y, w, label, value, h=58):
        fx, fy, fw, fh = self.box(x, y, w, h)
        self.fig.text(fx + 10 / self.w, fy + fh - 10 / self.h, label, fontsize=7.5, color=INK2, va="top")
        self.fig.text(fx + 10 / self.w, fy + 12 / self.h, value, fontsize=9, color=INK, va="bottom")
        self.fig.text(fx + fw - 14 / self.w, fy + 12 / self.h, "v", fontsize=8, color=MUTED, va="bottom")

    def card(self, x, y, w, h, label, value, note=None, trend=None, good=None):
        """KPI card. trend = 'up' / 'down' / 'status' draws the symbol; good colours it (None = neutral ink).
        The note always states the comparison in words, so the meaning never depends on colour alone."""
        fx, fy, fw, fh = self.box(x, y, w, h)
        self.fig.text(fx + 10 / self.w, fy + fh - 10 / self.h, label, fontsize=7.5, color=INK2, va="top")
        self.fig.text(fx + 10 / self.w, fy + fh / 2 - 6 / self.h, value, fontsize=17 if h > 70 else 13, fontweight="semibold", color=INK, va="center")
        if note:
            sym = {"up": "▲ ", "down": "▼ ", "status": "● "}.get(trend, "")
            colour = INK2 if good is None else (GOOD if good else BAD)
            self.fig.text(fx + 10 / self.w, fy + 8 / self.h, sym + note, fontsize=7.5, color=colour, va="bottom")

    def table(self, x, y, w, h, title, df: pd.DataFrame, col_w=None, fs=7.2):
        fx, fy, fw, fh = self.box(x, y, w, h, title)
        ncol = len(df.columns)
        col_w = col_w or [1 / ncol] * ncol
        top = fy + fh - 30 / self.h
        row_h = min(17 / self.h, (fh - 40 / self.h) / (len(df) + 1))
        xs = [fx + 10 / self.w]
        for cw in col_w[:-1]:
            xs.append(xs[-1] + cw * (fw - 20 / self.w))
        numeric = [j > 0 and all(str(v).replace(",", "").replace(".", "").replace("%", "").replace("+", "").replace("-", "")
                                 .replace(" days", "").strip().isdigit() or str(v) == "" for v in df.iloc[:, j]) for j in range(ncol)]

        def xpos(j):
            return xs[j] + (col_w[j] * (fw - 20 / self.w) - 4 / self.w if numeric[j] else 0)
        for j, c in enumerate(df.columns):
            self.fig.text(xpos(j), top, c, fontsize=fs, fontweight="semibold", color=INK2, va="top", ha="right" if numeric[j] else "left")
        self.fig.add_artist(plt.Line2D([fx + 8 / self.w, fx + fw - 8 / self.w], [top - row_h * 0.9] * 2, transform=self.fig.transFigure,
                                       color=AXIS, lw=0.6))
        for i, (_, r) in enumerate(df.iterrows(), start=1):
            yy = top - row_h * i - 2 / self.h
            for j, v in enumerate(r.values):
                self.fig.text(xpos(j), yy, str(v), fontsize=fs, color=INK, va="top", ha="right" if numeric[j] else "left")

    def save(self, name):
        path = FIG / name
        self.fig.savefig(path, facecolor=PAGE_BG)
        plt.close(self.fig)
        print("saved", path.name)


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


def pct(v, d=1):
    return "" if v is None or pd.isna(v) else f"{100 * float(v):.{d}f}%"


def scalar(sql):
    v = query(sql).iloc[0, 0]
    return None if v is None else float(v)


# ------------------------------------------------------------------------------------------------ shared data
def facility_kpis(y0: int, y1: int, fac: str | None = None) -> pd.DataFrame:
    """Facility scorecard: the measures of the PBIR table, by facility (calendar-year window y0..y1)."""
    d0, d1 = y0 * 10000 + 101, y1 * 10000 + 1231
    f = f"AND f.facility_short_name = '{fac}'" if fac else ""
    enc = query(f"""
        SELECT f.facility_short_name AS facility, count(*) FILTER (WHERE ep.department_code = 'ED') AS ed,
               sum(e.seen_within_target)::float8 / nullif(count(e.seen_within_target), 0) AS swt,
               (sum(e.is_lwbs) FILTER (WHERE ep.department_code = 'ED'))::float8 / nullif(count(*) FILTER (WHERE ep.department_code = 'ED'), 0) AS lwbs
        FROM mart.v_fact_encounter e JOIN mart.v_dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key
        JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = e.care_unit_key JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key
        WHERE e.arrival_date_key BETWEEN {d0} AND {d1} {f} GROUP BY 1""")
    occ = query(f"""
        SELECT f.facility_short_name AS facility, sum(c.occupied_beds)::float8 / sum(c.beds_available) AS occ
        FROM mart.v_fact_ward_census c JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = c.care_unit_key
        JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key WHERE c.census_date_key BETWEEN {d0} AND {d1} {f} GROUP BY 1""")
    adm = query(f"""
        SELECT f.facility_short_name AS facility, avg(a.los_days) FILTER (WHERE a.is_discharged = 1)::float8 AS alos,
               sum(a.readmitted_within_30d)::float8 / nullif(sum(a.readmission_eligible), 0) AS readm
        FROM mart.v_fact_admission a JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = a.care_unit_key
        JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key WHERE a.discharge_date_key BETWEEN {d0} AND {d1} {f} GROUP BY 1""")
    mal = query(f"""
        SELECT f.facility_short_name AS facility, sum(s.cases_total) AS mal
        FROM mart.v_fact_surveillance s {MAL} JOIN mart.v_dim_facility f ON f.facility_key = s.facility_key
        WHERE s.epi_week_date_key BETWEEN {d0} AND {d1} {f} GROUP BY 1""")
    out = enc.merge(occ, on="facility", how="left").merge(adm, on="facility", how="left").merge(mal, on="facility", how="left")
    return out.sort_values("ed", ascending=False)


# ------------------------------------------------------------------------------------------------ page 1
def page1():
    year = 2026
    last = int(scalar("SELECT max(arrival_date_key) FROM mart.v_fact_encounter"))
    ytd = scalar(f"SELECT count(*) FROM mart.v_fact_encounter e {ED} WHERE e.arrival_date_key BETWEEN 20260101 AND 20261231")
    ytd_py = scalar(f"SELECT count(*) FROM mart.v_fact_encounter e {ED} WHERE e.arrival_date_key BETWEEN 20250101 AND {last - 10000}")
    k = query(f"""
        SELECT (SELECT sum(seen_within_target)::float8 / count(seen_within_target) FROM mart.v_fact_encounter WHERE arrival_date_key / 10000 = {year}) AS swt,
               (SELECT sum(seen_within_target)::float8 / count(seen_within_target) FROM mart.v_fact_encounter WHERE arrival_date_key / 10000 = {year - 1}) AS swt_py,
               (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY door_to_doctor_min) FROM mart.v_fact_encounter e {ED} WHERE arrival_date_key / 10000 = {year}) AS med,
               (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY door_to_doctor_min) FROM mart.v_fact_encounter e {ED} WHERE arrival_date_key / 10000 = {year - 1}) AS med_py,
               (SELECT sum(occupied_beds)::float8 / sum(beds_available) FROM mart.v_fact_ward_census WHERE census_date_key / 10000 = {year}) AS occ,
               (SELECT sum(readmitted_within_30d)::float8 / sum(readmission_eligible) FROM mart.v_fact_admission WHERE discharge_date_key / 10000 = {year}) AS readm,
               (SELECT sum(readmitted_within_30d)::float8 / sum(readmission_eligible) FROM mart.v_fact_admission WHERE discharge_date_key / 10000 = {year - 1}) AS readm_py
    """).iloc[0]
    pg = Page("GBHS Health Services - Executive Overview", f"Data to {pd.to_datetime(str(last)).strftime('%-d %b %Y')}  |  Calendar year {year}")
    for i, (lab, val) in enumerate([("Calendar year", str(year)), ("Management zone", "All"), ("Facility type", "All"), ("Facility", "All")]):
        pg.slicer(24 + i * 212, 56, 200, lab, val)
    yoy = ytd / ytd_py - 1
    occ_py = scalar(f"SELECT sum(occupied_beds)::float8 / sum(beds_available) FROM mart.v_fact_ward_census WHERE census_date_key / 10000 = {year - 1}")
    cards = [("ED attendances YTD", f"{ytd:,.0f}", f"{100 * yoy:+.1f}% vs same days of {year - 1}", "up", None),
             ("YTD change vs last year", f"{100 * yoy:+.1f}%", f"demand growth ({ytd_py:,.0f} last year)", None, None),
             ("Seen within triage target", pct(k.swt), f"{100 * (k.swt - k.swt_py):+.1f} pts vs {year - 1} (worse)", "down", False),
             ("Median door-to-doctor (min)", f"{k.med:.0f}", f"{k.med - k.med_py:+.0f} min vs {year - 1} (worse)", "up", False),
             ("Bed occupancy", pct(k.occ), f"{100 * (k.occ - occ_py):+.1f} pts vs {year - 1}; ceiling 85%", "up", None),
             ("30-day readmissions", pct(k.readm), f"{100 * (k.readm - k.readm_py):+.1f} pts (worse); ceiling 12%", "up", False)]
    for i, (lab, val, note, trend, good) in enumerate(cards):
        pg.card(24 + i * 206, 126, 190 if i < 5 else 202, 92, lab, val, note, trend, good)
    ax = pg.axes(24, 232, 820, 250, "Share of ED patients seen within their triage target, by month", pad=(46, 30, 14, 26))
    m = query(f"""SELECT d.month_num, d.calendar_year AS y, sum(seen_within_target)::float8 / count(seen_within_target) AS v
                  FROM mart.v_fact_encounter e JOIN mart.v_dim_date d ON d.date_key = e.arrival_date_key
                  WHERE d.calendar_year IN ({year}, {year - 1}) GROUP BY 1, 2 ORDER BY 1""")
    cur, py = m[m.y == year].set_index("month_num").v, m[m.y == year - 1].set_index("month_num").v
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    ax.plot(cur.index - 1, 100 * cur.values, color=SERIES[0], lw=2, label=f"Seen within target {year}")
    ax.plot(py.index - 1, 100 * py.values, color=SERIES[1], lw=2, label=f"Same month {year - 1}")
    ax.plot(py.index - 1, [80] * len(py), color=SERIES[2], lw=1.6, ls="--", label="Target 80 %")
    ax.set_xticks(range(12), months)
    ax.set_ylim(50, 90)
    ax.set_ylabel("% seen within target", color=INK2)
    ax.legend(loc="lower right", fontsize=7, ncol=3)
    ax.text(0, 86.5, "Malaria season (Jan-May): fewer patients seen on time", fontsize=7, color=INK2, ha="left", va="center")
    ax.annotate("Oct = 1 day (1 Oct delta load)", (9, 100 * cur.loc[10]), xytext=(-40, -16), textcoords="offset points", fontsize=6.5, color=MUTED)
    style(ax)
    fk = facility_kpis(year, year)
    ax = pg.axes(860, 232, 396, 250, "Bed occupancy by hospital", pad=(92, 30, 46, 36))
    oc = fk.dropna(subset=["occ"]).sort_values("occ")
    ax.barh(oc.facility, 100 * oc.occ, height=0.58, color=SERIES[0])
    for yv, v in enumerate(oc.occ):
        ax.text(97, yv, f"{100 * v:.1f}%", va="center", fontsize=6.8, color=INK2)
    ax.axvline(85, color=SERIES[1], lw=1, ls="--")
    ax.text(85, len(oc) - 0.4, "85 % ceiling", fontsize=6.5, color=INK2, ha="center")
    ax.set_xlim(0, 108)
    style(ax, ygrid=False)
    ax.grid(True, axis="x", color=GRID, linewidth=0.6)
    ax = pg.axes(24, 494, 400, 210, "Notified malaria cases by month", pad=(46, 30, 12, 30))
    mm = query(f"""SELECT d.month_num, sum(s.cases_total) AS c FROM mart.v_fact_surveillance s {MAL}
                   JOIN mart.v_dim_date d ON d.date_key = s.epi_week_date_key WHERE d.calendar_year = {year} GROUP BY 1 ORDER BY 1""")
    ax.plot(mm.month_num - 1, mm.c.astype(float), color=SERIES[0], lw=2, marker="o", ms=3.5)
    ax.set_xticks(range(12), [mn[0] for mn in months])
    ax.set_ylabel("cases", color=INK2)
    style(ax)
    tab = pd.DataFrame({"Facility": fk.facility, "ED attendances": fk.ed.map("{:,.0f}".format),
                        "Within target": fk.swt.map(pct), "LWBS": fk.lwbs.map(pct), "Occupancy": fk.occ.map(pct),
                        "ALOS (days)": fk.alos.map(lambda v: "" if pd.isna(v) else f"{v:.2f}"), "Readmitted 30d": fk.readm.map(pct),
                        "Malaria cases": fk.mal.map(lambda v: "" if pd.isna(v) else f"{v:,.0f}")})
    tab.loc[fk.ed == 0, "ED attendances"] = ""
    pg.table(440, 494, 816, 210, "Facility scorecard (right-click a facility to drill through)", tab,
             col_w=[0.18, 0.13, 0.11, 0.09, 0.11, 0.11, 0.14, 0.13], fs=6.9)
    pg.save("mockup_p1_executive.png")
    return dict(ytd=ytd, yoy=yoy, swt=k.swt, med=k.med, occ=k.occ, readm=k.readm)


# ------------------------------------------------------------------------------------------------ page 2
def page2():
    pg = Page("Patient Flow & Resource Utilisation - Diagnostics", "All years 2022-2026  |  all facilities, triage categories and shifts")
    for i, (lab, val) in enumerate([("Calendar year", "All"), ("Facility", "All"), ("Triage category", "All"), ("Arrival shift", "All")]):
        pg.slicer(24 + i * 212, 56, 200, lab, val)
    apd = scalar(f"""SELECT (SELECT count(*) FROM mart.v_fact_encounter e {ED})::float8 /
                            (SELECT sum(r.doctors_on_duty) FROM mart.v_fact_staff_roster r JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = r.care_unit_key
                             WHERE cu.unit_type = 'Emergency department')""")
    nh = query("""SELECT (SELECT sum(r.nurse_hours) FROM mart.v_fact_staff_roster r JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = r.care_unit_key
                          WHERE cu.unit_type = 'Inpatient ward')::float8 / (SELECT sum(occupied_beds) FROM mart.v_fact_ward_census) AS nhppd,
                         (SELECT sum(agency_hours) / sum(nurse_hours) FROM mart.v_fact_staff_roster)::float8 AS agency""").iloc[0]
    pg.card(872, 56, 124, 58, "Arrivals / doctor-shift", f"{apd:.1f}")
    pg.card(1004, 56, 124, 58, "Nursing hrs / patient day", f"{nh.nhppd:.2f}")
    pg.card(1136, 56, 120, 58, "Agency share", pct(nh.agency))
    mx = query("""
        WITH c AS (SELECT cu.facility_key, sum(c.occupied_beds)::float8 / sum(c.beds_available) AS occ,
                          sum(c.occupied_beds)::float8 / count(DISTINCT c.census_date_key) AS adc, sum(c.occupied_beds) AS pdays
                   FROM mart.v_fact_ward_census c JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = c.care_unit_key GROUP BY 1),
             a AS (SELECT cu.facility_key, avg(a.los_days) FILTER (WHERE a.is_discharged = 1)::float8 AS alos
                   FROM mart.v_fact_admission a JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = a.care_unit_key WHERE a.discharge_date_key > 0 GROUP BY 1),
             r AS (SELECT cu.facility_key, sum(r.nurse_hours) FILTER (WHERE cu.unit_type = 'Inpatient ward') AS ward_hours,
                          sum(r.overtime_hours) / sum(r.nurse_hours) AS ot
                   FROM mart.v_fact_staff_roster r JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = r.care_unit_key GROUP BY 1)
        SELECT rg.region_name AS region, f.facility_short_name AS facility, c.occ, c.adc, a.alos, (r.ward_hours / c.pdays)::float8 AS nhppd, r.ot::float8 AS ot
        FROM mart.v_dim_facility f JOIN mart.v_dim_region rg ON rg.region_key = f.region_key
        LEFT JOIN c ON c.facility_key = f.facility_key LEFT JOIN a ON a.facility_key = f.facility_key LEFT JOIN r ON r.facility_key = f.facility_key
        WHERE f.facility_key > 0 ORDER BY 1, 2""")
    tab = pd.DataFrame({"Region > Facility": [f"{a} > {b}" for a, b in zip(mx.region, mx.facility)], "Occupancy": mx.occ.map(pct),
                        "Avg daily census": mx.adc.map(lambda v: "" if pd.isna(v) else f"{v:.1f}"),
                        "ALOS": mx.alos.map(lambda v: "" if pd.isna(v) else f"{v:.2f}"),
                        "NHPPD": mx.nhppd.map(lambda v: "" if pd.isna(v) else f"{v:.2f}"), "Overtime": mx.ot.map(pct)})
    pg.table(24, 128, 620, 280, "Ward utilisation (drill down region > facility > ward)", tab, col_w=[0.40, 0.13, 0.15, 0.10, 0.11, 0.11])
    ax = pg.axes(660, 128, 596, 280, "Median door-to-doctor time by hour of arrival", pad=(46, 30, 14, 30))
    hr = query(f"""SELECT e.arrival_hour_key AS h, percentile_cont(0.5) WITHIN GROUP (ORDER BY e.door_to_doctor_min) AS m
                   FROM mart.v_fact_encounter e {ED} GROUP BY 1 ORDER BY 1""")
    ax.plot(hr.h, hr.m.astype(float), color=SERIES[0], lw=2, marker="o", ms=3)
    ax.set_xticks(range(0, 24, 2), [f"{h:02d}:00" for h in range(0, 24, 2)], fontsize=6.8)
    ax.set_ylabel("minutes", color=INK2)
    ax.set_ylim(0, hr.m.astype(float).max() * 1.2)
    style(ax)
    ax = pg.axes(24, 420, 410, 284, "Access block: bed occupancy vs ED patients seen on time", pad=(46, 30, 14, 40))
    sc = query("""
        WITH o AS (SELECT cu.facility_key, c.census_date_key / 10000 AS y, sum(c.occupied_beds)::float8 / sum(c.beds_available) AS occ
                   FROM mart.v_fact_ward_census c JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = c.care_unit_key GROUP BY 1, 2),
             s AS (SELECT cu.facility_key, e.arrival_date_key / 10000 AS y, sum(e.seen_within_target)::float8 / count(e.seen_within_target) AS swt
                   FROM mart.v_fact_encounter e JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = e.care_unit_key GROUP BY 1, 2)
        SELECT o.y, o.occ, s.swt FROM o JOIN s USING (facility_key, y) WHERE s.swt IS NOT NULL ORDER BY 1""")
    for j, (y, d) in enumerate(sc.groupby("y")):
        ax.scatter(100 * d.occ, 100 * d.swt, s=42, color=SERIES[j], edgecolor="white", linewidth=1.5, label=str(y), zorder=3)
    ax.set_xlabel("Bed occupancy %", color=INK2)
    ax.set_ylabel("% seen within target", color=INK2)
    ax.set_ylim(45, 100)
    ax.legend(loc="upper right", fontsize=6.6, ncol=5, handletextpad=0.2, columnspacing=0.8)
    style(ax)
    ax.grid(True, axis="x", color=GRID, linewidth=0.6)
    ax = pg.axes(450, 420, 390, 284, "Seen within target by triage category", pad=(118, 30, 44, 36))
    tg = query("""SELECT t.triage_label AS t, t.priority, sum(e.seen_within_target)::float8 / count(e.seen_within_target) AS v
                  FROM mart.v_fact_encounter e JOIN mart.v_dim_triage t ON t.triage_key = e.triage_key
                  GROUP BY 1, 2 HAVING count(e.seen_within_target) > 0 ORDER BY 2 DESC""")
    ax.barh(tg.t, 100 * tg.v, height=0.58, color=SERIES[0])
    for yv, v in enumerate(tg.v):
        ax.text(100 * v + 1, yv, f"{100 * v:.1f}%", va="center", fontsize=6.8, color=INK2)
    ax.set_xlim(0, 110)
    style(ax, ygrid=False)
    ax.grid(True, axis="x", color=GRID, linewidth=0.6)
    ax = pg.axes(856, 420, 400, 284, "ED arrivals per doctor-shift by month", pad=(40, 30, 12, 30))
    ld = query(f"""
        WITH a AS (SELECT d.month_start_date AS m, count(*) AS n FROM mart.v_fact_encounter e {ED}
                   JOIN mart.v_dim_date d ON d.date_key = e.arrival_date_key GROUP BY 1),
             r AS (SELECT d.month_start_date AS m, sum(r.doctors_on_duty) AS s FROM mart.v_fact_staff_roster r
                   JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = r.care_unit_key AND cu.unit_type = 'Emergency department'
                   JOIN mart.v_dim_date d ON d.date_key = r.roster_date_key GROUP BY 1)
        SELECT a.m, a.n::float8 / r.s AS v FROM a JOIN r USING (m) WHERE a.m < DATE '2026-10-01' ORDER BY 1""")
    ax.plot(pd.to_datetime(ld.m), ld.v, color=SERIES[0], lw=1.8)
    ax.set_ylabel("arrivals per doctor-shift", color=INK2)
    style(ax)
    pg.save("mockup_p2_flow.png")


# ------------------------------------------------------------------------------------------------ page 3
def page3():
    last_epi = int(scalar("SELECT max(epi_week_date_key) FROM mart.v_fact_surveillance"))
    label = query(f"SELECT epi_week_label FROM mart.v_dim_date WHERE date_key = {last_epi}").iloc[0, 0]
    pg = Page("Disease Surveillance - IDSR Priority Conditions", f"IDSR returns to epi week {label}  |  all epi years")
    for i, (lab, val) in enumerate([("Epi year", "All"), ("IDSR condition", "All"), ("Malaria stratum", "All"), ("Facility", "All")]):
        pg.slicer(24 + i * 212, 56, 200, lab, val)
    end = pd.to_datetime(str(last_epi)) + pd.Timedelta(days=6)
    ytd = scalar(f"SELECT sum(s.cases_total) FROM mart.v_fact_surveillance s {MAL} JOIN mart.v_dim_date d ON d.date_key = s.epi_week_date_key "
                 f"WHERE d.epi_year = {end.year} AND d.full_date <= DATE '{end.date()}'")
    ytd_py = scalar(f"SELECT sum(s.cases_total) FROM mart.v_fact_surveillance s {MAL} JOIN mart.v_dim_date d ON d.date_key = s.epi_week_date_key "
                    f"WHERE d.epi_year = {end.year - 1} AND d.full_date <= DATE '{(end - pd.Timedelta(days=364)).date()}'")
    inc = query(f"""
        WITH days AS (SELECT epi_year, count(*) AS n FROM mart.v_dim_date
                      WHERE full_date BETWEEN (SELECT to_date(min(epi_week_date_key)::text, 'YYYYMMDD') FROM mart.v_fact_surveillance) AND DATE '{end.date()}'
                      GROUP BY 1),
             pop AS (SELECT year_date_key / 10000 AS y, sum(catchment_population) AS p FROM mart.v_fact_catchment_population GROUP BY 1)
        SELECT (SELECT sum(s.cases_total) FROM mart.v_fact_surveillance s {MAL})::float8 * 1000 / sum(pop.p * days.n / 365.0) AS inc
        FROM days JOIN pop ON pop.y = days.epi_year""").inc[0]
    k = query("""SELECT sum(tests_positive)::float8 / sum(tests_done) AS tp,
                        (SELECT avg(report_received) FROM mart.v_fact_idsr_report)::float8 AS comp,
                        (SELECT avg(report_on_time) FROM mart.v_fact_idsr_report)::float8 AS tim FROM mart.v_fact_surveillance""").iloc[0]
    cards = [("Malaria cases, epi-YTD", f"{ytd:,.0f}", f"epi weeks 1-{int(label[-2:])} of {end.year}", None, None),
             ("Change vs same weeks last year", f"{100 * (ytd / ytd_py - 1):+.1f}%", f"{ytd_py:,.0f} in the same weeks of {end.year - 1}", "up", None),
             ("Incidence per 1,000 person-years", f"{inc:.1f}", "catchment population, 2022-2026", None, None),
             ("Malaria test positivity", pct(k.tp), "positive / tested, 2022-2026", None, None),
             ("IDSR report completeness", pct(k.comp), "target 80% met", "status", k.comp >= 0.8),
             ("IDSR report timeliness", pct(k.tim), "target 80% met", "status", k.tim >= 0.8)]
    for i, (lab, val, note, trend, good) in enumerate(cards):
        pg.card(24 + i * 206, 126, 190 if i < 5 else 202, 92, lab, val, note, trend, good)
    ax = pg.axes(24, 230, 820, 240, "Weekly confirmed malaria cases vs the same epi week last year", pad=(46, 30, 14, 26))
    wk = query(f"""SELECT to_date(s.epi_week_date_key::text, 'YYYYMMDD') AS w, sum(s.cases_total) AS c FROM mart.v_fact_surveillance s {MAL}
                   GROUP BY 1 ORDER BY 1""")
    wk["w"] = pd.to_datetime(wk.w)
    wk["c"] = wk.c.astype(float)
    ly = wk.assign(w=wk.w + pd.Timedelta(days=364)).query("w <= @end")
    ax.plot(wk.w, wk.c, color=SERIES[0], lw=1.8, label="Malaria cases")
    ax.plot(ly.w, ly.c, color=SERIES[1], lw=1.4, label="Same week last year")
    ax.set_ylabel("cases per week", color=INK2)
    ax.legend(loc="upper left", fontsize=7, ncol=2)
    style(ax)
    ax = pg.axes(860, 230, 396, 240, "Notified cases by IDSR condition", pad=(132, 30, 40, 30))
    cd = query("""SELECT k.condition_name AS c, sum(s.cases_total) AS n FROM mart.v_fact_surveillance s
                  JOIN mart.v_dim_condition k ON k.condition_key = s.condition_key GROUP BY 1 ORDER BY 2""")
    cd["c"] = cd.c.str.replace(" (confirmed)", "", regex=False)
    ax.barh(cd.c, cd.n.astype(float), height=0.6, color=SERIES[0])
    for yv, v in enumerate(cd.n):
        ax.text(float(v) + float(cd.n.max()) * 0.01, yv, f"{v:,.0f}", va="center", fontsize=6.6, color=INK2)
    ax.set_xlim(0, float(cd.n.max()) * 1.25)
    ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v / 1000:.0f}k"))
    style(ax, ygrid=False)
    ax = pg.axes(24, 482, 410, 222, "Rainfall 4-8 weeks earlier (malaria lead indicator)", pad=(40, 30, 12, 26))
    rn = query("""
        WITH daily AS (SELECT d.full_date, avg(w.rainfall_mm) AS r FROM mart.v_fact_weather w JOIN mart.v_dim_date d ON d.date_key = w.weather_date_key GROUP BY 1),
             weeks AS (SELECT DISTINCT to_date(epi_week_date_key::text, 'YYYYMMDD') AS w FROM mart.v_fact_surveillance)
        SELECT weeks.w, (SELECT sum(r) FROM daily WHERE full_date BETWEEN weeks.w - 56 AND weeks.w - 29) AS rain FROM weeks ORDER BY 1""")
    ax.plot(pd.to_datetime(rn.w), rn.rain.astype(float), color=SERIES[2], lw=1.4)
    ax.set_ylabel("mm per location", color=INK2)
    style(ax)
    pv = pd.read_csv(Path(__file__).resolve().parent / "evidence" / "olap_pivot.md", sep="|", skiprows=[1], skipinitialspace=True).iloc[:, 1:-1]
    pv.columns = [c.strip() for c in pv.columns]
    pv = pv.apply(lambda s: s.str.strip())
    pg.table(450, 482, 420, 222, "Malaria incidence per 100 000 catchment population", pv.rename(columns={"facility": "Facility", "2026 (to W39)": "2026*"}),
             col_w=[0.30, 0.14, 0.14, 0.14, 0.14, 0.14], fs=6.8)
    ax = pg.axes(886, 482, 370, 222, "IDSR completeness and timeliness by facility", pad=(36, 30, 10, 52))
    rp = query("""SELECT f.facility_short_name AS f, avg(report_received)::float8 AS c, avg(report_on_time)::float8 AS t
                  FROM mart.v_fact_idsr_report r JOIN mart.v_dim_facility f ON f.facility_key = r.facility_key GROUP BY 1 ORDER BY 3""")
    xs = np.arange(len(rp))
    ax.bar(xs - 0.2, 100 * rp.c, width=0.38, color=SERIES[0], label="Completeness")
    ax.bar(xs + 0.2, 100 * rp.t, width=0.38, color=SERIES[1], label="Timeliness")
    ax.set_xticks(xs, [f.replace("Katima Mulilo", "Katima").replace("Keetmanshoop", "Keetm.").replace("Otjiwarongo", "Otjiw.")
                       .replace("Nkurenkuru", "Nkuren.").replace("Walvis Bay", "Walvis") for f in rp.f], fontsize=6, rotation=45, ha="right")
    ax.set_ylim(0, 135)
    ax.set_yticks([0, 20, 40, 60, 80, 100])
    ax.legend(loc="upper left", fontsize=6.6, ncol=2)
    style(ax)
    pg.save("mockup_p3_surveillance.png")


# ------------------------------------------------------------------------------------------------ page 4
def page4():
    pg = Page("Advanced Analytics, Data Quality & Security", "Outbreak method: All  |  signed in as ceo@gbhs.example (Executive role)")
    pg.slicer(24, 56, 300, "Outbreak detection method", "All")
    k = query("""SELECT (SELECT sum(abs(actual - forecast)) / sum(abs(actual)) FROM mart.analytics_malaria_forecast WHERE kind = 'Back-test (1 week ahead)')::float8 AS wape,
                        (SELECT sum(observed * spells) FILTER (WHERE decile >= 9) / sum(observed * spells) FROM mart.analytics_readmission_deciles)::float8 AS cap,
                        (SELECT avg(is_injected_outbreak::int) FROM mart.analytics_outbreak_alerts)::float8 AS ppv,
                        (SELECT avg((status = 'PASS')::int) FROM mart.v_recon_latest)::float8 AS rec""").iloc[0]
    pg.card(340, 56, 180, 58, "Forecast error (WAPE)", pct(k.wape))
    pg.card(528, 56, 180, 58, "Readmissions in top-20 % risk", pct(k.cap))
    pg.card(716, 56, 180, 58, "Alerts in true outbreaks", pct(k.ppv))
    pg.card(904, 56, 170, 58, "Reconciliation passed", pct(k.rec))
    pg.card(1082, 56, 174, 58, "Facilities visible (RLS)", "10")
    ax = pg.axes(24, 126, 620, 290, "North-East malaria: weekly cases, back-test and 13-week forecast", pad=(46, 30, 14, 26))
    fc = query("""SELECT to_date(week_date_key::text, 'YYYYMMDD') AS w, kind, actual::float8 AS a, forecast::float8 AS f, lo::float8, hi::float8
                  FROM mart.analytics_malaria_forecast WHERE week_date_key >= 20240701 ORDER BY 1""")
    fc["w"] = pd.to_datetime(fc.w)
    a, b, f = fc[fc.kind == "Actual"], fc[fc.kind.str.startswith("Back")], fc[fc.kind == "Forecast"]
    ax.plot(a.w, a.a, color=SERIES[0], lw=1.6, label="Actual")
    ax.scatter(b.w, b.f, s=22, color=SERIES[1], zorder=3, label="Back-test (1 week ahead)")
    ax.fill_between(f.w, f.lo, f.hi, color=SERIES[2], alpha=0.18, lw=0, label="80 % interval")
    ax.plot(f.w, f.f, color=SERIES[2], lw=1.8, label="Forecast")
    ax.set_ylabel("cases per week", color=INK2)
    ax.set_ylim(0, float(a.a.max()) * 1.25)
    ax.legend(loc="upper left", fontsize=6.8, ncol=4)
    style(ax)
    ax = pg.axes(660, 126, 596, 290, "Readmission risk model: predicted vs observed by risk decile", pad=(46, 30, 14, 34))
    dc = query("SELECT decile, mean_predicted::float8 AS p, observed::float8 AS o FROM mart.analytics_readmission_deciles ORDER BY 1")
    xs = np.arange(len(dc))
    ax.bar(xs - 0.2, 100 * dc.p, width=0.38, color=SERIES[0], label="Predicted")
    ax.bar(xs + 0.2, 100 * dc.o, width=0.38, color=SERIES[1], label="Observed")
    ax.set_xticks(xs, [str(d) for d in dc.decile])
    ax.set_xlabel("risk decile (1 = lowest)", color=INK2)
    ax.set_ylabel("% readmitted within 30 days", color=INK2)
    ax.legend(loc="upper left", fontsize=7, ncol=2)
    style(ax)
    ax = pg.axes(24, 428, 410, 276, "What lengthens ED waits? (% change, OLS)", pad=(178, 30, 44, 30))
    dr = query("SELECT driver, effect_pct::float8 AS e, p_value::float8 AS p FROM mart.analytics_ed_drivers WHERE driver NOT LIKE 'Triage%' ORDER BY e")
    ax.barh(dr.driver, dr.e, height=0.58, color=[SERIES[1] if v > 0 else SERIES[0] for v in dr.e])
    for yv, v in enumerate(dr.e):
        ax.text(max(v, 0) + 0.2, yv, f"{v:+.1f}%" + (" (not significant)" if dr.p.iloc[yv] >= 0.05 else ""), va="center", ha="left",
                fontsize=6.8, color=INK2)
    ax.axvline(0, color=AXIS, lw=0.8)
    ax.set_xlim(min(dr.e.min() * 1.6, -1.5), dr.e.max() * 1.3)
    style(ax, ygrid=False)
    al = query("""SELECT d.epi_week_label AS "Epi week", f.facility_short_name AS "Facility", k.condition_name AS "Condition", a.method AS "Method",
                         CASE WHEN a.is_injected_outbreak THEN 'True' ELSE 'False' END AS "Known outbreak"
                  FROM mart.analytics_outbreak_alerts a JOIN mart.v_dim_date d ON d.date_key = a.week_date_key
                  JOIN mart.v_dim_facility f ON f.facility_key = a.facility_key JOIN mart.v_dim_condition k ON k.condition_key = a.condition_key
                  ORDER BY d.epi_week_key DESC, 2 LIMIT 11""")
    al["Condition"] = al.Condition.str.replace(" (confirmed)", "", regex=False)
    al["Alerts"] = 1
    al = al.rename(columns={"Known outbreak": "Known"})
    pg.table(450, 428, 420, 276, "Outbreak alerts (facility x condition x week)", al, col_w=[0.14, 0.2, 0.3, 0.2, 0.09, 0.07], fs=6.5)
    dq = query("""SELECT rule_code AS "Rule", dq_dimension AS "Dimension", action AS "Action", issues AS "Issues"
                  FROM mart.v_dq_summary ORDER BY issues DESC LIMIT 11""")
    dq["Issues"] = dq.Issues.map("{:,}".format)
    pg.table(886, 428, 370, 276, "Data-quality rules and issues logged", dq, col_w=[0.16, 0.34, 0.28, 0.22], fs=6.6)
    pg.save("mockup_p4_advanced.png")


# ------------------------------------------------------------------------------------------------ page 5 (drill-through) and tooltip
def page5(fac="Rundu"):
    pg = Page("", "Drill-through from the facility scorecard  |  all years")
    pg.fig.text(24 / W, 1 - 30 / H, "<", fontsize=14, color=INK2, va="center")
    pg.fig.text(72 / W, 1 - 30 / H, f"{fac} - facility detail", fontsize=15, fontweight="bold", color=INK, va="center")
    fk = facility_kpis(2022, 2026, fac).iloc[0]
    cards = [("ED attendances", f"{fk.ed:,.0f}"), ("Seen within target", pct(fk.swt)), ("Left without being seen", pct(fk.lwbs)),
             ("Bed occupancy", pct(fk.occ)), ("Average length of stay", f"{fk.alos:.2f} days"), ("Malaria cases", f"{fk.mal:,.0f}")]
    for i, (lab, val) in enumerate(cards):
        pg.card(24 + i * 206, 60, 190 if i < 5 else 202, 92, lab, val)
    ax = pg.axes(24, 166, 620, 260, "Seen within target by month", pad=(46, 30, 14, 26))
    m = query(f"""SELECT d.month_start_date AS m, sum(e.seen_within_target)::float8 / count(e.seen_within_target) AS v
                  FROM mart.v_fact_encounter e JOIN mart.v_dim_date d ON d.date_key = e.arrival_date_key
                  JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = e.care_unit_key JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key
                  WHERE f.facility_short_name = '{fac}' AND d.full_date < DATE '2026-10-01' GROUP BY 1 ORDER BY 1""")
    ax.plot(pd.to_datetime(m.m), 100 * m.v, color=SERIES[0], lw=1.8, label="Seen within target")
    ax.axhline(80, color=SERIES[2], lw=1.4, ls="--", label="Target 80 %")
    ax.set_ylabel("%", color=INK2)
    ax.legend(loc="lower left", fontsize=7, ncol=2)
    style(ax)
    ax = pg.axes(660, 166, 596, 260, "Bed occupancy by ward", pad=(80, 30, 46, 30))
    wd = query(f"""SELECT cu.unit_code AS u, sum(c.occupied_beds)::float8 / sum(c.beds_available) AS v
                   FROM mart.v_fact_ward_census c JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = c.care_unit_key
                   JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key WHERE f.facility_short_name = '{fac}' GROUP BY 1 ORDER BY 2""")
    ax.barh(wd.u, 100 * wd.v, height=0.55, color=SERIES[0])
    for yv, v in enumerate(wd.v):
        ax.text(100 * v + 1, yv, f"{100 * v:.1f}%", va="center", fontsize=6.8, color=INK2)
    ax.set_xlim(0, 115)
    style(ax, ygrid=False)
    ax = pg.axes(24, 438, 620, 266, "Weekly malaria cases", pad=(46, 30, 14, 26))
    wk = query(f"""SELECT to_date(s.epi_week_date_key::text, 'YYYYMMDD') AS w, sum(s.cases_total)::float8 AS c FROM mart.v_fact_surveillance s {MAL}
                   JOIN mart.v_dim_facility f ON f.facility_key = s.facility_key WHERE f.facility_short_name = '{fac}' GROUP BY 1 ORDER BY 1""")
    ax.plot(pd.to_datetime(wk.w), wk.c, color=SERIES[0], lw=1.5)
    ax.set_ylabel("cases per week", color=INK2)
    style(ax)
    st = query(f"""
        WITH r AS (SELECT r.roster_date_key / 10000 AS y, sum(r.nurse_hours) FILTER (WHERE cu.unit_type = 'Inpatient ward') AS wh,
                          sum(r.overtime_hours) / sum(r.nurse_hours) AS ot, sum(r.agency_hours) / sum(r.nurse_hours) AS ag,
                          sum(r.doctors_on_duty) FILTER (WHERE cu.unit_type = 'Emergency department') AS docs
                   FROM mart.v_fact_staff_roster r JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = r.care_unit_key
                   JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key WHERE f.facility_short_name = '{fac}' GROUP BY 1),
             c AS (SELECT c.census_date_key / 10000 AS y, sum(c.occupied_beds) AS pd FROM mart.v_fact_ward_census c
                   JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = c.care_unit_key JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key
                   WHERE f.facility_short_name = '{fac}' GROUP BY 1),
             e AS (SELECT e.arrival_date_key / 10000 AS y, count(*) AS n FROM mart.v_fact_encounter e {ED}
                   JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = e.care_unit_key JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key
                   WHERE f.facility_short_name = '{fac}' GROUP BY 1)
        SELECT r.y, (r.wh / c.pd)::float8 AS nhppd, r.ot::float8 AS ot, r.ag::float8 AS ag, (e.n::float8 / r.docs) AS apd
        FROM r JOIN c USING (y) JOIN e USING (y) ORDER BY 1""")
    tab = pd.DataFrame({"Calendar Year": st.y.astype(str), "NHPPD": st.nhppd.map("{:.2f}".format), "Overtime": st.ot.map(pct),
                        "Agency": st.ag.map(pct), "ED arrivals / doctor-shift": st.apd.map("{:.1f}".format)})
    pg.table(660, 438, 596, 266, "Staffing by year", tab, col_w=[0.22, 0.15, 0.17, 0.16, 0.30])
    pg.save("mockup_p5_drillthrough.png")


def tooltip(fac="Katima Mulilo", year=2025):
    k = facility_kpis(year, year, fac).iloc[0]
    med = scalar(f"""SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY e.door_to_doctor_min) FROM mart.v_fact_encounter e {ED}
                     JOIN mart.v_dim_care_unit cu ON cu.care_unit_key = e.care_unit_key JOIN mart.v_dim_facility f ON f.facility_key = cu.facility_key
                     WHERE f.facility_short_name = '{fac}' AND e.arrival_date_key / 10000 = {year}""")
    pg = Page("", "", w=320, h=240, footer=False)
    fx, fy, fw, fh = pg.box(8, 8, 304, 224)
    pg.fig.text(fx + 12 / 320, fy + fh - 12 / 240, f"{fac}, {year}", fontsize=9, fontweight="bold", color=INK, va="top")
    rows = [("Seen within target", pct(k.swt)), ("Status", "▲ On target (80 %)" if k.swt >= 0.8 else "▼ Below target (80 %)"),
            ("Median door-to-doctor (min)", f"{med:.0f}"), ("LWBS", pct(k.lwbs)), ("Bed occupancy", pct(k.occ)), ("Readmitted 30d", pct(k.readm))]
    for i, (a, b) in enumerate(rows):
        yy = fy + fh - (38 + i * 30) / 240
        pg.fig.text(fx + 12 / 320, yy, a, fontsize=7.5, color=INK2, va="top")
        pg.fig.text(fx + fw - 12 / 320, yy, b, fontsize=8.5, color=INK if i != 1 else (GOOD if k.swt >= 0.8 else BAD),
                    va="top", ha="right", fontweight="semibold")
    pg.save("mockup_p6_tooltip.png")


if __name__ == "__main__":
    k = page1()
    page2()
    page3()
    page4()
    page5()
    tooltip()
    print({kk: round(float(v), 4) for kk, v in k.items()})
