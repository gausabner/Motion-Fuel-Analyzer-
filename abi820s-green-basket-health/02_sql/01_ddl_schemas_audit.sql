-- =============================================================================
-- 01_ddl_schemas_audit.sql
-- Schemas, ETL audit tables and the data-quality rule catalogue.
-- Layering:  stg (raw landing, text)  ->  ref (steward-maintained mappings)
--            ->  dw (Kimball star with snowflaked hierarchies)  ->  mart (Power BI views)
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
CREATE SCHEMA ref;   COMMENT ON SCHEMA ref   IS 'Reference/mapping tables maintained by data stewards (code mappings and aliases).';
CREATE SCHEMA dw;    COMMENT ON SCHEMA dw    IS 'Dimensional warehouse: conformed dimensions and fact tables (system of record for BI).';
CREATE SCHEMA etl;   COMMENT ON SCHEMA etl   IS 'ETL helper functions and load procedures.';
CREATE SCHEMA mart;  COMMENT ON SCHEMA mart  IS 'Presentation views consumed by the Power BI semantic model (only needed columns, no identifiers).';
CREATE SCHEMA sec;   COMMENT ON SCHEMA sec   IS 'Security metadata: user-to-facility mapping for dynamic row-level security.';

-- -----------------------------------------------------------------------------
CREATE TABLE audit.etl_batch (
    batch_id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_type    text        NOT NULL CHECK (batch_type IN ('FULL', 'INCREMENTAL')),
    description   text,
    extract_cutoff timestamp,
    started_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    finished_at   timestamptz,
    status        text        NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    run_by        text        NOT NULL DEFAULT current_user
);
COMMENT ON TABLE audit.etl_batch IS 'One row per pipeline execution (full rebuild or incremental delta) with its extract cut-off.';

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
    action        text NOT NULL CHECK (action IN ('REJECT', 'CORRECT', 'FLAG', 'MAP', 'IMPUTE', 'KEEP LATEST', 'INFER')),
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
COMMENT ON TABLE audit.dq_issue_log IS 'Row-level record of every data-quality rule hit and the action taken (no clinical free text is ever logged).';

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
-- Data-quality rule catalogue (owner roles are defined in the governance section, report 3.8)
-- -----------------------------------------------------------------------------
INSERT INTO audit.dq_rule VALUES
 ('MD01','Region name variant','Consistency','master data (facilities, patient index)','MAP','Master Data Steward','Region text mapped to the ISO 3166-2:NA code through ref.region_alias (e.g. "Kavango-East" -> NA-KE).'),
 ('MD02','Sex code variant','Consistency','patient index','MAP','Health Information Manager','Sex value mapped to F/M/U through ref.code_map (e.g. "Female" -> F); unmapped values -> U.'),
 ('MD03','Birth year implausible','Validity','patient index','CORRECT','Health Information Manager','Birth year not a whole number between 1900 and the registration year: set to NULL (age band Unknown).'),
 ('MD04','Superseded patient-index record','Uniqueness','patient index','KEEP LATEST','Health Information Manager','Same pseudonym exported twice: the row with the latest last_updated is kept, the older one rejected.'),
 ('MD05','Payer code variant','Consistency','patient index','MAP','Revenue Cycle Steward','Payer text mapped to the standard payer code through ref.payer_alias (e.g. "Psemas" -> PSEMAS).'),
 ('MD06','Duplicate or untrimmed ICD-10 code','Uniqueness','master data (ICD-10 list)','CORRECT','Clinical Coding Lead','Code trimmed; duplicate code rows collapsed to the first (WHO) title.'),
 ('EN01','Duplicate attendance record','Uniqueness','PAS encounter extracts','REJECT','Health Information Manager','Same encounter_id more than once (overlapping yearly extracts or re-sent rows): first occurrence kept.'),
 ('EN02','Timestamp in day-first format','Consistency','PAS encounter extracts','CORRECT','Health Information Manager','DD/MM/YYYY HH:MI timestamps (Oshakati PAS upgrade, 2023) parsed with the fallback format.'),
 ('EN03','Facility code variant','Consistency','PAS encounter extracts','CORRECT','Health Information Manager','Facility code matched after removing case, blanks and punctuation (e.g. "gbh whk" -> GBH-WHK).'),
 ('EN04','Triage category missing','Completeness','PAS encounter extracts','FLAG','ED Nursing Manager','ED attendance without a triage colour: loaded with triage "Not recorded" and excluded from the within-target KPI.'),
 ('EN05','Doctor-seen time before arrival','Validity','PAS encounter extracts','REJECT','ED Nursing Manager','seen_datetime earlier than arrival: the timestamp (not the attendance) is rejected, waits are NULL.'),
 ('EN06','Implausible length of stay','Accuracy','PAS encounter extracts','REJECT','ED Nursing Manager','Door-to-doctor > 24 h or ED length of stay > 72 h: the duration is set to NULL (attendance kept).'),
 ('EN07','ICD-10 code formatting','Consistency','PAS encounter extracts','CORRECT','Clinical Coding Lead','Lower case, missing dot, trailing blanks or hyphens removed before matching the ICD-10 list.'),
 ('EN08','ICD-10 code invalid or missing','Validity','PAS encounter extracts','FLAG','Clinical Coding Lead','Code not in the ICD-10 list after correction: loaded against diagnosis "Unknown / not coded" (-1).'),
 ('EN09','Code variant (triage, disposition, arrival mode)','Consistency','PAS encounter extracts','MAP','Health Information Manager','Free-text code mapped to the standard code through ref.code_map.'),
 ('EN10','Patient not in patient index (late-arriving)','Timeliness','PAS encounter and spell extracts','INFER','Health Information Manager','Pseudonym absent from the patient index: inferred dimension member created, completed when the index record arrives.'),
 ('EN11','Patient identifier missing','Completeness','PAS encounter extracts','FLAG','Health Information Manager','Unidentified patient (e.g. unconscious trauma): loaded against patient "Unknown" (-1).'),
 ('EN12','Arrival date outside the extract window','Validity','PAS encounter extracts','REJECT','Health Information Manager','Arrival before 2021-12-01 or after the extract cut-off (e.g. year keyed as 2062): attendance rejected.'),
 ('AD01','Superseded spell image (CDC)','Uniqueness','PAS inpatient spells','KEEP LATEST','Health Information Manager','Change-data-capture export holds several images of one spell: the latest last_updated wins.'),
 ('AD02','Discharge before admission','Validity','PAS inpatient spells','CORRECT','Health Information Manager','Discharge year keyed one year early: +1 year when that gives a stay of 0-120 days, otherwise discharge rejected.'),
 ('AD03','Implausible length of stay','Accuracy','PAS inpatient spells','CORRECT','Health Information Manager','Stay > 365 days because the year was keyed 10 years late: -10 years when that gives 0-120 days, otherwise rejected.'),
 ('AD04','Ward code variant','Consistency','PAS inpatient spells','CORRECT','Health Information Manager','Ward code matched after removing case, blanks and punctuation.'),
 ('AD05','Principal diagnosis not coded','Completeness','PAS inpatient spells','FLAG','Clinical Coding Lead','Spell without a principal ICD-10 code: diagnosis "Unknown / not coded" (-1) until coding is completed.'),
 ('AD06','Open spell older than 60 days','Completeness','PAS inpatient spells','FLAG','Nursing Services Manager','Spell still open > 60 days after admission while the ward census does not count the patient: probable missing discharge.'),
 ('AD07','Admission method variant','Consistency','PAS inpatient spells','MAP','Health Information Manager','Admission method text mapped through ref.code_map.'),
 ('WC01','Ward return missing','Completeness','ward midnight census','IMPUTE','Nursing Services Manager','No return for a ward-day: occupied beds imputed from the PAS-derived midnight census.'),
 ('WC02','Occupied beds keyed x10','Accuracy','ward midnight census','CORRECT','Nursing Services Manager','Occupied > 3 x bed complement: divided by 10 when that is within 1.6 x complement and close to PAS, otherwise imputed.'),
 ('WC03','Resubmitted ward return','Uniqueness','ward midnight census','KEEP LATEST','Nursing Services Manager','Two returns for one ward-day: the latest submission is kept.'),
 ('WC04','Occupied beds negative or blank','Validity','ward midnight census','IMPUTE','Nursing Services Manager','Negative or blank occupied beds: value imputed from the PAS-derived census.'),
 ('RS01','Shift code variant','Consistency','e-roster extract','MAP','Workforce Planning Officer','Shift text mapped through ref.code_map (e.g. "Day" -> D).'),
 ('RS02','Negative hours','Validity','e-roster extract','CORRECT','Workforce Planning Officer','Negative hours (sign keyed wrongly): absolute value used.'),
 ('RS03','Duplicate roster row','Uniqueness','e-roster extract','REJECT','Workforce Planning Officer','Same unit + date + shift more than once: last row kept.'),
 ('RS04','Overtime exceeds hours worked','Consistency','e-roster extract','FLAG','Workforce Planning Officer','Overtime hours > nurse hours worked: overtime set to NULL for the shift.'),
 ('SV01','Epi-week format variant','Consistency','IDSR weekly returns','CORRECT','Surveillance Officer','"W05/2024" parsed as ISO week 2024-W05.'),
 ('SV02','Superseded IDSR report version','Uniqueness','IDSR weekly returns','KEEP LATEST','Surveillance Officer','Corrected resubmission: the latest submission is kept; timeliness uses the first submission.'),
 ('SV03','Condition name variant','Consistency','IDSR weekly returns','MAP','Surveillance Officer','Condition text mapped through ref.condition_alias (e.g. "Hep E" -> HEV).'),
 ('SV04','Deaths exceed cases','Consistency','IDSR weekly returns','FLAG','Surveillance Officer','Reported deaths > reported cases + 3 (deaths are counted in the week they occur, so a small excess is legitimate): deaths set to NULL and queried with the facility.'),
 ('SV05','Positive tests exceed tests done','Consistency','IDSR weekly returns','FLAG','Surveillance Officer','tests_positive > tests_done: both test counts set to NULL for the row.'),
 ('SV06','Case count keyed x10','Accuracy','IDSR weekly returns','CORRECT','Surveillance Officer','Count >= 10 x the clinical (PAS) count for the week and /10 brings it within +/-2 or 20%: divided by 10.'),
 ('SV07','Negative case count','Validity','IDSR weekly returns','CORRECT','Surveillance Officer','Negative count set to NULL.'),
 ('EX01','Census number formatting','Validity','NSA census table','CORRECT','External Data Steward','Thousands separators (spaces or commas) removed before conversion.'),
 ('EX02','Census aggregate or note row','Consistency','NSA census table','REJECT','External Data Steward','Title, national total and footnote rows excluded from the fact (the national total is kept as a control total).'),
 ('WE01','Weather fill value (temperature, humidity)','Completeness','NASA POWER weather','IMPUTE','External Data Steward','-999 replaced by linear interpolation of the neighbouring days (or carried forward at the series end).'),
 ('WE02','Weather fill value (rainfall)','Completeness','NASA POWER weather','IMPUTE','External Data Steward','-999 rainfall set to 0 in the dry season (May-Sep); otherwise left NULL and flagged.');
