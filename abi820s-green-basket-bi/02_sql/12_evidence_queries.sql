-- =============================================================================
-- 12_evidence_queries.sql
-- "Evidence the warehouse was loaded" - captured into 06_report/evidence/*.md
-- =============================================================================

-- name: ev_row_counts
SELECT t.table_schema || '.' || t.table_name AS table_name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text::bigint AS row_count,
       pg_size_pretty(pg_total_relation_size(format('%I.%I', t.table_schema, t.table_name)::regclass)) AS total_size
FROM information_schema.tables t
WHERE t.table_schema = 'dw' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name LIKE 'fact%' DESC, row_count DESC;

-- name: ev_batches
SELECT batch_id, batch_type, description, to_char(started_at, 'YYYY-MM-DD HH24:MI:SS') AS started,
       round(extract(epoch FROM finished_at - started_at)::numeric, 1) AS seconds, status
FROM audit.etl_batch ORDER BY batch_id;

-- name: ev_extract_files
SELECT replace(step_name, 'extract ', '') AS source_file, target_table, rows_in AS rows_landed
FROM audit.etl_step_log WHERE batch_id = 1 AND step_name LIKE 'extract %' ORDER BY step_id;

-- name: ev_steps
SELECT step_name, rows_in, rows_out, rows_rejected, round(duration_ms) AS ms, coalesce(message, '') AS note
FROM audit.etl_step_log WHERE batch_id = 1 AND step_name NOT LIKE 'extract %' ORDER BY step_id;

-- name: ev_recon
SELECT check_code, check_name, check_type,
       CASE WHEN abs(source_value) >= 1000 THEN to_char(source_value, 'FM999,999,999,990') ELSE source_value::text END AS source_value,
       CASE WHEN abs(target_value) >= 1000 THEN to_char(target_value, 'FM999,999,999,990') ELSE target_value::text END AS target_value,
       status, explanation
FROM audit.recon_result WHERE batch_id = 1 ORDER BY recon_id;

-- name: ev_dq_summary
SELECT r.rule_code, r.rule_name, r.dq_dimension, r.action, count(l.issue_id) AS rows_affected, r.owner_role
FROM audit.dq_rule r LEFT JOIN audit.dq_issue_log l ON l.rule_code = r.rule_code AND l.batch_id = 1
GROUP BY r.rule_code, r.rule_name, r.dq_dimension, r.action, r.owner_role ORDER BY r.rule_code;

-- name: ev_dq_examples
SELECT DISTINCT ON (rule_code) rule_code, source_object, source_key, column_name, left(coalesce(raw_value, ''), 40) AS raw_value,
       left(action_taken, 70) AS action_taken
FROM audit.dq_issue_log WHERE batch_id = 1 ORDER BY rule_code, issue_id;

-- name: ev_sample_fact_sales
SELECT f.invoice_no, f.line_no, d.full_date AS invoice_date, p.product_code, left(c.customer_name, 28) AS customer, c.channel,
       fa.farm_code, f.currency_code AS ccy, f.quantity_kg, f.net_revenue_nad, f.cogs_nad, f.gross_margin_nad
FROM dw.fact_sales f
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
JOIN dw.dim_product p ON p.product_key = f.product_key
JOIN dw.dim_customer c ON c.customer_key = f.customer_key
JOIN dw.dim_farm fa ON fa.farm_key = f.farm_key
WHERE f.invoice_no IN ('INV2026-000500', 'INV2025-020001') OR (f.currency_code = 'EUR' AND d.full_date = DATE '2025-12-01')
ORDER BY f.invoice_no, f.line_no LIMIT 8;

-- name: ev_scd2_farm
SELECT farm_key, farm_code, farm_name, irrigation_type, cultivated_ha, farm_manager_code AS manager,
       is_globalgap_certified AS globalgap, scd_effective_from, scd_effective_to, scd_is_current, scd_version
FROM dw.dim_farm WHERE farm_code IN ('GB-KAW-01', 'GB-HAR-01', 'GB-OTJ-01', 'GB-ERO-01', 'GB-KAE-02')
ORDER BY farm_code, scd_version;

-- name: ev_scd2_customer
SELECT customer_key, customer_code, left(customer_name, 30) AS customer_name, channel, credit_terms_days, is_key_account,
       is_inferred, scd_effective_from, scd_effective_to, scd_version
FROM dw.dim_customer
WHERE customer_code IN (SELECT customer_code FROM dw.dim_customer GROUP BY 1 HAVING count(*) >= 3 ORDER BY 1 LIMIT 1)
   OR customer_code IN (SELECT customer_code FROM dw.dim_customer WHERE dw_batch_id = 2 AND scd_version = 1 ORDER BY 1 LIMIT 2)
ORDER BY customer_code, scd_version;

-- name: ev_scd2_effect
-- Why SCD2 matters: Nkurenkuru maize yield attributed to the irrigation regime valid at planting
SELECT fa.irrigation_type AS irrigation_at_planting, d.crop_season_label AS harvest_season,
       round(sum(c.planted_ha)) AS planted_ha, round(sum(c.harvested_kg) / 1000) AS harvest_t,
       round(sum(c.harvested_kg) / 1000 / nullif(sum(c.planted_ha), 0), 2) AS yield_t_per_planted_ha
FROM dw.fact_crop_cycle c
JOIN dw.dim_farm fa ON fa.farm_key = c.farm_key
JOIN dw.dim_crop cr ON cr.crop_key = c.crop_key
JOIN dw.dim_date d ON d.date_key = c.harvest_season_end_date_key
WHERE fa.farm_code = 'GB-KAW-01' AND cr.crop_code = 'MZW' AND c.cycle_status IN ('Completed', 'Failed')
GROUP BY 1, 2 ORDER BY 2;

-- name: ev_rls_expected
-- Expected values for the RLS "View as" test (FY2026 net revenue by management zone of the farm of origin)
SELECT r.zone_code, r.zone_name, count(DISTINCT fa.farm_code) AS farms,
       round(sum(f.net_revenue_nad), 0) AS net_revenue_fy2026_nad
FROM dw.fact_sales f
JOIN dw.dim_farm fa ON fa.farm_key = f.farm_key
JOIN dw.dim_region r ON r.region_key = fa.region_key
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
WHERE d.fiscal_year = 2026
GROUP BY ROLLUP ((r.zone_code, r.zone_name)) ORDER BY r.zone_code NULLS LAST;

-- name: ev_kpi_headline
SELECT d.fiscal_year_label,
       round(sum(f.net_revenue_nad) / 1e6, 1) AS net_revenue_nad_m,
       round(100 * sum(f.net_revenue_nad - f.cogs_nad) / sum(f.net_revenue_nad), 1) AS gross_margin_pct,
       round(100 * sum(f.net_revenue_nad) FILTER (WHERE cu.channel = 'Export') / sum(f.net_revenue_nad), 1) AS export_share_pct,
       round(sum(f.quantity_kg) FILTER (WHERE f.doc_type = 'INV') / 1e6, 1) AS volume_kt,
       round(100 * -sum(f.net_revenue_nad) FILTER (WHERE f.doc_type = 'CRN') / sum(f.net_revenue_nad) FILTER (WHERE f.doc_type = 'INV'), 2) AS credit_note_pct,
       count(DISTINCT cu.customer_code) AS active_customers
FROM dw.fact_sales f
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
JOIN dw.dim_customer cu ON cu.customer_key = f.customer_key
GROUP BY d.fiscal_year_label ORDER BY d.fiscal_year_label;

-- name: ev_yield_by_crop
SELECT cr.crop_name, c.is_irrigated, d.crop_season_label AS season,
       round(sum(c.harvested_kg) / 1000 / nullif(sum(c.harvested_ha), 0), 2) AS yield_t_ha,
       round(sum(c.planned_production_kg) / 1000 / nullif(sum(c.planted_ha), 0), 2) AS plan_t_ha,
       round(sum(c.direct_cost_nad) / nullif(sum(c.harvested_kg), 0), 2) AS direct_cost_nad_per_kg
FROM dw.fact_crop_cycle c
JOIN dw.dim_farm fa ON fa.farm_key = c.farm_key
JOIN dw.dim_crop cr ON cr.crop_key = c.crop_key
JOIN dw.dim_date d ON d.date_key = c.harvest_season_end_date_key
WHERE c.cycle_status = 'Completed' AND cr.crop_code IN ('MZW', 'WHT', 'TOM', 'GRP') AND d.crop_season_label IN ('2022/23', '2023/24', '2024/25')
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
