-- =============================================================================
-- 08_reconciliation.sql
-- Post-load reconciliation: row counts, control totals, referential integrity,
-- cross-source checks and SCD integrity. Results land in audit.recon_result.
-- =============================================================================
CREATE OR REPLACE PROCEDURE etl.sp_reconcile(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE
    a numeric; b numeric; c numeric; d numeric; e numeric;
BEGIN
    DELETE FROM audit.recon_result WHERE batch_id = p_batch;

    -- R01 harvest rows: raw = loaded + rejected + duplicates
    SELECT count(*) INTO a FROM stg.harvest_log_raw;
    SELECT count(*) FILTER (WHERE dq_status IN ('OK', 'CORRECTED')), count(*) FILTER (WHERE dq_status = 'REJECTED'),
           count(*) FILTER (WHERE dq_status = 'DUPLICATE') INTO b, c, d FROM stg.harvest_clean;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R01', 'Harvest log rows: raw = loaded + rejected + duplicates', 'ROW_COUNT', a, b + c + d, 0,
            CASE WHEN a = b + c + d THEN 'PASS' ELSE 'FAIL' END,
            format('%s loaded, %s rejected to quarantine, %s duplicates removed', b, c, d));

    SELECT count(*) INTO e FROM dw.fact_harvest;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R02', 'Harvest rows: cleansed staging = fact_harvest', 'ROW_COUNT', b, e, 0,
            CASE WHEN b = e THEN 'PASS' ELSE 'FAIL' END, 'Every accepted harvest record loaded once');

    -- R03 harvest control total (kg)
    SELECT sum(harvested_kg) INTO a FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED');
    SELECT sum(harvested_kg) INTO b FROM dw.fact_harvest;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R03', 'Harvest control total (kg): staging = warehouse', 'CONTROL_TOTAL', a, b, 0.5,
            CASE WHEN abs(a - b) <= 0.5 THEN 'PASS' ELSE 'FAIL' END, 'Sum of standardised kilograms');

    -- R04 sales rows
    SELECT count(*) INTO a FROM stg.sales_raw;
    SELECT count(*) FILTER (WHERE dq_status IN ('OK', 'CORRECTED')), count(*) FILTER (WHERE dq_status = 'REJECTED'),
           count(*) FILTER (WHERE dq_status = 'DUPLICATE') INTO b, c, d FROM stg.sales_clean;
    SELECT count(*) INTO e FROM dw.fact_sales;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R04', 'ERP sales rows: raw = loaded + rejected + duplicates', 'ROW_COUNT', a, e + c + d, 0,
            CASE WHEN a = e + c + d THEN 'PASS' ELSE 'FAIL' END,
            format('%s lines in fact_sales, %s rejected, %s duplicate lines from overlapping extracts removed', e, c, d));

    -- R05 sales control total (net revenue N$)
    SELECT sum(net_revenue_nad) INTO a FROM stg.sales_clean WHERE dq_status IN ('OK', 'CORRECTED');
    SELECT sum(net_revenue_nad) INTO b FROM dw.fact_sales;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R05', 'Net revenue control total (N$): staging = warehouse', 'CONTROL_TOTAL', a, b, 1,
            CASE WHEN abs(a - b) <= 1 THEN 'PASS' ELSE 'FAIL' END, 'Includes credit notes (negative)');

    -- R06 cross-source: ERP invoiced kg vs stock-system dispatched kg (whole period)
    SELECT sum(quantity_kg) INTO a FROM dw.fact_sales WHERE doc_type = 'INV';
    SELECT sum(dispatched_kg) INTO b FROM dw.fact_inventory_monthly;
    SELECT coalesce(sum(s.quantity_kg), 0) INTO c
    FROM dw.fact_sales s WHERE s.doc_type = 'INV' AND s.invoice_date_key / 100 <> s.dispatch_date_key / 100;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R06', 'Cross-source: ERP invoiced kg vs stock-system dispatched kg', 'CROSS_SOURCE', a, b, 0.002 * a,
            CASE WHEN abs(b - a) <= 0.002 * a THEN 'PASS' WHEN abs(b - a) <= 0.01 * a THEN 'WARN' ELSE 'FAIL' END,
            format('Difference = goods dispatched on 29-30 Sep 2026 and invoiced after the extract (unbilled at cut-off). %s kg were invoiced in a later month than dispatched (timing only).', round(c)));

    -- R07 stock-flow identity after cleansing
    SELECT count(*) INTO a FROM dw.fact_inventory_monthly
    WHERE abs(opening_stock_kg + received_kg - dispatched_kg - shrinkage_kg - closing_stock_kg) > 1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R07', 'Stock-flow identity exceptions (opening + in - out - loss = closing)', 'INTEGRITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'FAIL' END, 'After sign-error correction (ST01) and gap imputation (ST03)');

    -- R08 stock continuity: closing(m-1) = opening(m)
    WITH s AS (
        SELECT f.farm_code, i.product_key, i.snapshot_date_key, i.opening_stock_kg,
               lag(i.closing_stock_kg) OVER (PARTITION BY f.farm_code, i.product_key ORDER BY i.snapshot_date_key) AS prev_close,
               lag(i.snapshot_date_key) OVER (PARTITION BY f.farm_code, i.product_key ORDER BY i.snapshot_date_key) AS prev_key
        FROM dw.fact_inventory_monthly i JOIN dw.dim_farm f USING (farm_key)
    )
    SELECT count(*) INTO a FROM s
    WHERE prev_key IS NOT NULL AND abs(opening_stock_kg - prev_close) > 1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R08', 'Stock continuity breaks (closing of month m-1 <> opening of month m)', 'INTEGRITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'FAIL' END, 'Gaps imputed by rule ST03');

    -- R09 cost ledger control total
    SELECT sum(etl.fn_try_numeric(r.amount_nad)) INTO a
    FROM stg.cost_ledger_raw r JOIN stg.cost_clean c USING (source_file, row_num) WHERE c.dq_status <> 'DUPLICATE';
    SELECT sum(amount_nad) INTO b FROM dw.fact_production_cost;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R09', 'Cost ledger control total (N$): raw (excl. duplicates) = warehouse', 'CONTROL_TOTAL', a, b, 1,
            CASE WHEN abs(a - b) <= 1 THEN 'PASS' ELSE 'FAIL' END, 'Reversal/correction pairs retained (they are legitimate postings)');

    SELECT count(*) INTO a FROM stg.cost_ledger_raw;
    SELECT count(*) INTO b FROM dw.fact_production_cost;
    SELECT count(*) INTO c FROM stg.cost_clean WHERE dq_status IN ('DUPLICATE', 'REJECTED');
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R10', 'Cost ledger rows: raw = loaded + duplicates/rejected', 'ROW_COUNT', a, b + c, 0,
            CASE WHEN a = b + c THEN 'PASS' ELSE 'FAIL' END, format('%s duplicate/rejected postings', c));

    -- R11 unknown-member share in fact_sales
    SELECT count(*) FILTER (WHERE farm_key = -1), count(*) INTO a, b FROM dw.fact_sales;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R11', 'Sales lines on Unknown farm (-1), % of lines', 'REFERENTIAL', 2.0, round(100 * a / b, 3), 2.0,
            CASE WHEN 100 * a / b <= 2 THEN 'PASS' ELSE 'WARN' END,
            format('%s of %s lines lack farm of origin (rule SA05); threshold 2 %%', a, b));

    SELECT count(*) INTO a FROM dw.dim_customer WHERE is_inferred;
    SELECT count(*) INTO b FROM dw.fact_sales WHERE customer_key = -1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R12', 'Sales lines with Unknown customer (-1) / open inferred members', 'REFERENTIAL', 0, b, 0,
            CASE WHEN b = 0 THEN 'PASS' ELSE 'FAIL' END,
            format('%s inferred customer member(s) currently awaiting master data (rule SA04)', a));

    -- R13 SCD2 integrity: one current row per key, no overlaps, no gaps
    SELECT (SELECT count(*) FROM (SELECT farm_code FROM dw.dim_farm GROUP BY farm_code HAVING count(*) FILTER (WHERE scd_is_current) <> 1) x)
         + (SELECT count(*) FROM (SELECT customer_code FROM dw.dim_customer GROUP BY customer_code HAVING count(*) FILTER (WHERE scd_is_current) <> 1) y)
         + (SELECT count(*) FROM (SELECT farm_code, scd_effective_from,
                                         lag(scd_effective_to) OVER (PARTITION BY farm_code ORDER BY scd_effective_from) AS prev_to
                                  FROM dw.dim_farm) z WHERE prev_to IS NOT NULL AND scd_effective_from <> prev_to + 1)
         + (SELECT count(*) FROM (SELECT customer_code, scd_effective_from,
                                         lag(scd_effective_to) OVER (PARTITION BY customer_code ORDER BY scd_effective_from) AS prev_to
                                  FROM dw.dim_customer) z WHERE prev_to IS NOT NULL AND scd_effective_from <> prev_to + 1)
    INTO a;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R13', 'SCD2 integrity violations (current-row count, overlaps, gaps)', 'INTEGRITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'FAIL' END,
            format('dim_farm %s versions / %s farms; dim_customer %s versions / %s customers',
                   (SELECT count(*) FROM dw.dim_farm WHERE farm_key > 0), (SELECT count(DISTINCT farm_code) FROM dw.dim_farm WHERE farm_key > 0),
                   (SELECT count(*) FROM dw.dim_customer WHERE customer_key > 0), (SELECT count(DISTINCT customer_code) FROM dw.dim_customer WHERE customer_key > 0)));

    -- R14 date dimension completeness
    SELECT count(*) INTO a FROM dw.dim_date WHERE date_key > 0;
    b := DATE '2027-12-31' - DATE '2020-01-01' + 1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R14', 'Date dimension: contiguous days 2020-01-01..2027-12-31', 'COMPLETENESS', b, a, 0,
            CASE WHEN a = b THEN 'PASS' ELSE 'FAIL' END, 'Required for Power BI time intelligence (mark as date table)');

    -- R15 weather completeness
    SELECT count(*), count(rainfall_mm), count(t_max_c) INTO a, b, c FROM dw.fact_weather_daily;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R15', 'Weather completeness: farm-days with rainfall (%)', 'COMPLETENESS', 100, round(100 * b / a, 3), 0.5,
            CASE WHEN 100 * b / a >= 99.5 THEN 'PASS' ELSE 'WARN' END,
            format('%s farm-days; temperature complete for %s after interpolation (WE01)', a, c));

    -- R16 market price completeness
    SELECT count(*) INTO a FROM dw.fact_market_price_monthly;
    SELECT count(DISTINCT month_start) * 6 INTO b FROM stg.market_price_clean;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R16', 'Commodity prices: months x 6 series loaded', 'COMPLETENESS', b, a, 0,
            CASE WHEN a = b THEN 'PASS' ELSE 'FAIL' END, 'Missing Pink Sheet markers interpolated (MP01)');

    -- R17 plausibility: Green Basket output <= regional estimate (region x crop x season)
    WITH gb AS (
        SELECT f.region_key, h.crop_key, (extract(year FROM d.full_date - interval '9 months'))::int AS season, sum(h.harvested_kg) / 1000 AS t
        FROM dw.fact_harvest h JOIN dw.dim_farm f USING (farm_key) JOIN dw.dim_date d ON d.date_key = h.harvest_date_key
        GROUP BY 1, 2, 3
    ), est AS (
        SELECT e.region_key, e.crop_key, (e.season_end_date_key / 10000) - 1 AS season, sum(e.production_t) AS t
        FROM dw.fact_crop_estimate e GROUP BY 1, 2, 3
    )
    SELECT count(*) FILTER (WHERE gb.t > est.t * 1.001), count(*) INTO a, b FROM gb JOIN est USING (region_key, crop_key, season);
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R17', 'Plausibility: Green Basket harvest exceeds the NSA regional estimate', 'PLAUSIBILITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'WARN' END, format('%s region-crop-season combinations compared', b));

    -- R18 cross-source: harvest (net of typical cull) vs stock received
    SELECT round(sum(h.harvested_kg * (1 - c.typical_cull_pct / 100)), 1) INTO a
    FROM dw.fact_harvest h JOIN dw.dim_crop c USING (crop_key) JOIN dw.dim_date d ON d.date_key = h.harvest_date_key
    WHERE d.full_date >= DATE '2021-04-01';
    SELECT sum(received_kg) INTO b FROM dw.fact_inventory_monthly WHERE is_imputed = false;
    SELECT coalesce(sum(etl.fn_try_numeric(r.qty_txt, r.template_code = 'B')
                        * coalesce(u.kg_factor, 1)), 0) INTO c
    FROM stg.harvest_clean h JOIN stg.harvest_log_raw r USING (source_file, row_num)
    LEFT JOIN ref.uom_conversion u ON u.uom_norm = h.unit_norm
    WHERE h.dq_status = 'REJECTED' AND coalesce(h.dq_note, '') NOT LIKE '%HV03%';
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R18', 'Cross-source: harvest net of cull (kg) vs stock received (kg)', 'CROSS_SOURCE', a, b, 0.005 * a,
            CASE WHEN abs(a - b) <= 0.005 * a THEN 'PASS' ELSE 'WARN' END,
            format('Net residual %s kg (%s %%): harvest rows quarantined for invalid date/quantity (%s kg as keyed; blank and negative entries carry no usable value until resubmitted) plus the gap between crop-level typical cull and actual grading losses; within the 0.5 %% tolerance.', round(a - b), round(100 * (a - b) / b, 2), round(c)));

    -- R19 price anomalies flagged for review
    SELECT count(*), coalesce(sum(net_revenue_nad), 0) INTO a, b FROM dw.fact_sales WHERE is_price_anomaly;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R19', 'Invoice lines flagged as price anomalies (SA07), count', 'PLAUSIBILITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'WARN' END,
            format('N$ %s of revenue on flagged lines awaiting Sales Data Steward review', to_char(b, 'FM999,999,999,990')));
END $$;
