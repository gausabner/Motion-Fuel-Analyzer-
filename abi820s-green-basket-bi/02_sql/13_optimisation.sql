-- =============================================================================
-- 13_optimisation.sql
-- Physical optimisation, applied AFTER the bulk load (loading into un-indexed
-- tables then indexing is faster than maintaining indexes row by row).
-- Evidence: 03_analytics/performance_benchmark.py measures every query with
-- and without these objects (06_report/evidence/perf_*.md).
-- =============================================================================

-- 1. B-tree indexes on fact foreign keys used for joins / slicer filters
CREATE INDEX IF NOT EXISTS ix_fact_sales_customer  ON dw.fact_sales (customer_key);
CREATE INDEX IF NOT EXISTS ix_fact_sales_product   ON dw.fact_sales (product_key);
CREATE INDEX IF NOT EXISTS ix_fact_sales_farm      ON dw.fact_sales (farm_key);
-- 2. BRIN on the date key: rows are loaded in date order, so a block-range index is tiny and
--    serves date-range filters (incl. Power BI incremental-refresh partitions) almost as well as a B-tree
CREATE INDEX IF NOT EXISTS brin_fact_sales_invoice_date ON dw.fact_sales USING brin (invoice_date_key) WITH (pages_per_range = 16);
-- 3. covering index for customer drill-through (index-only scans)
CREATE INDEX IF NOT EXISTS ix_fact_sales_customer_date ON dw.fact_sales (customer_key, invoice_date_key) INCLUDE (net_revenue_nad, quantity_kg);
CREATE INDEX IF NOT EXISTS ix_fact_harvest_date        ON dw.fact_harvest (harvest_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_harvest_farm_crop   ON dw.fact_harvest (farm_key, crop_key);
CREATE INDEX IF NOT EXISTS ix_fact_cost_date           ON dw.fact_production_cost (posting_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_cost_farm_crop      ON dw.fact_production_cost (farm_key, crop_key);
CREATE INDEX IF NOT EXISTS ix_fact_cycle_farm_crop     ON dw.fact_crop_cycle (farm_key, crop_key);
-- 4. SCD2 range lookups used by every fact load
CREATE INDEX IF NOT EXISTS ix_dim_customer_code_range ON dw.dim_customer (customer_code, scd_effective_from, scd_effective_to);
CREATE INDEX IF NOT EXISTS ix_dim_farm_code_range     ON dw.dim_farm (farm_code, scd_effective_from, scd_effective_to);
-- 5. aggregation table (month x product x farm x channel) for month-grain visuals and a DirectQuery fallback
DROP MATERIALIZED VIEW IF EXISTS mart.agg_sales_monthly;
CREATE MATERIALIZED VIEW mart.agg_sales_monthly AS
SELECT d.month_end_date, to_char(d.month_end_date, 'YYYYMMDD')::int AS month_date_key,
       f.product_key, f.farm_key, c.channel,
       sum(f.net_revenue_nad) AS net_revenue_nad, sum(f.cogs_nad) AS cogs_nad, sum(f.quantity_kg) AS quantity_kg,
       count(*) AS invoice_lines
FROM dw.fact_sales f
JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
JOIN dw.dim_customer c ON c.customer_key = f.customer_key
GROUP BY 1, 2, 3, 4, 5;
CREATE INDEX IF NOT EXISTS ix_agg_sales_monthly_date ON mart.agg_sales_monthly (month_date_key);
GRANT SELECT ON mart.agg_sales_monthly TO gb_pbi_reader;
ANALYZE dw.fact_sales; ANALYZE dw.fact_harvest; ANALYZE dw.fact_production_cost; ANALYZE dw.fact_crop_cycle;
ANALYZE dw.dim_customer; ANALYZE dw.dim_farm; ANALYZE mart.agg_sales_monthly;
