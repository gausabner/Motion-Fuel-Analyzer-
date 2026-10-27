-- =============================================================================
-- 09_mart_views.sql
-- Presentation layer for the Power BI semantic model (Import mode).
-- Design rules: expose only columns used by the model (no audit/lineage
-- columns, no fact surrogate keys, no high-cardinality text), keep integer keys,
-- exclude the -1 date member (Power BI date tables must be contiguous with no
-- blanks), flatten customer geography (avoids an ambiguous second path from
-- Region to Sales), keep Region -> Farm and Category -> Crop -> Product
-- snowflakes because facts attach at those rolled-up grains.
-- All views are simple projections/joins so Power Query folds them to SQL.
-- =============================================================================

CREATE OR REPLACE VIEW mart.dim_date AS
SELECT date_key, full_date, day_of_month, day_of_week_iso, day_name, day_short, is_weekend, is_public_holiday,
       holiday_name, is_working_day, iso_week, week_start_date, month_num, month_name, month_short, year_month,
       year_month_key, month_start_date, month_end_date, is_month_end, quarter_num, year_quarter, calendar_year,
       fiscal_year, fiscal_year_label, fiscal_quarter_num, fiscal_quarter_label, fiscal_month_num, month_short AS fiscal_month_name,
       crop_season_start_year, crop_season_label, season_month_num, is_current_month
FROM dw.dim_date
WHERE date_key > 0;

CREATE OR REPLACE VIEW mart.dim_region AS
SELECT region_key, region_code, region_name, zone_code, zone_name, capital_town, is_northern_crop_region
FROM dw.dim_region;

CREATE OR REPLACE VIEW mart.dim_farm AS
SELECT f.farm_key, f.farm_code, f.farm_name, f.region_key, r.zone_code, f.town, f.latitude, f.longitude,
       f.cultivated_ha, f.irrigation_type, f.is_irrigated, f.water_source, f.farm_manager_code, f.is_globalgap_certified,
       coalesce(cur.irrigation_type, f.irrigation_type) AS irrigation_type_current,
       coalesce(cur.farm_manager_code, f.farm_manager_code) AS farm_manager_current,
       f.scd_version, f.scd_effective_from, f.scd_effective_to, f.scd_is_current,
       f.farm_name || ' v' || f.scd_version || ' (' ||
           CASE WHEN f.scd_effective_from = DATE '1900-01-01' THEN 'start' ELSE to_char(f.scd_effective_from, 'YYYY-MM-DD') END
           || ' to ' || CASE WHEN f.scd_is_current THEN 'current' ELSE to_char(f.scd_effective_to, 'YYYY-MM-DD') END || ')'
           AS farm_version_label
FROM dw.dim_farm f
JOIN dw.dim_region r ON r.region_key = f.region_key
LEFT JOIN dw.dim_farm cur ON cur.farm_code = f.farm_code AND cur.scd_is_current AND f.farm_key > 0;

CREATE OR REPLACE VIEW mart.dim_crop_category AS
SELECT crop_category_key, category_code, category_name, sector FROM dw.dim_crop_category;

CREATE OR REPLACE VIEW mart.dim_crop AS
SELECT crop_key, crop_code, crop_name, crop_category_key, is_nab_controlled, storage_type, shelf_life_days
FROM dw.dim_crop;

CREATE OR REPLACE VIEW mart.dim_product AS
SELECT product_key, product_code, product_name, crop_key, grade, pack_type, sales_uom, kg_per_sales_uom, is_export_grade
FROM dw.dim_product;

CREATE OR REPLACE VIEW mart.dim_customer AS
SELECT c.customer_key, c.customer_code, c.customer_name, c.customer_type, c.channel, c.credit_terms_days, c.is_key_account,
       c.town, r.region_name AS customer_region, CASE WHEN c.region_key = -2 THEN 'Export markets' ELSE r.zone_name END AS customer_zone,
       coalesce(c.country_name, 'Unknown') AS country_name, coalesce(c.market_group, 'Unknown') AS market_group,
       c.customer_status, c.is_inferred, coalesce(s.segment_name, 'Not segmented') AS customer_segment,
       cur.channel AS channel_current, c.scd_version, c.scd_is_current
FROM dw.dim_customer c
JOIN dw.dim_region r ON r.region_key = c.region_key
LEFT JOIN dw.customer_segment s ON s.customer_code = c.customer_code
LEFT JOIN dw.dim_customer cur ON cur.customer_code = c.customer_code AND cur.scd_is_current;

CREATE OR REPLACE VIEW mart.dim_cost_category AS
SELECT cost_category_key, cost_category_code, cost_category_name, cost_group, cost_behaviour, is_crop_specific
FROM dw.dim_cost_category;

CREATE OR REPLACE VIEW mart.dim_commodity AS
SELECT commodity_key, commodity_code, commodity_name, price_unit, commodity_role FROM dw.dim_commodity;

-- ------------------------------------------------------------------ facts
CREATE OR REPLACE VIEW mart.fact_sales AS
SELECT invoice_date_key, dispatch_date_key, product_key, customer_key, farm_key,
       (CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END)
         * (substr(invoice_no, 4, 4)::bigint * 1000000 + split_part(invoice_no, '-', 2)::bigint) AS invoice_id,
       doc_type, quantity_kg, gross_revenue_nad, discount_nad, net_revenue_nad, cogs_nad, freight_cost_nad, is_price_anomaly
FROM dw.fact_sales;

CREATE OR REPLACE VIEW mart.fact_harvest AS
SELECT harvest_date_key, farm_key, crop_key, harvested_kg, is_corrected FROM dw.fact_harvest;

CREATE OR REPLACE VIEW mart.fact_crop_cycle AS
SELECT cycle_id, block_id, farm_key, crop_key, planting_date_key, first_harvest_date_key, last_harvest_date_key,
       harvest_season_end_date_key, cycle_status, irrigation_method, is_irrigated, planted_ha, harvested_ha,
       planned_production_kg, harvested_kg, days_to_first_harvest, direct_cost_nad, fertiliser_kg
FROM dw.fact_crop_cycle;

CREATE OR REPLACE VIEW mart.fact_production_cost AS
SELECT posting_date_key, farm_key, crop_key, cost_category_key, amount_nad, input_qty FROM dw.fact_production_cost;

CREATE OR REPLACE VIEW mart.fact_inventory_monthly AS
SELECT snapshot_date_key, farm_key, product_key, opening_stock_kg, received_kg, dispatched_kg, shrinkage_kg,
       closing_stock_kg, closing_stock_value_nad
FROM dw.fact_inventory_monthly;

CREATE OR REPLACE VIEW mart.fact_weather_daily AS
SELECT date_key, farm_key, rainfall_mm, t_max_c, t_min_c, CASE WHEN is_heat_day THEN 1 ELSE 0 END AS heat_day
FROM dw.fact_weather_daily;

CREATE OR REPLACE VIEW mart.fact_market_price_monthly AS
SELECT month_date_key, commodity_key, crop_key, price_usd, fx_nad_per_usd, price_nad FROM dw.fact_market_price_monthly;

CREATE OR REPLACE VIEW mart.fact_crop_estimate AS
SELECT season_end_date_key, region_key, crop_key, farming_sector, area_planted_ha, production_t FROM dw.fact_crop_estimate;

CREATE OR REPLACE VIEW mart.fact_forecast_monthly AS
SELECT month_date_key, crop_category_key, model_name, scenario, actual_net_revenue_nad, forecast_net_revenue_nad,
       lower_80_nad, upper_80_nad, lower_95_nad, upper_95_nad
FROM dw.fact_forecast_monthly;

CREATE OR REPLACE VIEW mart.yield_driver_importance AS
SELECT model_name, feature, importance, coefficient, p_value, rank_order FROM dw.yield_driver_importance;

CREATE OR REPLACE VIEW mart.sec_user_zone AS
SELECT user_upn, zone_code FROM sec.user_zone_access;

-- Data-quality summary for the operations / data-quality report page
CREATE OR REPLACE VIEW mart.dq_summary AS
SELECT r.rule_code, r.rule_name, r.dq_dimension, r.action, r.owner_role, r.source_object,
       count(l.issue_id) AS issues_logged, max(l.batch_id) AS last_batch_id
FROM audit.dq_rule r
LEFT JOIN audit.dq_issue_log l ON l.rule_code = r.rule_code
     AND l.batch_id = (SELECT max(batch_id) FROM audit.etl_batch WHERE batch_type = 'FULL' AND status = 'SUCCEEDED')
GROUP BY r.rule_code, r.rule_name, r.dq_dimension, r.action, r.owner_role, r.source_object;

CREATE OR REPLACE VIEW mart.recon_latest AS
SELECT check_code, check_name, check_type, source_value, target_value, difference, tolerance, status, explanation
FROM audit.recon_result
WHERE batch_id = (SELECT max(batch_id) FROM audit.etl_batch WHERE batch_type = 'FULL' AND status = 'SUCCEEDED');
