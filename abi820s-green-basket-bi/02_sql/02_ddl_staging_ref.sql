-- =============================================================================
-- 02_ddl_staging_ref.sql
-- Landing (raw) tables: every column is TEXT so that nothing is lost or coerced
-- on extract; typing and cleansing happen in SQL (ELT pattern) where each rule
-- is logged. Cleansed staging tables carry dq_status/dq_note per row.
-- =============================================================================

-- ---------------------------------------------------------------- RAW LANDING
CREATE TABLE stg.harvest_log_raw (
    source_file text NOT NULL, template_code char(1) NOT NULL CHECK (template_code IN ('A', 'B', 'C')), row_num integer NOT NULL,
    farm_txt text, date_txt text, crop_txt text, block_txt text, qty_txt text, unit_txt text, recorder_txt text, remarks_txt text,
    batch_id integer, PRIMARY KEY (source_file, row_num));
COMMENT ON TABLE stg.harvest_log_raw IS 'S1 farm harvest logs (14 files, templates A/B/C) harmonised to common text columns.';

CREATE TABLE stg.planting_register_raw (
    source_file text NOT NULL, row_num integer NOT NULL, cycle_id text, farm_code text, crop_code text, block_id text,
    planting_date text, planted_ha text, variety text, irrigation_method text, planned_yield_t_ha text, harvested_ha text, status text,
    last_updated text,
    batch_id integer, PRIMARY KEY (source_file, row_num));

CREATE TABLE stg.sales_raw (
    source_file text NOT NULL, row_num integer NOT NULL, invoice_no text, line_no text, doc_type text, invoice_date text,
    dispatch_date text, customer_code text, product_code text, farm_code text, quantity text, uom text, unit_price text,
    currency_code text, discount_pct text, unit_std_cost_nad text, freight_nad text, sales_rep_code text, ref_invoice_no text,
    batch_id integer, PRIMARY KEY (source_file, row_num));
COMMENT ON TABLE stg.sales_raw IS 'S3 ERP invoice-line extracts (one file per fiscal year, overlapping windows).';

CREATE TABLE stg.stock_raw (
    source_file text NOT NULL, row_num integer NOT NULL, farm_code text, product_code text, period text, opening_kg text,
    received_kg text, dispatched_kg text, shrinkage_kg text, closing_kg text, closing_value_nad text, count_date text,
    batch_id integer, PRIMARY KEY (source_file, row_num));

CREATE TABLE stg.cost_ledger_raw (
    source_file text NOT NULL, row_num integer NOT NULL, posting_id text, posting_date text, farm_code text, cost_centre text,
    crop_code text, cost_category text, gl_account text, description text, amount_nad text, input_qty text, input_uom text,
    supplier_code text, batch_id integer, PRIMARY KEY (source_file, row_num));

-- master data workbook: one raw table per sheet (extract_name distinguishes main vs delta file)
CREATE TABLE stg.md_regions_raw (extract_name text, row_num integer, region_code text, region_name text, zone_code text, zone_name text, capital_town text, known_aliases text, batch_id integer);
CREATE TABLE stg.md_crop_categories_raw (extract_name text, row_num integer, category_code text, category_name text, sector text, batch_id integer);
CREATE TABLE stg.md_crops_raw (extract_name text, row_num integer, crop_code text, crop_name text, category_code text, scientific_name text, nab_controlled text, storage_type text, shelf_life_days text, typical_cull_pct text, batch_id integer);
CREATE TABLE stg.md_products_raw (extract_name text, row_num integer, product_code text, product_name text, crop_code text, grade text, pack_type text, sales_uom text, net_weight_kg text, is_export_grade text, active text, batch_id integer);
CREATE TABLE stg.md_farms_raw (extract_name text, row_num integer, farm_code text, farm_name text, region text, town text, latitude text, longitude text, elevation_m text, total_ha text, cultivated_ha text, irrigation_type text, water_source text, farm_manager_code text, globalgap_certified text, established_year text, harvest_log_template text, batch_id integer);
CREATE TABLE stg.md_customers_raw (extract_name text, row_num integer, customer_code text, customer_name text, customer_type text, channel text, town text, region text, country_code text, currency_code text, credit_terms_days text, key_account text, onboarding_date text, status text, batch_id integer);
CREATE TABLE stg.md_history_raw (extract_name text, entity text CHECK (entity IN ('FARM', 'CUSTOMER')), row_num integer, change_id text, entity_code text, attribute text, old_value text, new_value text, effective_date text, approved_by_role text, batch_id integer);
CREATE TABLE stg.md_customer_merge_raw (extract_name text, row_num integer, duplicate_code text, survivor_code text, merge_date text, reason text, batch_id integer);
CREATE TABLE stg.md_cost_categories_raw (extract_name text, row_num integer, cost_category_code text, cost_category_name text, cost_group text, cost_behaviour text, gl_account text, quantity_uom text, ledger_aliases text, batch_id integer);

CREATE TABLE stg.weather_json_raw (source_file text PRIMARY KEY, farm_code text NOT NULL, payload jsonb NOT NULL, batch_id integer);
COMMENT ON TABLE stg.weather_json_raw IS 'S6 NASA POWER daily point JSON, one document per farm location (expanded in SQL with jsonb_each).';
CREATE TABLE stg.pink_sheet_raw (source_file text, period_txt text, series_header text, unit_txt text, value_txt text, batch_id integer);
CREATE TABLE stg.fred_raw (source_file text, series_id text, observation_date text, value_txt text, batch_id integer);
CREATE TABLE stg.crop_estimate_raw (source_file text, row_num integer, season text, region text, crop text, sector text, area_planted_ha text, production_tonnes text, yield_t_per_ha text, source_table text, release_date text, batch_id integer);

-- ---------------------------------------------------------------- REFERENCE / MAPPING
CREATE TABLE ref.region_alias (alias_norm text PRIMARY KEY, region_code char(5) NOT NULL, source text NOT NULL);
COMMENT ON TABLE ref.region_alias IS 'Normalised region spellings (upper, alphanumeric) -> ISO 3166-2:NA code.';
CREATE TABLE ref.crop_alias (alias_norm text PRIMARY KEY, crop_code char(3), source text NOT NULL);
COMMENT ON TABLE ref.crop_alias IS 'Crop names/codes seen in farm logs and NSA tables -> crop code (NULL = known out-of-scope crop).';
CREATE TABLE ref.cost_category_alias (alias_norm text PRIMARY KEY, cost_category_code char(4) NOT NULL);
CREATE TABLE ref.uom_conversion (uom_norm text PRIMARY KEY, kg_factor numeric(12, 4) NOT NULL, note text);
CREATE TABLE ref.customer_xref (duplicate_code text PRIMARY KEY, survivor_code text NOT NULL, merge_date date, reason text);
CREATE TABLE ref.commodity_series (series_header_norm text PRIMARY KEY, commodity_code text NOT NULL);
CREATE TABLE ref.country (country_code char(2) PRIMARY KEY, country_name text NOT NULL, region_group text NOT NULL);
CREATE TABLE ref.fx_rate_monthly (
    currency_code char(3), month_start date, nad_per_unit numeric(12, 6) NOT NULL, observations integer, source text,
    PRIMARY KEY (currency_code, month_start));
COMMENT ON TABLE ref.fx_rate_monthly IS 'Monthly average N$ per currency unit from FRED daily series (NAD = ZAR 1:1 under the Common Monetary Area).';

INSERT INTO ref.uom_conversion VALUES
 ('KG', 1, 'kilogram'), ('T', 1000, 'metric tonne'), ('TON', 1000, 'metric tonne (free text)'),
 ('CRATES10KG', 10, '10 kg harvest crate'), ('BINS400KG', 400, '400 kg field bin');
INSERT INTO ref.country VALUES
 ('NA', 'Namibia', 'Domestic'), ('ZA', 'South Africa', 'SACU'), ('BW', 'Botswana', 'SACU'), ('AO', 'Angola', 'SADC (non-SACU)'),
 ('GB', 'United Kingdom', 'Europe'), ('NL', 'Netherlands', 'Europe'), ('DE', 'Germany', 'Europe'), ('AE', 'United Arab Emirates', 'Middle East');
INSERT INTO ref.commodity_series VALUES
 ('MAIZE', 'MAIZE'), ('WHEATUSHRW', 'WHEAT_US_HRW'), ('SORGHUM', 'SORGHUM'), ('UREA', 'UREA'), ('DAP', 'DAP'), ('CRUDEOILBRENT', 'CRUDE_BRENT');

-- ---------------------------------------------------------------- CLEANSED STAGING
CREATE TABLE stg.harvest_clean (
    source_file text, row_num integer, template_code char(1), farm_code text, harvest_date date, crop_code char(3),
    block_id text, recorder_code text, qty_raw numeric, unit_norm text, kg_factor numeric, harvested_kg numeric(14, 1),
    cycle_id text, dq_status text NOT NULL DEFAULT 'OK' CHECK (dq_status IN ('OK', 'CORRECTED', 'REJECTED', 'DUPLICATE')),
    dq_note text, PRIMARY KEY (source_file, row_num));

CREATE TABLE stg.planting_clean (
    cycle_id text, block_id text, farm_code text, crop_code char(3), planting_date date, planted_ha numeric(10, 2),
    variety text, irrigation_method text, is_irrigated boolean, planned_yield_t_ha numeric(8, 2), harvested_ha numeric(10, 2),
    register_status text,
    dq_status text NOT NULL DEFAULT 'OK', dq_note text, PRIMARY KEY (cycle_id, block_id));

CREATE TABLE stg.sales_clean (
    source_file text, row_num integer, invoice_no text, line_no smallint, doc_type char(3), invoice_date date, dispatch_date date,
    customer_code_raw text, customer_code text, product_code_raw text, product_code text, farm_code text, quantity numeric(14, 3),
    uom text, unit_price numeric(14, 4), currency_code char(3), discount_pct numeric(6, 2), unit_std_cost_nad numeric(14, 4),
    freight_nad numeric(14, 2), sales_rep_code text, ref_invoice_no text,
    kg_per_uom numeric(12, 4), quantity_kg numeric(14, 3), fx_rate_nad numeric(12, 6),
    gross_revenue_nad numeric(16, 2), discount_nad numeric(16, 2), net_revenue_nad numeric(16, 2), cogs_nad numeric(16, 2),
    price_per_kg_nad numeric(14, 4), is_price_anomaly boolean NOT NULL DEFAULT false,
    dq_status text NOT NULL DEFAULT 'OK', dq_note text, PRIMARY KEY (source_file, row_num));

CREATE TABLE stg.stock_clean (
    farm_code text, product_code text, snapshot_date date, opening_kg numeric(14, 1), received_kg numeric(14, 1),
    dispatched_kg numeric(14, 1), shrinkage_kg numeric(14, 1), closing_kg numeric(14, 1), closing_value_nad numeric(16, 2),
    is_imputed boolean NOT NULL DEFAULT false, dq_status text NOT NULL DEFAULT 'OK', dq_note text,
    PRIMARY KEY (farm_code, product_code, snapshot_date));

CREATE TABLE stg.cost_clean (
    source_file text, row_num integer, posting_id text, posting_date date, farm_code text, cost_centre text, crop_code text,
    cost_category_code char(4), gl_account text, amount_nad numeric(16, 2), input_qty numeric(14, 2), input_uom text,
    supplier_code text, is_reversal boolean, dq_status text NOT NULL DEFAULT 'OK', dq_note text,
    PRIMARY KEY (source_file, row_num));

CREATE TABLE stg.weather_clean (
    farm_code text, obs_date date, rainfall_mm numeric(7, 2), t_max_c numeric(5, 2), t_min_c numeric(5, 2),
    rh_pct numeric(5, 2), solar_mj_m2 numeric(6, 2), rainfall_imputed boolean NOT NULL DEFAULT false,
    temp_imputed boolean NOT NULL DEFAULT false, rainfall_missing boolean NOT NULL DEFAULT false,
    PRIMARY KEY (farm_code, obs_date));

CREATE TABLE stg.market_price_clean (
    commodity_code text, month_start date, price_usd numeric(12, 2), is_imputed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (commodity_code, month_start));

CREATE TABLE stg.crop_estimate_clean (
    season_start_year smallint, region_code char(5), crop_code char(3), farming_sector text, area_planted_ha numeric(12, 1),
    production_t numeric(14, 1), yield_t_ha numeric(8, 3), yield_derived boolean, release_date date, source_table text,
    dq_status text NOT NULL DEFAULT 'OK', dq_note text);

-- master data (cleansed)
CREATE TABLE stg.md_farm_clean (
    farm_code text PRIMARY KEY, farm_name text, region_code char(5), town text, latitude numeric(9, 5), longitude numeric(9, 5),
    elevation_m integer, total_ha numeric(10, 1), cultivated_ha numeric(10, 1), irrigation_type text, water_source text,
    farm_manager_code text, globalgap_certified text, established_year smallint, harvest_log_template char(1));
CREATE TABLE stg.md_customer_clean (
    customer_code text PRIMARY KEY, customer_name text, customer_type text, channel text, town text, region_code char(5),
    country_code char(2), currency_code char(3), credit_terms_days smallint, key_account text, onboarding_date date, status text,
    extract_name text);
CREATE TABLE stg.md_history_clean (
    entity text, entity_code text, attribute text, old_value text, new_value text, effective_date date, extract_name text);

-- ---------------------------------------------------------------- STEWARD SEED DATA
-- Crop aliases observed during profiling of the farm logs and NSA tables
-- (codes and official names are added automatically from the Crops sheet).
INSERT INTO ref.crop_alias (alias_norm, crop_code, source) VALUES
 ('MAIZE', 'MZW', 'profiling'), ('WHITEMAIZE', 'MZW', 'profiling'), ('MAIZEWHITE', 'MZW', 'profiling'),
 ('WMAIZE', 'MZW', 'profiling'), ('MZ', 'MZW', 'profiling'), ('WH', 'WHT', 'profiling'),
 ('MAHANGU', 'MAH', 'profiling'), ('PEARLMILLET', 'MAH', 'profiling'), ('MAHANGUPEARLMILLET', 'MAH', 'profiling'),
 ('TOMATO', 'TOM', 'profiling'), ('ONION', 'ONI', 'profiling'), ('ON', 'ONI', 'profiling'),
 ('POTATO', 'POT', 'profiling'), ('CABBAGES', 'CAB', 'profiling'), ('BUTTERNUTS', 'BUT', 'profiling'),
 ('BUTTERNUTSQUASH', 'BUT', 'profiling'), ('BN', 'BUT', 'profiling'), ('WATERMELONS', 'WML', 'profiling'),
 ('GRAPES', 'GRP', 'profiling'),
 ('SORGHUM', NULL, 'profiling: known crop outside Green Basket scope');
