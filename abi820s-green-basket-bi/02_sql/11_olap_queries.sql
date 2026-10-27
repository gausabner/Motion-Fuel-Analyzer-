-- =============================================================================
-- 11_olap_queries.sql
-- OLAP operations on the warehouse (each query is mirrored by a Power BI
-- interaction described in report section 3.5.1). Output captured by
-- 03_analytics/capture_sql_evidence.py into 06_report/evidence/olap_*.md
-- =============================================================================

-- name: olap_rollup
-- ROLL-UP: month -> fiscal quarter -> fiscal year -> grand total (net revenue, N$ million)
SELECT coalesce(d.fiscal_year_label, 'ALL YEARS')        AS fiscal_year,
       coalesce(d.fiscal_quarter_label, '(year total)')   AS fiscal_quarter,
       round(sum(f.net_revenue_nad) / 1e6, 2)             AS net_revenue_nad_m,
       GROUPING(d.fiscal_year_label, d.fiscal_quarter_label) AS grouping_level
FROM dw.fact_sales f
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
WHERE d.fiscal_year BETWEEN 2025 AND 2026
GROUP BY ROLLUP (d.fiscal_year_label, d.fiscal_quarter_label)
ORDER BY d.fiscal_year_label NULLS LAST, d.fiscal_quarter_label NULLS LAST;

-- name: olap_drilldown
-- DRILL-DOWN along the snowflaked product hierarchy: category -> crop -> product (FY2026)
SELECT coalesce(cc.category_name, 'ALL CATEGORIES') AS category,
       coalesce(c.crop_name, '(category total)')     AS crop,
       coalesce(p.product_name, '(crop total)')      AS product,
       round(sum(f.net_revenue_nad) / 1e6, 2)        AS net_revenue_nad_m,
       round(sum(f.quantity_kg) / 1000)              AS volume_t
FROM dw.fact_sales f
JOIN dw.dim_product p ON p.product_key = f.product_key
JOIN dw.dim_crop c ON c.crop_key = p.crop_key
JOIN dw.dim_crop_category cc ON cc.crop_category_key = c.crop_category_key
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
WHERE d.fiscal_year = 2026 AND cc.category_code IN ('CER', 'FRU')
GROUP BY ROLLUP (cc.category_name, c.crop_name, p.product_name)
ORDER BY cc.category_name NULLS LAST, c.crop_name NULLS LAST, p.product_name NULLS LAST;

-- name: olap_slice
-- SLICE: fix one dimension member (FY2026) and view revenue by management zone of the farm of origin
SELECT r.zone_name, count(DISTINCT f.farm_key) AS farm_versions, round(sum(f.net_revenue_nad) / 1e6, 2) AS net_revenue_nad_m,
       round(100 * sum(f.net_revenue_nad) / sum(sum(f.net_revenue_nad)) OVER (), 1) AS share_pct
FROM dw.fact_sales f
JOIN dw.dim_farm fa ON fa.farm_key = f.farm_key
JOIN dw.dim_region r ON r.region_key = fa.region_key
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
WHERE d.fiscal_year = 2026
GROUP BY r.zone_name ORDER BY net_revenue_nad_m DESC;

-- name: olap_dice
-- DICE: sub-cube Vegetables x North-Central farms x FY2025-FY2026 x Retail/Informal channels
SELECT d.fiscal_year_label, c.crop_name, cu.channel,
       round(sum(f.net_revenue_nad) / 1e6, 2) AS net_revenue_nad_m,
       round(sum(f.net_revenue_nad) / nullif(sum(f.quantity_kg), 0), 2) AS avg_price_nad_per_kg
FROM dw.fact_sales f
JOIN dw.dim_product p ON p.product_key = f.product_key
JOIN dw.dim_crop c ON c.crop_key = p.crop_key
JOIN dw.dim_crop_category cc ON cc.crop_category_key = c.crop_category_key
JOIN dw.dim_customer cu ON cu.customer_key = f.customer_key
JOIN dw.dim_farm fa ON fa.farm_key = f.farm_key
JOIN dw.dim_region r ON r.region_key = fa.region_key
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
WHERE cc.category_code = 'VEG' AND r.zone_code = 'NC' AND d.fiscal_year IN (2025, 2026)
  AND cu.channel IN ('Retail', 'Informal market')
GROUP BY d.fiscal_year_label, c.crop_name, cu.channel
ORDER BY c.crop_name, cu.channel, d.fiscal_year_label;

-- name: olap_pivot
-- PIVOT: crops as columns, fiscal years as rows (net revenue, N$ million)
SELECT d.fiscal_year_label,
       round(sum(f.net_revenue_nad) FILTER (WHERE c.crop_code = 'MZW') / 1e6, 1) AS maize,
       round(sum(f.net_revenue_nad) FILTER (WHERE c.crop_code = 'WHT') / 1e6, 1) AS wheat,
       round(sum(f.net_revenue_nad) FILTER (WHERE c.crop_code = 'MAH') / 1e6, 1) AS mahangu,
       round(sum(f.net_revenue_nad) FILTER (WHERE c.crop_code IN ('TOM', 'ONI', 'POT', 'CAB', 'BUT')) / 1e6, 1) AS vegetables,
       round(sum(f.net_revenue_nad) FILTER (WHERE c.crop_code = 'GRP') / 1e6, 1) AS table_grapes,
       round(sum(f.net_revenue_nad) FILTER (WHERE c.crop_code = 'WML') / 1e6, 1) AS watermelon,
       round(sum(f.net_revenue_nad) / 1e6, 1) AS total
FROM dw.fact_sales f
JOIN dw.dim_product p ON p.product_key = f.product_key
JOIN dw.dim_crop c ON c.crop_key = p.crop_key
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
GROUP BY d.fiscal_year_label ORDER BY d.fiscal_year_label;

-- name: olap_cube
-- CUBE: every subtotal combination of channel x crop category (FY2026)
SELECT coalesce(cu.channel, 'ALL CHANNELS') AS channel, coalesce(cc.category_name, 'ALL CATEGORIES') AS category,
       round(sum(f.net_revenue_nad) / 1e6, 2) AS net_revenue_nad_m,
       round(100 * sum(f.net_revenue_nad - f.cogs_nad) / nullif(sum(f.net_revenue_nad), 0), 1) AS gross_margin_pct
FROM dw.fact_sales f
JOIN dw.dim_customer cu ON cu.customer_key = f.customer_key
JOIN dw.dim_product p ON p.product_key = f.product_key
JOIN dw.dim_crop c ON c.crop_key = p.crop_key
JOIN dw.dim_crop_category cc ON cc.crop_category_key = c.crop_category_key
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
WHERE d.fiscal_year = 2026
GROUP BY CUBE (cu.channel, cc.category_name)
ORDER BY GROUPING(cu.channel), cu.channel, GROUPING(cc.category_name), cc.category_name;

-- name: olap_drill_across
-- DRILL-ACROSS (two facts via conformed region/crop/date): Green Basket yield vs NSA commercial benchmark, maize
WITH gb AS (
    SELECT fa.region_key, cc.crop_key, d.crop_season_label,
           sum(cc.harvested_kg) / 1000 / nullif(sum(cc.harvested_ha), 0) AS gb_yield,
           sum(cc.harvested_ha) AS gb_ha
    FROM dw.fact_crop_cycle cc
    JOIN dw.dim_farm fa ON fa.farm_key = cc.farm_key
    JOIN dw.dim_date d ON d.date_key = cc.harvest_season_end_date_key
    WHERE cc.cycle_status = 'Completed' AND cc.crop_key = (SELECT crop_key FROM dw.dim_crop WHERE crop_code = 'MZW')
    GROUP BY 1, 2, 3
), nsa AS (
    SELECT e.region_key, e.crop_key, d.crop_season_label,
           sum(e.production_t) FILTER (WHERE e.farming_sector = 'Commercial') / nullif(sum(e.area_planted_ha) FILTER (WHERE e.farming_sector = 'Commercial'), 0) AS commercial_yield,
           sum(e.production_t) FILTER (WHERE e.farming_sector = 'Communal') / nullif(sum(e.area_planted_ha) FILTER (WHERE e.farming_sector = 'Communal'), 0) AS communal_yield
    FROM dw.fact_crop_estimate e JOIN dw.dim_date d ON d.date_key = e.season_end_date_key
    GROUP BY 1, 2, 3
)
SELECT r.region_name, gb.crop_season_label AS season, round(gb.gb_ha) AS gb_harvested_ha, round(gb.gb_yield, 2) AS gb_yield_t_ha,
       round(nsa.commercial_yield, 2) AS nsa_commercial_t_ha, round(nsa.communal_yield, 2) AS nsa_communal_t_ha,
       round(gb.gb_yield - nsa.commercial_yield, 2) AS gap_vs_commercial
FROM gb JOIN nsa USING (region_key, crop_key, crop_season_label)
JOIN dw.dim_region r ON r.region_key = gb.region_key
WHERE gb.crop_season_label IN ('2022/23', '2023/24', '2024/25')
ORDER BY r.region_name, season;

-- name: olap_semi_additive
-- SEMI-ADDITIVE: closing stock must use the LAST month of each quarter, never a sum over months
SELECT d.fiscal_quarter_label,
       round(sum(i.closing_stock_kg) FILTER (WHERE d.full_date = q.last_snapshot) / 1000) AS closing_stock_t_correct,
       round(sum(i.closing_stock_kg) / 1000) AS closing_stock_t_wrong_sum_of_months,
       round(sum(i.closing_stock_value_nad) FILTER (WHERE d.full_date = q.last_snapshot) / 1e6, 2) AS closing_value_nad_m
FROM dw.fact_inventory_monthly i
JOIN dw.dim_date d ON d.date_key = i.snapshot_date_key
JOIN (SELECT dd.fiscal_quarter_label, max(dd.full_date) AS last_snapshot
      FROM dw.fact_inventory_monthly ii JOIN dw.dim_date dd ON dd.date_key = ii.snapshot_date_key
      GROUP BY dd.fiscal_quarter_label) q ON q.fiscal_quarter_label = d.fiscal_quarter_label
WHERE d.fiscal_year = 2026
GROUP BY d.fiscal_quarter_label ORDER BY d.fiscal_quarter_label;

-- name: olap_yoy_window
-- Time intelligence in SQL: year-on-year growth by crop category with LAG over the fiscal-year series
WITH y AS (
    SELECT cc.category_name, d.fiscal_year, sum(f.net_revenue_nad) AS rev
    FROM dw.fact_sales f
    JOIN dw.dim_product p ON p.product_key = f.product_key
    JOIN dw.dim_crop c ON c.crop_key = p.crop_key
    JOIN dw.dim_crop_category cc ON cc.crop_category_key = c.crop_category_key
    JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
    WHERE d.fiscal_year BETWEEN 2022 AND 2026
    GROUP BY 1, 2
)
SELECT category_name, 'FY' || fiscal_year AS fiscal_year, round(rev / 1e6, 1) AS net_revenue_nad_m,
       round(100 * (rev / lag(rev) OVER (PARTITION BY category_name ORDER BY fiscal_year) - 1), 1) AS yoy_pct
FROM y ORDER BY category_name, fiscal_year;
