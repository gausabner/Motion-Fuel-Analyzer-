-- =============================================================================
-- 08_reconciliation.sql
-- RECONCILE: row counts, control totals, cross-source, referential, integrity and
-- completeness checks written to audit.recon_result after every batch (cumulative state).
-- PASS = within tolerance, WARN = explained difference that needs a steward's attention,
-- FAIL = load defect (the batch must not be published).
-- =============================================================================
CREATE OR REPLACE FUNCTION etl.fn_recon_add(p_batch integer, p_code text, p_name text, p_type text, p_src numeric, p_tgt numeric,
                                            p_tol numeric, p_warn_band numeric, p_expl text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    v_status := CASE WHEN abs(coalesce(p_tgt, 0) - coalesce(p_src, 0)) <= p_tol THEN 'PASS'
                     WHEN abs(coalesce(p_tgt, 0) - coalesce(p_src, 0)) <= p_warn_band THEN 'WARN'
                     ELSE 'FAIL' END;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, p_code, p_name, p_type, p_src, p_tgt, p_tol, v_status, p_expl);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_reconcile(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE
    v_cut timestamp := etl.fn_batch_cutoff(p_batch);
    a numeric; b numeric; c numeric; d numeric; v_txt text;
BEGIN
    -- R01 batch row count: every landed attendance row is either accepted or rejected with a logged reason
    SELECT count(*) INTO a FROM stg.encounter_raw WHERE batch_id = p_batch;
    SELECT count(*) INTO b FROM stg.encounter_clean WHERE batch_id = p_batch;
    SELECT count(*) INTO c FROM audit.dq_issue_log
    WHERE batch_id = p_batch AND (rule_code IN ('EN01', 'EN12') OR (rule_code = 'EN03' AND action_taken LIKE 'Unknown facility%'));
    PERFORM etl.fn_recon_add(p_batch, 'R01', 'Attendance rows landed = accepted + rejected (this batch)', 'ROW_COUNT', a, b + c, 0, 0,
                          format('%s accepted, %s rejected (EN01 duplicates, EN12 out-of-window, unknown facility)', b, c));
    -- R02 staging -> fact row count (cumulative)
    SELECT count(*) INTO a FROM stg.encounter_clean;
    SELECT count(*) INTO b FROM dw.fact_encounter;
    PERFORM etl.fn_recon_add(p_batch, 'R02', 'Attendances: clean staging = fact_encounter', 'ROW_COUNT', a, b, 0, 0, NULL);
    -- R03 control total of waiting time
    SELECT coalesce(sum(door_to_doctor_min), 0) INTO a FROM stg.encounter_clean;
    SELECT coalesce(sum(door_to_doctor_min), 0) INTO b FROM dw.fact_encounter;
    PERFORM etl.fn_recon_add(p_batch, 'R03', 'Control total: door-to-doctor minutes, staging vs fact', 'CONTROL_TOTAL', a, b, 0.5, 0.5, NULL);
    -- R04 spells (accumulating snapshot): one fact row per distinct spell
    SELECT count(*) INTO a FROM stg.spell_clean;
    SELECT count(*) INTO b FROM dw.fact_admission;
    PERFORM etl.fn_recon_add(p_batch, 'R04', 'Inpatient spells: distinct spells in staging = fact_admission', 'ROW_COUNT', a, b, 0, 0,
                          format('%s superseded CDC images rejected over all batches (AD01)', (SELECT count(*) FROM audit.dq_issue_log WHERE rule_code = 'AD01')));
    -- R05 control total of patient days (discharged spells)
    SELECT coalesce(sum(discharge_ts::date - admission_ts::date), 0) INTO a FROM stg.spell_clean WHERE discharge_ts IS NOT NULL;
    SELECT coalesce(sum(los_days), 0) INTO b FROM dw.fact_admission WHERE is_discharged = 1;
    PERFORM etl.fn_recon_add(p_batch, 'R05', 'Control total: length-of-stay days of discharged spells, staging vs fact', 'CONTROL_TOTAL', a, b, 0, 0, NULL);
    -- R06 cross-source: ED dispositions "admitted" vs emergency spells linked to an ED attendance
    SELECT count(*) INTO a FROM dw.fact_encounter WHERE is_admitted = 1;
    SELECT count(*) INTO b FROM dw.fact_admission f JOIN dw.fact_encounter e ON e.encounter_id = f.ed_encounter_id WHERE e.is_admitted = 1;
    PERFORM etl.fn_recon_add(p_batch, 'R06', 'Cross-source: ED attendances admitted = spells linked to them', 'CROSS_SOURCE', a, b,
                          round(a * 0.001), round(a * 0.01),
                          'Differences = admissions recorded in the ED but missing (or not yet exported) in the inpatient spell extract');
    -- R07 cross-source: nurse-reported occupied bed-days vs PAS-derived midnight census
    SELECT coalesce(sum(occupied_beds), 0), coalesce(sum(pas_occupied_beds), 0) INTO a, b FROM dw.fact_ward_census_daily;
    SELECT count(*) INTO c FROM dw.fact_admission WHERE is_open_over_60d = 1;
    PERFORM etl.fn_recon_add(p_batch, 'R07', 'Cross-source: occupied bed-days, ward returns vs PAS spells', 'CROSS_SOURCE', a, b,
                          round(a * 0.005), round(a * 0.05),
                          format('PAS exceeds the ward returns by %s bed-days; %s spells are still open > 60 days in PAS (AD06, probable missing discharges)',
                                 b - a, c));
    -- R08 cross-source: IDSR malaria cases vs PAS attendances coded B50-B54 (weeks with a received report)
    SELECT coalesce(sum(s.cases_total), 0) INTO b
    FROM dw.fact_surveillance_weekly s JOIN dw.dim_condition c2 ON c2.condition_key = s.condition_key WHERE c2.condition_code = 'MAL';
    SELECT count(*) INTO a
    FROM dw.fact_encounter e
    JOIN dw.dim_diagnosis dx ON dx.diagnosis_key = e.diagnosis_key
    JOIN dw.dim_condition c3 ON c3.condition_key = dx.condition_key AND c3.condition_code = 'MAL'
    JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
    JOIN dw.dim_date dd ON dd.date_key = e.arrival_date_key
    JOIN dw.fact_idsr_report r ON r.facility_key = cu.facility_key AND r.epi_week_date_key = etl.fn_date_key(dd.epi_week_start)
                                AND r.report_received = 1;
    PERFORM etl.fn_recon_add(p_batch, 'R08', 'Cross-source: malaria cases, IDSR returns vs PAS attendances (B50-B54)', 'CROSS_SOURCE', a, b,
                          round(a * 0.01), round(a * 0.05),
                          format('IDSR / PAS = %s%%: transcription differences on the weekly forms (rows corrected under SV06 are already fixed)',
                                 round(100.0 * b / nullif(a, 0), 1)));
    -- R09 external control total: regions add up to the NSA national total
    SELECT national_total INTO a FROM stg.nsa_control_total WHERE census_year = 2023;
    SELECT sum(population) INTO b FROM dw.fact_population WHERE year_date_key = 20230701;
    PERFORM etl.fn_recon_add(p_batch, 'R09', 'Control total: 14 regions = NSA national total (2023 census)', 'CONTROL_TOTAL', a, b, 0, 0, NULL);
    -- R10 / R11 SCD2 integrity: no overlaps or gaps, exactly one current version per natural key
    SELECT count(*) INTO a FROM (
        SELECT patient_pseudo_id, scd_effective_from, scd_effective_to, scd_is_current,
               lead(scd_effective_from) OVER (PARTITION BY patient_pseudo_id ORDER BY scd_effective_from) AS nxt
        FROM dw.dim_patient WHERE patient_key > 0) x
    WHERE (nxt IS NOT NULL AND nxt <> scd_effective_to + 1) OR (nxt IS NULL AND (NOT scd_is_current OR scd_effective_to <> DATE '9999-12-31'));
    SELECT count(*) INTO b FROM (SELECT patient_pseudo_id FROM dw.dim_patient GROUP BY 1 HAVING count(*) FILTER (WHERE scd_is_current) <> 1) y;
    PERFORM etl.fn_recon_add(p_batch, 'R10', 'SCD2 integrity dim_patient: gaps/overlaps + keys without exactly one current version', 'INTEGRITY', 0, a + b, 0, 0,
                          format('%s versions for %s patients', (SELECT count(*) FROM dw.dim_patient WHERE patient_key > 0),
                                 (SELECT count(DISTINCT patient_pseudo_id) FROM dw.dim_patient WHERE patient_key > 0)));
    SELECT count(*) INTO a FROM (
        SELECT unit_code, scd_effective_from, scd_effective_to, scd_is_current,
               lead(scd_effective_from) OVER (PARTITION BY unit_code ORDER BY scd_effective_from) AS nxt
        FROM dw.dim_care_unit WHERE care_unit_key > 0) x
    WHERE (nxt IS NOT NULL AND nxt <> scd_effective_to + 1) OR (nxt IS NULL AND (NOT scd_is_current OR scd_effective_to <> DATE '9999-12-31'));
    SELECT count(*) INTO b FROM (SELECT unit_code FROM dw.dim_care_unit GROUP BY 1 HAVING count(*) FILTER (WHERE scd_is_current) <> 1) y;
    PERFORM etl.fn_recon_add(p_batch, 'R11', 'SCD2 integrity dim_care_unit: gaps/overlaps + keys without exactly one current version', 'INTEGRITY', 0, a + b, 0, 0,
                          format('%s versions for %s units', (SELECT count(*) FROM dw.dim_care_unit WHERE care_unit_key > 0),
                                 (SELECT count(DISTINCT unit_code) FROM dw.dim_care_unit WHERE care_unit_key > 0)));
    -- R12 referential: facts on Unknown members are exactly the logged DQ cases
    SELECT count(*) INTO a FROM audit.dq_issue_log WHERE rule_code = 'EN11';
    SELECT count(*) INTO b FROM dw.fact_encounter WHERE patient_key = -1;
    PERFORM etl.fn_recon_add(p_batch, 'R12', 'Referential: attendances on patient -1 = unidentified patients logged (EN11)', 'REFERENTIAL', a, b, 0, 0, NULL);
    SELECT count(*) INTO a FROM audit.dq_issue_log WHERE rule_code = 'EN08';
    SELECT count(*) INTO b FROM dw.fact_encounter WHERE diagnosis_key = -1;
    PERFORM etl.fn_recon_add(p_batch, 'R13', 'Referential: attendances on diagnosis -1 = invalid/missing codes logged (EN08)', 'REFERENTIAL', a, b, 0, 0, NULL);
    SELECT (SELECT count(*) FROM dw.fact_encounter WHERE care_unit_key = -1) + (SELECT count(*) FROM dw.fact_admission WHERE care_unit_key = -1)
         + (SELECT count(*) FROM dw.fact_admission WHERE patient_key = -1) INTO b;
    PERFORM etl.fn_recon_add(p_batch, 'R14', 'Referential: facts without a care unit or (spells) without a patient', 'REFERENTIAL', 0, b, 0, 0, NULL);
    -- R15 completeness of the date dimension
    SELECT (DATE '2027-12-31' - DATE '2021-01-01') + 1 INTO a;
    SELECT count(*) INTO b FROM dw.dim_date WHERE date_key > 0;
    PERFORM etl.fn_recon_add(p_batch, 'R15', 'Completeness: dim_date has every day 2021-01-01..2027-12-31', 'COMPLETENESS', a, b, 0, 0, NULL);
    -- R16 completeness of the ward census periodic snapshot
    SELECT (SELECT count(*) FROM stg.md_unit_clean WHERE unit_type = 'Inpatient ward') * ((v_cut::date - DATE '2022-01-01') + 1) INTO a;
    SELECT count(*) INTO b FROM dw.fact_ward_census_daily;
    SELECT count(*) INTO c FROM dw.fact_ward_census_daily WHERE census_source = 'Imputed from PAS';
    PERFORM etl.fn_recon_add(p_batch, 'R16', 'Completeness: one census row per ward per day', 'COMPLETENESS', a, b, 0, 0,
                          format('%s ward-days imputed from PAS (WC01, WC02, WC04)', c));
    -- R17 completeness of the weather series (no fill values left)
    SELECT 10 * ((least(v_cut::date, DATE '2026-09-30') - DATE '2021-09-01') + 1) INTO a;
    SELECT count(*) INTO b FROM dw.fact_weather_daily WHERE weather_date_key >= 20210901;
    SELECT count(*) INTO c FROM dw.fact_weather_daily WHERE tmax_c IS NULL OR tmin_c IS NULL OR rh_pct IS NULL;
    PERFORM etl.fn_recon_add(p_batch, 'R17', 'Completeness: weather one row per facility per day, no temperature gaps', 'COMPLETENESS', a, b + c, 0, 0,
                          format('%s facility-days imputed (WE01/WE02)', (SELECT count(*) FROM dw.fact_weather_daily WHERE is_imputed)));
    -- R18 IDSR coverage: expected reports = facilities x weeks due by the cut-off
    SELECT count(*) * (SELECT count(*) FROM generate_series(DATE '2022-01-03', v_cut::date, interval '7 days') g
                       WHERE g + interval '8 days 12 hours' <= v_cut)
    INTO a FROM dw.dim_facility WHERE facility_key > 0;
    SELECT count(*), sum(report_received), sum(report_on_time) INTO b, c, d FROM dw.fact_idsr_report;
    PERFORM etl.fn_recon_add(p_batch, 'R18', 'Completeness: IDSR coverage fact = facilities x due epi weeks', 'COMPLETENESS', a, b, 0, 0,
                          format('completeness %s%%, timeliness %s%%', round(100 * c / nullif(b, 0), 1), round(100 * d / nullif(b, 0), 1)));
    -- R19 accumulating-snapshot integrity
    SELECT count(*) INTO b FROM dw.fact_admission
    WHERE (discharge_ts IS NOT NULL AND discharge_ts < admission_ts) OR los_days < 0
       OR (is_discharged = 1 AND discharge_date_key = -2) OR (is_discharged = 0 AND discharge_date_key <> -2);
    PERFORM etl.fn_recon_add(p_batch, 'R19', 'Integrity: spells discharged after admission, milestone keys consistent', 'INTEGRITY', 0, b, 0, 0,
                          format('%s spells still in hospital at the cut-off', (SELECT count(*) FROM dw.fact_admission WHERE is_discharged = 0)));
    -- R20 control total of nursing hours
    SELECT coalesce(sum(coalesce(rn_hours, 0) + coalesce(en_hours, 0)), 0) INTO a FROM stg.roster_clean;
    SELECT coalesce(sum(nurse_hours), 0) INTO b FROM dw.fact_staff_roster;
    PERFORM etl.fn_recon_add(p_batch, 'R20', 'Control total: nursing hours worked, staging vs fact', 'CONTROL_TOTAL', a, b, 0.5, 0.5, NULL);
    -- R21 presentation layer = warehouse (what Power BI imports equals the facts)
    SELECT count(*) INTO a FROM dw.fact_encounter;
    SELECT count(*) INTO b FROM mart.v_fact_encounter;
    PERFORM etl.fn_recon_add(p_batch, 'R21', 'Mart view v_fact_encounter = dw.fact_encounter', 'ROW_COUNT', a, b, 0, 0, NULL);
    -- R22 plausibility: occupancy never above 200% of available beds
    SELECT count(*) INTO b FROM dw.fact_ward_census_daily WHERE occupied_beds > 2 * greatest(beds_available, 1);
    SELECT count(*) INTO c FROM dw.fact_ward_census_daily;
    PERFORM etl.fn_recon_add(p_batch, 'R22', 'Plausibility: ward-days above 200% occupancy (WARN up to 0.5% of ward-days)', 'PLAUSIBILITY', 0, b, 0, round(c * 0.005),
                          format('%s ward-days above 100%% (overflow beds) are plausible and kept',
                                 (SELECT count(*) FROM dw.fact_ward_census_daily WHERE occupied_beds > beds_available)));
END $$;
