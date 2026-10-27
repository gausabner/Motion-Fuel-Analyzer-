-- =============================================================================
-- 07_etl_load_facts.sql
-- LOAD: clean staging -> fact tables (surrogate-key lookups, SCD2 range joins on the
-- event date, idempotent upserts) and the orchestrating procedure etl.sp_run_load,
-- used for both the full load and incremental (day-2) deltas.
-- =============================================================================

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_encounter(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n int;
BEGIN
    SELECT count(*) INTO n_in FROM stg.encounter_clean WHERE batch_id = p_batch;
    INSERT INTO dw.fact_encounter (encounter_id, arrival_date_key, arrival_hour_key, care_unit_key, patient_key, diagnosis_key,
                                   triage_key, encounter_profile_key, age_band_key, age_years, wait_to_triage_min,
                                   door_to_doctor_min, ed_los_min, seen_within_target, is_lwbs, is_admitted, is_died, dw_batch_id)
    SELECT e.encounter_id, etl.fn_date_key(e.arrival_ts::date), extract(hour FROM e.arrival_ts)::smallint,
           coalesce(cu.care_unit_key, -1), coalesce(pt.patient_key, -1), coalesce(dx.diagnosis_key, -1),
           coalesce(tr.triage_key, -1), ep.encounter_profile_key, etl.fn_age_band_key(a.age), a.age,
           e.wait_to_triage_min, e.door_to_doctor_min, e.ed_los_min,
           CASE WHEN tr.compliance_minutes IS NOT NULL AND e.door_to_doctor_min IS NOT NULL AND e.disposition_code <> 'LWBS'
                THEN (e.door_to_doctor_min <= tr.compliance_minutes)::int END,
           (e.disposition_code = 'LWBS')::int, (e.disposition_code = 'ADM')::int, (e.disposition_code = 'DIED')::int, p_batch
    FROM stg.encounter_clean e
    LEFT JOIN dw.dim_care_unit cu ON cu.unit_code = e.unit_code AND e.arrival_ts::date BETWEEN cu.scd_effective_from AND cu.scd_effective_to
    LEFT JOIN dw.dim_patient pt ON pt.patient_pseudo_id = e.patient_id AND e.arrival_ts::date BETWEEN pt.scd_effective_from AND pt.scd_effective_to
    LEFT JOIN dw.dim_diagnosis dx ON dx.icd10_code = e.icd10_code
    LEFT JOIN dw.dim_triage tr ON tr.triage_code = e.triage_code
    JOIN dw.dim_encounter_profile ep ON ep.department_code = e.department AND ep.arrival_mode_code = e.arrival_mode_code
                                    AND ep.disposition_code = e.disposition_code
    CROSS JOIN LATERAL (SELECT CASE WHEN pt.birth_year IS NULL THEN NULL
                                    ELSE (extract(year FROM e.arrival_ts) - pt.birth_year)::smallint END AS age) a
    WHERE e.batch_id = p_batch
    ON CONFLICT (encounter_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_encounter', 'dw.fact_encounter', n_in, n, n_in - n, t0);
END $$;

-- Accumulating snapshot: insert new spells, apply newer PAS images (discharge milestone) in place
CREATE OR REPLACE PROCEDURE etl.sp_load_fact_admission(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n_new int; n_upd int; v_cut timestamp := etl.fn_batch_cutoff(p_batch);
BEGIN
    SELECT count(*) INTO n_in FROM stg.spell_clean WHERE batch_id = p_batch;
    SELECT count(*) INTO n_upd FROM stg.spell_clean s JOIN dw.fact_admission f ON f.admission_id = s.admission_id WHERE s.batch_id = p_batch;
    INSERT INTO dw.fact_admission (admission_id, admission_date_key, discharge_date_key, care_unit_key, patient_key, diagnosis_key,
                                   admission_profile_key, age_band_key, age_years, ed_encounter_id, admission_ts, discharge_ts,
                                   los_days, is_discharged, is_died, discharged_before_noon, is_weekend_discharge,
                                   source_last_updated, dw_batch_id)
    SELECT s.admission_id, etl.fn_date_key(s.admission_ts::date),
           CASE WHEN s.discharge_ts IS NULL THEN -2 ELSE etl.fn_date_key(s.discharge_ts::date) END,
           coalesce(cu.care_unit_key, -1), coalesce(pt.patient_key, -1), coalesce(dx.diagnosis_key, -1), ap.admission_profile_key,
           etl.fn_age_band_key(a.age), a.age, s.ed_encounter_id, s.admission_ts, s.discharge_ts,
           (s.discharge_ts::date - s.admission_ts::date), (s.discharge_ts IS NOT NULL)::int, coalesce((s.discharge_status = 'DIED')::int, 0),
           CASE WHEN s.discharge_ts IS NOT NULL THEN (extract(hour FROM s.discharge_ts) < 12)::int END,
           CASE WHEN s.discharge_ts IS NOT NULL THEN (extract(isodow FROM s.discharge_ts) IN (6, 7))::int END,
           s.last_updated, p_batch
    FROM stg.spell_clean s
    LEFT JOIN dw.dim_care_unit cu ON cu.unit_code = s.ward_code AND s.admission_ts::date BETWEEN cu.scd_effective_from AND cu.scd_effective_to
    LEFT JOIN dw.dim_patient pt ON pt.patient_pseudo_id = s.patient_id AND s.admission_ts::date BETWEEN pt.scd_effective_from AND pt.scd_effective_to
    LEFT JOIN dw.dim_diagnosis dx ON dx.icd10_code = s.icd10_code
    JOIN dw.dim_admission_profile ap ON ap.admission_method_code = s.admission_method
                                    AND ap.discharge_status_code = coalesce(s.discharge_status, 'IN')
    CROSS JOIN LATERAL (SELECT CASE WHEN pt.birth_year IS NULL THEN NULL
                                    ELSE (extract(year FROM s.admission_ts) - pt.birth_year)::smallint END AS age) a
    WHERE s.batch_id = p_batch
    ON CONFLICT (admission_id) DO UPDATE SET
        discharge_date_key = EXCLUDED.discharge_date_key, care_unit_key = EXCLUDED.care_unit_key, patient_key = EXCLUDED.patient_key,
        diagnosis_key = EXCLUDED.diagnosis_key, admission_profile_key = EXCLUDED.admission_profile_key,
        discharge_ts = EXCLUDED.discharge_ts, los_days = EXCLUDED.los_days, is_discharged = EXCLUDED.is_discharged,
        is_died = EXCLUDED.is_died, discharged_before_noon = EXCLUDED.discharged_before_noon,
        is_weekend_discharge = EXCLUDED.is_weekend_discharge, source_last_updated = EXCLUDED.source_last_updated,
        dw_batch_id = EXCLUDED.dw_batch_id, dw_updated_at = now()
    WHERE EXCLUDED.source_last_updated >= dw.fact_admission.source_last_updated;
    GET DIAGNOSTICS n_new = ROW_COUNT;

    -- milestone 3 and flow features, recomputed for all spells (window over the patient pseudonym)
    WITH s AS (
        SELECT f.admission_key, p.patient_pseudo_id AS pid, f.admission_ts, f.discharge_ts, ap.admission_method_code AS method,
               ap.discharge_status_code AS status, ap.is_emergency
        FROM dw.fact_admission f
        JOIN dw.dim_patient p ON p.patient_key = f.patient_key
        JOIN dw.dim_admission_profile ap ON ap.admission_profile_key = f.admission_profile_key
        WHERE f.patient_key <> -1
    ), o AS (
        SELECT s.*,
               lag(discharge_ts) OVER w AS prev_dis, lag(status) OVER w AS prev_status, lag(method) OVER w AS prev_method,
               lead(admission_ts) OVER w AS next_adm, lead(is_emergency) OVER w AS next_emerg,
               count(*) OVER (PARTITION BY pid ORDER BY admission_ts RANGE BETWEEN interval '365 days' PRECEDING AND interval '1 second' PRECEDING) AS prior12
        FROM s WINDOW w AS (PARTITION BY pid ORDER BY admission_ts, admission_key)
    ), flags AS (
        SELECT admission_key,
               coalesce(is_emergency AND prev_status IN ('HOME', 'AMA') AND prev_method <> 'MATERNITY'
                        AND admission_ts > prev_dis AND admission_ts <= prev_dis + interval '30 days', false)::int AS readm,
               coalesce(status IN ('HOME', 'AMA') AND method <> 'MATERNITY' AND discharge_ts <= v_cut - interval '30 days', false)::int AS elig,
               coalesce(status IN ('HOME', 'AMA') AND method <> 'MATERNITY' AND discharge_ts <= v_cut - interval '30 days'
                        AND next_emerg AND next_adm > discharge_ts AND next_adm <= discharge_ts + interval '30 days', false)::int AS readm30,
               prior12::smallint AS prior12,
               coalesce(discharge_ts IS NULL AND admission_ts < v_cut - interval '60 days', false)::int AS open60
        FROM o
    )
    UPDATE dw.fact_admission f SET is_readmission_30d = x.readm, readmission_eligible = x.elig, readmitted_within_30d = x.readm30,
                                   prior_admissions_12m = x.prior12, is_open_over_60d = x.open60
    FROM flags x
    WHERE x.admission_key = f.admission_key
      AND (f.is_readmission_30d, f.readmission_eligible, f.readmitted_within_30d, f.prior_admissions_12m, f.is_open_over_60d)
          IS DISTINCT FROM (x.readm, x.elig, x.readm30, x.prior12, x.open60);
    PERFORM etl.fn_log_step(p_batch, 'load fact_admission (accumulating snapshot)', 'dw.fact_admission', n_in, n_new, n_in - n_new, t0,
                            format('%s new spells, %s existing spells updated (milestones)', n_new - n_upd, n_upd));
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_ward_census(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n int;
BEGIN
    SELECT count(*) INTO n_in FROM stg.census_clean WHERE batch_id = p_batch;
    INSERT INTO dw.fact_ward_census_daily (census_date_key, care_unit_key, beds_complement, beds_closed, beds_available, occupied_beds,
                                           admissions, discharges, deaths, pas_occupied_beds, census_source, dw_batch_id)
    SELECT etl.fn_date_key(c.census_date), cu.care_unit_key, cu.bed_complement, least(c.beds_closed, cu.bed_complement),
           greatest(cu.bed_complement - c.beds_closed, 0), c.occupied_midnight, c.admissions, c.discharges, c.deaths,
           p.pas_occupied, c.census_source, p_batch
    FROM stg.census_clean c
    JOIN dw.dim_care_unit cu ON cu.unit_code = c.ward_code AND c.census_date BETWEEN cu.scd_effective_from AND cu.scd_effective_to
    LEFT JOIN stg.pas_ward_census p ON p.ward_code = c.ward_code AND p.census_date = c.census_date
    WHERE c.batch_id = p_batch
    ON CONFLICT (census_date_key, care_unit_key) DO UPDATE SET beds_complement = EXCLUDED.beds_complement,
        beds_closed = EXCLUDED.beds_closed, beds_available = EXCLUDED.beds_available, occupied_beds = EXCLUDED.occupied_beds,
        admissions = EXCLUDED.admissions, discharges = EXCLUDED.discharges, deaths = EXCLUDED.deaths,
        pas_occupied_beds = EXCLUDED.pas_occupied_beds, census_source = EXCLUDED.census_source, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- keep the PAS reference current for every ward-day (later PAS images can change past midnights)
    UPDATE dw.fact_ward_census_daily f SET pas_occupied_beds = p.pas_occupied
    FROM dw.dim_care_unit cu, stg.pas_ward_census p
    WHERE cu.care_unit_key = f.care_unit_key AND p.ward_code = cu.unit_code AND etl.fn_date_key(p.census_date) = f.census_date_key
      AND f.pas_occupied_beds IS DISTINCT FROM p.pas_occupied;
    PERFORM etl.fn_log_step(p_batch, 'load fact_ward_census_daily (periodic snapshot)', 'dw.fact_ward_census_daily', n_in, n, n_in - n, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_staff_roster(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n int;
BEGIN
    SELECT count(*) INTO n_in FROM stg.roster_clean WHERE batch_id = p_batch;
    INSERT INTO dw.fact_staff_roster (roster_date_key, care_unit_key, shift_key, planned_nurse_hours, rn_hours, en_hours, nurse_hours,
                                      doctor_hours, overtime_hours, agency_hours, sick_leave_hours, nurses_on_duty, doctors_on_duty, dw_batch_id)
    SELECT etl.fn_date_key(r.roster_date), cu.care_unit_key, sh.shift_key, r.planned_nurse_hours, r.rn_hours, r.en_hours,
           coalesce(r.rn_hours, 0) + coalesce(r.en_hours, 0), r.doctor_hours, r.overtime_hours, r.agency_hours, r.sick_leave_hours,
           r.nurses_on_duty, r.doctors_on_duty, p_batch
    FROM stg.roster_clean r
    JOIN dw.dim_care_unit cu ON cu.unit_code = r.unit_code AND r.roster_date BETWEEN cu.scd_effective_from AND cu.scd_effective_to
    JOIN dw.dim_shift sh ON sh.shift_code = r.shift_code
    WHERE r.batch_id = p_batch
    ON CONFLICT (roster_date_key, care_unit_key, shift_key) DO UPDATE SET planned_nurse_hours = EXCLUDED.planned_nurse_hours,
        rn_hours = EXCLUDED.rn_hours, en_hours = EXCLUDED.en_hours, nurse_hours = EXCLUDED.nurse_hours,
        doctor_hours = EXCLUDED.doctor_hours, overtime_hours = EXCLUDED.overtime_hours, agency_hours = EXCLUDED.agency_hours,
        sick_leave_hours = EXCLUDED.sick_leave_hours, nurses_on_duty = EXCLUDED.nurses_on_duty,
        doctors_on_duty = EXCLUDED.doctors_on_duty, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_staff_roster', 'dw.fact_staff_roster', n_in, n, n_in - n, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_surveillance(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n int; v_cut timestamp := etl.fn_batch_cutoff(p_batch);
BEGIN
    SELECT count(*) INTO n_in FROM stg.idsr_clean WHERE batch_id = p_batch;
    INSERT INTO dw.fact_surveillance_weekly (epi_week_date_key, facility_key, condition_key, cases_under5, cases_5plus, cases_total,
                                             deaths_under5, deaths_5plus, deaths_total, tests_done, tests_positive, report_version, dw_batch_id)
    SELECT etl.fn_date_key(s.epi_week_start), f.facility_key, c.condition_key, s.cases_under5, s.cases_5plus,
           CASE WHEN s.cases_under5 IS NULL AND s.cases_5plus IS NULL THEN NULL ELSE coalesce(s.cases_under5, 0) + coalesce(s.cases_5plus, 0) END,
           s.deaths_under5, s.deaths_5plus,
           CASE WHEN s.deaths_under5 IS NULL AND s.deaths_5plus IS NULL THEN NULL ELSE coalesce(s.deaths_under5, 0) + coalesce(s.deaths_5plus, 0) END,
           s.tests_done, s.tests_positive, s.report_version, p_batch
    FROM stg.idsr_clean s
    JOIN dw.dim_facility f ON f.facility_code = s.facility_code
    JOIN dw.dim_condition c ON c.condition_code = s.condition_code
    WHERE s.batch_id = p_batch
    ON CONFLICT (epi_week_date_key, facility_key, condition_key) DO UPDATE SET cases_under5 = EXCLUDED.cases_under5,
        cases_5plus = EXCLUDED.cases_5plus, cases_total = EXCLUDED.cases_total, deaths_under5 = EXCLUDED.deaths_under5,
        deaths_5plus = EXCLUDED.deaths_5plus, deaths_total = EXCLUDED.deaths_total, tests_done = EXCLUDED.tests_done,
        tests_positive = EXCLUDED.tests_positive, report_version = EXCLUDED.report_version, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;

    -- coverage fact: every facility x epi week whose report was due by the extract cut-off (rebuilt, idempotent)
    DELETE FROM dw.fact_idsr_report;
    INSERT INTO dw.fact_idsr_report (epi_week_date_key, facility_key, report_expected, report_received, report_on_time, hours_after_due,
                                     first_submitted_at, due_at, dw_batch_id)
    SELECT etl.fn_date_key(w.wk), f.facility_key, 1,
           (s.first_submitted_at IS NOT NULL AND s.first_submitted_at <= v_cut)::int,
           (s.first_submitted_at IS NOT NULL AND s.first_submitted_at <= v_cut AND s.first_submitted_at <= w.wk + interval '8 days 12 hours')::int,
           CASE WHEN s.first_submitted_at <= v_cut THEN round((extract(epoch FROM s.first_submitted_at - (w.wk + interval '8 days 12 hours')) / 3600)::numeric, 1) END,
           CASE WHEN s.first_submitted_at <= v_cut THEN s.first_submitted_at END,
           w.wk + interval '8 days 12 hours', p_batch
    FROM (SELECT g::date AS wk FROM generate_series(DATE '2022-01-03', v_cut::date, interval '7 days') g) w
    CROSS JOIN dw.dim_facility f
    LEFT JOIN stg.idsr_submission s ON s.facility_code = f.facility_code AND s.epi_week_start = w.wk
    WHERE f.facility_key > 0 AND w.wk + interval '8 days 12 hours' <= v_cut;
    PERFORM etl.fn_log_step(p_batch, 'load fact_surveillance_weekly + fact_idsr_report (coverage)', 'dw.fact_surveillance_weekly, dw.fact_idsr_report',
                            n_in, n, n_in - n, t0, format('%s expected reports in coverage fact', (SELECT count(*) FROM dw.fact_idsr_report)));
END $$;

-- Population: 2023 census counts (NSA) and derived mid-year estimates for the other years using the national
-- intercensal growth rate 2011-2023 (2011 census total 2,113,077 people; NSA, 2012)
CREATE OR REPLACE PROCEDURE etl.sp_load_fact_population(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); v_growth numeric;
BEGIN
    SELECT power(national_total::numeric / 2113077, 1.0 / 12) - 1 INTO v_growth FROM stg.nsa_control_total WHERE census_year = 2023;
    IF v_growth IS NULL THEN RETURN; END IF;
    DELETE FROM dw.fact_population;
    INSERT INTO dw.fact_population (year_date_key, region_key, population, is_census_count, population_source, dw_batch_id)
    SELECT (y * 10000 + 701), r.region_key, round(p.population * power(1 + v_growth, y - 2023))::int, y = 2023,
           CASE WHEN y = 2023 THEN 'NSA 2023 Population and Housing Census (preliminary)'
                ELSE format('Derived: 2023 census x (1 + %s%%)^(%s-2023)', round(v_growth * 100, 2), y) END, p_batch
    FROM stg.nsa_population_clean p
    JOIN dw.dim_region r ON r.region_code = p.region_code
    CROSS JOIN generate_series(2021, 2027) y;
    PERFORM etl.fn_log_step(p_batch, 'load fact_population (external, NSA)', 'dw.fact_population',
                            (SELECT count(*) FROM stg.nsa_population_clean), (SELECT count(*) FROM dw.fact_population), 0, t0,
                            format('national intercensal growth %s%% per year', round(v_growth * 100, 3)));
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_fact_weather(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n int;
BEGIN
    SELECT count(*) INTO n_in FROM stg.weather_clean WHERE batch_id = p_batch;
    INSERT INTO dw.fact_weather_daily (weather_date_key, facility_key, rainfall_mm, tmax_c, tmin_c, rh_pct, is_imputed, dw_batch_id)
    SELECT etl.fn_date_key(w.obs_date), f.facility_key, w.rainfall_mm, w.tmax_c, w.tmin_c, w.rh_pct, w.is_imputed, p_batch
    FROM stg.weather_clean w JOIN dw.dim_facility f ON f.facility_code = w.facility_code
    WHERE w.batch_id = p_batch AND w.obs_date >= DATE '2021-01-01'
    ON CONFLICT (weather_date_key, facility_key) DO UPDATE SET rainfall_mm = EXCLUDED.rainfall_mm, tmax_c = EXCLUDED.tmax_c,
        tmin_c = EXCLUDED.tmin_c, rh_pct = EXCLUDED.rh_pct, is_imputed = EXCLUDED.is_imputed, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_weather_daily (external, NASA POWER)', 'dw.fact_weather_daily', n_in, n, n_in - n, t0);
END $$;

-- ---------------------------------------------------------------------------
-- Orchestration: the same sequence serves the full load and every incremental delta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_run_load(p_batch integer)
LANGUAGE plpgsql AS $$
BEGIN
    CALL etl.sp_transform_master(p_batch);
    IF NOT EXISTS (SELECT 1 FROM dw.dim_date WHERE date_key > 0) THEN
        CALL etl.sp_load_dim_date(p_batch, DATE '2021-01-01', DATE '2027-12-31');
    ELSE
        UPDATE dw.dim_date SET is_after_cutoff = full_date > etl.fn_batch_cutoff(p_batch)::date WHERE full_date IS NOT NULL;
    END IF;
    CALL etl.sp_load_static_dims(p_batch);
    CALL etl.sp_load_dim_geography(p_batch);
    CALL etl.sp_load_dim_clinical(p_batch);
    CALL etl.sp_load_dim_care_unit_scd2(p_batch);
    CALL etl.sp_transform_patients(p_batch);
    CALL etl.sp_load_dim_patient_scd2(p_batch);
    CALL etl.sp_transform_encounters(p_batch);
    CALL etl.sp_transform_spells(p_batch);
    CALL etl.sp_add_inferred_patients(p_batch);
    CALL etl.sp_transform_census(p_batch);
    CALL etl.sp_transform_roster(p_batch);
    CALL etl.sp_transform_idsr(p_batch);
    CALL etl.sp_transform_external(p_batch);
    CALL etl.sp_load_fact_encounter(p_batch);
    CALL etl.sp_load_fact_admission(p_batch);
    CALL etl.sp_load_fact_ward_census(p_batch);
    CALL etl.sp_load_fact_staff_roster(p_batch);
    CALL etl.sp_load_fact_surveillance(p_batch);
    CALL etl.sp_load_fact_population(p_batch);
    CALL etl.sp_load_fact_weather(p_batch);
END $$;
