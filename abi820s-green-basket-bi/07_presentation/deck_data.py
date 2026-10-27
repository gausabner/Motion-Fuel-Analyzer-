#!/usr/bin/env python3
"""
deck_data.py - pulls every number shown in the presentation from the warehouse into deck_data.json,
so the slides (built by build_presentation.js) never carry hand-typed figures.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "03_analytics"))
from common import query  # noqa: E402


def f(v):
    return float(v) if v is not None else None


def main():
    d = {}
    k = query("""SELECT d.fiscal_year_label AS fy, sum(f.net_revenue_nad)::float8 AS rev,
                        1 - sum(f.cogs_nad)::float8 / sum(f.net_revenue_nad)::float8 AS gm
                 FROM mart.fact_sales f JOIN mart.dim_date d ON d.date_key = f.invoice_date_key GROUP BY 1 ORDER BY 1""")
    d["fy"] = [{"fy": r.fy, "rev_m": round(r.rev / 1e6, 1), "gm_pct": round(100 * r.gm, 1)} for r in k.itertuples()]
    act = query("""SELECT d.year_month AS m, sum(f.net_revenue_nad)::float8 / 1e6 AS v FROM mart.fact_sales f
                   JOIN mart.dim_date d ON d.date_key = f.invoice_date_key GROUP BY 1 ORDER BY 1""")
    fc = query("""SELECT d.year_month AS m, sum(forecast_net_revenue_nad)::float8 / 1e6 AS f,
                         sum(lower_80_nad)::float8 / 1e6 AS lo, sum(upper_80_nad)::float8 / 1e6 AS hi
                  FROM mart.fact_forecast_monthly x JOIN mart.dim_date d ON d.date_key = x.month_date_key
                  WHERE scenario = 'Forecast' AND model_name = 'Seasonal naive' GROUP BY 1 ORDER BY 1""")
    d["actual"] = [{"m": r.m, "v": round(r.v, 2)} for r in act.itertuples()]
    d["forecast"] = [{"m": r.m, "f": round(r.f, 2), "lo": round(max(r.lo, 0), 2), "hi": round(r.hi, 2)} for r in fc.itertuples()]
    seg = query("""SELECT customer_segment AS s, count(DISTINCT customer_code) AS n FROM mart.dim_customer
                   WHERE scd_is_current AND customer_segment IS NOT NULL GROUP BY 1""")
    prof = (HERE.parent / "06_report/evidence/cluster_profiles.md").read_text().splitlines()
    rows = [l.split("|")[1:-1] for l in prof if l.startswith("| ") and not l.startswith("| segment") and "---" not in l][:5]
    d["segments"] = [{"segment": r[0].strip(), "customers": int(float(r[1])), "share_pct": float(r[-1])} for r in rows]
    scd = query("""SELECT f.irrigation_type AS irr, d.crop_season_label AS season,
                          sum(c.harvested_kg)::float8 / 1000 / sum(c.planted_ha)::float8 AS y
                   FROM mart.fact_crop_cycle c JOIN mart.dim_farm f ON f.farm_key = c.farm_key
                   JOIN mart.dim_crop cr ON cr.crop_key = c.crop_key JOIN mart.dim_date d ON d.date_key = c.harvest_season_end_date_key
                   WHERE f.farm_code = 'GB-KAW-01' AND cr.crop_code = 'MZW' AND c.cycle_status IN ('Completed', 'Failed')
                   GROUP BY 1, 2 ORDER BY 2""")
    d["nkurenkuru"] = [{"irr": r.irr, "season": r.season, "y": round(r.y, 2)} for r in scd.itertuples()]
    my = query("""SELECT d.crop_season_label AS season, c.is_irrigated AS irr,
                         sum(c.harvested_kg)::float8 / 1000 / sum(c.harvested_ha)::float8 AS y
                  FROM mart.fact_crop_cycle c JOIN mart.dim_crop cr ON cr.crop_key = c.crop_key
                  JOIN mart.dim_date d ON d.date_key = c.harvest_season_end_date_key
                  WHERE cr.crop_code = 'MZW' AND c.cycle_status = 'Completed' AND c.harvested_ha > 0
                  GROUP BY 1, 2 ORDER BY 1, 2""")
    d["maize_yield"] = [{"season": r.season, "irrigated": bool(r.irr), "y": round(r.y, 2)} for r in my.itertuples()]
    perf = (HERE.parent / "06_report/evidence/perf_queries.md").read_text().splitlines()
    pr = [l.split("|")[1:-1] for l in perf if l.startswith("| Q")]
    d["perf"] = [{"q": r[0].strip().split(" ")[0], "label": r[0].strip()[3:], "base": float(r[1]), "opt": float(r[2]),
                  "x": float(r[3])} for r in pr]
    rls = query("""SELECT r.zone_name AS zone, count(DISTINCT f.farm_code) FILTER (WHERE f.farm_code <> 'UNKNOWN') AS farms,
                          sum(s.net_revenue_nad)::float8 AS rev
                   FROM mart.fact_sales s JOIN mart.dim_farm f ON f.farm_key = s.farm_key
                   JOIN mart.dim_region r ON r.region_key = f.region_key JOIN mart.dim_date d ON d.date_key = s.invoice_date_key
                   WHERE d.fiscal_year = 2026 GROUP BY 1 ORDER BY 3 DESC""")
    d["rls"] = [{"zone": r.zone, "farms": int(r.farms), "rev_m": round(r.rev / 1e6, 1)} for r in rls.itertuples()]
    recon = query("SELECT status, count(*) AS n FROM mart.recon_latest GROUP BY 1")
    d["recon"] = {r.status: int(r.n) for r in recon.itertuples()}
    dq = query("""SELECT r.action, count(l.issue_id) AS n FROM audit.dq_rule r
                  LEFT JOIN audit.dq_issue_log l ON l.rule_code = r.rule_code AND l.batch_id = 1 GROUP BY 1 ORDER BY 2 DESC""")
    d["dq_actions"] = [{"action": r.action, "n": int(r.n)} for r in dq.itertuples()]
    top10 = query("""WITH c AS (SELECT cu.customer_code, sum(f.net_revenue_nad) r FROM mart.fact_sales f
                     JOIN mart.dim_customer cu ON cu.customer_key = f.customer_key JOIN mart.dim_date d ON d.date_key = f.invoice_date_key
                     WHERE d.fiscal_year = 2026 GROUP BY 1)
                     SELECT (SELECT sum(r) FROM (SELECT r FROM c ORDER BY r DESC LIMIT 10) t) / sum(r) AS s FROM c""")
    d["top10_pct"] = round(100 * float(top10.s[0]), 1)
    out = HERE / "deck_data.json"
    out.write_text(json.dumps(d, indent=1))
    print("wrote", out, {k: (len(v) if isinstance(v, list) else v) for k, v in d.items()})


if __name__ == "__main__":
    main()
