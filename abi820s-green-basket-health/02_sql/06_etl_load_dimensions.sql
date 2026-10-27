-- =============================================================================
-- 06_etl_load_dimensions.sql
-- Dimension load procedures. Type 1 dimensions are upserted (corrections overwrite).
-- dim_care_unit and dim_patient are SCD Type 2:
--   * history is rebuilt by replaying the change logs (Unit_History sheet, PAS patient audit trail);
--   * a version is created only when the MD5 hash of the Type 2 attributes changes, so re-running
--     a batch never creates duplicates (idempotent);
--   * late-arriving patients referenced by facts become inferred members (EN10) and are completed
--     in place when their patient-index record arrives (Kimball inferred-member rule).
-- Surrogate keys: smart key YYYYMMDD for dates, sequence-style integers elsewhere,
-- -1 = Unknown, -2 = Not applicable.
-- =============================================================================

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_date(p_batch integer, p_start date, p_end date)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); v_cut date := etl.fn_batch_cutoff(p_batch)::date;
BEGIN
    INSERT INTO dw.dim_date (date_key, day_name, day_short, month_name, month_short, year_month, year_quarter, epi_week_label,
                             fiscal_year_label, fiscal_quarter_label, rainy_season_label, is_weekend, is_public_holiday,
                             is_working_day, is_malaria_season, is_after_cutoff)
    VALUES (-1, 'Unknown', 'N/A', 'Unknown', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', false, false, false, false, false),
           (-2, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', false, false, false, false, false)
    ON CONFLICT (date_key) DO NOTHING;
    INSERT INTO dw.dim_date (date_key, full_date, day_of_month, day_of_year, day_of_week_iso, day_name, day_short, is_weekend,
                             is_public_holiday, holiday_name, is_working_day, epi_year, epi_week, epi_week_label, epi_week_key,
                             epi_week_start, month_num, month_name, month_short, year_month, year_month_key, month_start_date,
                             month_end_date, quarter_num, year_quarter, calendar_year, fiscal_year_label, fiscal_year_start,
                             fiscal_quarter_label, rainy_season_label, is_malaria_season, is_after_cutoff)
    SELECT to_char(d, 'YYYYMMDD')::int, d, extract(day FROM d), extract(doy FROM d), extract(isodow FROM d),
           to_char(d, 'FMDay'), to_char(d, 'Dy'), extract(isodow FROM d) IN (6, 7),
           h.name IS NOT NULL, h.name, extract(isodow FROM d) <> 7 AND h.name IS NULL,
           to_char(d, 'IYYY')::int, to_char(d, 'IW')::int, to_char(d, 'IYYY-"W"IW'), to_char(d, 'IYYYIW')::int,
           date_trunc('week', d)::date,
           extract(month FROM d), to_char(d, 'FMMonth'), to_char(d, 'Mon'), to_char(d, 'YYYY-MM'), to_char(d, 'YYYYMM')::int,
           date_trunc('month', d)::date, (date_trunc('month', d) + interval '1 month - 1 day')::date,
           extract(quarter FROM d), to_char(d, 'YYYY-"Q"Q'), extract(year FROM d),
           'FY' || fy.y || '/' || right((fy.y + 1)::text, 2), fy.y,
           'FY' || fy.y || '/' || right((fy.y + 1)::text, 2) || '-Q' || (((extract(month FROM d)::int + 8) % 12) / 3 + 1),
           rs.y || '/' || right((rs.y + 1)::text, 2), extract(month FROM d) BETWEEN 1 AND 5,
           d > coalesce(v_cut, DATE '9999-12-31')
    FROM generate_series(p_start, p_end, interval '1 day') AS g(ts)
    CROSS JOIN LATERAL (SELECT g.ts::date AS d) x
    CROSS JOIN LATERAL (SELECT CASE WHEN extract(month FROM x.d) >= 4 THEN extract(year FROM x.d)::int ELSE extract(year FROM x.d)::int - 1 END AS y) fy
    CROSS JOIN LATERAL (SELECT CASE WHEN extract(month FROM x.d) >= 7 THEN extract(year FROM x.d)::int ELSE extract(year FROM x.d)::int - 1 END AS y) rs
    CROSS JOIN LATERAL (SELECT etl.fn_namibian_holiday(x.d) AS name) h
    ON CONFLICT (date_key) DO NOTHING;
    UPDATE dw.dim_date SET is_after_cutoff = full_date > v_cut WHERE full_date IS NOT NULL AND is_after_cutoff IS DISTINCT FROM (full_date > v_cut);
    PERFORM etl.fn_log_step(p_batch, 'load dim_date', 'dw.dim_date', NULL, (SELECT count(*) FROM dw.dim_date), 0, t0);
END $$;

-- Static and small dimensions (hour, age band, shift, triage, junk dimensions)
CREATE OR REPLACE PROCEDURE etl.sp_load_static_dims(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    INSERT INTO dw.dim_hour (hour_key, hour_label, hour_band, hour_band_sort, shift_code, shift_name, is_after_hours)
    SELECT h, lpad(h::text, 2, '0') || ':00',
           CASE WHEN h < 7 THEN 'Night 00-06' WHEN h < 12 THEN 'Morning 07-11' WHEN h < 17 THEN 'Afternoon 12-16' ELSE 'Evening 17-23' END,
           CASE WHEN h < 7 THEN 1 WHEN h < 12 THEN 2 WHEN h < 17 THEN 3 ELSE 4 END,
           CASE WHEN h BETWEEN 7 AND 18 THEN 'D' ELSE 'N' END, CASE WHEN h BETWEEN 7 AND 18 THEN 'Day' ELSE 'Night' END,
           h < 8 OR h >= 17
    FROM generate_series(0, 23) h
    ON CONFLICT (hour_key) DO NOTHING;

    INSERT INTO dw.dim_age_band (age_band_key, age_band, age_from, age_to, idsr_age_group, life_stage) VALUES
        (-1, 'Unknown', NULL, NULL, 'Unknown', 'Unknown'), (1, '0-4', 0, 4, 'Under 5', 'Child'), (2, '5-14', 5, 14, '5 and over', 'Child'),
        (3, '15-24', 15, 24, '5 and over', 'Adult'), (4, '25-44', 25, 44, '5 and over', 'Adult'), (5, '45-64', 45, 64, '5 and over', 'Adult'),
        (6, '65+', 65, NULL, '5 and over', 'Older adult')
    ON CONFLICT (age_band_key) DO NOTHING;

    INSERT INTO dw.dim_shift (shift_key, shift_code, shift_name, start_time, end_time, shift_hours) VALUES
        (1, 'D', 'Day', TIME '07:00', TIME '19:00', 12.0), (2, 'N', 'Night', TIME '19:00', TIME '07:00', 12.0)
    ON CONFLICT (shift_key) DO NOTHING;

    INSERT INTO dw.dim_triage (triage_key, triage_code, triage_label, priority, target_minutes, compliance_minutes, target_text, colour_hex)
    VALUES (-1, 'UNK', 'Not recorded', 99, NULL, NULL, 'Not applicable', '#9E9E9E')
    ON CONFLICT (triage_key) DO NOTHING;
    INSERT INTO dw.dim_triage (triage_key, triage_code, triage_label, priority, target_minutes, compliance_minutes, target_text, colour_hex)
    SELECT priority, triage_code, triage_label, priority, target_minutes,
           CASE WHEN target_minutes = 0 THEN 5 ELSE target_minutes END, target_text, colour_hex
    FROM stg.md_triage_clean
    ON CONFLICT (triage_key) DO UPDATE SET triage_label = EXCLUDED.triage_label, target_minutes = EXCLUDED.target_minutes,
        compliance_minutes = EXCLUDED.compliance_minutes, target_text = EXCLUDED.target_text, colour_hex = EXCLUDED.colour_hex;

    -- junk dimension 1: department x arrival mode x disposition (Cartesian product, stable keys)
    INSERT INTO dw.dim_encounter_profile (encounter_profile_key, department_code, department_name, arrival_mode_code,
                                          arrival_mode_name, disposition_code, disposition_name, disposition_group)
    SELECT row_number() OVER (ORDER BY d.s, a.s, x.s), d.c, d.n, a.c, a.n, x.c, x.n, x.g
    FROM (VALUES (1, 'ED', 'Emergency department'), (2, 'OPD', 'Clinic outpatient')) d(s, c, n)
    CROSS JOIN (VALUES (1, 'WALK', 'Walk-in / own transport'), (2, 'AMB', 'Ambulance'), (3, 'REF', 'Referral from another facility'),
                       (4, 'UNK', 'Unknown')) a(s, c, n)
    CROSS JOIN (VALUES (1, 'DIS', 'Discharged home', 'Discharged'), (2, 'ADM', 'Admitted to a ward', 'Admitted or transferred'),
                       (3, 'TRF', 'Transferred to another facility', 'Admitted or transferred'),
                       (4, 'REF', 'Referred to hospital', 'Referred to hospital'),
                       (5, 'LWBS', 'Left without being seen', 'Left without being seen'),
                       (6, 'DIED', 'Died in the department', 'Died'), (7, 'UNK', 'Unknown', 'Unknown')) x(s, c, n, g)
    ON CONFLICT (encounter_profile_key) DO NOTHING;

    -- junk dimension 2: admission method x discharge status
    INSERT INTO dw.dim_admission_profile (admission_profile_key, admission_method_code, admission_method_name, is_emergency,
                                          discharge_status_code, discharge_status_name)
    SELECT row_number() OVER (ORDER BY m.s, x.s), m.c, m.n, m.e, x.c, x.n
    FROM (VALUES (1, 'EMER-ED', 'Emergency admission via the emergency department', true),
                 (2, 'EMER-DIRECT', 'Emergency admission direct to a ward', true),
                 (3, 'TRANSFER-IN', 'Transfer in from another hospital', true),
                 (4, 'ELECTIVE', 'Elective (planned) admission', false), (5, 'MATERNITY', 'Maternity admission (labour ward)', false),
                 (6, 'UNK', 'Unknown', false)) m(s, c, n, e)
    CROSS JOIN (VALUES (1, 'HOME', 'Discharged home'), (2, 'TRANSFER', 'Transferred out'), (3, 'DIED', 'Died in hospital'),
                       (4, 'AMA', 'Left against medical advice / absconded'), (5, 'IN', 'Still in hospital (not yet discharged)'),
                       (6, 'UNK', 'Unknown')) x(s, c, n)
    ON CONFLICT (admission_profile_key) DO NOTHING;
    PERFORM etl.fn_log_step(p_batch, 'load static dimensions', 'dw.dim_hour/age_band/shift/triage/*_profile', NULL,
                            (SELECT count(*) FROM dw.dim_encounter_profile) + (SELECT count(*) FROM dw.dim_admission_profile), 0, t0);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_geography(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_t1 int;
BEGIN
    INSERT INTO dw.dim_region (region_key, region_code, region_name, zone, malaria_stratum)
    VALUES (-1, 'UNK', 'Unknown', 'Unknown', 'Unknown') ON CONFLICT (region_key) DO NOTHING;
    UPDATE dw.dim_region d SET region_name = r.region_name, zone = r.zone, malaria_stratum = r.malaria_stratum, dw_updated_at = now()
    FROM stg.md_region_clean r
    WHERE d.region_code = r.region_code AND (d.region_name, d.zone, d.malaria_stratum) IS DISTINCT FROM (r.region_name, r.zone, r.malaria_stratum);
    INSERT INTO dw.dim_region (region_key, region_code, region_name, zone, malaria_stratum)
    SELECT (SELECT greatest(coalesce(max(region_key), 0), 0) FROM dw.dim_region) + row_number() OVER (ORDER BY r.region_code),
           r.region_code, r.region_name, r.zone, r.malaria_stratum
    FROM stg.md_region_clean r WHERE NOT EXISTS (SELECT 1 FROM dw.dim_region d WHERE d.region_code = r.region_code);

    INSERT INTO dw.dim_facility (facility_key, facility_code, facility_name, facility_short_name, facility_type, region_key)
    VALUES (-1, 'UNKNOWN', 'Unknown facility', 'Unknown', 'Unknown', -1) ON CONFLICT (facility_key) DO NOTHING;
    UPDATE dw.dim_facility d
    SET facility_name = f.facility_name, facility_short_name = coalesce((regexp_match(f.town, '\(([^)]+)\)'))[1], f.town),
        facility_type = f.facility_type, region_key = coalesce(r.region_key, -1), town = f.town, latitude = f.latitude,
        longitude = f.longitude, elevation_m = f.elevation_m, has_emergency_department = f.has_emergency_department,
        catchment_share = f.catchment_share, opened_date = f.opened_date, ownership = f.ownership, dw_updated_at = now()
    FROM stg.md_facility_clean f LEFT JOIN dw.dim_region r ON r.region_code = f.region_code
    WHERE d.facility_code = f.facility_code
      AND (d.facility_name, d.facility_type, d.region_key, d.town, d.catchment_share)
          IS DISTINCT FROM (f.facility_name, f.facility_type, coalesce(r.region_key, -1), f.town, f.catchment_share);
    GET DIAGNOSTICS n_t1 = ROW_COUNT;
    INSERT INTO dw.dim_facility (facility_key, facility_code, facility_name, facility_short_name, facility_type, region_key, town,
                                 latitude, longitude, elevation_m, has_emergency_department, catchment_share, opened_date, ownership)
    SELECT (SELECT greatest(coalesce(max(facility_key), 0), 0) FROM dw.dim_facility) + row_number() OVER (ORDER BY f.facility_code),
           f.facility_code, f.facility_name, coalesce((regexp_match(f.town, '\(([^)]+)\)'))[1], f.town), f.facility_type,
           coalesce(r.region_key, -1), f.town, f.latitude, f.longitude, f.elevation_m, f.has_emergency_department,
           f.catchment_share, f.opened_date, f.ownership
    FROM stg.md_facility_clean f LEFT JOIN dw.dim_region r ON r.region_code = f.region_code
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_facility d WHERE d.facility_code = f.facility_code);
    PERFORM etl.fn_log_step(p_batch, 'load dim_region / dim_facility (Type 1)', 'dw.dim_region, dw.dim_facility',
                            (SELECT count(*) FROM stg.md_facility_clean), (SELECT count(*) FROM dw.dim_facility), 0, t0,
                            format('%s facility rows updated in place (Type 1)', n_t1));
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_clinical(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    INSERT INTO dw.dim_condition (condition_key, condition_code, condition_name, idsr_category, notification, alert_threshold, icd10_codes, is_notifiable)
    VALUES (-1, 'UNK', 'Unknown', 'Unknown', NULL, NULL, NULL, false),
           (-2, 'N/A', 'Not a notifiable condition', 'Not notifiable', NULL, NULL, NULL, false)
    ON CONFLICT (condition_key) DO NOTHING;
    UPDATE dw.dim_condition d SET condition_name = c.condition_name, idsr_category = c.idsr_category, notification = c.notification,
                                  alert_threshold = c.alert_threshold, icd10_codes = c.icd10_codes
    FROM stg.md_condition_clean c WHERE d.condition_code = c.condition_code;
    INSERT INTO dw.dim_condition (condition_key, condition_code, condition_name, idsr_category, notification, alert_threshold, icd10_codes)
    SELECT (SELECT greatest(coalesce(max(condition_key), 0), 0) FROM dw.dim_condition) + row_number() OVER (ORDER BY c.condition_code),
           c.condition_code, c.condition_name, c.idsr_category, c.notification, c.alert_threshold, c.icd10_codes
    FROM stg.md_condition_clean c WHERE NOT EXISTS (SELECT 1 FROM dw.dim_condition d WHERE d.condition_code = c.condition_code);

    INSERT INTO dw.dim_diagnosis (diagnosis_key, icd10_code, icd10_category, icd10_title, block_range, block_title, chapter_code,
                                  chapter_number, chapter_range, chapter_title, severity_class, default_specialty, is_chronic, condition_key)
    VALUES (-1, 'UNK', 'UNK', 'Unknown / not coded', 'Unknown', 'Unknown', 'UNK', 99, 'Unknown', 'Unknown / not coded',
            'unknown', 'Unknown', false, -1)
    ON CONFLICT (diagnosis_key) DO NOTHING;
    INSERT INTO dw.dim_diagnosis (diagnosis_key, icd10_code, icd10_category, icd10_title, block_range, block_title, chapter_code,
                                  chapter_number, chapter_range, chapter_title, severity_class, default_specialty, is_chronic, condition_key)
    SELECT coalesce(d.diagnosis_key, (SELECT greatest(coalesce(max(diagnosis_key), 0), 0) FROM dw.dim_diagnosis)
                                     + row_number() OVER (PARTITION BY d.diagnosis_key IS NULL ORDER BY i.icd10_code)),
           i.icd10_code, left(i.icd10_code, 3), i.icd10_title, i.block_range, i.block_title, i.chapter,
           array_position(ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII',
                                'XVIII','XIX','XX','XXI','XXII'], i.chapter),
           i.chapter_range, i.chapter_title, i.severity_class, i.default_specialty, i.is_chronic, coalesce(c.condition_key, -2)
    FROM stg.md_icd_clean i
    LEFT JOIN dw.dim_condition c ON c.condition_code = i.condition_code
    LEFT JOIN dw.dim_diagnosis d ON d.icd10_code = i.icd10_code
    ON CONFLICT (diagnosis_key) DO UPDATE SET icd10_title = EXCLUDED.icd10_title, block_range = EXCLUDED.block_range,
        block_title = EXCLUDED.block_title, chapter_code = EXCLUDED.chapter_code, chapter_number = EXCLUDED.chapter_number,
        chapter_range = EXCLUDED.chapter_range, chapter_title = EXCLUDED.chapter_title, severity_class = EXCLUDED.severity_class,
        default_specialty = EXCLUDED.default_specialty, is_chronic = EXCLUDED.is_chronic, condition_key = EXCLUDED.condition_key;
    PERFORM etl.fn_log_step(p_batch, 'load dim_condition / dim_diagnosis (snowflake)', 'dw.dim_condition, dw.dim_diagnosis',
                            (SELECT count(*) FROM stg.md_icd_clean), (SELECT count(*) FROM dw.dim_diagnosis), 0, t0);
END $$;

-- ---------------------------------------------------------------------------
-- dim_care_unit : SCD Type 2 (specialty, bed_complement); Type 1 (name, type, facility)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_load_dim_care_unit_scd2(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE
    t0 timestamptz := clock_timestamp(); ev record; cur dw.dim_care_unit%ROWTYPE; src stg.md_unit_clean%ROWTYPE;
    v_spec text; v_beds text; v_hash text; n_initial int := 0; n_versions int := 0; n_t1 int := 0;
BEGIN
    INSERT INTO dw.dim_care_unit (care_unit_key, unit_code, unit_name, unit_type, facility_key, specialty, bed_complement,
                                  scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    VALUES (-1, 'UNKNOWN', 'Unknown unit', 'Unknown', -1, 'Unknown', 0, DATE '1900-01-01', true, 1, md5('unknown'), p_batch)
    ON CONFLICT (care_unit_key) DO NOTHING;

    -- 1) first version (state as at 1900-01-01) for units not yet in the dimension
    INSERT INTO dw.dim_care_unit (care_unit_key, unit_code, unit_name, unit_type, facility_key, specialty, bed_complement,
                                  scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    SELECT (SELECT greatest(coalesce(max(care_unit_key), 0), 0) FROM dw.dim_care_unit) + row_number() OVER (ORDER BY u.unit_code),
           u.unit_code, u.unit_name, u.unit_type, coalesce(f.facility_key, -1), a.spec, a.beds::smallint,
           DATE '1900-01-01', true, 1, md5(concat_ws('|', a.spec, a.beds)), p_batch
    FROM stg.md_unit_clean u
    LEFT JOIN dw.dim_facility f ON f.facility_code = u.facility_code
    CROSS JOIN LATERAL (SELECT etl.fn_unit_attr_asof(u.unit_code, 'specialty', DATE '1900-01-01', u.specialty) AS spec,
                               etl.fn_unit_attr_asof(u.unit_code, 'bed_complement', DATE '1900-01-01', u.bed_complement::text) AS beds) a
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_care_unit d WHERE d.unit_code = u.unit_code);
    GET DIAGNOSTICS n_initial = ROW_COUNT;

    -- 2) replay Type 2 change events in date order (one new version per unit per effective date)
    FOR ev IN
        SELECT unit_code, effective_date FROM stg.md_unit_history_clean
        WHERE attribute IN ('specialty', 'bed_complement')
        GROUP BY unit_code, effective_date ORDER BY effective_date, unit_code
    LOOP
        SELECT * INTO cur FROM dw.dim_care_unit WHERE unit_code = ev.unit_code AND scd_is_current;
        CONTINUE WHEN NOT FOUND OR ev.effective_date <= cur.scd_effective_from;
        SELECT * INTO src FROM stg.md_unit_clean WHERE unit_code = ev.unit_code;
        v_spec := etl.fn_unit_attr_asof(ev.unit_code, 'specialty', ev.effective_date, src.specialty);
        v_beds := etl.fn_unit_attr_asof(ev.unit_code, 'bed_complement', ev.effective_date, src.bed_complement::text);
        v_hash := md5(concat_ws('|', v_spec, v_beds));
        CONTINUE WHEN v_hash = cur.scd_row_hash;
        UPDATE dw.dim_care_unit SET scd_effective_to = ev.effective_date - 1, scd_is_current = false, dw_batch_id = p_batch, dw_updated_at = now()
        WHERE care_unit_key = cur.care_unit_key;
        INSERT INTO dw.dim_care_unit (care_unit_key, unit_code, unit_name, unit_type, facility_key, specialty, bed_complement,
                                      scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
        VALUES ((SELECT max(care_unit_key) + 1 FROM dw.dim_care_unit), cur.unit_code, cur.unit_name, cur.unit_type, cur.facility_key,
                v_spec, v_beds::smallint, ev.effective_date, true, cur.scd_version + 1, v_hash, p_batch);
        n_versions := n_versions + 1;
    END LOOP;

    -- 3) Type 1 attributes overwrite every version
    UPDATE dw.dim_care_unit d SET unit_name = u.unit_name, unit_type = u.unit_type, facility_key = coalesce(f.facility_key, -1), dw_updated_at = now()
    FROM stg.md_unit_clean u LEFT JOIN dw.dim_facility f ON f.facility_code = u.facility_code
    WHERE d.unit_code = u.unit_code AND (d.unit_name, d.unit_type, d.facility_key) IS DISTINCT FROM (u.unit_name, u.unit_type, coalesce(f.facility_key, -1));
    GET DIAGNOSTICS n_t1 = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load dim_care_unit (SCD2)', 'dw.dim_care_unit', (SELECT count(*) FROM stg.md_unit_clean),
                            (SELECT count(*) FROM dw.dim_care_unit), 0, t0,
                            format('%s initial rows, %s new versions, %s Type 1 updates', n_initial, n_versions, n_t1));
END $$;

-- ---------------------------------------------------------------------------
-- dim_patient : SCD Type 2 (residence region, payer class) + inferred members
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_load_dim_patient_scd2(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE
    t0 timestamptz := clock_timestamp(); ev record; cur dw.dim_patient%ROWTYPE; src stg.patient_clean%ROWTYPE;
    v_reg text; v_pay text; v_hash text; n_inferred_fixed int := 0; n_initial int := 0; n_versions int := 0;
BEGIN
    INSERT INTO dw.dim_patient (patient_key, patient_pseudo_id, sex, residence_region_code, residence_region_name, payer_code,
                                payer_name, payer_group, scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    VALUES (-1, 'UNKNOWN', 'U', 'UNK', 'Unknown', 'UNK', 'Unknown', 'Unknown', DATE '1900-01-01', true, 1, md5('unknown'), p_batch)
    ON CONFLICT (patient_key) DO NOTHING;

    -- 0) inferred members whose patient-index record has now arrived: completed in place
    UPDATE dw.dim_patient d
    SET sex = p.sex, birth_year = p.birth_year, registration_date = p.registration_date,
        residence_region_code = a.reg, residence_region_name = r.region_name, payer_code = a.pay, payer_name = pc.payer_name,
        payer_group = pc.payer_group, is_inferred = false, scd_row_hash = md5(concat_ws('|', a.reg, a.pay)),
        dw_batch_id = p_batch, dw_updated_at = now()
    FROM stg.patient_clean p
    CROSS JOIN LATERAL (SELECT etl.fn_patient_attr_asof(p.patient_id, 'residence_region', DATE '1900-01-01', p.residence_region_code) AS reg,
                               etl.fn_patient_attr_asof(p.patient_id, 'payer_class', DATE '1900-01-01', p.payer_code) AS pay) a
    LEFT JOIN stg.md_region_clean r ON r.region_code = a.reg
    LEFT JOIN stg.md_payer_clean pc ON pc.payer_code = a.pay
    WHERE d.patient_pseudo_id = p.patient_id AND d.is_inferred;
    GET DIAGNOSTICS n_inferred_fixed = ROW_COUNT;

    -- 1) set-based history build for patients not yet in the dimension: one candidate version per change date,
    --    consecutive identical hashes collapsed, effective_to = next version start - 1
    INSERT INTO dw.dim_patient (patient_key, patient_pseudo_id, sex, birth_year, residence_region_code, residence_region_name,
                                payer_code, payer_name, payer_group, registration_date, is_inferred, scd_effective_from,
                                scd_effective_to, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    WITH newp AS (
        SELECT p.* FROM stg.patient_clean p
        WHERE NOT EXISTS (SELECT 1 FROM dw.dim_patient d WHERE d.patient_pseudo_id = p.patient_id)
    ), evt AS (
        SELECT patient_id, DATE '1900-01-01' AS eff FROM newp
        UNION
        SELECT h.patient_id, h.effective_date FROM stg.patient_change_clean h JOIN newp USING (patient_id)
    ), st AS (
        SELECT evt.patient_id, evt.eff, n.sex, n.birth_year, n.registration_date,
               etl.fn_patient_attr_asof(evt.patient_id, 'residence_region', evt.eff, n.residence_region_code) AS reg,
               etl.fn_patient_attr_asof(evt.patient_id, 'payer_class', evt.eff, n.payer_code) AS pay
        FROM evt JOIN newp n USING (patient_id)
    ), hs AS (
        SELECT st.*, md5(concat_ws('|', reg, pay)) AS hsh,
               lag(md5(concat_ws('|', reg, pay))) OVER (PARTITION BY patient_id ORDER BY eff) AS prev_hsh
        FROM st
    ), v AS (
        SELECT * FROM hs WHERE prev_hsh IS NULL OR prev_hsh <> hsh
    )
    SELECT (SELECT greatest(coalesce(max(patient_key), 0), 0) FROM dw.dim_patient) + row_number() OVER (ORDER BY v.patient_id, v.eff),
           v.patient_id, v.sex, v.birth_year, v.reg, r.region_name, v.pay, pc.payer_name, pc.payer_group, v.registration_date, false,
           v.eff, coalesce(lead(v.eff) OVER w - 1, DATE '9999-12-31'), lead(v.eff) OVER w IS NULL, row_number() OVER w, v.hsh, p_batch
    FROM v
    LEFT JOIN stg.md_region_clean r ON r.region_code = v.reg
    LEFT JOIN stg.md_payer_clean pc ON pc.payer_code = v.pay
    WINDOW w AS (PARTITION BY v.patient_id ORDER BY v.eff);
    GET DIAGNOSTICS n_initial = ROW_COUNT;

    -- 2) incremental: replay change events newer than the current version (deltas and completed inferred members)
    FOR ev IN
        SELECT h.patient_id, h.effective_date
        FROM stg.patient_change_clean h JOIN dw.dim_patient d ON d.patient_pseudo_id = h.patient_id AND d.scd_is_current
        WHERE h.effective_date > d.scd_effective_from
        GROUP BY h.patient_id, h.effective_date ORDER BY h.effective_date, h.patient_id
    LOOP
        SELECT * INTO cur FROM dw.dim_patient WHERE patient_pseudo_id = ev.patient_id AND scd_is_current;
        CONTINUE WHEN NOT FOUND OR ev.effective_date <= cur.scd_effective_from;
        SELECT * INTO src FROM stg.patient_clean WHERE patient_id = ev.patient_id;
        CONTINUE WHEN NOT FOUND;
        v_reg := etl.fn_patient_attr_asof(ev.patient_id, 'residence_region', ev.effective_date, src.residence_region_code);
        v_pay := etl.fn_patient_attr_asof(ev.patient_id, 'payer_class', ev.effective_date, src.payer_code);
        v_hash := md5(concat_ws('|', v_reg, v_pay));
        CONTINUE WHEN v_hash = cur.scd_row_hash;
        UPDATE dw.dim_patient SET scd_effective_to = ev.effective_date - 1, scd_is_current = false, dw_batch_id = p_batch, dw_updated_at = now()
        WHERE patient_key = cur.patient_key;
        INSERT INTO dw.dim_patient (patient_key, patient_pseudo_id, sex, birth_year, residence_region_code, residence_region_name,
                                    payer_code, payer_name, payer_group, registration_date, is_inferred, scd_effective_from,
                                    scd_is_current, scd_version, scd_row_hash, dw_batch_id)
        SELECT (SELECT max(patient_key) + 1 FROM dw.dim_patient), cur.patient_pseudo_id, cur.sex, cur.birth_year, v_reg, r.region_name,
               v_pay, pc.payer_name, pc.payer_group, cur.registration_date, false, ev.effective_date, true, cur.scd_version + 1, v_hash, p_batch
        FROM (SELECT 1) one
        LEFT JOIN stg.md_region_clean r ON r.region_code = v_reg
        LEFT JOIN stg.md_payer_clean pc ON pc.payer_code = v_pay;
        n_versions := n_versions + 1;
    END LOOP;

    -- 3) Type 1 attributes (sex, birth year, registration date) overwrite every version
    UPDATE dw.dim_patient d SET sex = p.sex, birth_year = p.birth_year, registration_date = p.registration_date, dw_updated_at = now()
    FROM stg.patient_clean p
    WHERE d.patient_pseudo_id = p.patient_id AND p.batch_id = p_batch
      AND (d.sex, d.birth_year, d.registration_date) IS DISTINCT FROM (p.sex, p.birth_year, p.registration_date);
    -- 4) durable key = surrogate key of the first version (stable across versions and reloads)
    UPDATE dw.dim_patient d SET patient_durable_key = x.k
    FROM (SELECT patient_pseudo_id, min(patient_key) AS k FROM dw.dim_patient GROUP BY 1) x
    WHERE x.patient_pseudo_id = d.patient_pseudo_id AND d.patient_durable_key IS DISTINCT FROM x.k;
    ANALYZE dw.dim_patient;
    PERFORM etl.fn_log_step(p_batch, 'load dim_patient (SCD2)', 'dw.dim_patient', (SELECT count(*) FROM stg.patient_clean WHERE batch_id = p_batch),
                            (SELECT count(*) FROM dw.dim_patient), 0, t0,
                            format('%s initial rows, %s new versions, %s inferred members completed', n_initial, n_versions, n_inferred_fixed));
END $$;

-- Inferred members for pseudonyms referenced by this batch's facts but absent from the patient index (EN10)
CREATE OR REPLACE PROCEDURE etl.sp_add_inferred_patients(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n int;
BEGIN
    DROP TABLE IF EXISTS tmp_inf;
    CREATE TEMP TABLE tmp_inf AS
    SELECT x.patient_id, min(x.src) AS src, min(x.ref) AS ref
    FROM (SELECT patient_id, 'PAS encounters' AS src, encounter_id AS ref FROM stg.encounter_clean WHERE batch_id = p_batch AND patient_id IS NOT NULL
          UNION ALL
          SELECT patient_id, 'PAS inpatient spells', admission_id FROM stg.spell_clean WHERE batch_id = p_batch AND patient_id IS NOT NULL) x
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_patient d WHERE d.patient_pseudo_id = x.patient_id)
    GROUP BY x.patient_id;
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'EN10', src, patient_id, 'patient_id', ref, 'Inferred patient member created'
    FROM tmp_inf;
    INSERT INTO dw.dim_patient (patient_key, patient_pseudo_id, sex, residence_region_code, residence_region_name, payer_code, payer_name,
                                payer_group, is_inferred, scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    SELECT (SELECT greatest(coalesce(max(patient_key), 0), 0) FROM dw.dim_patient) + row_number() OVER (ORDER BY patient_id),
           patient_id, 'U', 'UNK', 'Unknown', 'UNK', 'Unknown (inferred)', 'Unknown', true, DATE '1900-01-01', true, 1, md5('inferred'), p_batch
    FROM tmp_inf;
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE dw.dim_patient SET patient_durable_key = patient_key WHERE patient_durable_key IS NULL;
    PERFORM etl.fn_log_step(p_batch, 'inferred patient members (EN10)', 'dw.dim_patient', n, n, 0, t0);
END $$;
