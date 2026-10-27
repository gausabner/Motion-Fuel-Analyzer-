-- =============================================================================
-- 05_etl_transform.sql
-- TRANSFORM: raw landing (stg.*_raw, text) -> clean staging (stg.*_clean, typed).
-- Every procedure processes only the rows of the given batch, applies the data-
-- quality rules catalogued in audit.dq_rule, writes one audit.dq_issue_log row per
-- rule hit (with the raw value) and MERGES the result into the clean tables by
-- natural key - so the same code serves the full load and incremental deltas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Master and reference data (MD01, MD06)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_master(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint;
BEGIN
    SELECT (SELECT count(*) FROM stg.md_regions_raw WHERE batch_id = p_batch) + (SELECT count(*) FROM stg.md_facilities_raw WHERE batch_id = p_batch)
         + (SELECT count(*) FROM stg.md_units_raw WHERE batch_id = p_batch) + (SELECT count(*) FROM stg.md_icd_raw WHERE batch_id = p_batch)
    INTO n_in;
    -- steward code mappings
    INSERT INTO ref.code_map (code_type, source_value, standard_code, standard_description)
    SELECT btrim(code_type), source_value, btrim(standard_code), standard_description
    FROM stg.md_code_map_raw WHERE batch_id = p_batch AND code_type IS NOT NULL AND source_value IS NOT NULL
    ON CONFLICT (code_type, source_value) DO UPDATE
        SET standard_code = EXCLUDED.standard_code, standard_description = EXCLUDED.standard_description;

    -- regions and their aliases
    INSERT INTO stg.md_region_clean (region_code, region_name, zone, malaria_stratum, batch_id)
    SELECT btrim(region_code), btrim(region_name), btrim(zone), btrim(malaria_stratum), p_batch
    FROM stg.md_regions_raw WHERE batch_id = p_batch
    ON CONFLICT (region_code) DO UPDATE SET region_name = EXCLUDED.region_name, zone = EXCLUDED.zone,
        malaria_stratum = EXCLUDED.malaria_stratum, batch_id = EXCLUDED.batch_id;
    INSERT INTO ref.region_alias (alias_norm, region_code)
    SELECT DISTINCT etl.fn_norm(a), btrim(r.region_code)
    FROM stg.md_regions_raw r
    CROSS JOIN LATERAL unnest(ARRAY[r.region_name, r.region_code] || string_to_array(coalesce(r.known_aliases, ''), ';')) AS a
    WHERE r.batch_id = p_batch AND etl.fn_norm(a) IS NOT NULL
    ON CONFLICT (alias_norm) DO NOTHING;

    -- facilities (MD01: region spelling variants)
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'MD01', 'Master data: Facilities', btrim(f.facility_code), 'region', f.region,
           'Mapped to ' || coalesce(a.region_code, 'UNKNOWN')
    FROM stg.md_facilities_raw f
    LEFT JOIN ref.region_alias a ON a.alias_norm = etl.fn_norm(f.region)
    LEFT JOIN stg.md_region_clean rc ON rc.region_code = a.region_code
    WHERE f.batch_id = p_batch AND (rc.region_name IS NULL OR btrim(f.region) <> rc.region_name);
    INSERT INTO stg.md_facility_clean (facility_code, facility_name, facility_type, region_code, town, latitude, longitude,
                                       elevation_m, has_emergency_department, catchment_share, opened_date, ownership, batch_id)
    SELECT btrim(f.facility_code), btrim(f.facility_name), btrim(f.facility_type), a.region_code, btrim(f.town),
           etl.fn_num(f.latitude), etl.fn_num(f.longitude), etl.fn_num(f.elevation_m)::int,
           upper(btrim(f.has_emergency_department)) = 'Y', etl.fn_num(f.catchment_share_pct) / 100.0,
           etl.fn_try_date(left(f.opened_date, 10), 'YYYY-MM-DD'), btrim(f.ownership), p_batch
    FROM stg.md_facilities_raw f LEFT JOIN ref.region_alias a ON a.alias_norm = etl.fn_norm(f.region)
    WHERE f.batch_id = p_batch
    ON CONFLICT (facility_code) DO UPDATE SET facility_name = EXCLUDED.facility_name, facility_type = EXCLUDED.facility_type,
        region_code = EXCLUDED.region_code, town = EXCLUDED.town, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
        elevation_m = EXCLUDED.elevation_m, has_emergency_department = EXCLUDED.has_emergency_department,
        catchment_share = EXCLUDED.catchment_share, opened_date = EXCLUDED.opened_date, ownership = EXCLUDED.ownership,
        batch_id = EXCLUDED.batch_id;

    -- care units and their change history (SCD2 source)
    INSERT INTO stg.md_unit_clean (unit_code, facility_code, unit_name, unit_type, specialty, bed_complement, is_active, batch_id)
    SELECT btrim(unit_code), btrim(facility_code), btrim(unit_name), btrim(unit_type), btrim(specialty),
           etl.fn_num(bed_complement)::int, upper(btrim(active)) = 'Y', p_batch
    FROM stg.md_units_raw WHERE batch_id = p_batch
    ON CONFLICT (unit_code) DO UPDATE SET facility_code = EXCLUDED.facility_code, unit_name = EXCLUDED.unit_name,
        unit_type = EXCLUDED.unit_type, specialty = EXCLUDED.specialty, bed_complement = EXCLUDED.bed_complement,
        is_active = EXCLUDED.is_active, batch_id = EXCLUDED.batch_id;
    INSERT INTO stg.md_unit_history_clean (change_id, unit_code, attribute, old_value, new_value, effective_date, approved_by_role, batch_id)
    SELECT etl.fn_num(change_id)::int, btrim(unit_code), btrim(attribute), btrim(old_value), btrim(new_value),
           etl.fn_try_date(left(effective_date, 10), 'YYYY-MM-DD'), btrim(approved_by_role), p_batch
    FROM stg.md_unit_history_raw WHERE batch_id = p_batch
    ON CONFLICT (change_id) DO NOTHING;

    -- triage scale
    INSERT INTO stg.md_triage_clean (triage_code, triage_label, priority, target_minutes, target_text, colour_hex, batch_id)
    SELECT btrim(triage_code), btrim(triage_label), etl.fn_num(priority)::smallint, etl.fn_num(target_minutes)::int,
           btrim(target_text), btrim(colour_hex), p_batch
    FROM stg.md_triage_raw WHERE batch_id = p_batch
    ON CONFLICT (triage_code) DO UPDATE SET triage_label = EXCLUDED.triage_label, priority = EXCLUDED.priority,
        target_minutes = EXCLUDED.target_minutes, target_text = EXCLUDED.target_text, colour_hex = EXCLUDED.colour_hex;

    -- ICD-10 list (MD06: untrimmed codes, duplicate code rows -> first row wins)
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'MD06', 'Master data: ICD10_Codes', btrim(icd10_code), 'icd10_code', icd10_code,
           CASE WHEN rn > 1 THEN 'Duplicate code row dropped (title "' || icd10_title || '")' ELSE 'Code trimmed' END
    FROM (SELECT *, row_number() OVER (PARTITION BY btrim(icd10_code) ORDER BY row_num) AS rn
          FROM stg.md_icd_raw WHERE batch_id = p_batch) x
    WHERE rn > 1 OR icd10_code <> btrim(icd10_code);
    INSERT INTO stg.md_icd_clean (icd10_code, icd10_title, chapter, chapter_range, chapter_title, block_range, block_title,
                                  severity_class, default_specialty, is_chronic, condition_code, batch_id)
    SELECT DISTINCT ON (btrim(icd10_code)) btrim(icd10_code), btrim(icd10_title), btrim(chapter), btrim(chapter_range),
           btrim(chapter_title), btrim(block_range), btrim(block_title), btrim(severity_class), btrim(default_specialty),
           upper(btrim(is_chronic_condition)) = 'Y', nullif(btrim(idsr_condition_code), ''), p_batch
    FROM stg.md_icd_raw WHERE batch_id = p_batch
    ORDER BY btrim(icd10_code), row_num
    ON CONFLICT (icd10_code) DO UPDATE SET icd10_title = EXCLUDED.icd10_title, chapter = EXCLUDED.chapter,
        chapter_range = EXCLUDED.chapter_range, chapter_title = EXCLUDED.chapter_title, block_range = EXCLUDED.block_range,
        block_title = EXCLUDED.block_title, severity_class = EXCLUDED.severity_class,
        default_specialty = EXCLUDED.default_specialty, is_chronic = EXCLUDED.is_chronic, condition_code = EXCLUDED.condition_code;

    -- IDSR conditions and aliases
    INSERT INTO stg.md_condition_clean (condition_code, condition_name, idsr_category, notification, alert_threshold, icd10_codes, batch_id)
    SELECT btrim(condition_code), btrim(condition_name), btrim(idsr_category), btrim(notification), btrim(alert_threshold),
           btrim(icd10_codes), p_batch
    FROM stg.md_conditions_raw WHERE batch_id = p_batch
    ON CONFLICT (condition_code) DO UPDATE SET condition_name = EXCLUDED.condition_name, idsr_category = EXCLUDED.idsr_category,
        notification = EXCLUDED.notification, alert_threshold = EXCLUDED.alert_threshold, icd10_codes = EXCLUDED.icd10_codes;
    INSERT INTO ref.condition_alias (alias_norm, condition_code)
    SELECT DISTINCT etl.fn_norm(a), btrim(c.condition_code)
    FROM stg.md_conditions_raw c
    CROSS JOIN LATERAL unnest(ARRAY[c.condition_code, c.condition_name] || string_to_array(coalesce(c.known_aliases, ''), ';')) AS a
    WHERE c.batch_id = p_batch AND etl.fn_norm(a) IS NOT NULL
    ON CONFLICT (alias_norm) DO NOTHING;

    -- payer classes and aliases
    INSERT INTO stg.md_payer_clean (payer_code, payer_name, payer_group, batch_id)
    SELECT btrim(payer_code), btrim(payer_name), btrim(payer_group), p_batch FROM stg.md_payers_raw WHERE batch_id = p_batch
    ON CONFLICT (payer_code) DO UPDATE SET payer_name = EXCLUDED.payer_name, payer_group = EXCLUDED.payer_group;
    INSERT INTO ref.payer_alias (alias_norm, payer_code)
    SELECT DISTINCT etl.fn_norm(a), btrim(p.payer_code)
    FROM stg.md_payers_raw p
    CROSS JOIN LATERAL unnest(ARRAY[p.payer_code, p.payer_name] || string_to_array(coalesce(p.known_aliases, ''), ';')) AS a
    WHERE p.batch_id = p_batch AND etl.fn_norm(a) IS NOT NULL
    ON CONFLICT (alias_norm) DO NOTHING;

    PERFORM etl.fn_log_step(p_batch, 'transform master data', 'stg.md_*_clean, ref.*', n_in,
                            (SELECT count(*) FROM stg.md_facility_clean) + (SELECT count(*) FROM stg.md_unit_clean)
                            + (SELECT count(*) FROM stg.md_icd_clean) + (SELECT count(*) FROM stg.md_region_clean), 0, t0);
END $$;

-- ---------------------------------------------------------------------------
-- Pseudonymised patient index and its change log (MD01-MD05)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_patients(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n_rej bigint;
BEGIN
    SELECT count(*) INTO n_in FROM stg.patient_raw WHERE batch_id = p_batch;
    DROP TABLE IF EXISTS tmp_pat;
    CREATE TEMP TABLE tmp_pat AS
    SELECT r.row_num, btrim(r.patient_id) AS patient_id, r.sex AS sex_raw,
           coalesce(sm.standard_code, CASE WHEN upper(btrim(r.sex)) IN ('F', 'M', 'U') THEN upper(btrim(r.sex)) END, 'U') AS sex,
           r.birth_year AS by_raw,
           CASE WHEN btrim(r.birth_year) ~ '^[0-9]{4}$'
                 AND btrim(r.birth_year)::int BETWEEN 1900 AND extract(year FROM coalesce(etl.fn_try_date(r.registration_date, 'YYYY-MM-DD'), current_date))
                THEN btrim(r.birth_year)::smallint END AS birth_year,
           r.residence_region AS region_raw, ra.region_code, r.payer_class AS payer_raw, pa.payer_code,
           etl.fn_try_date(r.registration_date, 'YYYY-MM-DD') AS registration_date,
           etl.fn_parse_ts(r.last_updated) AS last_updated,
           row_number() OVER (PARTITION BY btrim(r.patient_id) ORDER BY etl.fn_parse_ts(r.last_updated) DESC NULLS LAST, r.row_num DESC) AS rn
    FROM stg.patient_raw r
    LEFT JOIN ref.code_map sm ON sm.code_type = 'SEX' AND sm.source_value = r.sex
    LEFT JOIN ref.region_alias ra ON ra.alias_norm = etl.fn_norm(r.residence_region)
    LEFT JOIN ref.payer_alias pa ON pa.alias_norm = etl.fn_norm(r.payer_class)
    WHERE r.batch_id = p_batch AND nullif(btrim(r.patient_id), '') IS NOT NULL;
    ANALYZE tmp_pat;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'MD04', 'PAS patient index', patient_id, 'last_updated', last_updated::text, 'Superseded record rejected (older last_updated)'
    FROM tmp_pat WHERE rn > 1
    UNION ALL
    SELECT p_batch, 'MD02', 'PAS patient index', patient_id, 'sex', sex_raw, 'Mapped to ' || sex
    FROM tmp_pat WHERE rn = 1 AND coalesce(sex_raw, '') NOT IN ('F', 'M', 'U')
    UNION ALL
    SELECT p_batch, 'MD03', 'PAS patient index', patient_id, 'birth_year', by_raw, 'Implausible birth year set to NULL'
    FROM tmp_pat WHERE rn = 1 AND birth_year IS NULL
    UNION ALL
    SELECT p_batch, 'MD05', 'PAS patient index', patient_id, 'payer_class', payer_raw, 'Mapped to ' || coalesce(payer_code, 'UNKNOWN')
    FROM tmp_pat WHERE rn = 1 AND (payer_code IS NULL OR payer_raw <> payer_code)
    UNION ALL
    SELECT p_batch, 'MD01', 'PAS patient index', t.patient_id, 'residence_region', t.region_raw, 'Mapped to ' || coalesce(t.region_code, 'UNKNOWN')
    FROM tmp_pat t LEFT JOIN stg.md_region_clean rc ON rc.region_code = t.region_code
    WHERE t.rn = 1 AND (rc.region_name IS NULL OR t.region_raw <> rc.region_name);
    SELECT count(*) INTO n_rej FROM tmp_pat WHERE rn > 1;

    INSERT INTO stg.patient_clean (patient_id, sex, birth_year, residence_region_code, payer_code, registration_date, last_updated, batch_id)
    SELECT patient_id, sex, birth_year, region_code, payer_code, registration_date, last_updated, p_batch
    FROM tmp_pat WHERE rn = 1
    ON CONFLICT (patient_id) DO UPDATE SET sex = EXCLUDED.sex, birth_year = EXCLUDED.birth_year,
        residence_region_code = EXCLUDED.residence_region_code, payer_code = EXCLUDED.payer_code,
        registration_date = EXCLUDED.registration_date, last_updated = EXCLUDED.last_updated, batch_id = EXCLUDED.batch_id
    WHERE EXCLUDED.last_updated >= stg.patient_clean.last_updated;

    -- change log: values standardised to codes (region names -> ISO code, payer aliases -> payer code)
    INSERT INTO stg.patient_change_clean (change_id, patient_id, attribute, old_value, new_value, effective_date, batch_id)
    SELECT etl.fn_num(c.change_id)::int, btrim(c.patient_id), btrim(c.attribute),
           CASE WHEN btrim(c.attribute) = 'residence_region' THEN ro.region_code ELSE po.payer_code END,
           CASE WHEN btrim(c.attribute) = 'residence_region' THEN rn.region_code ELSE pn.payer_code END,
           etl.fn_try_date(left(c.effective_date, 10), 'YYYY-MM-DD'), p_batch
    FROM stg.patient_change_raw c
    LEFT JOIN ref.region_alias ro ON ro.alias_norm = etl.fn_norm(c.old_value)
    LEFT JOIN ref.region_alias rn ON rn.alias_norm = etl.fn_norm(c.new_value)
    LEFT JOIN ref.payer_alias po ON po.alias_norm = etl.fn_norm(c.old_value)
    LEFT JOIN ref.payer_alias pn ON pn.alias_norm = etl.fn_norm(c.new_value)
    WHERE c.batch_id = p_batch AND btrim(c.attribute) IN ('residence_region', 'payer_class')
    ON CONFLICT (change_id) DO NOTHING;
    ANALYZE stg.patient_change_clean;

    PERFORM etl.fn_log_step(p_batch, 'transform patient index (MD01-MD05)', 'stg.patient_clean', n_in,
                            (SELECT count(*) FROM tmp_pat WHERE rn = 1), n_rej, t0,
                            format('%s change-log rows', (SELECT count(*) FROM stg.patient_change_clean WHERE batch_id = p_batch)));
END $$;

-- ---------------------------------------------------------------------------
-- ED and clinic attendances (EN01-EN12)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_encounters(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n_out bigint; v_cut timestamp := etl.fn_batch_cutoff(p_batch);
BEGIN
    SELECT count(*) INTO n_in FROM stg.encounter_raw WHERE batch_id = p_batch;
    DROP TABLE IF EXISTS tmp_enc;
    CREATE TEMP TABLE tmp_enc AS
    SELECT r.source_file, r.row_num, btrim(r.encounter_id) AS encounter_id, r.facility_code AS fac_raw, f.facility_code,
           upper(btrim(r.department)) AS department, nullif(btrim(r.patient_id), '') AS patient_id,
           r.arrival_datetime AS arrival_raw, etl.fn_parse_ts(r.arrival_datetime) AS arrival_ts,
           etl.fn_parse_ts(r.triage_datetime) AS triage_ts, r.seen_datetime AS seen_raw, etl.fn_parse_ts(r.seen_datetime) AS seen_ts,
           r.departure_datetime AS dep_raw, etl.fn_parse_ts(r.departure_datetime) AS departure_ts,
           etl.fn_ts_is_dayfirst(r.arrival_datetime) AS dayfirst,
           r.triage_category AS tri_raw,
           coalesce(tm.standard_code, CASE WHEN upper(btrim(r.triage_category)) IN ('RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE')
                                           THEN upper(btrim(r.triage_category)) END) AS triage_code,
           r.arrival_mode AS am_raw, coalesce(am.standard_code, 'UNK') AS arrival_mode_code,
           r.disposition AS disp_raw, coalesce(dm.standard_code, 'UNK') AS disposition_code,
           r.primary_icd10 AS icd_raw, etl.fn_icd_clean(r.primary_icd10) AS icd_clean,
           row_number() OVER (PARTITION BY btrim(r.encounter_id) ORDER BY r.source_file, r.row_num) AS dup_rn
    FROM stg.encounter_raw r
    LEFT JOIN stg.md_facility_clean f ON etl.fn_norm(f.facility_code) = etl.fn_norm(r.facility_code)
    LEFT JOIN ref.code_map tm ON tm.code_type = 'TRIAGE' AND tm.source_value = r.triage_category
    LEFT JOIN ref.code_map am ON am.code_type = 'ARRIVAL_MODE' AND am.source_value = r.arrival_mode
    LEFT JOIN ref.code_map dm ON dm.code_type = 'DISPOSITION' AND dm.source_value = r.disposition
    WHERE r.batch_id = p_batch;
    ANALYZE tmp_enc;
    ALTER TABLE tmp_enc ADD COLUMN accepted boolean;
    UPDATE tmp_enc SET accepted = dup_rn = 1 AND facility_code IS NOT NULL AND arrival_ts IS NOT NULL
                                  AND arrival_ts >= TIMESTAMP '2021-12-01' AND arrival_ts <= v_cut
                                  AND NOT EXISTS (SELECT 1 FROM stg.encounter_clean c WHERE c.encounter_id = tmp_enc.encounter_id AND c.batch_id <> p_batch);

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'EN01', source_file, encounter_id, 'encounter_id', 'row ' || row_num, 'Duplicate row rejected'
    FROM tmp_enc WHERE dup_rn > 1
       OR EXISTS (SELECT 1 FROM stg.encounter_clean c WHERE c.encounter_id = tmp_enc.encounter_id AND c.batch_id <> p_batch)
    UNION ALL
    SELECT p_batch, 'EN12', source_file, encounter_id, 'arrival_datetime', arrival_raw, 'Attendance rejected (arrival outside extract window or unparseable)'
    FROM tmp_enc WHERE dup_rn = 1 AND (arrival_ts IS NULL OR arrival_ts < TIMESTAMP '2021-12-01' OR arrival_ts > v_cut)
    UNION ALL
    SELECT p_batch, 'EN03', source_file, encounter_id, 'facility_code', fac_raw,
           CASE WHEN facility_code IS NULL THEN 'Unknown facility: rejected' ELSE 'Corrected to ' || facility_code END
    FROM tmp_enc WHERE dup_rn = 1 AND (facility_code IS NULL OR fac_raw <> facility_code)
    UNION ALL
    SELECT p_batch, 'EN02', source_file, encounter_id, 'arrival_datetime', arrival_raw, 'Parsed as DD/MM/YYYY HH:MI'
    FROM tmp_enc WHERE accepted AND dayfirst
    UNION ALL
    SELECT p_batch, 'EN04', source_file, encounter_id, 'triage_category', coalesce(tri_raw, ''), 'Loaded as triage "Not recorded"'
    FROM tmp_enc WHERE accepted AND department = 'ED' AND nullif(btrim(tri_raw), '') IS NULL
    UNION ALL
    SELECT p_batch, 'EN09', source_file, encounter_id, x.col, x.raw, 'Mapped to ' || x.std
    FROM tmp_enc CROSS JOIN LATERAL (VALUES ('triage_category', tri_raw, triage_code), ('disposition', disp_raw, disposition_code),
                                            ('arrival_mode', am_raw, arrival_mode_code)) AS x(col, raw, std)
    WHERE accepted AND nullif(btrim(x.raw), '') IS NOT NULL AND x.raw IS DISTINCT FROM x.std
    UNION ALL
    SELECT p_batch, 'EN05', source_file, encounter_id, 'seen_datetime', seen_raw, 'Seen time before arrival: timestamp rejected'
    FROM tmp_enc WHERE accepted AND seen_ts < arrival_ts
    UNION ALL
    SELECT p_batch, 'EN06', source_file, encounter_id, 'departure_datetime', dep_raw, 'Implausible duration set to NULL'
    FROM tmp_enc WHERE accepted AND (etl.fn_minutes(arrival_ts, departure_ts) > 4320 OR etl.fn_minutes(arrival_ts, departure_ts) < 0
                                     OR etl.fn_minutes(arrival_ts, seen_ts) > 1440)
    UNION ALL
    SELECT p_batch, 'EN07', source_file, t.encounter_id, 'primary_icd10', t.icd_raw, 'Corrected to ' || t.icd_clean
    FROM tmp_enc t JOIN stg.md_icd_clean i ON i.icd10_code = t.icd_clean
    WHERE t.accepted AND t.icd_raw <> t.icd_clean
    UNION ALL
    SELECT p_batch, 'EN08', source_file, t.encounter_id, 'primary_icd10', coalesce(t.icd_raw, ''), 'Loaded as diagnosis "Unknown / not coded"'
    FROM tmp_enc t WHERE t.accepted AND NOT EXISTS (SELECT 1 FROM stg.md_icd_clean i WHERE i.icd10_code = t.icd_clean)
    UNION ALL
    SELECT p_batch, 'EN11', source_file, encounter_id, 'patient_id', '', 'Loaded against patient "Unknown"'
    FROM tmp_enc WHERE accepted AND patient_id IS NULL;

    INSERT INTO stg.encounter_clean (encounter_id, facility_code, unit_code, department, patient_id, arrival_ts, triage_ts, seen_ts,
                                     departure_ts, triage_code, arrival_mode_code, disposition_code, icd10_code,
                                     wait_to_triage_min, door_to_doctor_min, ed_los_min, source_file, row_num, batch_id)
    SELECT t.encounter_id, t.facility_code, split_part(t.facility_code, '-', 2) || '-' || t.department, t.department, t.patient_id,
           t.arrival_ts,
           CASE WHEN t.triage_ts >= t.arrival_ts AND etl.fn_minutes(t.arrival_ts, t.triage_ts) <= 1440 THEN t.triage_ts END,
           CASE WHEN t.seen_ts >= t.arrival_ts AND etl.fn_minutes(t.arrival_ts, t.seen_ts) <= 1440 THEN t.seen_ts END,
           CASE WHEN t.departure_ts >= t.arrival_ts AND etl.fn_minutes(t.arrival_ts, t.departure_ts) <= 4320 THEN t.departure_ts END,
           CASE WHEN t.department = 'OPD' THEN 'NT' ELSE t.triage_code END,
           t.arrival_mode_code, t.disposition_code,
           CASE WHEN EXISTS (SELECT 1 FROM stg.md_icd_clean i WHERE i.icd10_code = t.icd_clean) THEN t.icd_clean END,
           CASE WHEN t.triage_ts >= t.arrival_ts AND etl.fn_minutes(t.arrival_ts, t.triage_ts) <= 1440 THEN etl.fn_minutes(t.arrival_ts, t.triage_ts) END,
           CASE WHEN t.seen_ts >= t.arrival_ts AND etl.fn_minutes(t.arrival_ts, t.seen_ts) <= 1440 THEN etl.fn_minutes(t.arrival_ts, t.seen_ts) END,
           CASE WHEN t.departure_ts >= t.arrival_ts AND etl.fn_minutes(t.arrival_ts, t.departure_ts) <= 4320 THEN etl.fn_minutes(t.arrival_ts, t.departure_ts) END,
           t.source_file, t.row_num, p_batch
    FROM tmp_enc t WHERE t.accepted
    ON CONFLICT (encounter_id) DO NOTHING;
    GET DIAGNOSTICS n_out = ROW_COUNT;
    ANALYZE stg.encounter_clean;
    PERFORM etl.fn_log_step(p_batch, 'transform ED/clinic attendances (EN01-EN12)', 'stg.encounter_clean', n_in, n_out, n_in - n_out, t0);
END $$;

-- ---------------------------------------------------------------------------
-- Inpatient spells (AD01-AD07)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_spells(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n_out bigint; v_cut timestamp := etl.fn_batch_cutoff(p_batch);
BEGIN
    SELECT count(*) INTO n_in FROM stg.spell_raw WHERE batch_id = p_batch;
    DROP TABLE IF EXISTS tmp_sp;
    CREATE TEMP TABLE tmp_sp AS
    SELECT r.row_num, btrim(r.admission_id) AS admission_id, f.facility_code, r.ward_code AS ward_raw, u.unit_code AS ward_code,
           nullif(btrim(r.patient_id), '') AS patient_id, etl.fn_parse_ts(r.admission_datetime) AS admission_ts,
           r.discharge_datetime AS dis_raw, etl.fn_parse_ts(r.discharge_datetime) AS dis_ts,
           r.admission_method AS method_raw, coalesce(mm.standard_code, 'UNK') AS admission_method,
           coalesce(sm.standard_code, nullif(upper(btrim(r.discharge_status)), '')) AS discharge_status,
           r.principal_icd10 AS icd_raw, etl.fn_icd_clean(r.principal_icd10) AS icd_clean,
           nullif(btrim(r.ed_encounter_id), '') AS ed_encounter_id, etl.fn_parse_ts(r.last_updated) AS last_updated,
           row_number() OVER (PARTITION BY btrim(r.admission_id) ORDER BY etl.fn_parse_ts(r.last_updated) DESC NULLS LAST, r.row_num DESC) AS rn
    FROM stg.spell_raw r
    LEFT JOIN stg.md_facility_clean f ON etl.fn_norm(f.facility_code) = etl.fn_norm(r.facility_code)
    LEFT JOIN stg.md_unit_clean u ON etl.fn_norm(u.unit_code) = etl.fn_norm(r.ward_code)
    LEFT JOIN ref.code_map mm ON mm.code_type = 'ADMISSION_METHOD' AND mm.source_value = r.admission_method
    LEFT JOIN ref.code_map sm ON sm.code_type = 'DISCHARGE_STATUS' AND sm.source_value = r.discharge_status
    WHERE r.batch_id = p_batch;
    ANALYZE tmp_sp;
    -- AD02 / AD03: discharge year keyed wrongly -> corrected when the result is plausible (0-120 days)
    ALTER TABLE tmp_sp ADD COLUMN dis_fixed timestamp, ADD COLUMN dis_rule text;
    UPDATE tmp_sp SET dis_fixed = CASE
            WHEN dis_ts IS NULL THEN NULL
            WHEN dis_ts < admission_ts AND dis_ts + interval '1 year' BETWEEN admission_ts AND admission_ts + interval '120 days' THEN dis_ts + interval '1 year'
            WHEN dis_ts < admission_ts THEN NULL
            WHEN dis_ts > admission_ts + interval '365 days' AND dis_ts - interval '10 years' BETWEEN admission_ts AND admission_ts + interval '120 days' THEN dis_ts - interval '10 years'
            WHEN dis_ts > admission_ts + interval '365 days' THEN NULL
            ELSE dis_ts END,
        dis_rule = CASE WHEN dis_ts < admission_ts THEN 'AD02' WHEN dis_ts > admission_ts + interval '365 days' THEN 'AD03' END;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'AD01', 'PAS inpatient spells', admission_id, 'last_updated', last_updated::text, 'Superseded image rejected'
    FROM tmp_sp WHERE rn > 1
    UNION ALL
    SELECT p_batch, dis_rule, 'PAS inpatient spells', admission_id, 'discharge_datetime', dis_raw,
           CASE WHEN dis_fixed IS NULL THEN 'Discharge rejected (not correctable)' ELSE 'Corrected to ' || to_char(dis_fixed, 'YYYY-MM-DD HH24:MI') END
    FROM tmp_sp WHERE rn = 1 AND dis_rule IS NOT NULL
    UNION ALL
    SELECT p_batch, 'AD04', 'PAS inpatient spells', admission_id, 'ward_code', ward_raw,
           CASE WHEN ward_code IS NULL THEN 'Unknown ward' ELSE 'Corrected to ' || ward_code END
    FROM tmp_sp WHERE rn = 1 AND (ward_code IS NULL OR ward_raw <> ward_code)
    UNION ALL
    SELECT p_batch, 'AD05', 'PAS inpatient spells', admission_id, 'principal_icd10', coalesce(icd_raw, ''), 'Diagnosis "Unknown / not coded" until coded'
    FROM tmp_sp t WHERE rn = 1 AND NOT EXISTS (SELECT 1 FROM stg.md_icd_clean i WHERE i.icd10_code = t.icd_clean)
    UNION ALL
    SELECT p_batch, 'AD07', 'PAS inpatient spells', admission_id, 'admission_method', method_raw, 'Mapped to ' || admission_method
    FROM tmp_sp WHERE rn = 1 AND method_raw IS DISTINCT FROM admission_method
    UNION ALL
    SELECT p_batch, 'AD06', 'PAS inpatient spells', admission_id, 'discharge_datetime', '',
           'Open ' || (v_cut::date - admission_ts::date) || ' days: probable missing discharge (flagged)'
    FROM tmp_sp WHERE rn = 1 AND dis_ts IS NULL AND admission_ts < v_cut - interval '60 days';

    INSERT INTO stg.spell_clean (admission_id, facility_code, ward_code, patient_id, admission_ts, discharge_ts, admission_method,
                                 discharge_status, icd10_code, ed_encounter_id, last_updated, batch_id)
    SELECT t.admission_id, t.facility_code, t.ward_code, t.patient_id, t.admission_ts, t.dis_fixed, t.admission_method,
           CASE WHEN t.dis_fixed IS NULL THEN NULL ELSE coalesce(t.discharge_status, 'UNK') END,
           CASE WHEN EXISTS (SELECT 1 FROM stg.md_icd_clean i WHERE i.icd10_code = t.icd_clean) THEN t.icd_clean END,
           t.ed_encounter_id, t.last_updated, p_batch
    FROM tmp_sp t WHERE t.rn = 1 AND t.admission_ts IS NOT NULL AND t.ward_code IS NOT NULL
    ON CONFLICT (admission_id) DO UPDATE SET facility_code = EXCLUDED.facility_code, ward_code = EXCLUDED.ward_code,
        patient_id = EXCLUDED.patient_id, admission_ts = EXCLUDED.admission_ts, discharge_ts = EXCLUDED.discharge_ts,
        admission_method = EXCLUDED.admission_method, discharge_status = EXCLUDED.discharge_status,
        icd10_code = EXCLUDED.icd10_code, ed_encounter_id = EXCLUDED.ed_encounter_id, last_updated = EXCLUDED.last_updated,
        batch_id = EXCLUDED.batch_id
    WHERE EXCLUDED.last_updated >= stg.spell_clean.last_updated;
    GET DIAGNOSTICS n_out = ROW_COUNT;
    ANALYZE stg.spell_clean;
    PERFORM etl.fn_log_step(p_batch, 'transform inpatient spells (AD01-AD07)', 'stg.spell_clean', n_in, n_out, n_in - n_out, t0,
                            format('%s distinct spells in batch', (SELECT count(*) FROM tmp_sp WHERE rn = 1)));
END $$;

-- ---------------------------------------------------------------------------
-- Ward midnight census (WC01-WC04), with the PAS-derived census as reference
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_census(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n_imp bigint; v_cut date := etl.fn_batch_cutoff(p_batch)::date;
        v_from date;
BEGIN
    SELECT count(*) INTO n_in FROM stg.census_raw WHERE batch_id = p_batch;
    -- (1) PAS-derived midnight census for every ward-day up to the cut-off (patient present at 23:59)
    TRUNCATE stg.pas_ward_census;
    INSERT INTO stg.pas_ward_census (census_date, ward_code, pas_occupied, pas_admissions, pas_discharges, pas_deaths)
    SELECT d.census_date, w.unit_code, coalesce(o.occ, 0), coalesce(a.n, 0), coalesce(x.n, 0), coalesce(x.deaths, 0)
    FROM (SELECT unit_code FROM stg.md_unit_clean WHERE unit_type = 'Inpatient ward') w
    CROSS JOIN (SELECT g::date AS census_date FROM generate_series(DATE '2022-01-01', v_cut, interval '1 day') g) d
    LEFT JOIN (SELECT s.ward_code, g::date AS census_date, count(*) AS occ
               FROM stg.spell_clean s
               CROSS JOIN LATERAL generate_series(greatest(s.admission_ts::date, DATE '2022-01-01'),
                                                  least(coalesce(s.discharge_ts::date, v_cut + 1), v_cut + 1) - 1, interval '1 day') g
               GROUP BY 1, 2) o ON o.ward_code = w.unit_code AND o.census_date = d.census_date
    LEFT JOIN (SELECT ward_code, admission_ts::date AS dt, count(*) AS n FROM stg.spell_clean GROUP BY 1, 2) a
           ON a.ward_code = w.unit_code AND a.dt = d.census_date
    LEFT JOIN (SELECT ward_code, discharge_ts::date AS dt, count(*) AS n, count(*) FILTER (WHERE discharge_status = 'DIED') AS deaths
               FROM stg.spell_clean WHERE discharge_ts IS NOT NULL GROUP BY 1, 2) x
           ON x.ward_code = w.unit_code AND x.dt = d.census_date;

    -- (2) parse this batch's ward returns
    DROP TABLE IF EXISTS tmp_cen;
    CREATE TEMP TABLE tmp_cen AS
    SELECT r.row_num, etl.fn_try_date(r.census_date, 'YYYY-MM-DD') AS census_date, u.unit_code AS ward_code,
           etl.fn_num(r.beds_closed)::int AS beds_closed, r.occupied_midnight AS occ_raw, etl.fn_num(r.occupied_midnight)::int AS occ,
           etl.fn_num(r.admissions)::int AS admissions, etl.fn_num(r.discharges)::int AS discharges, etl.fn_num(r.deaths)::int AS deaths,
           etl.fn_parse_ts(r.submitted_at) AS submitted_at,
           row_number() OVER (PARTITION BY r.census_date, etl.fn_norm(r.ward_code) ORDER BY etl.fn_parse_ts(r.submitted_at) DESC, r.row_num DESC) AS rn
    FROM stg.census_raw r JOIN stg.md_unit_clean u ON etl.fn_norm(u.unit_code) = etl.fn_norm(r.ward_code)
    WHERE r.batch_id = p_batch;
    ANALYZE tmp_cen;
    ALTER TABLE tmp_cen ADD COLUMN complement int, ADD COLUMN pas int, ADD COLUMN occ_final int, ADD COLUMN src text, ADD COLUMN rule text;
    UPDATE tmp_cen t SET complement = etl.fn_unit_attr_asof(t.ward_code, 'bed_complement', t.census_date, u.bed_complement::text)::int,
                         pas = p.pas_occupied
    FROM stg.md_unit_clean u, stg.pas_ward_census p
    WHERE u.unit_code = t.ward_code AND p.ward_code = t.ward_code AND p.census_date = t.census_date AND t.rn = 1;
    -- WC02: a x10 keying error is recognised when the value is far from the PAS census but one tenth of it is close
    -- (genuine overcrowding is close to PAS, so it is never "corrected"); values above 3 x complement are imputed
    ALTER TABLE tmp_cen ADD COLUMN x10 boolean;
    UPDATE tmp_cen SET x10 = occ >= 10 AND abs(occ - pas) > greatest(5, 0.5 * pas)
                             AND abs(occ / 10.0 - pas) <= greatest(2, 0.2 * pas) AND occ / 10.0 <= 1.6 * complement
    WHERE rn = 1;
    UPDATE tmp_cen SET
        rule = CASE WHEN occ IS NULL OR occ < 0 THEN 'WC04' WHEN x10 OR occ > 3 * complement THEN 'WC02' END,
        occ_final = CASE WHEN occ IS NULL OR occ < 0 THEN pas WHEN x10 THEN round(occ / 10.0)
                         WHEN occ > 3 * complement THEN pas ELSE occ END,
        src = CASE WHEN occ IS NULL OR occ < 0 THEN 'Imputed from PAS' WHEN x10 THEN 'Corrected return'
                   WHEN occ > 3 * complement THEN 'Imputed from PAS' ELSE 'Ward return' END
    WHERE rn = 1;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'WC03', 'Ward midnight census', ward_code || '|' || census_date, 'submitted_at', submitted_at::text, 'Earlier submission superseded'
    FROM tmp_cen WHERE rn > 1
    UNION ALL
    SELECT p_batch, rule, 'Ward midnight census', ward_code || '|' || census_date, 'occupied_midnight', coalesce(occ_raw, ''),
           src || ' (value ' || occ_final || ')'
    FROM tmp_cen WHERE rn = 1 AND rule IS NOT NULL;

    INSERT INTO stg.census_clean (census_date, ward_code, beds_closed, occupied_midnight, admissions, discharges, deaths,
                                  submitted_at, census_source, batch_id)
    SELECT census_date, ward_code, coalesce(beds_closed, 0), occ_final, admissions, discharges, deaths, submitted_at, src, p_batch
    FROM tmp_cen WHERE rn = 1 AND census_date IS NOT NULL
    ON CONFLICT (census_date, ward_code) DO UPDATE SET beds_closed = EXCLUDED.beds_closed, occupied_midnight = EXCLUDED.occupied_midnight,
        admissions = EXCLUDED.admissions, discharges = EXCLUDED.discharges, deaths = EXCLUDED.deaths,
        submitted_at = EXCLUDED.submitted_at, census_source = EXCLUDED.census_source, batch_id = EXCLUDED.batch_id;

    -- (3) WC01: ward-days in this batch's window with no return -> imputed from PAS
    SELECT coalesce(min(census_date), v_cut) INTO v_from FROM tmp_cen;
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'WC01', 'Ward midnight census', p.ward_code || '|' || p.census_date, 'occupied_midnight', NULL,
           'Missing return imputed from PAS (value ' || p.pas_occupied || ')'
    FROM stg.pas_ward_census p
    WHERE p.census_date BETWEEN v_from AND v_cut
      AND NOT EXISTS (SELECT 1 FROM stg.census_clean c WHERE c.census_date = p.census_date AND c.ward_code = p.ward_code);
    INSERT INTO stg.census_clean (census_date, ward_code, beds_closed, occupied_midnight, admissions, discharges, deaths,
                                  submitted_at, census_source, batch_id)
    SELECT p.census_date, p.ward_code, 0, p.pas_occupied, p.pas_admissions, p.pas_discharges, p.pas_deaths, NULL, 'Imputed from PAS', p_batch
    FROM stg.pas_ward_census p
    WHERE p.census_date BETWEEN v_from AND v_cut
      AND NOT EXISTS (SELECT 1 FROM stg.census_clean c WHERE c.census_date = p.census_date AND c.ward_code = p.ward_code);
    GET DIAGNOSTICS n_imp = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'transform ward census (WC01-WC04)', 'stg.census_clean', n_in,
                            (SELECT count(*) FROM tmp_cen WHERE rn = 1) + n_imp, (SELECT count(*) FROM tmp_cen WHERE rn > 1), t0,
                            format('%s ward-days imputed from PAS', n_imp));
END $$;

-- ---------------------------------------------------------------------------
-- E-roster shift summary (RS01-RS04)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_roster(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n_out bigint;
BEGIN
    SELECT count(*) INTO n_in FROM stg.roster_raw WHERE batch_id = p_batch;
    DROP TABLE IF EXISTS tmp_ros;
    CREATE TEMP TABLE tmp_ros AS
    SELECT r.*, etl.fn_try_date(r.roster_date, 'YYYY-MM-DD') AS rdate, u.unit_code AS unit,
           coalesce(sm.standard_code, CASE WHEN upper(btrim(r.shift)) IN ('D', 'N') THEN upper(btrim(r.shift)) END) AS shift_code,
           row_number() OVER (PARTITION BY r.roster_date, etl.fn_norm(r.unit_code),
                              coalesce(sm.standard_code, upper(btrim(r.shift))) ORDER BY r.row_num DESC) AS rn
    FROM stg.roster_raw r
    LEFT JOIN stg.md_unit_clean u ON etl.fn_norm(u.unit_code) = etl.fn_norm(r.unit_code)
    LEFT JOIN ref.code_map sm ON sm.code_type = 'SHIFT' AND sm.source_value = r.shift
    WHERE r.batch_id = p_batch;
    ANALYZE tmp_ros;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'RS03', 'E-roster', unit_code || '|' || roster_date || '|' || shift_code, 'row', 'row ' || row_num, 'Duplicate row rejected'
    FROM tmp_ros WHERE rn > 1
    UNION ALL
    SELECT p_batch, 'RS01', 'E-roster', unit_code || '|' || roster_date || '|' || shift_code, 'shift', shift, 'Mapped to ' || shift_code
    FROM tmp_ros WHERE rn = 1 AND shift IS DISTINCT FROM shift_code
    UNION ALL
    SELECT p_batch, 'RS02', 'E-roster', unit_code || '|' || roster_date || '|' || shift_code, x.col, x.val, 'Absolute value used'
    FROM tmp_ros CROSS JOIN LATERAL (VALUES ('rn_hours', rn_hours), ('en_hours', en_hours), ('doctor_hours', doctor_hours),
                                            ('overtime_hours', overtime_hours), ('agency_hours', agency_hours)) AS x(col, val)
    WHERE rn = 1 AND etl.fn_num(x.val) < 0
    UNION ALL
    SELECT p_batch, 'RS04', 'E-roster', unit_code || '|' || roster_date || '|' || shift_code, 'overtime_hours', overtime_hours,
           'Overtime > hours worked: set to NULL'
    FROM tmp_ros WHERE rn = 1 AND etl.fn_num(overtime_hours) > abs(coalesce(etl.fn_num(rn_hours), 0)) + abs(coalesce(etl.fn_num(en_hours), 0));

    INSERT INTO stg.roster_clean (roster_date, unit_code, shift_code, planned_nurse_hours, rn_hours, en_hours, doctor_hours,
                                  overtime_hours, agency_hours, sick_leave_hours, nurses_on_duty, doctors_on_duty, batch_id)
    SELECT rdate, unit, shift_code, abs(etl.fn_num(planned_nurse_hours)), abs(etl.fn_num(rn_hours)), abs(etl.fn_num(en_hours)),
           abs(etl.fn_num(doctor_hours)),
           CASE WHEN etl.fn_num(overtime_hours) > abs(coalesce(etl.fn_num(rn_hours), 0)) + abs(coalesce(etl.fn_num(en_hours), 0)) THEN NULL
                ELSE abs(etl.fn_num(overtime_hours)) END,
           abs(etl.fn_num(agency_hours)), abs(etl.fn_num(sick_leave_hours)), etl.fn_num(nurses_on_duty)::smallint,
           etl.fn_num(doctors_on_duty)::smallint, p_batch
    FROM tmp_ros WHERE rn = 1 AND rdate IS NOT NULL AND unit IS NOT NULL AND shift_code IS NOT NULL
    ON CONFLICT (roster_date, unit_code, shift_code) DO UPDATE SET planned_nurse_hours = EXCLUDED.planned_nurse_hours,
        rn_hours = EXCLUDED.rn_hours, en_hours = EXCLUDED.en_hours, doctor_hours = EXCLUDED.doctor_hours,
        overtime_hours = EXCLUDED.overtime_hours, agency_hours = EXCLUDED.agency_hours, sick_leave_hours = EXCLUDED.sick_leave_hours,
        nurses_on_duty = EXCLUDED.nurses_on_duty, doctors_on_duty = EXCLUDED.doctors_on_duty, batch_id = EXCLUDED.batch_id;
    GET DIAGNOSTICS n_out = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'transform e-roster (RS01-RS04)', 'stg.roster_clean', n_in, n_out, n_in - n_out, t0);
END $$;

-- ---------------------------------------------------------------------------
-- IDSR weekly returns (SV01-SV07); clinical counts from PAS are the reference for SV06
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_idsr(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint; n_out bigint;
BEGIN
    SELECT count(*) INTO n_in FROM stg.idsr_raw WHERE batch_id = p_batch;
    DROP TABLE IF EXISTS tmp_pas_cases;
    CREATE TEMP TABLE tmp_pas_cases AS
    SELECT e.facility_code, date_trunc('week', e.arrival_ts)::date AS epi_week_start, i.condition_code,
           count(*) FILTER (WHERE extract(year FROM e.arrival_ts) - p.birth_year < 5) AS pas_u5,
           count(*) FILTER (WHERE extract(year FROM e.arrival_ts) - p.birth_year >= 5 OR p.birth_year IS NULL) AS pas_5plus
    FROM stg.encounter_clean e
    JOIN stg.md_icd_clean i ON i.icd10_code = e.icd10_code AND i.condition_code IS NOT NULL
    LEFT JOIN stg.patient_clean p ON p.patient_id = e.patient_id
    GROUP BY 1, 2, 3;
    ANALYZE tmp_pas_cases;
    DROP TABLE IF EXISTS tmp_ids;
    CREATE TEMP TABLE tmp_ids AS
    SELECT r.row_num, r.facility_code AS fac_raw, f.facility_code, r.epi_week AS week_raw, etl.fn_parse_epi_week(r.epi_week) AS epi_week_start,
           r.condition AS cond_raw, ca.condition_code,
           etl.fn_num(r.cases_under5)::int AS cu5, etl.fn_num(r.cases_5plus)::int AS c5, etl.fn_num(r.deaths_under5)::int AS du5,
           etl.fn_num(r.deaths_5plus)::int AS d5, etl.fn_num(r.tests_done)::int AS tests, etl.fn_num(r.tests_positive)::int AS tpos,
           etl.fn_parse_ts(r.submitted_at) AS submitted_at, etl.fn_num(r.report_version)::smallint AS report_version
    FROM stg.idsr_raw r
    LEFT JOIN stg.md_facility_clean f ON etl.fn_norm(f.facility_code) = etl.fn_norm(r.facility_code)
    LEFT JOIN ref.condition_alias ca ON ca.alias_norm = etl.fn_norm(r.condition)
    WHERE r.batch_id = p_batch;
    ANALYZE tmp_ids;
    ALTER TABLE tmp_ids ADD COLUMN rn int;
    UPDATE tmp_ids t SET rn = x.rn FROM (
        SELECT ctid, row_number() OVER (PARTITION BY facility_code, epi_week_start, condition_code ORDER BY submitted_at DESC, row_num DESC) AS rn
        FROM tmp_ids) x WHERE x.ctid = t.ctid;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT DISTINCT p_batch, 'SV01', 'IDSR weekly returns', facility_code || '|' || to_char(epi_week_start, 'IYYY-"W"IW'), 'epi_week', week_raw,
           'Parsed as ' || to_char(epi_week_start, 'IYYY-"W"IW')
    FROM tmp_ids WHERE week_raw !~ '^[0-9]{4}-W[0-9]{2}$' AND epi_week_start IS NOT NULL
    UNION ALL
    SELECT DISTINCT p_batch, 'SV02', 'IDSR weekly returns', facility_code || '|' || to_char(epi_week_start, 'IYYY-"W"IW'), 'submitted_at',
           submitted_at::text, 'Superseded version rejected (latest kept)'
    FROM tmp_ids WHERE rn > 1
    UNION ALL
    SELECT p_batch, 'SV03', 'IDSR weekly returns', facility_code || '|' || to_char(epi_week_start, 'IYYY-"W"IW') || '|' || coalesce(condition_code, '?'),
           'condition', cond_raw, 'Mapped to ' || coalesce(condition_code, 'UNKNOWN')
    FROM tmp_ids WHERE rn = 1 AND (condition_code IS NULL OR cond_raw <> condition_code)
    UNION ALL
    SELECT p_batch, 'SV07', 'IDSR weekly returns', facility_code || '|' || to_char(epi_week_start, 'IYYY-"W"IW') || '|' || condition_code,
           x.col, x.v::text, 'Negative count set to NULL'
    FROM tmp_ids CROSS JOIN LATERAL (VALUES ('cases_under5', cu5), ('cases_5plus', c5), ('deaths_under5', du5), ('deaths_5plus', d5)) AS x(col, v)
    WHERE rn = 1 AND x.v < 0;
    UPDATE tmp_ids SET cu5 = CASE WHEN cu5 < 0 THEN NULL ELSE cu5 END, c5 = CASE WHEN c5 < 0 THEN NULL ELSE c5 END,
                       du5 = CASE WHEN du5 < 0 THEN NULL ELSE du5 END, d5 = CASE WHEN d5 < 0 THEN NULL ELSE d5 END;

    -- SV06: x10 keying error against the clinical (PAS) count of the same facility-week-condition
    ALTER TABLE tmp_ids ADD COLUMN pas_5plus int;
    UPDATE tmp_ids t SET pas_5plus = coalesce(p.pas_5plus, 0)
    FROM tmp_pas_cases p WHERE p.facility_code = t.facility_code AND p.epi_week_start = t.epi_week_start AND p.condition_code = t.condition_code;
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'SV06', 'IDSR weekly returns', facility_code || '|' || to_char(epi_week_start, 'IYYY-"W"IW') || '|' || condition_code,
           'cases_5plus', c5::text, 'Divided by 10 (clinical count ' || coalesce(pas_5plus, 0) || ')'
    FROM tmp_ids
    WHERE rn = 1 AND c5 >= 10 AND c5 >= 5 * greatest(coalesce(pas_5plus, 0), 1)
      AND abs(c5 / 10.0 - coalesce(pas_5plus, 0)) <= greatest(2, 0.2 * coalesce(pas_5plus, 0));
    UPDATE tmp_ids SET c5 = round(c5 / 10.0)
    WHERE rn = 1 AND c5 >= 10 AND c5 >= 5 * greatest(coalesce(pas_5plus, 0), 1)
      AND abs(c5 / 10.0 - coalesce(pas_5plus, 0)) <= greatest(2, 0.2 * coalesce(pas_5plus, 0));

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'SV04', 'IDSR weekly returns', facility_code || '|' || to_char(epi_week_start, 'IYYY-"W"IW') || '|' || condition_code,
           'deaths', coalesce(du5, 0) + coalesce(d5, 0) || ' deaths vs ' || coalesce(cu5, 0) + coalesce(c5, 0) || ' cases', 'Deaths set to NULL'
    FROM tmp_ids WHERE rn = 1 AND coalesce(du5, 0) + coalesce(d5, 0) > coalesce(cu5, 0) + coalesce(c5, 0) + 3
    UNION ALL
    SELECT p_batch, 'SV05', 'IDSR weekly returns', facility_code || '|' || to_char(epi_week_start, 'IYYY-"W"IW') || '|' || condition_code,
           'tests', tpos || ' positive of ' || tests, 'Test counts set to NULL'
    FROM tmp_ids WHERE rn = 1 AND tpos > tests;

    -- submission log (timeliness uses the FIRST submission, completeness any version)
    INSERT INTO stg.idsr_submission (facility_code, epi_week_start, first_submitted_at, last_submitted_at, versions, batch_id)
    SELECT facility_code, epi_week_start, min(submitted_at), max(submitted_at), count(DISTINCT submitted_at), p_batch
    FROM tmp_ids WHERE facility_code IS NOT NULL AND epi_week_start IS NOT NULL
    GROUP BY 1, 2
    ON CONFLICT (facility_code, epi_week_start) DO UPDATE
        SET first_submitted_at = least(stg.idsr_submission.first_submitted_at, EXCLUDED.first_submitted_at),
            last_submitted_at = greatest(stg.idsr_submission.last_submitted_at, EXCLUDED.last_submitted_at),
            versions = stg.idsr_submission.versions + EXCLUDED.versions, batch_id = EXCLUDED.batch_id;

    INSERT INTO stg.idsr_clean (facility_code, epi_week_start, condition_code, cases_under5, cases_5plus, deaths_under5, deaths_5plus,
                                tests_done, tests_positive, submitted_at, report_version, batch_id)
    SELECT facility_code, epi_week_start, condition_code, cu5, c5,
           CASE WHEN coalesce(du5, 0) + coalesce(d5, 0) > coalesce(cu5, 0) + coalesce(c5, 0) + 3 THEN NULL ELSE du5 END,
           CASE WHEN coalesce(du5, 0) + coalesce(d5, 0) > coalesce(cu5, 0) + coalesce(c5, 0) + 3 THEN NULL ELSE d5 END,
           CASE WHEN tpos > tests THEN NULL ELSE tests END, CASE WHEN tpos > tests THEN NULL ELSE tpos END,
           submitted_at, report_version, p_batch
    FROM tmp_ids
    WHERE rn = 1 AND facility_code IS NOT NULL AND epi_week_start IS NOT NULL AND condition_code IS NOT NULL
    ON CONFLICT (facility_code, epi_week_start, condition_code) DO UPDATE SET cases_under5 = EXCLUDED.cases_under5,
        cases_5plus = EXCLUDED.cases_5plus, deaths_under5 = EXCLUDED.deaths_under5, deaths_5plus = EXCLUDED.deaths_5plus,
        tests_done = EXCLUDED.tests_done, tests_positive = EXCLUDED.tests_positive, submitted_at = EXCLUDED.submitted_at,
        report_version = EXCLUDED.report_version, batch_id = EXCLUDED.batch_id
    WHERE EXCLUDED.submitted_at >= stg.idsr_clean.submitted_at;
    GET DIAGNOSTICS n_out = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'transform IDSR weekly returns (SV01-SV07)', 'stg.idsr_clean', n_in, n_out, n_in - n_out, t0);
END $$;

-- ---------------------------------------------------------------------------
-- External sources: NSA census (EX01, EX02) and NASA POWER weather (WE01, WE02)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_external(p_batch integer)
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_in bigint;
BEGIN
    SELECT count(*) INTO n_in FROM stg.nsa_census_raw WHERE batch_id = p_batch;
    IF n_in > 0 THEN
        INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
        SELECT p_batch, 'EX01', source_file, region_txt, 'population', population_txt, 'Thousands separators removed'
        FROM stg.nsa_census_raw WHERE batch_id = p_batch AND population_txt ~ '[0-9][ ,][0-9]'
        UNION ALL
        SELECT p_batch, 'EX02', source_file, coalesce(left(region_txt, 60), 'row ' || row_num), 'region', left(coalesce(region_txt, ''), 120),
               CASE WHEN etl.fn_norm(region_txt) = 'NAMIBIA' THEN 'National total kept as control total, excluded from the fact'
                    ELSE 'Title / note row excluded' END
        FROM stg.nsa_census_raw r
        WHERE batch_id = p_batch
          AND (etl.fn_norm(region_txt) = 'NAMIBIA' OR NOT EXISTS (SELECT 1 FROM ref.region_alias a WHERE a.alias_norm = etl.fn_norm(r.region_txt)))
          AND coalesce(btrim(region_txt), '') NOT IN ('', 'Region');
        INSERT INTO stg.nsa_population_clean (region_code, census_year, population, batch_id)
        SELECT a.region_code, 2023, etl.fn_try_numeric(r.population_txt)::int, p_batch
        FROM stg.nsa_census_raw r JOIN ref.region_alias a ON a.alias_norm = etl.fn_norm(r.region_txt)
        WHERE r.batch_id = p_batch AND etl.fn_try_numeric(r.population_txt) IS NOT NULL
        ON CONFLICT (region_code) DO UPDATE SET population = EXCLUDED.population, batch_id = EXCLUDED.batch_id;
        INSERT INTO stg.nsa_control_total (census_year, national_total, batch_id)
        SELECT 2023, etl.fn_try_numeric(population_txt)::int, p_batch FROM stg.nsa_census_raw
        WHERE batch_id = p_batch AND etl.fn_norm(region_txt) = 'NAMIBIA'
        ON CONFLICT (census_year) DO UPDATE SET national_total = EXCLUDED.national_total, batch_id = EXCLUDED.batch_id;
    END IF;

    IF EXISTS (SELECT 1 FROM stg.weather_json_raw WHERE batch_id = p_batch) THEN
        DROP TABLE IF EXISTS tmp_wx;
        CREATE TEMP TABLE tmp_wx AS
        WITH kv AS (
            SELECT w.facility_code, prm.name, e.key, nullif(e.value::numeric, -999) AS val
            FROM stg.weather_json_raw w
            CROSS JOIN (VALUES ('PRECTOTCORR'), ('T2M_MAX'), ('T2M_MIN'), ('RH2M')) AS prm(name)
            CROSS JOIN LATERAL jsonb_each_text(w.payload -> 'properties' -> 'parameter' -> prm.name) AS e(key, value)
            WHERE w.batch_id = p_batch
        )
        SELECT facility_code, to_date(key, 'YYYYMMDD') AS obs_date,
               max(val) FILTER (WHERE name = 'PRECTOTCORR') AS rain, max(val) FILTER (WHERE name = 'T2M_MAX') AS tmax,
               max(val) FILTER (WHERE name = 'T2M_MIN') AS tmin, max(val) FILTER (WHERE name = 'RH2M') AS rh
        FROM kv GROUP BY facility_code, key;
        INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
        SELECT p_batch, 'WE01', 'NASA POWER ' || facility_code, facility_code || '|' || obs_date, x.col, '-999', 'Interpolated'
        FROM tmp_wx CROSS JOIN LATERAL (VALUES ('T2M_MAX', tmax), ('T2M_MIN', tmin), ('RH2M', rh)) AS x(col, v) WHERE x.v IS NULL
        UNION ALL
        SELECT p_batch, 'WE02', 'NASA POWER ' || facility_code, facility_code || '|' || obs_date, 'PRECTOTCORR', '-999',
               CASE WHEN extract(month FROM obs_date) BETWEEN 5 AND 9 THEN 'Set to 0 (dry season)' ELSE 'Left NULL (rainy season)' END
        FROM tmp_wx WHERE rain IS NULL;
        -- linear interpolation between the neighbouring observed days (carry forward/backward at the ends):
        -- running counts of non-null values group each gap with its previous (forward) / next (backward) observation
        INSERT INTO stg.weather_clean (facility_code, obs_date, rainfall_mm, tmax_c, tmin_c, rh_pct, is_imputed, batch_id)
        WITH g AS (
            SELECT t.*,
                   count(tmax) OVER fw AS gx_f, count(tmax) OVER bw AS gx_b,
                   count(tmin) OVER fw AS gn_f, count(tmin) OVER bw AS gn_b,
                   count(rh) OVER fw AS gr_f, count(rh) OVER bw AS gr_b
            FROM tmp_wx t
            WINDOW fw AS (PARTITION BY facility_code ORDER BY obs_date),
                   bw AS (PARTITION BY facility_code ORDER BY obs_date DESC)
        ), nb AS (
            SELECT g.*,
                   first_value(tmax) OVER (PARTITION BY facility_code, gx_f ORDER BY obs_date) AS x_p,
                   first_value(obs_date) OVER (PARTITION BY facility_code, gx_f ORDER BY obs_date) AS x_pd,
                   first_value(tmax) OVER (PARTITION BY facility_code, gx_b ORDER BY obs_date DESC) AS x_n,
                   first_value(obs_date) OVER (PARTITION BY facility_code, gx_b ORDER BY obs_date DESC) AS x_nd,
                   first_value(tmin) OVER (PARTITION BY facility_code, gn_f ORDER BY obs_date) AS n_p,
                   first_value(obs_date) OVER (PARTITION BY facility_code, gn_f ORDER BY obs_date) AS n_pd,
                   first_value(tmin) OVER (PARTITION BY facility_code, gn_b ORDER BY obs_date DESC) AS n_n,
                   first_value(obs_date) OVER (PARTITION BY facility_code, gn_b ORDER BY obs_date DESC) AS n_nd,
                   first_value(rh) OVER (PARTITION BY facility_code, gr_f ORDER BY obs_date) AS r_p,
                   first_value(obs_date) OVER (PARTITION BY facility_code, gr_f ORDER BY obs_date) AS r_pd,
                   first_value(rh) OVER (PARTITION BY facility_code, gr_b ORDER BY obs_date DESC) AS r_n,
                   first_value(obs_date) OVER (PARTITION BY facility_code, gr_b ORDER BY obs_date DESC) AS r_nd
            FROM g
        )
        SELECT facility_code, obs_date,
               CASE WHEN rain IS NOT NULL THEN rain WHEN extract(month FROM obs_date) BETWEEN 5 AND 9 THEN 0 END,
               coalesce(tmax, round(coalesce(x_p + (x_n - x_p) * (obs_date - x_pd) / nullif(x_nd - x_pd, 0), x_p, x_n), 2)),
               coalesce(tmin, round(coalesce(n_p + (n_n - n_p) * (obs_date - n_pd) / nullif(n_nd - n_pd, 0), n_p, n_n), 2)),
               coalesce(rh, round(coalesce(r_p + (r_n - r_p) * (obs_date - r_pd) / nullif(r_nd - r_pd, 0), r_p, r_n), 2)),
               (rain IS NULL OR tmax IS NULL OR tmin IS NULL OR rh IS NULL), p_batch
        FROM nb
        ON CONFLICT (facility_code, obs_date) DO UPDATE SET rainfall_mm = EXCLUDED.rainfall_mm, tmax_c = EXCLUDED.tmax_c,
            tmin_c = EXCLUDED.tmin_c, rh_pct = EXCLUDED.rh_pct, is_imputed = EXCLUDED.is_imputed, batch_id = EXCLUDED.batch_id;
    END IF;
    PERFORM etl.fn_log_step(p_batch, 'transform external sources (EX01-EX02, WE01-WE02)', 'stg.nsa_population_clean, stg.weather_clean',
                            n_in, (SELECT count(*) FROM stg.nsa_population_clean) + (SELECT count(*) FROM stg.weather_clean WHERE batch_id = p_batch), 0, t0);
END $$;
