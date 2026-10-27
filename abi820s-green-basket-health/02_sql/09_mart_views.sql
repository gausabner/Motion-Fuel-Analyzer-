-- =============================================================================
-- 09_mart_views.sql
-- Presentation layer for the Power BI semantic model (Import mode). Only the columns
-- the model needs; no pseudonyms, timestamps or free text leave the warehouse
-- (data minimisation). Patients are counted with the durable key (first surrogate
-- key of the patient), which is stable across SCD2 versions.
-- =============================================================================

CREATE OR REPLACE VIEW mart.v_dim_date AS
SELECT date_key, full_date, day_of_month, day_of_week_iso, day_name, day_short, is_weekend, is_public_holiday,
       coalesce(holiday_name, '') AS holiday_name, epi_year, epi_week, epi_week_label, epi_week_key, epi_week_start, month_num,
       month_name, month_short, year_month, year_month_key, month_start_date, quarter_num, year_quarter, calendar_year,
       fiscal_year_label, fiscal_year_start, rainy_season_label, is_malaria_season, is_after_cutoff
FROM dw.dim_date
WHERE date_key > 0
  AND calendar_year <= (SELECT max(arrival_date_key) / 10000 FROM dw.fact_encounter);
COMMENT ON VIEW mart.v_dim_date IS 'Date table for Power BI: complete calendar years from 2021 up to the latest year with attendances (special members excluded so that it can be marked as a date table; the warehouse calendar itself runs to 2027).';

CREATE OR REPLACE VIEW mart.v_dim_hour AS
SELECT hour_key, hour_label, hour_band, hour_band_sort, shift_name, is_after_hours FROM dw.dim_hour;

CREATE OR REPLACE VIEW mart.v_dim_region AS
SELECT region_key, region_code, region_name, zone, malaria_stratum FROM dw.dim_region;

CREATE OR REPLACE VIEW mart.v_dim_facility AS
SELECT facility_key, facility_code, facility_name, facility_short_name, facility_type, region_key, town, latitude, longitude,
       has_emergency_department, catchment_share
FROM dw.dim_facility;

CREATE OR REPLACE VIEW mart.v_dim_care_unit AS
SELECT care_unit_key, unit_code, unit_name, unit_type, facility_key, specialty, bed_complement, scd_effective_from,
       scd_effective_to, scd_is_current, scd_version
FROM dw.dim_care_unit;

CREATE OR REPLACE VIEW mart.v_dim_patient AS
SELECT p.patient_key, p.patient_durable_key, p.sex,
       CASE p.sex WHEN 'F' THEN 'Female' WHEN 'M' THEN 'Male' ELSE 'Unknown' END AS sex_name,
       p.residence_region_name, p.payer_code, p.payer_name, p.payer_group, p.is_inferred, p.scd_is_current
FROM dw.dim_patient p;
COMMENT ON VIEW mart.v_dim_patient IS 'Patient attributes for analysis only: no pseudonym, no birth year (age is carried on the facts as an age band).';

CREATE OR REPLACE VIEW mart.v_dim_diagnosis AS
SELECT diagnosis_key, icd10_code, icd10_code || ' ' || icd10_title AS diagnosis_label, icd10_category, block_range,
       block_range || ' ' || block_title AS block_label, chapter_code, chapter_number,
       chapter_code || ' ' || chapter_title AS chapter_label, severity_class, default_specialty, is_chronic, condition_key
FROM dw.dim_diagnosis;

CREATE OR REPLACE VIEW mart.v_dim_condition AS
SELECT condition_key, condition_code, condition_name, idsr_category, notification, alert_threshold, is_notifiable
FROM dw.dim_condition;

CREATE OR REPLACE VIEW mart.v_dim_triage AS
SELECT triage_key, triage_code, triage_label, priority, target_minutes, compliance_minutes, target_text, colour_hex FROM dw.dim_triage;

CREATE OR REPLACE VIEW mart.v_dim_encounter_profile AS
SELECT encounter_profile_key, department_code, department_name, arrival_mode_name, disposition_code, disposition_name,
       disposition_group FROM dw.dim_encounter_profile;

CREATE OR REPLACE VIEW mart.v_dim_admission_profile AS
SELECT admission_profile_key, admission_method_code, admission_method_name, is_emergency, discharge_status_code,
       discharge_status_name FROM dw.dim_admission_profile;

CREATE OR REPLACE VIEW mart.v_dim_age_band AS
SELECT age_band_key, age_band, idsr_age_group, life_stage FROM dw.dim_age_band;

CREATE OR REPLACE VIEW mart.v_dim_shift AS SELECT shift_key, shift_code, shift_name FROM dw.dim_shift;

-- ---------------------------------------------------------------------------------- facts
CREATE OR REPLACE VIEW mart.v_fact_encounter AS
SELECT e.arrival_date_key, e.arrival_hour_key, e.care_unit_key, e.patient_key, p.patient_durable_key, e.diagnosis_key,
       e.triage_key, e.encounter_profile_key, e.age_band_key, e.encounter_count, e.wait_to_triage_min, e.door_to_doctor_min,
       e.ed_los_min, e.seen_within_target, e.is_lwbs, e.is_admitted, e.is_died
FROM dw.fact_encounter e
JOIN dw.dim_patient p ON p.patient_key = e.patient_key;

CREATE OR REPLACE VIEW mart.v_fact_admission AS
SELECT f.admission_date_key, f.discharge_date_key, f.care_unit_key, f.patient_key, p.patient_durable_key, f.diagnosis_key,
       f.admission_profile_key, f.age_band_key, f.admission_count, f.los_days, f.is_discharged, f.is_died,
       f.discharged_before_noon, f.is_weekend_discharge, f.is_readmission_30d, f.readmission_eligible,
       f.readmitted_within_30d, f.prior_admissions_12m, f.is_open_over_60d
FROM dw.fact_admission f
JOIN dw.dim_patient p ON p.patient_key = f.patient_key;

CREATE OR REPLACE VIEW mart.v_fact_ward_census AS
SELECT census_date_key, care_unit_key, beds_complement, beds_closed, beds_available, occupied_beds, admissions, discharges,
       deaths, census_source FROM dw.fact_ward_census_daily;

CREATE OR REPLACE VIEW mart.v_fact_staff_roster AS
SELECT roster_date_key, care_unit_key, shift_key, planned_nurse_hours, nurse_hours, rn_hours, doctor_hours, overtime_hours,
       agency_hours, sick_leave_hours, nurses_on_duty, doctors_on_duty FROM dw.fact_staff_roster;

CREATE OR REPLACE VIEW mart.v_fact_surveillance AS
SELECT epi_week_date_key, facility_key, condition_key, cases_under5, cases_5plus, cases_total, deaths_total, tests_done,
       tests_positive FROM dw.fact_surveillance_weekly;

CREATE OR REPLACE VIEW mart.v_fact_idsr_report AS
SELECT epi_week_date_key, facility_key, report_expected, report_received, report_on_time, hours_after_due FROM dw.fact_idsr_report;

CREATE OR REPLACE VIEW mart.v_fact_population AS
SELECT year_date_key, region_key, population, is_census_count, population_source FROM dw.fact_population;

-- Catchment population per facility and year = NSA regional population x facility catchment share (master data)
CREATE OR REPLACE VIEW mart.v_fact_catchment_population AS
SELECT p.year_date_key, f.facility_key, round(p.population * f.catchment_share)::int AS catchment_population,
       p.is_census_count
FROM dw.fact_population p
JOIN dw.dim_facility f ON f.region_key = p.region_key AND f.facility_key > 0;
COMMENT ON VIEW mart.v_fact_catchment_population IS 'Derived fact: catchment population per facility and year (denominator of incidence per 100 000).';

CREATE OR REPLACE VIEW mart.v_fact_weather AS
SELECT weather_date_key, facility_key, rainfall_mm, tmax_c, tmin_c, rh_pct FROM dw.fact_weather_daily;

CREATE OR REPLACE VIEW mart.v_sec_user_facility AS
SELECT lower(u.user_principal_name) AS user_principal_name, f.facility_key
FROM sec.user_facility_access u JOIN dw.dim_facility f ON f.facility_code = u.facility_code;
COMMENT ON VIEW mart.v_sec_user_facility IS 'Dynamic RLS mapping consumed by the Power BI role "Facility manager".';

-- Data-quality summary for the governance page (counts only, no record keys)
CREATE OR REPLACE VIEW mart.v_dq_summary AS
SELECT r.rule_code, r.rule_name, r.dq_dimension, r.source_object, r.action, r.owner_role,
       count(l.issue_id) AS issues, max(l.batch_id) AS last_batch
FROM audit.dq_rule r LEFT JOIN audit.dq_issue_log l ON l.rule_code = r.rule_code
GROUP BY r.rule_code, r.rule_name, r.dq_dimension, r.source_object, r.action, r.owner_role;

CREATE OR REPLACE VIEW mart.v_recon_latest AS
SELECT check_code, check_name, check_type, source_value, target_value, difference, status, explanation
FROM audit.recon_result WHERE batch_id = (SELECT max(batch_id) FROM audit.recon_result);
