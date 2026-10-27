-- =============================================================================
-- 01_ddl_schemas_audit.sql
-- Schemas, ETL audit tables and the data-quality rule catalogue.
-- Layering:  stg (raw landing, text)  ->  ref (steward-maintained mappings)
--            ->  dw (Kimball star/snowflake)  ->  mart (Power BI views)
--            audit (lineage, DQ log, reconciliation), etl (functions/procedures),
--            sec (row-level-security mapping)
-- Re-runnable: drops and recreates every project schema (full rebuild).
-- =============================================================================
DROP SCHEMA IF EXISTS mart  CASCADE;
DROP SCHEMA IF EXISTS dw    CASCADE;
DROP SCHEMA IF EXISTS etl   CASCADE;
DROP SCHEMA IF EXISTS stg   CASCADE;
DROP SCHEMA IF EXISTS ref   CASCADE;
DROP SCHEMA IF EXISTS sec   CASCADE;
DROP SCHEMA IF EXISTS audit CASCADE;

CREATE SCHEMA audit; COMMENT ON SCHEMA audit IS 'ETL batches, step log, data-quality issue log and reconciliation results (lineage evidence).';
CREATE SCHEMA stg;   COMMENT ON SCHEMA stg   IS 'Landing (raw text, one table per source layout) and cleansed staging tables.';
CREATE SCHEMA ref;   COMMENT ON SCHEMA ref   IS 'Reference/mapping tables maintained by data stewards (aliases, unit conversions, FX).';
CREATE SCHEMA dw;    COMMENT ON SCHEMA dw    IS 'Dimensional warehouse: conformed dimensions and fact tables (system of record for BI).';
CREATE SCHEMA etl;   COMMENT ON SCHEMA etl   IS 'ETL helper functions and load procedures.';
CREATE SCHEMA mart;  COMMENT ON SCHEMA mart  IS 'Presentation views consumed by the Power BI semantic model (only needed columns).';
CREATE SCHEMA sec;   COMMENT ON SCHEMA sec   IS 'Security metadata: user-to-zone mapping for dynamic row-level security.';

-- -----------------------------------------------------------------------------
CREATE TABLE audit.etl_batch (
    batch_id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_type    text        NOT NULL CHECK (batch_type IN ('FULL', 'INCREMENTAL')),
    description   text,
    started_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    finished_at   timestamptz,
    status        text        NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    run_by        text        NOT NULL DEFAULT current_user
);
COMMENT ON TABLE audit.etl_batch IS 'One row per pipeline execution (full rebuild or incremental delta).';

CREATE TABLE audit.etl_step_log (
    step_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id      integer NOT NULL REFERENCES audit.etl_batch (batch_id),
    step_name     text    NOT NULL,
    target_table  text,
    rows_in       bigint,
    rows_out      bigint,
    rows_rejected bigint,
    started_at    timestamptz NOT NULL,
    finished_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
    duration_ms   numeric(12, 1) GENERATED ALWAYS AS (extract(epoch FROM (finished_at - started_at)) * 1000) STORED,
    message       text
);
COMMENT ON TABLE audit.etl_step_log IS 'Row counts and timings for every extract/transform/load step (operational lineage).';

CREATE TABLE audit.dq_rule (
    rule_code     text PRIMARY KEY,
    rule_name     text NOT NULL,
    dq_dimension  text NOT NULL CHECK (dq_dimension IN ('Completeness', 'Validity', 'Uniqueness', 'Consistency', 'Accuracy', 'Timeliness', 'Integrity')),
    source_object text NOT NULL,
    action        text NOT NULL CHECK (action IN ('REJECT', 'CORRECT', 'FLAG', 'MAP', 'IMPUTE', 'MERGE', 'INFER')),
    owner_role    text NOT NULL,
    description   text NOT NULL
);
COMMENT ON TABLE audit.dq_rule IS 'Catalogue of data-quality rules (rule code, DQ dimension, action and accountable steward role).';

CREATE TABLE audit.dq_issue_log (
    issue_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id      integer NOT NULL REFERENCES audit.etl_batch (batch_id),
    rule_code     text    NOT NULL REFERENCES audit.dq_rule (rule_code),
    source_object text    NOT NULL,
    source_key    text,
    column_name   text,
    raw_value     text,
    action_taken  text    NOT NULL,
    logged_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ix_dq_issue_log_rule ON audit.dq_issue_log (batch_id, rule_code);
COMMENT ON TABLE audit.dq_issue_log IS 'Row-level record of every data-quality rule hit and the action taken.';

CREATE TABLE audit.recon_result (
    recon_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id      integer NOT NULL REFERENCES audit.etl_batch (batch_id),
    check_code    text    NOT NULL,
    check_name    text    NOT NULL,
    check_type    text    NOT NULL CHECK (check_type IN ('ROW_COUNT', 'CONTROL_TOTAL', 'REFERENTIAL', 'CROSS_SOURCE', 'INTEGRITY', 'COMPLETENESS', 'PLAUSIBILITY')),
    source_value  numeric,
    target_value  numeric,
    difference    numeric GENERATED ALWAYS AS (coalesce(target_value, 0) - coalesce(source_value, 0)) STORED,
    tolerance     numeric NOT NULL DEFAULT 0,
    status        text    NOT NULL CHECK (status IN ('PASS', 'WARN', 'FAIL')),
    explanation   text,
    checked_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE audit.recon_result IS 'Reconciliation evidence: row counts, control totals, referential and cross-source checks per batch.';

-- -----------------------------------------------------------------------------
-- Data-quality rule catalogue
-- -----------------------------------------------------------------------------
INSERT INTO audit.dq_rule VALUES
 ('MD01','Region name variant','Consistency','master data (farms, customers)','MAP','Master Data Steward','Region text mapped to ISO 3166-2:NA code through ref.region_alias.'),
 ('MD02','Customer region missing','Completeness','master data (customers)','FLAG','Master Data Steward','Domestic customer without region: loaded with Unknown region.'),
 ('MD03','Product net weight missing','Completeness','master data (products)','IMPUTE','Master Data Steward','Net weight derived from the pack-type text (e.g. "400kg bin" -> 400).'),
 ('MD04','Duplicate customer account','Uniqueness','master data (customers)','MERGE','Master Data Steward','Steward-approved duplicate codes merged into the survivor via ref.customer_xref.'),
 ('MD05','Customer name formatting','Consistency','master data (customers)','CORRECT','Master Data Steward','Leading/trailing blanks removed; ALL-CAPS names converted to title case with legal suffixes preserved.'),
 ('HV01','Harvest date unparseable','Validity','farm harvest logs','REJECT','Farm Data Steward','Date does not parse with the template date format (e.g. 31/02/2023).'),
 ('HV02','Harvest quantity missing','Completeness','farm harvest logs','REJECT','Farm Data Steward','Quantity cell blank.'),
 ('HV03','Harvest quantity not positive','Validity','farm harvest logs','REJECT','Farm Data Steward','Zero or negative harvest quantity.'),
 ('HV04','Unknown farm or crop code','Integrity','farm harvest logs','REJECT','Farm Data Steward','Farm/crop text could not be mapped to master data.'),
 ('HV05','Duplicate harvest record','Uniqueness','farm harvest logs','REJECT','Farm Data Steward','Exact duplicate of an earlier row in the same log (re-submission).'),
 ('HV06','Harvest quantity unit/decimal error','Accuracy','farm harvest logs','CORRECT','Farm Data Steward','Record > 5x the median of its 4 neighbouring records in the same block, or block yield > 2.5x the median of its sister blocks (leave-one-out; a single sister needs the plan to agree): divided by 10/1000 only when that restores it to within 3x of the reference; otherwise flagged.'),
 ('HV07','Harvest record without planting block','Integrity','farm harvest logs','FLAG','Farm Data Steward','No planting-register block for farm+crop+block on or before the harvest date.'),
 ('HV08','Farm code formatting','Consistency','farm harvest logs','CORRECT','Farm Data Steward','Farm code trimmed, upper-cased and underscores replaced by hyphens.'),
 ('PL01','Planting date alternative format','Consistency','planting register','CORRECT','Agronomist','Date captured as DD/MM/YYYY instead of ISO; parsed with fallback format.'),
 ('PL02','Planted area missing','Completeness','planting register','IMPUTE','Agronomist','Missing block area imputed as the mean block area of the same crop cycle.'),
 ('PL03','Status inconsistent with harvest log','Consistency','planting register','FLAG','Agronomist','Register status contradicts the harvest log (e.g. Growing with harvests).'),
 ('SA01','Duplicate invoice line','Uniqueness','ERP sales extracts','REJECT','Sales Data Steward','Same invoice_no + line_no seen more than once (overlapping extracts).'),
 ('SA02','Product code variant','Consistency','ERP sales extracts','CORRECT','Sales Data Steward','Product code matched after removing punctuation/case differences.'),
 ('SA03','Customer code merged','Uniqueness','ERP sales extracts','MERGE','Sales Data Steward','Duplicate customer code replaced by the survivor code.'),
 ('SA04','Unknown customer (late-arriving)','Timeliness','ERP sales extracts','INFER','Sales Data Steward','Customer code absent from master data: inferred dimension member created.'),
 ('SA05','Farm of origin missing','Completeness','ERP sales extracts','FLAG','Sales Data Steward','Line loaded against the Unknown farm member (-1).'),
 ('SA06','Currency missing','Completeness','ERP sales extracts','CORRECT','Sales Data Steward','Currency defaulted from the customer master.'),
 ('SA07','Unit price anomaly','Accuracy','ERP sales extracts','FLAG','Sales Data Steward','N$/kg price > 4x or < 0.25x the product-month median: flagged for review, not changed.'),
 ('SA08','Quantity sign inconsistent with document type','Validity','ERP sales extracts','REJECT','Sales Data Steward','Invoice with quantity <= 0 or credit note with quantity >= 0.'),
 ('CL01','Duplicate ledger posting','Uniqueness','cost ledger','REJECT','Finance Data Steward','posting_id repeated.'),
 ('CL02','Cost category alias','Consistency','cost ledger','MAP','Finance Data Steward','Free-text category mapped to the standard cost category.'),
 ('CL03','Crop missing on crop-specific cost','Completeness','cost ledger','FLAG','Finance Data Steward','Crop-specific posting without crop: loaded against Unknown crop (-1).'),
 ('CL04','Amount text formatting','Validity','cost ledger','CORRECT','Finance Data Steward','Currency symbol / thousands separators removed from amount.'),
 ('ST01','Closing stock sign error','Accuracy','stock system','CORRECT','Inventory Controller','Negative closing stock whose absolute value satisfies the stock-flow identity: sign corrected.'),
 ('ST02','Stock-flow identity broken','Consistency','stock system','FLAG','Inventory Controller','opening + received - dispatched - shrinkage <> closing (tolerance 1 kg).'),
 ('ST03','Missing monthly stock snapshot','Completeness','stock system','IMPUTE','Inventory Controller','Gap in the monthly snapshot series: row imputed from adjacent snapshots and ERP dispatches.'),
 ('WE01','Weather fill value (temperature)','Completeness','NASA POWER weather','IMPUTE','External Data Steward','-999 replaced by linear interpolation of neighbouring days (or carry-forward at series end).'),
 ('WE02','Weather fill value (rainfall)','Completeness','NASA POWER weather','IMPUTE','External Data Steward','-999 rainfall set to 0 in the dry season (May-Sep); otherwise left NULL and flagged.'),
 ('MP01','Commodity price missing','Completeness','World Bank Pink Sheet','IMPUTE','External Data Steward','Missing monthly price linearly interpolated between adjacent months.'),
 ('FX01','FX observation blank','Completeness','FRED exchange rates','FLAG','External Data Steward','Blank/holiday observation excluded from the monthly average.'),
 ('CE01','Crop outside Green Basket scope','Integrity','NSA crop estimates','REJECT','External Data Steward','Crop not in the crop dimension (e.g. sorghum): excluded from the benchmark fact.'),
 ('CE02','Yield not published','Completeness','NSA crop estimates','IMPUTE','External Data Steward','Yield derived as production / area when area > 0.');
