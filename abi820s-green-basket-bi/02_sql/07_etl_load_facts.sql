-- =============================================================================
-- 07_etl_load_facts.sql
-- Fact load procedures. Surrogate keys are resolved against the dimension
-- version valid on the event date (SCD2 range lookup); unresolved members map
-- to -1/-2. All loads are idempotent upserts on the fact's natural key, so the
-- same procedure supports full rebuilds and incremental re-runs.
-- =============================================================================

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_sales(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_inferred int; n bigint;
BEGIN
    -- SA04: late-arriving customers become inferred members (completed later by sp_load_dim_customer_scd2)
    INSERT INTO dw.dim_customer (customer_code, customer_name, customer_type, region_key, channel, is_inferred,
                                 scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    SELECT DISTINCT s.customer_code, 'Inferred customer ' || s.customer_code || ' (awaiting master data)', 'Unknown', -1,
           'Unassigned', true, DATE '1900-01-01', true, 1, md5('inferred'), p_batch
    FROM stg.sales_clean s
    WHERE s.dq_status IN ('OK', 'CORRECTED')
      AND NOT EXISTS (SELECT 1 FROM dw.dim_customer d WHERE d.customer_code = s.customer_code);
    GET DIAGNOSTICS n_inferred = ROW_COUNT;

    INSERT INTO dw.fact_sales (invoice_date_key, dispatch_date_key, product_key, customer_key, farm_key, invoice_no, line_no,
                               doc_type, ref_invoice_no, sales_rep_code, currency_code, quantity_sales_uom, quantity_kg,
                               unit_price_txn, fx_rate_nad, gross_revenue_nad, discount_nad, net_revenue_nad, cogs_nad,
                               freight_cost_nad, is_price_anomaly, dw_batch_id)
    SELECT to_char(s.invoice_date, 'YYYYMMDD')::int,
           to_char(coalesce(s.dispatch_date, s.invoice_date), 'YYYYMMDD')::int,
           p.product_key, coalesce(c.customer_key, -1), coalesce(f.farm_key, -1),
           s.invoice_no, s.line_no, s.doc_type, s.ref_invoice_no, s.sales_rep_code, s.currency_code,
           s.quantity, s.quantity_kg, s.unit_price, s.fx_rate_nad, s.gross_revenue_nad, s.discount_nad, s.net_revenue_nad,
           s.cogs_nad, s.freight_nad, s.is_price_anomaly, p_batch
    FROM stg.sales_clean s
    JOIN dw.dim_product p ON p.product_code = s.product_code
    LEFT JOIN dw.dim_customer c ON c.customer_code = s.customer_code
                               AND s.invoice_date BETWEEN c.scd_effective_from AND c.scd_effective_to
    LEFT JOIN dw.dim_farm f ON f.farm_code = s.farm_code
                           AND s.invoice_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    WHERE s.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (invoice_no, line_no) DO UPDATE
    SET invoice_date_key = EXCLUDED.invoice_date_key, dispatch_date_key = EXCLUDED.dispatch_date_key,
        product_key = EXCLUDED.product_key, customer_key = EXCLUDED.customer_key, farm_key = EXCLUDED.farm_key,
        quantity_sales_uom = EXCLUDED.quantity_sales_uom, quantity_kg = EXCLUDED.quantity_kg,
        unit_price_txn = EXCLUDED.unit_price_txn, fx_rate_nad = EXCLUDED.fx_rate_nad,
        gross_revenue_nad = EXCLUDED.gross_revenue_nad, discount_nad = EXCLUDED.discount_nad,
        net_revenue_nad = EXCLUDED.net_revenue_nad, cogs_nad = EXCLUDED.cogs_nad, freight_cost_nad = EXCLUDED.freight_cost_nad,
        is_price_anomaly = EXCLUDED.is_price_anomaly, dw_batch_id = EXCLUDED.dw_batch_id
    WHERE (dw.fact_sales.customer_key, dw.fact_sales.farm_key, dw.fact_sales.net_revenue_nad, dw.fact_sales.quantity_kg)
          IS DISTINCT FROM (EXCLUDED.customer_key, EXCLUDED.farm_key, EXCLUDED.net_revenue_nad, EXCLUDED.quantity_kg);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_sales', 'dw.fact_sales',
                         (SELECT count(*) FROM stg.sales_clean WHERE dq_status IN ('OK', 'CORRECTED')), n, 0, t0,
                         n_inferred || ' inferred customer members created');
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_harvest(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_harvest (harvest_date_key, farm_key, crop_key, cycle_id, block_id, recorder_code, harvested_kg,
                                 is_corrected, source_file, source_row_num, dw_batch_id)
    SELECT to_char(h.harvest_date, 'YYYYMMDD')::int, coalesce(f.farm_key, -1), c.crop_key, h.cycle_id, h.block_id,
           h.recorder_code, h.harvested_kg, coalesce(h.dq_note, '') LIKE '%HV06%', h.source_file, h.row_num, p_batch
    FROM stg.harvest_clean h
    JOIN dw.dim_crop c ON c.crop_code = h.crop_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = h.farm_code AND h.harvest_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    WHERE h.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (source_file, source_row_num) DO UPDATE
    SET harvest_date_key = EXCLUDED.harvest_date_key, farm_key = EXCLUDED.farm_key, crop_key = EXCLUDED.crop_key,
        cycle_id = EXCLUDED.cycle_id, harvested_kg = EXCLUDED.harvested_kg, is_corrected = EXCLUDED.is_corrected,
        dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_harvest', 'dw.fact_harvest',
                         (SELECT count(*) FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED')), n, 0, t0);
END $$;

-- Accumulating snapshot: milestones and cumulative measures are recomputed and
-- the existing row is UPDATED in place as the crop cycle progresses.
CREATE OR REPLACE PROCEDURE etl.sp_load_fact_crop_cycle(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    -- PL03: register status contradicting the harvest log
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'PL03', 'Planting register', p.cycle_id || '|' || p.block_id, 'status', p.register_status,
           CASE WHEN h.n > 0 THEN 'Status set to Harvesting (harvest records exist)' ELSE 'Kept (no harvest records yet)' END
    FROM stg.planting_clean p
    LEFT JOIN (SELECT cycle_id, block_id, count(*) AS n FROM stg.harvest_clean
               WHERE dq_status IN ('OK', 'CORRECTED') GROUP BY 1, 2) h USING (cycle_id, block_id)
    WHERE (p.register_status = 'Growing' AND h.n > 0) OR (p.register_status = 'Completed' AND h.n IS NULL);

    WITH h AS (
        SELECT cycle_id, block_id, min(harvest_date) AS first_d, max(harvest_date) AS last_d,
               sum(harvested_kg) AS kg, count(*) AS n
        FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED') AND cycle_id IS NOT NULL GROUP BY 1, 2
    ), area AS (
        SELECT cycle_id, sum(planted_ha) AS cycle_ha FROM stg.planting_clean GROUP BY 1
    ), cost AS (
        SELECT cost_centre AS cycle_id, sum(amount_nad) AS amt,
               coalesce(sum(input_qty) FILTER (WHERE cost_category_code = 'CC02'), 0) AS fert
        FROM stg.cost_clean WHERE dq_status IN ('OK', 'CORRECTED') GROUP BY 1
    ), delay AS (
        SELECT p.crop_code, avg(h.first_d - p.planting_date)::int AS avg_days
        FROM stg.planting_clean p JOIN h USING (cycle_id, block_id) GROUP BY 1
    )
    INSERT INTO dw.fact_crop_cycle (cycle_id, block_id, farm_key, crop_key, planting_date_key, first_harvest_date_key,
                                    last_harvest_date_key, harvest_season_end_date_key, cycle_status, variety,
                                    irrigation_method, is_irrigated, planted_ha,
                                    harvested_ha, planned_yield_t_ha, planned_production_kg, harvested_kg, harvest_event_count,
                                    days_to_first_harvest, harvest_duration_days, direct_cost_nad, fertiliser_kg,
                                    planted_ha_imputed, dw_batch_id)
    SELECT p.cycle_id, p.block_id, coalesce(f.farm_key, -1), c.crop_key,
           to_char(p.planting_date, 'YYYYMMDD')::int,
           coalesce(to_char(h.first_d, 'YYYYMMDD')::int, -1),
           coalesce(to_char(h.last_d, 'YYYYMMDD')::int, -1),
           to_char(make_date(extract(year FROM (coalesce(h.first_d, p.planting_date + coalesce(dl.avg_days, 120)) - interval '9 months'))::int + 1, 9, 30), 'YYYYMMDD')::int,
           CASE WHEN p.register_status = 'Growing' AND h.n > 0 THEN 'Harvesting' ELSE p.register_status END,
           p.variety, coalesce(p.irrigation_method, f.irrigation_type, 'Unknown'), coalesce(p.is_irrigated, f.is_irrigated, false),
           p.planted_ha, p.harvested_ha, p.planned_yield_t_ha,
           round(p.planned_yield_t_ha * p.planted_ha * 1000, 1),
           coalesce(h.kg, 0), coalesce(h.n, 0), h.first_d - p.planting_date, h.last_d - h.first_d,
           round(coalesce(cost.amt, 0) * p.planted_ha / nullif(a.cycle_ha, 0), 2),
           round(coalesce(cost.fert, 0) * p.planted_ha / nullif(a.cycle_ha, 0), 1),
           coalesce(p.dq_note, '') LIKE '%PL02%', p_batch
    FROM stg.planting_clean p
    JOIN dw.dim_crop c ON c.crop_code = p.crop_code
    JOIN area a ON a.cycle_id = p.cycle_id
    LEFT JOIN h ON h.cycle_id = p.cycle_id AND h.block_id = p.block_id
    LEFT JOIN cost ON cost.cycle_id = p.cycle_id
    LEFT JOIN delay dl ON dl.crop_code = p.crop_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = p.farm_code AND p.planting_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    ON CONFLICT (cycle_id, block_id) DO UPDATE
    SET first_harvest_date_key = EXCLUDED.first_harvest_date_key, last_harvest_date_key = EXCLUDED.last_harvest_date_key,
        harvest_season_end_date_key = EXCLUDED.harvest_season_end_date_key, cycle_status = EXCLUDED.cycle_status,
        irrigation_method = EXCLUDED.irrigation_method, is_irrigated = EXCLUDED.is_irrigated,
        harvested_ha = EXCLUDED.harvested_ha, harvested_kg = EXCLUDED.harvested_kg,
        harvest_event_count = EXCLUDED.harvest_event_count, days_to_first_harvest = EXCLUDED.days_to_first_harvest,
        harvest_duration_days = EXCLUDED.harvest_duration_days, direct_cost_nad = EXCLUDED.direct_cost_nad,
        fertiliser_kg = EXCLUDED.fertiliser_kg, dw_batch_id = EXCLUDED.dw_batch_id, dw_updated_at = now();
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_crop_cycle (accumulating snapshot)', 'dw.fact_crop_cycle',
                         (SELECT count(*) FROM stg.planting_clean), n, 0, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_production_cost(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_production_cost (posting_date_key, farm_key, crop_key, cost_category_key, posting_id, cost_centre,
                                         supplier_code, amount_nad, input_qty, input_uom, is_reversal, dw_batch_id)
    SELECT to_char(c.posting_date, 'YYYYMMDD')::int, coalesce(f.farm_key, -1),
           CASE WHEN c.crop_code IS NOT NULL THEN coalesce(cr.crop_key, -1)
                WHEN cc.is_crop_specific THEN -1 ELSE -2 END,
           cc.cost_category_key, c.posting_id, c.cost_centre, c.supplier_code, c.amount_nad, c.input_qty, c.input_uom,
           c.is_reversal, p_batch
    FROM stg.cost_clean c
    JOIN dw.dim_cost_category cc ON cc.cost_category_code = c.cost_category_code
    LEFT JOIN dw.dim_crop cr ON cr.crop_code = c.crop_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = c.farm_code AND c.posting_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    WHERE c.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (posting_id) DO UPDATE
    SET amount_nad = EXCLUDED.amount_nad, input_qty = EXCLUDED.input_qty, farm_key = EXCLUDED.farm_key,
        crop_key = EXCLUDED.crop_key, cost_category_key = EXCLUDED.cost_category_key, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_production_cost', 'dw.fact_production_cost',
                         (SELECT count(*) FROM stg.cost_clean WHERE dq_status IN ('OK', 'CORRECTED')), n, 0, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_inventory(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_inventory_monthly (snapshot_date_key, farm_key, product_key, opening_stock_kg, received_kg,
                                           dispatched_kg, shrinkage_kg, closing_stock_kg, closing_stock_value_nad,
                                           is_imputed, is_sign_corrected, dw_batch_id)
    SELECT to_char(s.snapshot_date, 'YYYYMMDD')::int, coalesce(f.farm_key, -1), p.product_key, s.opening_kg, s.received_kg,
           s.dispatched_kg, s.shrinkage_kg, s.closing_kg, s.closing_value_nad, s.is_imputed,
           coalesce(s.dq_note, '') LIKE '%ST01%', p_batch
    FROM stg.stock_clean s
    JOIN dw.dim_product p ON p.product_code = s.product_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = s.farm_code AND s.snapshot_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    ON CONFLICT (snapshot_date_key, farm_key, product_key) DO UPDATE
    SET opening_stock_kg = EXCLUDED.opening_stock_kg, received_kg = EXCLUDED.received_kg, dispatched_kg = EXCLUDED.dispatched_kg,
        shrinkage_kg = EXCLUDED.shrinkage_kg, closing_stock_kg = EXCLUDED.closing_stock_kg,
        closing_stock_value_nad = EXCLUDED.closing_stock_value_nad, is_imputed = EXCLUDED.is_imputed,
        is_sign_corrected = EXCLUDED.is_sign_corrected, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_inventory_monthly (periodic snapshot)', 'dw.fact_inventory_monthly',
                         (SELECT count(*) FROM stg.stock_clean), n, 0, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_weather(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_weather_daily (date_key, farm_key, rainfall_mm, t_max_c, t_min_c, rh_pct, solar_mj_m2, is_heat_day,
                                       is_rain_day, rainfall_imputed, temp_imputed, dw_batch_id)
    SELECT to_char(w.obs_date, 'YYYYMMDD')::int, f.farm_key, w.rainfall_mm, w.t_max_c, w.t_min_c, w.rh_pct, w.solar_mj_m2,
           w.t_max_c >= 35, w.rainfall_mm >= 1, w.rainfall_imputed, w.temp_imputed, p_batch
    FROM stg.weather_clean w
    JOIN dw.dim_farm f ON f.farm_code = w.farm_code AND w.obs_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    ON CONFLICT (date_key, farm_key) DO UPDATE
    SET rainfall_mm = EXCLUDED.rainfall_mm, t_max_c = EXCLUDED.t_max_c, t_min_c = EXCLUDED.t_min_c, rh_pct = EXCLUDED.rh_pct,
        solar_mj_m2 = EXCLUDED.solar_mj_m2, is_heat_day = EXCLUDED.is_heat_day, is_rain_day = EXCLUDED.is_rain_day,
        rainfall_imputed = EXCLUDED.rainfall_imputed, temp_imputed = EXCLUDED.temp_imputed, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_weather_daily', 'dw.fact_weather_daily', (SELECT count(*) FROM stg.weather_clean), n, 0, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_market_price(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_market_price_monthly (month_date_key, commodity_key, crop_key, price_usd, fx_nad_per_usd, price_nad,
                                              is_imputed, dw_batch_id)
    SELECT to_char((m.month_start + interval '1 month - 1 day')::date, 'YYYYMMDD')::int, d.commodity_key, d.crop_key,
           m.price_usd, fx.nad_per_unit, round(m.price_usd * fx.nad_per_unit, 2), m.is_imputed, p_batch
    FROM stg.market_price_clean m
    JOIN dw.dim_commodity d ON d.commodity_code = m.commodity_code
    JOIN ref.fx_rate_monthly fx ON fx.currency_code = 'USD' AND fx.month_start = m.month_start
    WHERE m.price_usd IS NOT NULL
    ON CONFLICT (month_date_key, commodity_key) DO UPDATE
    SET price_usd = EXCLUDED.price_usd, fx_nad_per_usd = EXCLUDED.fx_nad_per_usd, price_nad = EXCLUDED.price_nad,
        is_imputed = EXCLUDED.is_imputed, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_market_price_monthly', 'dw.fact_market_price_monthly',
                         (SELECT count(*) FROM stg.market_price_clean), n, 0, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_crop_estimate(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_crop_estimate (season_end_date_key, region_key, crop_key, farming_sector, area_planted_ha, production_t,
                                       yield_t_ha, is_yield_derived, release_date, source_table, dw_batch_id)
    SELECT to_char(make_date(e.season_start_year + 1, 9, 30), 'YYYYMMDD')::int, r.region_key, c.crop_key, e.farming_sector,
           e.area_planted_ha, e.production_t, e.yield_t_ha, e.yield_derived, e.release_date, e.source_table, p_batch
    FROM stg.crop_estimate_clean e
    JOIN dw.dim_region r ON r.region_code = e.region_code
    JOIN dw.dim_crop c ON c.crop_code = e.crop_code
    WHERE e.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (season_end_date_key, region_key, crop_key, farming_sector) DO UPDATE
    SET area_planted_ha = EXCLUDED.area_planted_ha, production_t = EXCLUDED.production_t, yield_t_ha = EXCLUDED.yield_t_ha,
        is_yield_derived = EXCLUDED.is_yield_derived, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_crop_estimate', 'dw.fact_crop_estimate',
                         (SELECT count(*) FROM stg.crop_estimate_clean WHERE dq_status <> 'REJECTED'), n, 0, t0);
END $$;

-- ---------------------------------------------------------------------------
-- Orchestration: full load (all transforms, dimensions, facts) in dependency order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_run_full_load(p_batch integer)
LANGUAGE plpgsql AS $$
BEGIN
    CALL etl.sp_transform_master_data(p_batch);
    CALL etl.sp_load_dim_date(p_batch, DATE '2020-01-01', DATE '2027-12-31', DATE '2026-09-30');
    CALL etl.sp_load_dim_region(p_batch);
    CALL etl.sp_load_dim_crop_hierarchy(p_batch);
    CALL etl.sp_load_dim_cost_category(p_batch);
    CALL etl.sp_load_dim_farm_scd2(p_batch);
    CALL etl.sp_load_dim_customer_scd2(p_batch);
    CALL etl.sp_transform_market_fx(p_batch);
    CALL etl.sp_load_dim_commodity(p_batch);
    CALL etl.sp_transform_planting(p_batch);
    CALL etl.sp_transform_harvest(p_batch);
    CALL etl.sp_transform_sales(p_batch);
    CALL etl.sp_transform_costs(p_batch);
    CALL etl.sp_transform_stock(p_batch);
    CALL etl.sp_transform_weather(p_batch);
    CALL etl.sp_transform_crop_estimates(p_batch);
    CALL etl.sp_load_fact_sales(p_batch);
    CALL etl.sp_load_fact_harvest(p_batch);
    CALL etl.sp_load_fact_crop_cycle(p_batch);
    CALL etl.sp_load_fact_production_cost(p_batch);
    CALL etl.sp_load_fact_inventory(p_batch);
    CALL etl.sp_load_fact_weather(p_batch);
    CALL etl.sp_load_fact_market_price(p_batch);
    CALL etl.sp_load_fact_crop_estimate(p_batch);
END $$;

-- Day-2 incremental run: master-data delta only (SCD2 versions + inferred-member completion)
CREATE OR REPLACE PROCEDURE etl.sp_run_master_delta(p_batch integer)
LANGUAGE plpgsql AS $$
BEGIN
    CALL etl.sp_transform_master_data(p_batch);
    CALL etl.sp_load_dim_farm_scd2(p_batch);
    CALL etl.sp_load_dim_customer_scd2(p_batch);
END $$;
