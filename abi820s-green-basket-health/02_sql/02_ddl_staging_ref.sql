-- =============================================================================
-- 02_ddl_staging_ref.sql
-- (1) Raw landing tables: every source column is landed as TEXT, unchanged, with
--     the source file, row number and batch id (lossless, re-playable).
-- (2) Clean staging tables: typed, standardised, de-duplicated rows produced by the
--     transform procedures (05_etl_transform.sql); they persist across batches so
--     that incremental deltas are merged by natural key.
-- (3) Reference tables maintained by data stewards (code maps, aliases).
-- =============================================================================

-- ------------------------------------------------------------------ raw landing
CREATE TABLE stg.encounter_raw (
    source_file text, row_num integer, encounter_id text, facility_code text, department text, patient_id text,
    arrival_datetime text, triage_datetime text, triage_category text, seen_datetime text, departure_datetime text,
    arrival_mode text, disposition text, primary_icd10 text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.encounter_raw IS 'PAS ED and clinic attendance extracts, landed as text (yearly files + daily delta).';

CREATE TABLE stg.spell_raw (
    source_file text, row_num integer, admission_id text, facility_code text, ward_code text, patient_id text,
    admission_datetime text, discharge_datetime text, admission_method text, discharge_status text,
    principal_icd10 text, ed_encounter_id text, last_updated text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.spell_raw IS 'PAS inpatient spell change-data-capture export (several images per spell), landed as text.';

CREATE TABLE stg.patient_raw (
    source_file text, row_num integer, patient_id text, sex text, birth_year text, residence_region text,
    payer_class text, registration_date text, last_updated text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.patient_raw IS 'Pseudonymised master patient index (no names, ID numbers, dates of birth or addresses), landed as text.';

CREATE TABLE stg.patient_change_raw (
    source_file text, row_num integer, change_id text, patient_id text, attribute text, old_value text,
    new_value text, effective_date text, captured_at text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.patient_change_raw IS 'Patient-index audit trail (residence region and payer class changes) used to build SCD Type 2 history.';

CREATE TABLE stg.census_raw (
    source_file text, row_num integer, census_date text, ward_code text, beds_closed text, occupied_midnight text,
    admissions text, discharges text, deaths text, submitted_at text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.census_raw IS 'Nurse-reported ward bed state at midnight (one return per ward per day), landed as text.';

CREATE TABLE stg.roster_raw (
    source_file text, row_num integer, roster_date text, unit_code text, shift text, planned_nurse_hours text,
    rn_hours text, en_hours text, doctor_hours text, overtime_hours text, agency_hours text, sick_leave_hours text,
    nurses_on_duty text, doctors_on_duty text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.roster_raw IS 'E-rostering shift summary per care unit, date and shift, landed as text.';

CREATE TABLE stg.idsr_raw (
    source_file text, row_num integer, facility_code text, epi_week text, condition text, cases_under5 text,
    cases_5plus text, deaths_under5 text, deaths_5plus text, tests_done text, tests_positive text,
    submitted_at text, report_version text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.idsr_raw IS 'IDSR weekly returns (aggregate counts per facility, epi week and priority condition), landed as text.';

CREATE TABLE stg.nsa_census_raw (
    source_file text, row_num integer, region_txt text, population_txt text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.nsa_census_raw IS 'NSA 2023 census regional population table, every CSV row landed (including title, total and note rows).';

CREATE TABLE stg.weather_json_raw (
    source_file text, facility_code text, payload jsonb, batch_id integer NOT NULL);
COMMENT ON TABLE stg.weather_json_raw IS 'NASA POWER daily point JSON, one document per facility location.';

-- master data workbook sheets
CREATE TABLE stg.md_regions_raw (extract_name text, row_num integer, region_code text, region_name text, zone text,
    malaria_stratum text, known_aliases text, batch_id integer NOT NULL);
CREATE TABLE stg.md_facilities_raw (extract_name text, row_num integer, facility_code text, facility_name text,
    facility_type text, region text, town text, latitude text, longitude text, elevation_m text,
    has_emergency_department text, catchment_share_pct text, opened_date text, ownership text, batch_id integer NOT NULL);
CREATE TABLE stg.md_units_raw (extract_name text, row_num integer, unit_code text, facility_code text, unit_name text,
    unit_type text, specialty text, bed_complement text, active text, batch_id integer NOT NULL);
CREATE TABLE stg.md_unit_history_raw (extract_name text, row_num integer, change_id text, unit_code text, attribute text,
    old_value text, new_value text, effective_date text, approved_by_role text, batch_id integer NOT NULL);
CREATE TABLE stg.md_triage_raw (extract_name text, row_num integer, triage_code text, triage_label text, priority text,
    target_minutes text, target_text text, colour_hex text, batch_id integer NOT NULL);
CREATE TABLE stg.md_icd_raw (extract_name text, row_num integer, icd10_code text, icd10_title text, chapter text,
    chapter_range text, chapter_title text, block_range text, block_title text, severity_class text,
    default_specialty text, is_chronic_condition text, idsr_condition_code text, batch_id integer NOT NULL);
CREATE TABLE stg.md_conditions_raw (extract_name text, row_num integer, condition_code text, condition_name text,
    idsr_category text, notification text, alert_threshold text, icd10_codes text, known_aliases text, batch_id integer NOT NULL);
CREATE TABLE stg.md_payers_raw (extract_name text, row_num integer, payer_code text, payer_name text, payer_group text,
    known_aliases text, batch_id integer NOT NULL);
CREATE TABLE stg.md_code_map_raw (extract_name text, row_num integer, code_type text, source_value text,
    standard_code text, standard_description text, batch_id integer NOT NULL);
COMMENT ON TABLE stg.md_facilities_raw IS 'Master data workbook (GBHS_Master_Data.xlsx and day-2 delta), one raw table per sheet.';

-- ------------------------------------------------------------------ reference (steward-maintained)
CREATE TABLE ref.code_map (
    code_type text NOT NULL, source_value text NOT NULL, standard_code text NOT NULL, standard_description text,
    PRIMARY KEY (code_type, source_value));
COMMENT ON TABLE ref.code_map IS 'Steward-maintained mapping of raw source codes to standard codes (disposition, triage, shift, sex ...).';
CREATE TABLE ref.region_alias (alias_norm text PRIMARY KEY, region_code text NOT NULL);
COMMENT ON TABLE ref.region_alias IS 'Normalised region names and aliases -> ISO 3166-2:NA region code.';
CREATE TABLE ref.condition_alias (alias_norm text PRIMARY KEY, condition_code text NOT NULL);
COMMENT ON TABLE ref.condition_alias IS 'Normalised IDSR condition names and aliases -> condition code.';
CREATE TABLE ref.payer_alias (alias_norm text PRIMARY KEY, payer_code text NOT NULL);
COMMENT ON TABLE ref.payer_alias IS 'Normalised payer names and aliases -> payer code.';

-- ------------------------------------------------------------------ clean staging (typed, merged by natural key)
CREATE TABLE stg.md_region_clean (region_code text PRIMARY KEY, region_name text, zone text, malaria_stratum text, batch_id integer);
CREATE TABLE stg.md_facility_clean (facility_code text PRIMARY KEY, facility_name text, facility_type text, region_code text,
    town text, latitude numeric(9,5), longitude numeric(9,5), elevation_m integer, has_emergency_department boolean,
    catchment_share numeric(6,4), opened_date date, ownership text, batch_id integer);
CREATE TABLE stg.md_unit_clean (unit_code text PRIMARY KEY, facility_code text, unit_name text, unit_type text, specialty text,
    bed_complement integer, is_active boolean, batch_id integer);
CREATE TABLE stg.md_unit_history_clean (change_id integer PRIMARY KEY, unit_code text, attribute text, old_value text,
    new_value text, effective_date date, approved_by_role text, batch_id integer);
CREATE TABLE stg.md_triage_clean (triage_code text PRIMARY KEY, triage_label text, priority smallint, target_minutes integer,
    target_text text, colour_hex text, batch_id integer);
CREATE TABLE stg.md_icd_clean (icd10_code text PRIMARY KEY, icd10_title text, chapter text, chapter_range text, chapter_title text,
    block_range text, block_title text, severity_class text, default_specialty text, is_chronic boolean,
    condition_code text, batch_id integer);
CREATE TABLE stg.md_condition_clean (condition_code text PRIMARY KEY, condition_name text, idsr_category text, notification text,
    alert_threshold text, icd10_codes text, batch_id integer);
CREATE TABLE stg.md_payer_clean (payer_code text PRIMARY KEY, payer_name text, payer_group text, batch_id integer);

CREATE TABLE stg.patient_clean (
    patient_id text PRIMARY KEY, sex text, birth_year smallint, residence_region_code text, payer_code text,
    registration_date date, last_updated timestamp, batch_id integer);
CREATE TABLE stg.patient_change_clean (
    change_id integer PRIMARY KEY, patient_id text NOT NULL, attribute text NOT NULL, old_value text, new_value text,
    effective_date date NOT NULL, batch_id integer);
CREATE INDEX ix_patient_change_lookup ON stg.patient_change_clean (patient_id, attribute, effective_date);

CREATE TABLE stg.encounter_clean (
    encounter_id text PRIMARY KEY, facility_code text, unit_code text, department text, patient_id text,
    arrival_ts timestamp, triage_ts timestamp, seen_ts timestamp, departure_ts timestamp, triage_code text,
    arrival_mode_code text, disposition_code text, icd10_code text, wait_to_triage_min numeric(8,1),
    door_to_doctor_min numeric(8,1), ed_los_min numeric(9,1), source_file text, row_num integer, batch_id integer);
CREATE INDEX ix_encounter_clean_batch ON stg.encounter_clean (batch_id);

CREATE TABLE stg.spell_clean (
    admission_id text PRIMARY KEY, facility_code text, ward_code text, patient_id text, admission_ts timestamp,
    discharge_ts timestamp, admission_method text, discharge_status text, icd10_code text, ed_encounter_id text,
    last_updated timestamp, batch_id integer);
CREATE INDEX ix_spell_clean_batch ON stg.spell_clean (batch_id);

CREATE TABLE stg.census_clean (
    census_date date, ward_code text, beds_closed integer, occupied_midnight integer, admissions integer,
    discharges integer, deaths integer, submitted_at timestamp, census_source text, batch_id integer,
    PRIMARY KEY (census_date, ward_code));
CREATE TABLE stg.pas_ward_census (
    census_date date, ward_code text, pas_occupied integer, pas_admissions integer, pas_discharges integer,
    pas_deaths integer, PRIMARY KEY (census_date, ward_code));
COMMENT ON TABLE stg.pas_ward_census IS 'Midnight census derived from PAS spells (used to impute missing ward returns and to reconcile).';

CREATE TABLE stg.roster_clean (
    roster_date date, unit_code text, shift_code text, planned_nurse_hours numeric(7,1), rn_hours numeric(7,1),
    en_hours numeric(7,1), doctor_hours numeric(7,1), overtime_hours numeric(7,1), agency_hours numeric(7,1),
    sick_leave_hours numeric(7,1), nurses_on_duty smallint, doctors_on_duty smallint, batch_id integer,
    PRIMARY KEY (roster_date, unit_code, shift_code));

CREATE TABLE stg.idsr_clean (
    facility_code text, epi_week_start date, condition_code text, cases_under5 integer, cases_5plus integer,
    deaths_under5 integer, deaths_5plus integer, tests_done integer, tests_positive integer, submitted_at timestamp,
    report_version smallint, batch_id integer, PRIMARY KEY (facility_code, epi_week_start, condition_code));
CREATE TABLE stg.idsr_submission (
    facility_code text, epi_week_start date, first_submitted_at timestamp, last_submitted_at timestamp,
    versions smallint, batch_id integer, PRIMARY KEY (facility_code, epi_week_start));

CREATE TABLE stg.nsa_population_clean (region_code text PRIMARY KEY, census_year smallint, population integer, batch_id integer);
CREATE TABLE stg.nsa_control_total (census_year smallint PRIMARY KEY, national_total integer, batch_id integer);

CREATE TABLE stg.weather_clean (
    facility_code text, obs_date date, rainfall_mm numeric(7,2), tmax_c numeric(5,2), tmin_c numeric(5,2),
    rh_pct numeric(5,2), is_imputed boolean, batch_id integer, PRIMARY KEY (facility_code, obs_date));
