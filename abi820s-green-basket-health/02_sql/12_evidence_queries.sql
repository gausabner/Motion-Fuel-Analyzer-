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
SELECT batch_id, batch_type, description, to_char(extract_cutoff, 'YYYY-MM-DD HH24:MI') AS extract_cutoff,
       round(extract(epoch FROM finished_at - started_at)::numeric, 1) AS seconds, status
FROM audit.etl_batch ORDER BY batch_id;

-- name: ev_extract_files
SELECT replace(step_name, 'extract ', '') AS source_file, target_table, rows_in AS rows_landed
FROM audit.etl_step_log WHERE batch_id = 1 AND step_name LIKE 'extract %' AND step_name NOT LIKE 'extract POWER%'
UNION ALL
SELECT 'POWER_Point_Daily_*.json (10 files)', 'stg.weather_json_raw', count(*)
FROM audit.etl_step_log WHERE batch_id = 1 AND step_name LIKE 'extract POWER%';

-- name: ev_steps
SELECT step_name, rows_in, rows_out, rows_rejected, round(duration_ms) AS ms, coalesce(message, '') AS note
FROM audit.etl_step_log WHERE batch_id = 1 AND step_name NOT LIKE 'extract %' ORDER BY step_id;

-- name: ev_steps_delta
SELECT step_name, rows_in, rows_out, coalesce(message, '') AS note
FROM audit.etl_step_log WHERE batch_id = 2 AND step_name NOT LIKE 'extract %' AND coalesce(rows_in, 1) > 0 ORDER BY step_id;

-- name: ev_recon
SELECT check_code, check_name, check_type,
       CASE WHEN abs(source_value) >= 1000 THEN to_char(source_value, 'FM999,999,999,990') ELSE source_value::text END AS source_value,
       CASE WHEN abs(target_value) >= 1000 THEN to_char(target_value, 'FM999,999,999,990') ELSE target_value::text END AS target_value,
       status, coalesce(explanation, '') AS explanation
FROM audit.recon_result WHERE batch_id = 2 ORDER BY recon_id;

-- name: ev_dq_rules
SELECT r.rule_code, r.rule_name, r.dq_dimension, r.action, r.owner_role, count(l.issue_id) AS hits
FROM audit.dq_rule r LEFT JOIN audit.dq_issue_log l ON l.rule_code = r.rule_code
GROUP BY r.rule_code, r.rule_name, r.dq_dimension, r.action, r.owner_role ORDER BY r.rule_code;

-- name: ev_dq_examples
SELECT DISTINCT ON (rule_code) rule_code, source_object, column_name, left(coalesce(raw_value, ''), 40) AS raw_value, left(action_taken, 60) AS action_taken
FROM audit.dq_issue_log WHERE rule_code IN ('EN02', 'EN03', 'EN05', 'EN07', 'EN09', 'AD02', 'AD03', 'WC02', 'SV01', 'SV03', 'SV06', 'MD02', 'MD05')
ORDER BY rule_code, issue_id;

-- name: ev_scd2_unit
SELECT unit_code, scd_version, specialty, bed_complement, scd_effective_from, scd_effective_to, scd_is_current
FROM dw.dim_care_unit WHERE unit_code IN ('WHK-MED2', 'RUN-MED1', 'KAT-PAE1') ORDER BY unit_code, scd_version;

-- name: ev_scd2_unit_effect
-- business effect: the COVID-19 isolation period of WHK-MED2 keeps its own specialty in history
SELECT cu.unit_code, cu.specialty, min(d.full_date) AS first_admission, max(d.full_date) AS last_admission, count(*) AS admissions,
       count(*) FILTER (WHERE dx.icd10_code = 'U07.1') AS covid_admissions
FROM dw.fact_admission f
JOIN dw.dim_care_unit cu ON cu.care_unit_key = f.care_unit_key
JOIN dw.dim_date d ON d.date_key = f.admission_date_key
JOIN dw.dim_diagnosis dx ON dx.diagnosis_key = f.diagnosis_key
WHERE cu.unit_code = 'WHK-MED2' AND d.full_date < DATE '2022-07-01'
GROUP BY cu.unit_code, cu.scd_version, cu.specialty ORDER BY first_admission;

-- name: ev_scd2_patient
-- one patient with a payer change (pseudonym masked): facts before/after point to different versions
SELECT 'P****' || right(p.patient_pseudo_id, 4) AS patient, p.scd_version, p.payer_code, p.residence_region_name,
       p.scd_effective_from, p.scd_effective_to, p.scd_is_current,
       (SELECT count(*) FROM dw.fact_encounter e WHERE e.patient_key = p.patient_key) AS attendances_on_version
FROM dw.dim_patient p
WHERE p.patient_pseudo_id = (SELECT p2.patient_pseudo_id FROM dw.dim_patient p2 JOIN dw.fact_encounter e ON e.patient_key = p2.patient_key
                             WHERE p2.scd_version = 2 GROUP BY p2.patient_pseudo_id ORDER BY count(*) DESC, p2.patient_pseudo_id LIMIT 1)
ORDER BY p.scd_version;

-- name: ev_scd2_summary
SELECT 'dim_patient' AS dimension, count(DISTINCT patient_pseudo_id) AS natural_keys, count(*) AS versions,
       count(*) FILTER (WHERE scd_version > 1) AS later_versions, count(*) FILTER (WHERE is_inferred) AS inferred_now
FROM dw.dim_patient WHERE patient_key > 0
UNION ALL
SELECT 'dim_care_unit', count(DISTINCT unit_code), count(*), count(*) FILTER (WHERE scd_version > 1), 0
FROM dw.dim_care_unit WHERE care_unit_key > 0;

-- name: ev_accumulating_snapshot
-- spells that were open at the 30 Sep cut-off and received their discharge milestone in the 1 Oct delta
SELECT f.admission_id, cu.unit_code, ad.full_date AS admitted, dd.full_date AS discharged, f.los_days, ap.discharge_status_code,
       f.dw_batch_id AS updated_by_batch
FROM dw.fact_admission f
JOIN dw.dim_care_unit cu ON cu.care_unit_key = f.care_unit_key
JOIN dw.dim_date ad ON ad.date_key = f.admission_date_key
JOIN dw.dim_date dd ON dd.date_key = f.discharge_date_key
JOIN dw.dim_admission_profile ap ON ap.admission_profile_key = f.admission_profile_key
WHERE f.dw_batch_id = 2 AND f.admission_date_key < 20261001
ORDER BY f.admission_ts LIMIT 8;

-- name: ev_inferred_members
-- EN10: attendances whose patient was missing from the patient index get an inferred member in the full load;
-- the 1 Oct delta delivers the late patient records and completes those members in place (no new version)
SELECT count(*) FILTER (WHERE l.batch_id = 1) AS inferred_in_full_load,
       (SELECT substring(s.message FROM '([0-9]+) inferred members completed')::int FROM audit.etl_step_log s
         WHERE s.batch_id = 2 AND s.step_name = 'load dim_patient (SCD2)') AS completed_by_delta,
       (SELECT count(*) FROM dw.dim_patient WHERE is_inferred) AS still_inferred_after_delta
FROM audit.dq_issue_log l WHERE l.rule_code = 'EN10';

-- name: ev_fact_sample
SELECT e.arrival_date_key, h.hour_label, cu.unit_code, t.triage_code, dx.icd10_code, ep.disposition_code, ab.age_band,
       e.door_to_doctor_min, e.ed_los_min, e.seen_within_target
FROM dw.fact_encounter e
JOIN dw.dim_hour h ON h.hour_key = e.arrival_hour_key
JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
JOIN dw.dim_triage t ON t.triage_key = e.triage_key
JOIN dw.dim_diagnosis dx ON dx.diagnosis_key = e.diagnosis_key
JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key
JOIN dw.dim_age_band ab ON ab.age_band_key = e.age_band_key
WHERE e.arrival_date_key = 20260915 AND cu.unit_code = 'RUN-ED'
ORDER BY e.encounter_key LIMIT 8;

-- name: ev_population
SELECT r.region_name, r.malaria_stratum, p.population AS population_2023,
       (SELECT p2.population FROM dw.fact_population p2 WHERE p2.region_key = p.region_key AND p2.year_date_key = 20260701) AS estimate_2026
FROM dw.fact_population p JOIN dw.dim_region r ON r.region_key = p.region_key
WHERE p.year_date_key = 20230701 ORDER BY p.population DESC;

-- name: ev_kpi_baseline
SELECT d.calendar_year,
       count(*) FILTER (WHERE ep.department_code = 'ED') AS ed_attendances,
       round(100.0 * sum(e.seen_within_target) / nullif(count(e.seen_within_target), 0), 1) AS pct_within_triage_target,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.door_to_doctor_min) FILTER (WHERE ep.department_code = 'ED')::numeric, 0) AS ed_median_door_to_doctor_min,
       round(100.0 * avg(e.is_lwbs) FILTER (WHERE ep.department_code = 'ED'), 1) AS ed_lwbs_pct
FROM dw.fact_encounter e
JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key
WHERE d.full_date <= DATE '2026-09-30'
GROUP BY d.calendar_year ORDER BY d.calendar_year;

-- name: ev_kpi_inpatient
SELECT d.calendar_year, sum(c.occupied_beds) AS patient_days,
       round(100.0 * sum(c.occupied_beds) / sum(c.beds_available), 1) AS bed_occupancy_pct,
       a.discharges, a.alos_days, a.readmission_30d_pct, a.discharged_before_noon_pct
FROM dw.fact_ward_census_daily c
JOIN dw.dim_date d ON d.date_key = c.census_date_key
JOIN (SELECT dd.calendar_year, count(*) AS discharges, round(avg(f.los_days), 2) AS alos_days,
             round(100.0 * sum(f.readmitted_within_30d) / nullif(sum(f.readmission_eligible), 0), 1) AS readmission_30d_pct,
             round(100.0 * avg(f.discharged_before_noon), 1) AS discharged_before_noon_pct
      FROM dw.fact_admission f JOIN dw.dim_date dd ON dd.date_key = f.discharge_date_key
      WHERE f.is_discharged = 1 GROUP BY dd.calendar_year) a ON a.calendar_year = d.calendar_year
WHERE d.full_date <= DATE '2026-09-30'
GROUP BY d.calendar_year, a.discharges, a.alos_days, a.readmission_30d_pct, a.discharged_before_noon_pct ORDER BY d.calendar_year;

-- name: ev_kpi_surveillance
SELECT d.epi_year, sum(s.cases_total) FILTER (WHERE c.condition_code = 'MAL') AS malaria_cases,
       sum(s.deaths_total) FILTER (WHERE c.condition_code = 'MAL') AS malaria_deaths,
       round(100.0 * sum(s.tests_positive) / nullif(sum(s.tests_done), 0), 1) AS malaria_test_positivity_pct,
       r.completeness_pct, r.timeliness_pct
FROM dw.fact_surveillance_weekly s
JOIN dw.dim_condition c ON c.condition_key = s.condition_key
JOIN dw.dim_date d ON d.date_key = s.epi_week_date_key
JOIN (SELECT dd.epi_year, round(100.0 * avg(report_received), 1) AS completeness_pct, round(100.0 * avg(report_on_time), 1) AS timeliness_pct
      FROM dw.fact_idsr_report x JOIN dw.dim_date dd ON dd.date_key = x.epi_week_date_key GROUP BY dd.epi_year) r ON r.epi_year = d.epi_year
GROUP BY d.epi_year, r.completeness_pct, r.timeliness_pct ORDER BY d.epi_year;

-- name: ev_facility_profile
-- organisation profile (report 3.1): current SCD2 versions of the wards, ED attendances and admissions in 2025
SELECT f.facility_code, f.facility_short_name AS facility, f.facility_type, r.region_name AS region, r.zone, r.malaria_stratum,
       count(DISTINCT cu.unit_code) FILTER (WHERE cu.unit_type = 'Inpatient ward') AS wards,
       coalesce(sum(cu.bed_complement) FILTER (WHERE cu.scd_is_current AND cu.unit_type = 'Inpatient ward'), 0) AS beds_now,
       f.has_emergency_department AS has_ed, round(100 * f.catchment_share)::int AS catchment_share_pct,
       (SELECT count(*) FROM dw.fact_encounter e JOIN dw.dim_care_unit c2 ON c2.care_unit_key = e.care_unit_key
        WHERE c2.facility_key = f.facility_key AND e.arrival_date_key BETWEEN 20250101 AND 20251231) AS attendances_2025,
       (SELECT count(*) FROM dw.fact_admission a JOIN dw.dim_care_unit c3 ON c3.care_unit_key = a.care_unit_key
        WHERE c3.facility_key = f.facility_key AND a.admission_date_key BETWEEN 20250101 AND 20251231) AS admissions_2025
FROM dw.dim_facility f
JOIN dw.dim_region r ON r.region_key = f.region_key
LEFT JOIN dw.dim_care_unit cu ON cu.facility_key = f.facility_key
WHERE f.facility_key > 0
GROUP BY f.facility_key, f.facility_code, f.facility_short_name, f.facility_type, r.region_name, r.zone, r.malaria_stratum,
         f.has_emergency_department, f.catchment_share
ORDER BY f.facility_type DESC, attendances_2025 DESC;

-- name: ev_kpi_resources
-- resource-utilisation baseline (report 3.1 / 3.7): staffing and ED load by calendar year
WITH r AS (SELECT r.roster_date_key / 10000 AS y, sum(r.nurse_hours) FILTER (WHERE cu.unit_type = 'Inpatient ward') AS ward_hours,
                  sum(r.overtime_hours) / sum(r.nurse_hours) AS ot, sum(r.agency_hours) / sum(r.nurse_hours) AS ag,
                  sum(r.doctors_on_duty) FILTER (WHERE cu.unit_type = 'Emergency department') AS ed_doctor_shifts
           FROM dw.fact_staff_roster r JOIN dw.dim_care_unit cu ON cu.care_unit_key = r.care_unit_key GROUP BY 1),
     c AS (SELECT census_date_key / 10000 AS y, sum(occupied_beds) AS patient_days FROM dw.fact_ward_census_daily GROUP BY 1),
     e AS (SELECT e.arrival_date_key / 10000 AS y, count(*) FILTER (WHERE ep.department_code = 'ED') AS ed
           FROM dw.fact_encounter e JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key GROUP BY 1)
SELECT r.y AS calendar_year, round(r.ward_hours / c.patient_days, 2) AS nhppd, round(100 * r.ot, 1) AS overtime_pct,
       round(100 * r.ag, 1) AS agency_pct, round(e.ed::numeric / r.ed_doctor_shifts, 1) AS ed_arrivals_per_doctor_shift
FROM r JOIN c USING (y) JOIN e USING (y)
WHERE r.y <= 2026 ORDER BY 1;

-- name: ev_intervention
-- staffing intervention (Jan-Jun 2026: +1 day-shift ED doctor at Rundu and Katima Mulilo) vs the same months of 2025
SELECT f.facility_short_name AS facility, d.calendar_year, count(*) AS ed_attendances,
       round(100.0 * sum(e.seen_within_target) / count(e.seen_within_target), 1) AS pct_seen_within_target,
       round(100 * avg(e.is_lwbs), 1) AS lwbs_pct,
       (SELECT round(avg(r.doctors_on_duty) FILTER (WHERE s.shift_code = 'D'), 2)
        FROM dw.fact_staff_roster r JOIN dw.dim_care_unit c2 ON c2.care_unit_key = r.care_unit_key JOIN dw.dim_shift s ON s.shift_key = r.shift_key
        WHERE c2.facility_key = f.facility_key AND c2.unit_type = 'Emergency department'
          AND r.roster_date_key BETWEEN d.calendar_year * 10000 + 101 AND d.calendar_year * 10000 + 630) AS avg_day_shift_doctors
FROM dw.fact_encounter e
JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key AND ep.department_code = 'ED'
JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
JOIN dw.dim_facility f ON f.facility_key = cu.facility_key
JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
WHERE f.facility_code IN ('GBH-RUN', 'GBH-KAT', 'GBH-OSH') AND d.month_num <= 6 AND d.calendar_year IN (2025, 2026)
GROUP BY f.facility_key, f.facility_short_name, d.calendar_year ORDER BY 1, 2;
