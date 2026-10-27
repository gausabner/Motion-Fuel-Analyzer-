--
-- PostgreSQL database dump
--

\restrict vJteyUfZUyasIuJ9edVShctWI3QLKgMFgerNsfGAAnTmnG1vESffPsJ35Zoscdv

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA audit;


--
-- Name: SCHEMA audit; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA audit IS 'ETL batches, step log, data-quality issue log and reconciliation results (lineage evidence).';


--
-- Name: dw; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA dw;


--
-- Name: SCHEMA dw; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA dw IS 'Dimensional warehouse: conformed dimensions and fact tables (system of record for BI).';


--
-- Name: etl; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA etl;


--
-- Name: SCHEMA etl; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA etl IS 'ETL helper functions and load procedures.';


--
-- Name: mart; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA mart;


--
-- Name: SCHEMA mart; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA mart IS 'Presentation views consumed by the Power BI semantic model (only needed columns, no identifiers).';


--
-- Name: ref; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ref;


--
-- Name: SCHEMA ref; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA ref IS 'Reference/mapping tables maintained by data stewards (code mappings and aliases).';


--
-- Name: sec; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA sec;


--
-- Name: SCHEMA sec; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA sec IS 'Security metadata: user-to-facility mapping for dynamic row-level security.';


--
-- Name: stg; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA stg;


--
-- Name: SCHEMA stg; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA stg IS 'Landing (raw text, one table per source layout) and cleansed staging tables.';


--
-- Name: fn_age_band_key(integer); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_age_band_key(p_age integer) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT (CASE WHEN p_age IS NULL OR p_age < 0 OR p_age > 115 THEN -1
                 WHEN p_age < 5 THEN 1 WHEN p_age < 15 THEN 2 WHEN p_age < 25 THEN 3
                 WHEN p_age < 45 THEN 4 WHEN p_age < 65 THEN 5 ELSE 6 END)::smallint
$$;


--
-- Name: fn_batch_cutoff(integer); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_batch_cutoff(p_batch integer) RETURNS timestamp without time zone
    LANGUAGE sql STABLE
    AS $$
    SELECT extract_cutoff FROM audit.etl_batch WHERE batch_id = p_batch
$$;


--
-- Name: fn_date_key(date); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_date_key(p_date date) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT CASE WHEN p_date IS NULL THEN -1 ELSE to_char(p_date, 'YYYYMMDD')::int END
$$;


--
-- Name: fn_easter_sunday(integer); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_easter_sunday(p_year integer) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mon int; dy int;
BEGIN
    a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4;
    f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
    i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
    mon := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
    RETURN make_date(p_year, mon, dy);
END $$;


--
-- Name: fn_icd_clean(text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_icd_clean(p_txt text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    AS $_$
DECLARE s text := regexp_replace(upper(btrim(coalesce(p_txt, ''))), '[^A-Z0-9.]', '', 'g');
BEGIN
    IF s = '' THEN RETURN NULL; END IF;
    IF s ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$' THEN RETURN s; END IF;
    IF s ~ '^[A-Z][0-9]{3,4}$' THEN RETURN substr(s, 1, 3) || '.' || substr(s, 4); END IF;
    RETURN s;
END $_$;


--
-- Name: fn_log_step(integer, text, text, bigint, bigint, bigint, timestamp with time zone, text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_log_step(p_batch integer, p_step text, p_target text, p_in bigint, p_out bigint, p_rej bigint, p_started timestamp with time zone, p_msg text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO audit.etl_step_log (batch_id, step_name, target_table, rows_in, rows_out, rows_rejected, started_at, message)
    VALUES (p_batch, p_step, p_target, p_in, p_out, p_rej, p_started, p_msg);
END $$;


--
-- Name: fn_minutes(timestamp without time zone, timestamp without time zone); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_minutes(p_from timestamp without time zone, p_to timestamp without time zone) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT round((extract(epoch FROM (p_to - p_from)) / 60.0)::numeric, 1)
$$;


--
-- Name: fn_namibian_holiday(date); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_namibian_holiday(p_date date) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE y int := extract(year FROM p_date); e date; fixed record; obs date;
BEGIN
    e := etl.fn_easter_sunday(y);
    IF p_date = e - 2 THEN RETURN 'Good Friday'; END IF;
    IF p_date = e + 1 THEN RETURN 'Easter Monday'; END IF;
    IF p_date = e + 39 THEN RETURN 'Ascension Day'; END IF;
    FOR fixed IN
        SELECT * FROM (VALUES (1, 1, 'New Year''s Day'), (3, 21, 'Independence Day'), (5, 1, 'Workers'' Day'),
                              (5, 4, 'Cassinga Day'), (5, 25, 'Africa Day'), (5, 28, 'Genocide Remembrance Day'),
                              (8, 26, 'Heroes'' Day'), (12, 10, 'Human Rights Day'), (12, 25, 'Christmas Day'),
                              (12, 26, 'Family Day')) AS t(m, d, n)
    LOOP
        IF fixed.n = 'Genocide Remembrance Day' AND y < 2025 THEN CONTINUE; END IF;
        obs := make_date(y, fixed.m, fixed.d);
        IF p_date = obs THEN RETURN fixed.n; END IF;
        IF extract(isodow FROM obs) = 7 AND p_date = obs + 1 THEN RETURN fixed.n || ' (observed)'; END IF;
    END LOOP;
    RETURN NULL;
END $$;


--
-- Name: fn_norm(text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_norm(p_txt text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT nullif(regexp_replace(upper(coalesce(p_txt, '')), '[^A-Z0-9]', '', 'g'), '')
$$;


--
-- Name: fn_num(text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_num(p_txt text) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $_$
    SELECT CASE WHEN btrim(p_txt) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(p_txt)::numeric END
$_$;


--
-- Name: fn_parse_epi_week(text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_parse_epi_week(p_txt text) RETURNS date
    LANGUAGE sql IMMUTABLE
    AS $_$
    SELECT CASE WHEN m IS NULL OR m[2]::int NOT BETWEEN 1 AND 53 THEN NULL
                WHEN to_char(to_date(m[1] || '-' || lpad(m[2], 2, '0'), 'IYYY-IW'), 'IYYY-IW') <> m[1] || '-' || lpad(m[2], 2, '0') THEN NULL
                ELSE to_date(m[1] || '-' || lpad(m[2], 2, '0'), 'IYYY-IW') END
    FROM (SELECT coalesce(regexp_match(btrim(p_txt), '^([0-9]{4})-?W([0-9]{1,2})$'),
                          (SELECT ARRAY[x[2], x[1]] FROM regexp_match(btrim(p_txt), '^W([0-9]{1,2})/([0-9]{4})$') x)) AS m) s
$_$;


--
-- Name: fn_parse_ts(text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_parse_ts(p_txt text) RETURNS timestamp without time zone
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $_$
    SELECT CASE
        WHEN p_txt ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])[ T]([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          OR p_txt ~ '^[0-9]{4}-(0[13-9]|1[0-2])-(29|30)[ T]([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          OR p_txt ~ '^[0-9]{4}-(0[13578]|1[02])-31[ T]([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          OR p_txt ~ '^20(0[048]|[2468][048]|[13579][26])-02-29[ T]([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
            THEN p_txt::timestamp
        WHEN p_txt ~ '^(0[1-9]|1[0-9]|2[0-8])/(0[1-9]|1[0-2])/[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'
          OR p_txt ~ '^(29|30)/(0[13-9]|1[0-2])/[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'
          OR p_txt ~ '^31/(0[13578]|1[02])/[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'
          OR p_txt ~ '^29/02/20(0[048]|[2468][048]|[13579][26]) ([01][0-9]|2[0-3]):[0-5][0-9]$'
            THEN to_timestamp(p_txt, 'DD/MM/YYYY HH24:MI')::timestamp
    END
$_$;


--
-- Name: fn_patient_attr_asof(text, text, date, text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_patient_attr_asof(p_patient text, p_attr text, p_asof date, p_current text) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce(
        (SELECT h.new_value FROM stg.patient_change_clean h
          WHERE h.patient_id = p_patient AND h.attribute = p_attr AND h.effective_date <= p_asof
          ORDER BY h.effective_date DESC, h.change_id DESC LIMIT 1),
        (SELECT h.old_value FROM stg.patient_change_clean h
          WHERE h.patient_id = p_patient AND h.attribute = p_attr
          ORDER BY h.effective_date ASC, h.change_id ASC LIMIT 1),
        p_current)
$$;


--
-- Name: fn_recon_add(integer, text, text, text, numeric, numeric, numeric, numeric, text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_recon_add(p_batch integer, p_code text, p_name text, p_type text, p_src numeric, p_tgt numeric, p_tol numeric, p_warn_band numeric, p_expl text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE v_status text;
BEGIN
    v_status := CASE WHEN abs(coalesce(p_tgt, 0) - coalesce(p_src, 0)) <= p_tol THEN 'PASS'
                     WHEN abs(coalesce(p_tgt, 0) - coalesce(p_src, 0)) <= p_warn_band THEN 'WARN'
                     ELSE 'FAIL' END;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, p_code, p_name, p_type, p_src, p_tgt, p_tol, v_status, p_expl);
END $$;


--
-- Name: fn_start_batch(text, text, timestamp without time zone); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_start_batch(p_type text, p_description text, p_cutoff timestamp without time zone DEFAULT NULL::timestamp without time zone) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE v integer;
BEGIN
    INSERT INTO audit.etl_batch (batch_type, description, extract_cutoff) VALUES (p_type, p_description, p_cutoff)
    RETURNING batch_id INTO v;
    RETURN v;
END $$;


--
-- Name: fn_try_date(text, text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_try_date(p_txt text, p_fmt text) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE v date;
BEGIN
    IF p_txt IS NULL OR btrim(p_txt) = '' THEN RETURN NULL; END IF;
    v := to_date(btrim(p_txt), p_fmt);
    -- to_date is lenient with trailing text; enforce a round trip for strictness
    IF to_char(v, p_fmt) <> btrim(p_txt) AND upper(to_char(v, p_fmt)) <> upper(btrim(p_txt)) THEN
        RETURN NULL;
    END IF;
    RETURN v;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;


--
-- Name: fn_try_numeric(text, boolean); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_try_numeric(p_txt text, p_decimal_comma boolean DEFAULT false) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
DECLARE s text;
BEGIN
    IF p_txt IS NULL THEN RETURN NULL; END IF;
    s := regexp_replace(p_txt, '(N\$|NAD|\s)', '', 'g');
    IF s = '' OR upper(s) IN ('N/A', 'NA', '..', '…', '.') THEN RETURN NULL; END IF;
    IF p_decimal_comma THEN
        s := replace(replace(s, '.', ''), ',', '.');
    ELSE
        s := replace(s, ',', '');
    END IF;
    RETURN s::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $_$;


--
-- Name: fn_ts_is_dayfirst(text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_ts_is_dayfirst(p_txt text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT coalesce(btrim(p_txt) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4} ', false)
$$;


--
-- Name: fn_unit_attr_asof(text, text, date, text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_unit_attr_asof(p_unit text, p_attr text, p_asof date, p_current text) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce(
        (SELECT h.new_value FROM stg.md_unit_history_clean h
          WHERE h.unit_code = p_unit AND h.attribute = p_attr AND h.effective_date <= p_asof
          ORDER BY h.effective_date DESC, h.change_id DESC LIMIT 1),
        (SELECT h.old_value FROM stg.md_unit_history_clean h
          WHERE h.unit_code = p_unit AND h.attribute = p_attr
          ORDER BY h.effective_date ASC, h.change_id ASC LIMIT 1),
        p_current)
$$;


--
-- Name: sp_add_inferred_patients(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_add_inferred_patients(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_finish_batch(integer, text); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_finish_batch(IN p_batch integer, IN p_status text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE audit.etl_batch SET finished_at = clock_timestamp(), status = p_status WHERE batch_id = p_batch;
END $$;


--
-- Name: sp_load_dim_care_unit_scd2(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_care_unit_scd2(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_dim_clinical(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_clinical(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_dim_date(integer, date, date); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_date(IN p_batch integer, IN p_start date, IN p_end date)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_dim_geography(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_geography(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_dim_patient_scd2(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_patient_scd2(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_fact_admission(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_admission(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_fact_encounter(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_encounter(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_fact_population(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_population(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_fact_staff_roster(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_staff_roster(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_fact_surveillance(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_surveillance(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_fact_ward_census(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_ward_census(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_fact_weather(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_weather(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_load_static_dims(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_static_dims(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_reconcile(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_reconcile(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_run_load(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_run_load(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_transform_census(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_census(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_transform_encounters(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_encounters(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_transform_external(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_external(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_transform_idsr(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_idsr(IN p_batch integer)
    LANGUAGE plpgsql
    AS $_$
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
END $_$;


--
-- Name: sp_transform_master(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_master(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_transform_patients(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_patients(IN p_batch integer)
    LANGUAGE plpgsql
    AS $_$
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
END $_$;


--
-- Name: sp_transform_roster(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_roster(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sp_transform_spells(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_spells(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: dq_issue_log; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.dq_issue_log (
    issue_id bigint NOT NULL,
    batch_id integer NOT NULL,
    rule_code text NOT NULL,
    source_object text NOT NULL,
    source_key text,
    column_name text,
    raw_value text,
    action_taken text NOT NULL,
    logged_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: TABLE dq_issue_log; Type: COMMENT; Schema: audit; Owner: -
--

COMMENT ON TABLE audit.dq_issue_log IS 'Row-level record of every data-quality rule hit and the action taken (no clinical free text is ever logged).';


--
-- Name: dq_issue_log_issue_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

ALTER TABLE audit.dq_issue_log ALTER COLUMN issue_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME audit.dq_issue_log_issue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dq_rule; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.dq_rule (
    rule_code text NOT NULL,
    rule_name text NOT NULL,
    dq_dimension text NOT NULL,
    source_object text NOT NULL,
    action text NOT NULL,
    owner_role text NOT NULL,
    description text NOT NULL,
    CONSTRAINT dq_rule_action_check CHECK ((action = ANY (ARRAY['REJECT'::text, 'CORRECT'::text, 'FLAG'::text, 'MAP'::text, 'IMPUTE'::text, 'KEEP LATEST'::text, 'INFER'::text]))),
    CONSTRAINT dq_rule_dq_dimension_check CHECK ((dq_dimension = ANY (ARRAY['Completeness'::text, 'Validity'::text, 'Uniqueness'::text, 'Consistency'::text, 'Accuracy'::text, 'Timeliness'::text, 'Integrity'::text])))
);


--
-- Name: TABLE dq_rule; Type: COMMENT; Schema: audit; Owner: -
--

COMMENT ON TABLE audit.dq_rule IS 'Catalogue of data-quality rules (rule code, DQ dimension, action and accountable steward role).';


--
-- Name: etl_batch; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.etl_batch (
    batch_id integer NOT NULL,
    batch_type text NOT NULL,
    description text,
    extract_cutoff timestamp without time zone,
    started_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'RUNNING'::text NOT NULL,
    run_by text DEFAULT CURRENT_USER NOT NULL,
    CONSTRAINT etl_batch_batch_type_check CHECK ((batch_type = ANY (ARRAY['FULL'::text, 'INCREMENTAL'::text]))),
    CONSTRAINT etl_batch_status_check CHECK ((status = ANY (ARRAY['RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text])))
);


--
-- Name: TABLE etl_batch; Type: COMMENT; Schema: audit; Owner: -
--

COMMENT ON TABLE audit.etl_batch IS 'One row per pipeline execution (full rebuild or incremental delta) with its extract cut-off.';


--
-- Name: etl_batch_batch_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

ALTER TABLE audit.etl_batch ALTER COLUMN batch_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME audit.etl_batch_batch_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: etl_step_log; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.etl_step_log (
    step_id bigint NOT NULL,
    batch_id integer NOT NULL,
    step_name text NOT NULL,
    target_table text,
    rows_in bigint,
    rows_out bigint,
    rows_rejected bigint,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    duration_ms numeric(12,1) GENERATED ALWAYS AS ((EXTRACT(epoch FROM (finished_at - started_at)) * (1000)::numeric)) STORED,
    message text
);


--
-- Name: TABLE etl_step_log; Type: COMMENT; Schema: audit; Owner: -
--

COMMENT ON TABLE audit.etl_step_log IS 'Row counts and timings for every extract/transform/load step (operational lineage).';


--
-- Name: etl_step_log_step_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

ALTER TABLE audit.etl_step_log ALTER COLUMN step_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME audit.etl_step_log_step_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: recon_result; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.recon_result (
    recon_id bigint NOT NULL,
    batch_id integer NOT NULL,
    check_code text NOT NULL,
    check_name text NOT NULL,
    check_type text NOT NULL,
    source_value numeric,
    target_value numeric,
    difference numeric GENERATED ALWAYS AS ((COALESCE(target_value, (0)::numeric) - COALESCE(source_value, (0)::numeric))) STORED,
    tolerance numeric DEFAULT 0 NOT NULL,
    status text NOT NULL,
    explanation text,
    checked_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT recon_result_check_type_check CHECK ((check_type = ANY (ARRAY['ROW_COUNT'::text, 'CONTROL_TOTAL'::text, 'REFERENTIAL'::text, 'CROSS_SOURCE'::text, 'INTEGRITY'::text, 'COMPLETENESS'::text, 'PLAUSIBILITY'::text]))),
    CONSTRAINT recon_result_status_check CHECK ((status = ANY (ARRAY['PASS'::text, 'WARN'::text, 'FAIL'::text])))
);


--
-- Name: TABLE recon_result; Type: COMMENT; Schema: audit; Owner: -
--

COMMENT ON TABLE audit.recon_result IS 'Reconciliation evidence: row counts, control totals, referential and cross-source checks per batch.';


--
-- Name: recon_result_recon_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

ALTER TABLE audit.recon_result ALTER COLUMN recon_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME audit.recon_result_recon_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dim_admission_profile; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_admission_profile (
    admission_profile_key smallint NOT NULL,
    admission_method_code character varying(11) NOT NULL,
    admission_method_name character varying(50),
    is_emergency boolean,
    discharge_status_code character varying(8) NOT NULL,
    discharge_status_name character varying(45)
);


--
-- Name: TABLE dim_admission_profile; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_admission_profile IS 'Junk dimension: admission method x discharge status (IN = not yet discharged; updated as the accumulating snapshot progresses).';


--
-- Name: COLUMN dim_admission_profile.admission_profile_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_admission_profile.admission_profile_key IS 'Surrogate key. | Source: generated (Cartesian product)';


--
-- Name: COLUMN dim_admission_profile.admission_method_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_admission_profile.admission_method_code IS 'EMER-ED, EMER-DIRECT, ELECTIVE, MATERNITY, TRANSFER-IN or UNK. | Source: PAS admission_method via ref.code_map (AD07)';


--
-- Name: COLUMN dim_admission_profile.admission_method_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_admission_profile.admission_method_name IS 'Admission method description. | Source: ref.code_map';


--
-- Name: COLUMN dim_admission_profile.is_emergency; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_admission_profile.is_emergency IS 'True for unplanned admissions (EMER-ED, EMER-DIRECT, TRANSFER-IN). | Source: derived';


--
-- Name: COLUMN dim_admission_profile.discharge_status_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_admission_profile.discharge_status_code IS 'HOME, TRANSFER, DIED, AMA, IN (still in hospital) or UNK. | Source: PAS discharge_status';


--
-- Name: COLUMN dim_admission_profile.discharge_status_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_admission_profile.discharge_status_name IS 'Discharge status description. | Source: ref.code_map';


--
-- Name: dim_age_band; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_age_band (
    age_band_key smallint NOT NULL,
    age_band character varying(8) NOT NULL,
    age_from smallint,
    age_to smallint,
    idsr_age_group character varying(12),
    life_stage character varying(12)
);


--
-- Name: TABLE dim_age_band; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_age_band IS 'Age bands (age at the time of care), conformed between attendances and admissions; small-cell friendly groupings.';


--
-- Name: COLUMN dim_age_band.age_band_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_age_band.age_band_key IS 'Surrogate key = sort order (-1 = Unknown). | Source: generated';


--
-- Name: COLUMN dim_age_band.age_band; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_age_band.age_band IS 'Age band label (0-4, 5-14, 15-24, 25-44, 45-64, 65+). | Source: generated';


--
-- Name: COLUMN dim_age_band.age_from; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_age_band.age_from IS 'Lower bound in completed years. | Source: generated';


--
-- Name: COLUMN dim_age_band.age_to; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_age_band.age_to IS 'Upper bound in completed years (NULL = open-ended). | Source: generated';


--
-- Name: COLUMN dim_age_band.idsr_age_group; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_age_band.idsr_age_group IS 'IDSR reporting group: Under 5 or 5 and over. | Source: generated';


--
-- Name: COLUMN dim_age_band.life_stage; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_age_band.life_stage IS 'Child, Adult or Older adult. | Source: generated';


--
-- Name: dim_care_unit; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_care_unit (
    care_unit_key integer NOT NULL,
    unit_code character varying(10) NOT NULL,
    unit_name character varying(40),
    unit_type character varying(25),
    facility_key integer NOT NULL,
    specialty character varying(25),
    bed_complement smallint,
    scd_effective_from date NOT NULL,
    scd_effective_to date DEFAULT '9999-12-31'::date NOT NULL,
    scd_is_current boolean NOT NULL,
    scd_version smallint NOT NULL,
    scd_row_hash character(32) NOT NULL,
    dw_batch_id integer,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_care_unit; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_care_unit IS 'Care units (wards, emergency departments, clinic outpatient units). SCD Type 2 on specialty and bed complement; snowflaked to dim_facility.';


--
-- Name: COLUMN dim_care_unit.care_unit_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.care_unit_key IS 'Surrogate key of the unit version (-1 = Unknown). | Source: generated';


--
-- Name: COLUMN dim_care_unit.unit_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.unit_code IS 'Unit natural key, <facility>-<unit> (e.g. RUN-MED1). | Source: master data, Care_Units sheet';


--
-- Name: COLUMN dim_care_unit.unit_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.unit_name IS 'Unit name (Type 1). | Source: master data';


--
-- Name: COLUMN dim_care_unit.unit_type; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.unit_type IS 'Inpatient ward, Emergency department or Outpatient clinic (Type 1). | Source: master data';


--
-- Name: COLUMN dim_care_unit.facility_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.facility_key IS 'FK to dim_facility (snowflake). | Source: master data facility_code';


--
-- Name: COLUMN dim_care_unit.specialty; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.specialty IS 'Clinical specialty valid for this version (Type 2), e.g. Medical, Paediatric, Isolation (COVID-19). | Source: master data + Unit_History replay';


--
-- Name: COLUMN dim_care_unit.bed_complement; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.bed_complement IS 'Official (funded) beds valid for this version (Type 2); 0 for ED and clinics. | Source: master data + Unit_History replay';


--
-- Name: COLUMN dim_care_unit.scd_effective_from; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.scd_effective_from IS 'First day the version is valid. | Source: Unit_History effective_date';


--
-- Name: COLUMN dim_care_unit.scd_effective_to; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.scd_effective_to IS 'Last day the version is valid (9999-12-31 for the current version). | Source: ETL';


--
-- Name: COLUMN dim_care_unit.scd_is_current; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.scd_is_current IS 'True for the current version of the unit. | Source: ETL';


--
-- Name: COLUMN dim_care_unit.scd_version; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.scd_version IS 'Version number per unit (1 = first). | Source: ETL';


--
-- Name: COLUMN dim_care_unit.scd_row_hash; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.scd_row_hash IS 'MD5 of the Type 2 attributes, used to detect changes. | Source: ETL';


--
-- Name: COLUMN dim_care_unit.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.dw_batch_id IS 'Batch that created or last expired the version. | Source: ETL';


--
-- Name: COLUMN dim_care_unit.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_care_unit.dw_updated_at IS 'Last update timestamp. | Source: ETL';


--
-- Name: dim_condition; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_condition (
    condition_key integer NOT NULL,
    condition_code character varying(5) NOT NULL,
    condition_name character varying(40) NOT NULL,
    idsr_category character varying(50),
    notification character varying(30),
    alert_threshold character varying(120),
    icd10_codes character varying(20),
    is_notifiable boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE dim_condition; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_condition IS 'IDSR priority conditions (grain of the surveillance fact); snowflake parent of dim_diagnosis.';


--
-- Name: COLUMN dim_condition.condition_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.condition_key IS 'Surrogate key (-1 = Unknown, -2 = Not a notifiable condition). | Source: generated';


--
-- Name: COLUMN dim_condition.condition_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.condition_code IS 'GBHS IDSR condition code (MAL, COV, MEA ...). | Source: master data, IDSR_Conditions sheet';


--
-- Name: COLUMN dim_condition.condition_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.condition_name IS 'Condition name. | Source: master data';


--
-- Name: COLUMN dim_condition.idsr_category; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.idsr_category IS 'IDSR category (epidemic-prone, targeted for elimination, other priority). | Source: master data (IDSR technical guidelines)';


--
-- Name: COLUMN dim_condition.notification; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.notification IS 'Notification timeline (immediate within 24 h or weekly). | Source: master data';


--
-- Name: COLUMN dim_condition.alert_threshold; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.alert_threshold IS 'Alert threshold used by GBHS surveillance officers. | Source: master data (GBHS SOP)';


--
-- Name: COLUMN dim_condition.icd10_codes; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.icd10_codes IS 'ICD-10 codes mapped to the condition. | Source: master data';


--
-- Name: COLUMN dim_condition.is_notifiable; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_condition.is_notifiable IS 'False only for the -2 member. | Source: ETL';


--
-- Name: dim_date; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_date (
    date_key integer NOT NULL,
    full_date date,
    day_of_month smallint,
    day_of_year smallint,
    day_of_week_iso smallint,
    day_name character varying(9),
    day_short character(3),
    is_weekend boolean,
    is_public_holiday boolean,
    holiday_name character varying(40),
    is_working_day boolean,
    epi_year smallint,
    epi_week smallint,
    epi_week_label character(8),
    epi_week_key integer,
    epi_week_start date,
    month_num smallint,
    month_name character varying(9),
    month_short character(3),
    year_month character(7),
    year_month_key integer,
    month_start_date date,
    month_end_date date,
    quarter_num smallint,
    year_quarter character(7),
    calendar_year smallint,
    fiscal_year_label character(9),
    fiscal_year_start smallint,
    fiscal_quarter_label character(13),
    rainy_season_label character(7),
    is_malaria_season boolean,
    is_after_cutoff boolean,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_date IS 'Conformed calendar dimension, one row per day 2021-01-01..2027-12-31 plus -1 Unknown and -2 Not applicable; calendar, ISO epidemiological week, fiscal (Apr-Mar) and rainy-season hierarchies.';


--
-- Name: COLUMN dim_date.date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.date_key IS 'Smart surrogate key YYYYMMDD (-1 = unknown, -2 = not applicable / not yet happened). | Source: generated by etl.sp_load_dim_date';


--
-- Name: COLUMN dim_date.full_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.full_date IS 'Calendar date. | Source: generated';


--
-- Name: COLUMN dim_date.day_of_month; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.day_of_month IS 'Day number within the month (1-31). | Source: derived';


--
-- Name: COLUMN dim_date.day_of_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.day_of_year IS 'Day number within the calendar year (1-366). | Source: derived';


--
-- Name: COLUMN dim_date.day_of_week_iso; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.day_of_week_iso IS 'ISO weekday number, Monday = 1 ... Sunday = 7 (sort key for day_name). | Source: derived';


--
-- Name: COLUMN dim_date.day_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.day_name IS 'Weekday name (Monday..Sunday). | Source: derived';


--
-- Name: COLUMN dim_date.day_short; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.day_short IS 'Three-letter weekday abbreviation (sort by day_of_week_iso). | Source: derived';


--
-- Name: COLUMN dim_date.is_weekend; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_weekend IS 'True for Saturday and Sunday. | Source: derived';


--
-- Name: COLUMN dim_date.is_public_holiday; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_public_holiday IS 'True on Namibian public holidays (Public Holidays Act 26 of 1990, Sunday holidays observed on Monday). | Source: etl.fn_namibian_holiday';


--
-- Name: COLUMN dim_date.holiday_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.holiday_name IS 'Name of the Namibian public holiday, NULL otherwise. | Source: etl.fn_namibian_holiday';


--
-- Name: COLUMN dim_date.is_working_day; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_working_day IS 'Clinic working day: Monday-Saturday and not a public holiday. | Source: derived';


--
-- Name: COLUMN dim_date.epi_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.epi_year IS 'Epidemiological (ISO-8601) year of the epi week; can differ from the calendar year around 1 January. | Source: derived (IYYY)';


--
-- Name: COLUMN dim_date.epi_week; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.epi_week IS 'Epidemiological week number 1-53 (ISO-8601, Monday-Sunday), as used for IDSR weekly reporting. | Source: derived (IW)';


--
-- Name: COLUMN dim_date.epi_week_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.epi_week_label IS 'Epi week label YYYY-Www (e.g. 2026-W39). | Source: derived';


--
-- Name: COLUMN dim_date.epi_week_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.epi_week_key IS 'Integer YYYYWW (sort key for epi_week_label). | Source: derived';


--
-- Name: COLUMN dim_date.epi_week_start; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.epi_week_start IS 'Monday of the epi week (key used by the weekly surveillance facts). | Source: derived';


--
-- Name: COLUMN dim_date.month_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.month_num IS 'Calendar month number 1-12 (sort key for month_name). | Source: derived';


--
-- Name: COLUMN dim_date.month_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.month_name IS 'Calendar month name. | Source: derived';


--
-- Name: COLUMN dim_date.month_short; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.month_short IS 'Three-letter month abbreviation (sort by month_num). | Source: derived';


--
-- Name: COLUMN dim_date.year_month; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.year_month IS 'Year-month label YYYY-MM. | Source: derived';


--
-- Name: COLUMN dim_date.year_month_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.year_month_key IS 'Integer YYYYMM (sort key for year_month). | Source: derived';


--
-- Name: COLUMN dim_date.month_start_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.month_start_date IS 'First day of the month. | Source: derived';


--
-- Name: COLUMN dim_date.month_end_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.month_end_date IS 'Last day of the month. | Source: derived';


--
-- Name: COLUMN dim_date.quarter_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.quarter_num IS 'Calendar quarter 1-4. | Source: derived';


--
-- Name: COLUMN dim_date.year_quarter; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.year_quarter IS 'Quarter label YYYY-Qn. | Source: derived';


--
-- Name: COLUMN dim_date.calendar_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.calendar_year IS 'Calendar year (time-intelligence year for YTD and year-on-year measures). | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_year_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_year_label IS 'Fiscal year label FYyyyy/yy; the GBHS financial year runs 1 April - 31 March (aligned with the Namibian public sector). | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_year_start; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_year_start IS 'Calendar year in which the fiscal year starts (sort key for fiscal_year_label). | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_quarter_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_quarter_label IS 'Fiscal quarter label FYyyyy/yy-Qn. | Source: derived';


--
-- Name: COLUMN dim_date.rainy_season_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.rainy_season_label IS 'Rainy season (July-June) label yyyy/yy used for malaria seasonality analysis. | Source: derived';


--
-- Name: COLUMN dim_date.is_malaria_season; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_malaria_season IS 'True January-May, the usual malaria transmission peak in northern Namibia. | Source: derived (GBHS planning assumption)';


--
-- Name: COLUMN dim_date.is_after_cutoff; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_after_cutoff IS 'True for dates after the latest extract cut-off (future dates used by forecasts). | Source: derived per batch';


--
-- Name: COLUMN dim_date.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.dw_created_at IS 'Load timestamp of the row. | Source: ETL';


--
-- Name: dim_diagnosis; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_diagnosis (
    diagnosis_key integer NOT NULL,
    icd10_code character varying(7) NOT NULL,
    icd10_category character varying(3),
    icd10_title character varying(110),
    block_range character varying(7),
    block_title character varying(110),
    chapter_code character varying(5),
    chapter_number smallint,
    chapter_range character varying(7),
    chapter_title character varying(120),
    severity_class character varying(10),
    default_specialty character varying(20),
    is_chronic boolean,
    condition_key integer NOT NULL
);


--
-- Name: TABLE dim_diagnosis; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_diagnosis IS 'WHO ICD-10 codes used by GBHS with the chapter > block > category hierarchy flattened; snowflaked to dim_condition (IDSR).';


--
-- Name: COLUMN dim_diagnosis.diagnosis_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.diagnosis_key IS 'Surrogate key (-1 = Unknown / not coded). | Source: generated';


--
-- Name: COLUMN dim_diagnosis.icd10_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.icd10_code IS 'ICD-10 code (e.g. B50.9). | Source: master data, ICD10_Codes sheet (MD06)';


--
-- Name: COLUMN dim_diagnosis.icd10_category; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.icd10_category IS 'Three-character ICD-10 category (e.g. B50). | Source: derived';


--
-- Name: COLUMN dim_diagnosis.icd10_title; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.icd10_title IS 'WHO ICD-10 title. | Source: master data';


--
-- Name: COLUMN dim_diagnosis.block_range; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.block_range IS 'ICD-10 block code range (e.g. B50-B64). | Source: master data';


--
-- Name: COLUMN dim_diagnosis.block_title; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.block_title IS 'ICD-10 block title. | Source: master data';


--
-- Name: COLUMN dim_diagnosis.chapter_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.chapter_code IS 'ICD-10 chapter in Roman numerals (I-XXII). | Source: master data';


--
-- Name: COLUMN dim_diagnosis.chapter_number; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.chapter_number IS 'Chapter number 1-22 (sort key for chapter labels). | Source: derived';


--
-- Name: COLUMN dim_diagnosis.chapter_range; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.chapter_range IS 'Chapter code range (e.g. A00-B99). | Source: master data';


--
-- Name: COLUMN dim_diagnosis.chapter_title; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.chapter_title IS 'ICD-10 chapter title. | Source: master data';


--
-- Name: COLUMN dim_diagnosis.severity_class; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.severity_class IS 'GBHS severity class (minor, moderate, serious, critical) used for case-mix adjustment. | Source: master data';


--
-- Name: COLUMN dim_diagnosis.default_specialty; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.default_specialty IS 'Default admitting specialty. | Source: master data';


--
-- Name: COLUMN dim_diagnosis.is_chronic; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.is_chronic IS 'True for chronic conditions (readmission risk factor). | Source: master data';


--
-- Name: COLUMN dim_diagnosis.condition_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_diagnosis.condition_key IS 'FK to dim_condition (snowflake); -2 when the code is not notifiable. | Source: master data idsr_condition_code';


--
-- Name: dim_encounter_profile; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_encounter_profile (
    encounter_profile_key smallint NOT NULL,
    department_code character varying(3) NOT NULL,
    department_name character varying(30),
    arrival_mode_code character varying(4) NOT NULL,
    arrival_mode_name character varying(35),
    disposition_code character varying(4) NOT NULL,
    disposition_name character varying(35),
    disposition_group character varying(30)
);


--
-- Name: TABLE dim_encounter_profile; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_encounter_profile IS 'Junk dimension: all combinations of department x arrival mode x disposition (low-cardinality attendance flags).';


--
-- Name: COLUMN dim_encounter_profile.encounter_profile_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.encounter_profile_key IS 'Surrogate key. | Source: generated (Cartesian product)';


--
-- Name: COLUMN dim_encounter_profile.department_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.department_code IS 'ED (emergency department) or OPD (clinic outpatient). | Source: PAS department';


--
-- Name: COLUMN dim_encounter_profile.department_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.department_name IS 'Department name. | Source: generated';


--
-- Name: COLUMN dim_encounter_profile.arrival_mode_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.arrival_mode_code IS 'WALK, AMB, REF or UNK. | Source: PAS arrival_mode via ref.code_map (EN09)';


--
-- Name: COLUMN dim_encounter_profile.arrival_mode_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.arrival_mode_name IS 'Arrival mode description. | Source: ref.code_map';


--
-- Name: COLUMN dim_encounter_profile.disposition_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.disposition_code IS 'DIS, ADM, TRF, LWBS, DIED, REF or UNK. | Source: PAS disposition via ref.code_map (EN09)';


--
-- Name: COLUMN dim_encounter_profile.disposition_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.disposition_name IS 'Disposition description. | Source: ref.code_map';


--
-- Name: COLUMN dim_encounter_profile.disposition_group; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_encounter_profile.disposition_group IS 'Discharged, Admitted or transferred, Referred, Left / died, Unknown. | Source: derived';


--
-- Name: dim_facility; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_facility (
    facility_key integer NOT NULL,
    facility_code character varying(10) NOT NULL,
    facility_name character varying(60) NOT NULL,
    facility_short_name character varying(30),
    facility_type character varying(30),
    region_key integer NOT NULL,
    town character varying(40),
    latitude numeric(9,5),
    longitude numeric(9,5),
    elevation_m integer,
    has_emergency_department boolean,
    catchment_share numeric(6,4),
    opened_date date,
    ownership character varying(60),
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_facility; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_facility IS 'GBHS hospitals and clinics (10). Conformed across all facts; snowflaked to dim_region; Type 1 (corrections overwrite).';


--
-- Name: COLUMN dim_facility.facility_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.facility_key IS 'Surrogate key (-1 = Unknown). | Source: generated';


--
-- Name: COLUMN dim_facility.facility_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.facility_code IS 'Facility natural key (GBH- hospital, GBC- clinic). | Source: master data, Facilities sheet';


--
-- Name: COLUMN dim_facility.facility_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.facility_name IS 'Facility name (Type 1). | Source: master data, Facilities sheet';


--
-- Name: COLUMN dim_facility.facility_short_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.facility_short_name IS 'Town-based short name for compact visuals. | Source: derived';


--
-- Name: COLUMN dim_facility.facility_type; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.facility_type IS 'Referral hospital, District hospital or Clinic. | Source: master data';


--
-- Name: COLUMN dim_facility.region_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.region_key IS 'FK to dim_region (snowflake). | Source: master data region name mapped through ref.region_alias';


--
-- Name: COLUMN dim_facility.town; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.town IS 'Town where the facility is located. | Source: master data';


--
-- Name: COLUMN dim_facility.latitude; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.latitude IS 'Latitude (decimal degrees), used for the NASA POWER weather point. | Source: master data';


--
-- Name: COLUMN dim_facility.longitude; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.longitude IS 'Longitude (decimal degrees). | Source: master data';


--
-- Name: COLUMN dim_facility.elevation_m; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.elevation_m IS 'Elevation in metres. | Source: master data';


--
-- Name: COLUMN dim_facility.has_emergency_department; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.has_emergency_department IS 'True for hospitals with a 24-hour emergency department. | Source: master data';


--
-- Name: COLUMN dim_facility.catchment_share; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.catchment_share IS 'Share of the region''s population in the facility catchment (0-1), used to derive catchment population. | Source: master data (GBHS planning assumption)';


--
-- Name: COLUMN dim_facility.opened_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.opened_date IS 'Date the facility opened. | Source: master data';


--
-- Name: COLUMN dim_facility.ownership; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.ownership IS 'Operating company. | Source: master data';


--
-- Name: COLUMN dim_facility.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_facility.dw_updated_at IS 'Last update timestamp. | Source: ETL';


--
-- Name: dim_hour; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_hour (
    hour_key smallint NOT NULL,
    hour_label character(5),
    hour_band character varying(20),
    hour_band_sort smallint,
    shift_code character(1),
    shift_name character varying(12),
    is_after_hours boolean
);


--
-- Name: TABLE dim_hour; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_hour IS 'Time-of-day dimension at hour grain (24 rows) used for ED arrival patterns and shift alignment.';


--
-- Name: COLUMN dim_hour.hour_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_hour.hour_key IS 'Hour of day 0-23 (natural and surrogate key). | Source: generated';


--
-- Name: COLUMN dim_hour.hour_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_hour.hour_label IS 'Hour label HH:00. | Source: generated';


--
-- Name: COLUMN dim_hour.hour_band; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_hour.hour_band IS 'Part of day: Night 00-06, Morning 07-11, Afternoon 12-16, Evening 17-23. | Source: generated';


--
-- Name: COLUMN dim_hour.hour_band_sort; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_hour.hour_band_sort IS 'Sort key for hour_band. | Source: generated';


--
-- Name: COLUMN dim_hour.shift_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_hour.shift_code IS 'Nursing shift covering the hour: D = 07:00-19:00, N = 19:00-07:00. | Source: generated (GBHS rostering policy)';


--
-- Name: COLUMN dim_hour.shift_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_hour.shift_name IS 'Shift name (Day / Night). | Source: generated';


--
-- Name: COLUMN dim_hour.is_after_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_hour.is_after_hours IS 'True outside 08:00-16:59 (reduced specialist cover). | Source: generated';


--
-- Name: dim_patient; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_patient (
    patient_key integer NOT NULL,
    patient_pseudo_id character varying(13) NOT NULL,
    patient_durable_key integer,
    sex character(1),
    birth_year smallint,
    residence_region_code character varying(5),
    residence_region_name character varying(30),
    payer_code character varying(8),
    payer_name character varying(60),
    payer_group character varying(15),
    registration_date date,
    is_inferred boolean DEFAULT false NOT NULL,
    scd_effective_from date NOT NULL,
    scd_effective_to date DEFAULT '9999-12-31'::date NOT NULL,
    scd_is_current boolean NOT NULL,
    scd_version smallint NOT NULL,
    scd_row_hash character(32) NOT NULL,
    dw_batch_id integer,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_patient; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_patient IS 'Pseudonymised patients (no direct identifiers). SCD Type 2 on residence region and payer class so that facts carry the values valid at the time of care.';


--
-- Name: COLUMN dim_patient.patient_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.patient_key IS 'Surrogate key of the patient version (-1 = Unknown / unidentified patient). | Source: generated';


--
-- Name: COLUMN dim_patient.patient_pseudo_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.patient_pseudo_id IS 'Pseudonym assigned by the PAS (keyed hash of the medical record number); never shown in reports. | Source: PAS patient index';


--
-- Name: COLUMN dim_patient.patient_durable_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.patient_durable_key IS 'Durable (supernatural) key: the surrogate key of the patient''s first version, identical on every version - used to count distinct patients across SCD2 versions. | Source: ETL';


--
-- Name: COLUMN dim_patient.sex; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.sex IS 'F, M or U (unknown) (Type 1). | Source: PAS patient index, mapped via ref.code_map (MD02)';


--
-- Name: COLUMN dim_patient.birth_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.birth_year IS 'Year of birth only (data minimisation; no date of birth) (Type 1). | Source: PAS patient index (MD03)';


--
-- Name: COLUMN dim_patient.residence_region_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.residence_region_code IS 'ISO code of the region of residence valid for the version (Type 2; flattened, no relationship, to avoid a second filter path to dim_region). | Source: PAS patient index + change log (MD01)';


--
-- Name: COLUMN dim_patient.residence_region_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.residence_region_name IS 'Region of residence name (Type 2). | Source: dim_region lookup';


--
-- Name: COLUMN dim_patient.payer_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.payer_code IS 'Payer class valid for the version (Type 2): PSEMAS, PMA, SSC-MVA, MOHSS, CASH. | Source: PAS patient index + change log (MD05)';


--
-- Name: COLUMN dim_patient.payer_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.payer_name IS 'Payer class name. | Source: master data, Payer_Classes sheet';


--
-- Name: COLUMN dim_patient.payer_group; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.payer_group IS 'Medical aid, Statutory, Government or Self-pay. | Source: master data';


--
-- Name: COLUMN dim_patient.registration_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.registration_date IS 'Date the patient was first registered (Type 1). | Source: PAS patient index';


--
-- Name: COLUMN dim_patient.is_inferred; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.is_inferred IS 'True for an inferred member created from a fact before the patient-index record arrived (EN10). | Source: ETL';


--
-- Name: COLUMN dim_patient.scd_effective_from; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.scd_effective_from IS 'First day the version is valid. | Source: patient change log';


--
-- Name: COLUMN dim_patient.scd_effective_to; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.scd_effective_to IS 'Last day the version is valid (9999-12-31 = current). | Source: ETL';


--
-- Name: COLUMN dim_patient.scd_is_current; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.scd_is_current IS 'True for the current version. | Source: ETL';


--
-- Name: COLUMN dim_patient.scd_version; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.scd_version IS 'Version number per patient. | Source: ETL';


--
-- Name: COLUMN dim_patient.scd_row_hash; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.scd_row_hash IS 'MD5 of the Type 2 attributes. | Source: ETL';


--
-- Name: COLUMN dim_patient.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.dw_batch_id IS 'Batch that created or last changed the row. | Source: ETL';


--
-- Name: COLUMN dim_patient.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_patient.dw_updated_at IS 'Last update timestamp. | Source: ETL';


--
-- Name: dim_region; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_region (
    region_key integer NOT NULL,
    region_code character varying(5) NOT NULL,
    region_name character varying(30) NOT NULL,
    zone character varying(20),
    malaria_stratum character varying(20),
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_region; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_region IS 'Namibian administrative regions (14) - top of the geography snowflake and grain of the population fact (Type 1).';


--
-- Name: COLUMN dim_region.region_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.region_key IS 'Surrogate key (-1 = Unknown). | Source: generated';


--
-- Name: COLUMN dim_region.region_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.region_code IS 'ISO 3166-2:NA region code (e.g. NA-KE). | Source: master data, Regions sheet';


--
-- Name: COLUMN dim_region.region_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.region_name IS 'Official region name. | Source: master data, Regions sheet';


--
-- Name: COLUMN dim_region.zone; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.zone IS 'GBHS management zone (North-East, North-Central, Central, West, South, East, North-West). | Source: master data';


--
-- Name: COLUMN dim_region.malaria_stratum; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.malaria_stratum IS 'Malaria planning stratum: Endemic - high, Endemic - low, Non-endemic (imported cases only). | Source: master data (GBHS planning assumption based on MoHSS stratification)';


--
-- Name: COLUMN dim_region.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.dw_updated_at IS 'Last update timestamp. | Source: ETL';


--
-- Name: dim_shift; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_shift (
    shift_key smallint NOT NULL,
    shift_code character(1) NOT NULL,
    shift_name character varying(12),
    start_time time without time zone,
    end_time time without time zone,
    shift_hours numeric(4,1)
);


--
-- Name: TABLE dim_shift; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_shift IS 'Nursing shifts (Day 07:00-19:00, Night 19:00-07:00).';


--
-- Name: COLUMN dim_shift.shift_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_shift.shift_key IS 'Surrogate key. | Source: generated';


--
-- Name: COLUMN dim_shift.shift_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_shift.shift_code IS 'D or N. | Source: e-roster shift via ref.code_map (RS01)';


--
-- Name: COLUMN dim_shift.shift_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_shift.shift_name IS 'Shift name. | Source: ref.code_map';


--
-- Name: COLUMN dim_shift.start_time; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_shift.start_time IS 'Shift start time. | Source: GBHS rostering policy';


--
-- Name: COLUMN dim_shift.end_time; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_shift.end_time IS 'Shift end time. | Source: GBHS rostering policy';


--
-- Name: COLUMN dim_shift.shift_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_shift.shift_hours IS 'Paid hours per shift. | Source: GBHS rostering policy';


--
-- Name: dim_triage; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_triage (
    triage_key smallint NOT NULL,
    triage_code character varying(6) NOT NULL,
    triage_label character varying(40),
    priority smallint,
    target_minutes integer,
    compliance_minutes integer,
    target_text character varying(30),
    colour_hex character(7)
);


--
-- Name: TABLE dim_triage; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_triage IS 'SATS-style five-colour emergency triage scale plus "Not triaged" (clinic) and "Not recorded" (-1).';


--
-- Name: COLUMN dim_triage.triage_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.triage_key IS 'Surrogate key = priority (-1 = not recorded). | Source: generated';


--
-- Name: COLUMN dim_triage.triage_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.triage_code IS 'Triage colour code. | Source: master data, Triage_Scale sheet';


--
-- Name: COLUMN dim_triage.triage_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.triage_label IS 'Triage label (colour and urgency). | Source: master data';


--
-- Name: COLUMN dim_triage.priority; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.priority IS 'Clinical priority 1 (highest) - 9 (sort key). | Source: master data';


--
-- Name: COLUMN dim_triage.target_minutes; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.target_minutes IS 'Target time from arrival to doctor in minutes (0 = immediate). | Source: master data (SATS-style targets)';


--
-- Name: COLUMN dim_triage.compliance_minutes; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.compliance_minutes IS 'Threshold used for the within-target KPI: target, with "immediate" operationalised as 5 minutes. | Source: derived (GBHS KPI definition)';


--
-- Name: COLUMN dim_triage.target_text; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.target_text IS 'Target in words. | Source: master data';


--
-- Name: COLUMN dim_triage.colour_hex; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_triage.colour_hex IS 'Display colour (used with text labels, never colour alone). | Source: master data';


--
-- Name: fact_admission; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_admission (
    admission_key bigint NOT NULL,
    admission_id character varying(12) NOT NULL,
    admission_date_key integer NOT NULL,
    discharge_date_key integer NOT NULL,
    care_unit_key integer NOT NULL,
    patient_key integer NOT NULL,
    diagnosis_key integer NOT NULL,
    admission_profile_key smallint NOT NULL,
    age_band_key smallint NOT NULL,
    age_years smallint,
    ed_encounter_id character varying(12),
    admission_ts timestamp without time zone NOT NULL,
    discharge_ts timestamp without time zone,
    admission_count smallint DEFAULT 1 NOT NULL,
    los_days smallint,
    is_discharged smallint NOT NULL,
    is_died smallint NOT NULL,
    discharged_before_noon smallint,
    is_weekend_discharge smallint,
    is_readmission_30d smallint DEFAULT 0 NOT NULL,
    readmission_eligible smallint DEFAULT 0 NOT NULL,
    readmitted_within_30d smallint DEFAULT 0 NOT NULL,
    prior_admissions_12m smallint DEFAULT 0 NOT NULL,
    is_open_over_60d smallint DEFAULT 0 NOT NULL,
    source_last_updated timestamp without time zone NOT NULL,
    dw_batch_id integer NOT NULL,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE fact_admission; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_admission IS 'ACCUMULATING SNAPSHOT. Grain: one row per inpatient spell (admission to discharge), updated as milestones occur (admission, coding, discharge, 30-day follow-up). Additive: admission_count, los_days, flags.';


--
-- Name: COLUMN fact_admission.admission_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.admission_key IS 'Surrogate key. | Source: generated';


--
-- Name: COLUMN fact_admission.admission_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.admission_id IS 'Degenerate dimension: PAS spell number. | Source: PAS admission_id (AD01)';


--
-- Name: COLUMN fact_admission.admission_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.admission_date_key IS 'FK to dim_date - admission date (active relationship). | Source: PAS admission_datetime';


--
-- Name: COLUMN fact_admission.discharge_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.discharge_date_key IS 'FK to dim_date - discharge date (role-playing; -2 = still in hospital). | Source: PAS discharge_datetime (AD02, AD03)';


--
-- Name: COLUMN fact_admission.care_unit_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.care_unit_key IS 'FK to dim_care_unit version (admitting ward) valid on the admission date. | Source: PAS ward_code (AD04)';


--
-- Name: COLUMN fact_admission.patient_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.patient_key IS 'FK to dim_patient version valid on the admission date. | Source: PAS patient_id';


--
-- Name: COLUMN fact_admission.diagnosis_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.diagnosis_key IS 'FK to dim_diagnosis - principal diagnosis (-1 until coded). | Source: PAS principal_icd10 (AD05)';


--
-- Name: COLUMN fact_admission.admission_profile_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.admission_profile_key IS 'FK to the admission method x discharge status junk dimension. | Source: PAS admission_method, discharge_status (AD07)';


--
-- Name: COLUMN fact_admission.age_band_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.age_band_key IS 'FK to dim_age_band (age at admission). | Source: derived';


--
-- Name: COLUMN fact_admission.age_years; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.age_years IS 'Age in years at admission (admission year - birth year). | Source: derived';


--
-- Name: COLUMN fact_admission.ed_encounter_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.ed_encounter_id IS 'Degenerate link to the ED attendance that led to the admission (emergency admissions). | Source: PAS ed_encounter_id';


--
-- Name: COLUMN fact_admission.admission_ts; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.admission_ts IS 'Admission timestamp (milestone 1). | Source: PAS';


--
-- Name: COLUMN fact_admission.discharge_ts; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.discharge_ts IS 'Discharge timestamp (milestone 2; NULL while in hospital). | Source: PAS';


--
-- Name: COLUMN fact_admission.admission_count; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.admission_count IS 'Always 1; additive count of spells. | Source: ETL';


--
-- Name: COLUMN fact_admission.los_days; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.los_days IS 'Length of stay in midnights (discharge date - admission date); NULL while in hospital. Additive (= patient days). | Source: derived';


--
-- Name: COLUMN fact_admission.is_discharged; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.is_discharged IS '1 once the discharge milestone is recorded. | Source: derived';


--
-- Name: COLUMN fact_admission.is_died; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.is_died IS '1 for an in-hospital death. | Source: discharge_status = DIED';


--
-- Name: COLUMN fact_admission.discharged_before_noon; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.discharged_before_noon IS '1 if discharged before 12:00 (flow KPI); NULL while in hospital. | Source: derived';


--
-- Name: COLUMN fact_admission.is_weekend_discharge; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.is_weekend_discharge IS '1 if discharged on Saturday or Sunday; NULL while in hospital. | Source: derived';


--
-- Name: COLUMN fact_admission.is_readmission_30d; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.is_readmission_30d IS '1 if this spell is an emergency admission within 30 days of the same patient''s previous live discharge. | Source: derived (window over patient pseudonym)';


--
-- Name: COLUMN fact_admission.readmission_eligible; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.readmission_eligible IS '1 if this spell counts in the readmission-rate denominator: discharged alive (home or AMA), not maternity, and 30 days of follow-up available. | Source: derived (GBHS KPI definition)';


--
-- Name: COLUMN fact_admission.readmitted_within_30d; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.readmitted_within_30d IS '1 if an eligible spell was followed by an emergency readmission within 30 days (milestone 3). | Source: derived';


--
-- Name: COLUMN fact_admission.prior_admissions_12m; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.prior_admissions_12m IS 'Number of the patient''s admissions in the 365 days before this admission (risk feature). | Source: derived';


--
-- Name: COLUMN fact_admission.is_open_over_60d; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.is_open_over_60d IS '1 if the spell is still open more than 60 days after admission at the snapshot date (AD06, probable missing discharge). | Source: derived';


--
-- Name: COLUMN fact_admission.source_last_updated; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.source_last_updated IS 'last_updated of the PAS image applied (newer images overwrite older ones). | Source: PAS last_updated';


--
-- Name: COLUMN fact_admission.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.dw_batch_id IS 'Batch that inserted or last updated the row. | Source: ETL';


--
-- Name: COLUMN fact_admission.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_admission.dw_updated_at IS 'Last update timestamp. | Source: ETL';


--
-- Name: fact_admission_admission_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_admission ALTER COLUMN admission_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_admission_admission_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_encounter; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_encounter (
    encounter_key bigint NOT NULL,
    encounter_id character varying(12) NOT NULL,
    arrival_date_key integer NOT NULL,
    arrival_hour_key smallint NOT NULL,
    care_unit_key integer NOT NULL,
    patient_key integer NOT NULL,
    diagnosis_key integer NOT NULL,
    triage_key smallint NOT NULL,
    encounter_profile_key smallint NOT NULL,
    age_band_key smallint NOT NULL,
    age_years smallint,
    encounter_count smallint DEFAULT 1 NOT NULL,
    wait_to_triage_min numeric(8,1),
    door_to_doctor_min numeric(8,1),
    ed_los_min numeric(9,1),
    seen_within_target smallint,
    is_lwbs smallint NOT NULL,
    is_admitted smallint NOT NULL,
    is_died smallint NOT NULL,
    dw_batch_id integer NOT NULL,
    dw_loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE fact_encounter; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_encounter IS 'TRANSACTION FACT. Grain: one row per ED or clinic attendance (encounter). Additive: encounter_count and the 0/1 flags; durations are additive (sum) but reported as averages/medians.';


--
-- Name: COLUMN fact_encounter.encounter_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.encounter_key IS 'Surrogate key. | Source: generated';


--
-- Name: COLUMN fact_encounter.encounter_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.encounter_id IS 'Degenerate dimension: PAS attendance number. | Source: PAS encounter_id (EN01)';


--
-- Name: COLUMN fact_encounter.arrival_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.arrival_date_key IS 'FK to dim_date (arrival date). | Source: PAS arrival_datetime (EN02, EN12)';


--
-- Name: COLUMN fact_encounter.arrival_hour_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.arrival_hour_key IS 'FK to dim_hour (arrival hour). | Source: PAS arrival_datetime';


--
-- Name: COLUMN fact_encounter.care_unit_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.care_unit_key IS 'FK to dim_care_unit version valid on the arrival date (ED or clinic unit). | Source: PAS facility_code + department (EN03)';


--
-- Name: COLUMN fact_encounter.patient_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.patient_key IS 'FK to dim_patient version valid on the arrival date (-1 unidentified). | Source: PAS patient_id (EN10, EN11)';


--
-- Name: COLUMN fact_encounter.diagnosis_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.diagnosis_key IS 'FK to dim_diagnosis (primary diagnosis, -1 not coded/invalid). | Source: PAS primary_icd10 (EN07, EN08)';


--
-- Name: COLUMN fact_encounter.triage_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.triage_key IS 'FK to dim_triage (-1 not recorded; 9 clinic attendance). | Source: PAS triage_category (EN04, EN09)';


--
-- Name: COLUMN fact_encounter.encounter_profile_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.encounter_profile_key IS 'FK to the department x arrival mode x disposition junk dimension. | Source: PAS department, arrival_mode, disposition';


--
-- Name: COLUMN fact_encounter.age_band_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.age_band_key IS 'FK to dim_age_band (age at arrival). | Source: derived from birth year';


--
-- Name: COLUMN fact_encounter.age_years; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.age_years IS 'Age in years at arrival, approximated as arrival year - birth year (non-additive). | Source: derived';


--
-- Name: COLUMN fact_encounter.encounter_count; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.encounter_count IS 'Always 1; additive count of attendances. | Source: ETL';


--
-- Name: COLUMN fact_encounter.wait_to_triage_min; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.wait_to_triage_min IS 'Minutes from arrival to triage (ED only; NULL if invalid). | Source: triage_datetime - arrival_datetime';


--
-- Name: COLUMN fact_encounter.door_to_doctor_min; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.door_to_doctor_min IS 'Minutes from arrival to first assessment by a doctor/clinician (NULL if not seen or invalid, EN05/EN06). | Source: seen_datetime - arrival_datetime';


--
-- Name: COLUMN fact_encounter.ed_los_min; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.ed_los_min IS 'Minutes from arrival to departure (NULL if > 72 h or negative). | Source: departure_datetime - arrival_datetime';


--
-- Name: COLUMN fact_encounter.seen_within_target; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.seen_within_target IS '1 if seen within the triage compliance threshold, 0 if not, NULL if not triaged/seen. | Source: derived with dim_triage.compliance_minutes';


--
-- Name: COLUMN fact_encounter.is_lwbs; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.is_lwbs IS '1 if the patient left without being seen. | Source: disposition = LWBS';


--
-- Name: COLUMN fact_encounter.is_admitted; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.is_admitted IS '1 if admitted to a ward from the ED. | Source: disposition = ADM';


--
-- Name: COLUMN fact_encounter.is_died; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.is_died IS '1 if the patient died in the department (incl. dead on arrival). | Source: disposition = DIED';


--
-- Name: COLUMN fact_encounter.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.dw_batch_id IS 'Loading batch (lineage). | Source: ETL';


--
-- Name: COLUMN fact_encounter.dw_loaded_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_encounter.dw_loaded_at IS 'Load timestamp. | Source: ETL';


--
-- Name: fact_encounter_encounter_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_encounter ALTER COLUMN encounter_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_encounter_encounter_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_idsr_report; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_idsr_report (
    epi_week_date_key integer NOT NULL,
    facility_key integer NOT NULL,
    report_expected smallint DEFAULT 1 NOT NULL,
    report_received smallint NOT NULL,
    report_on_time smallint NOT NULL,
    hours_after_due numeric(7,1),
    first_submitted_at timestamp without time zone,
    due_at timestamp without time zone NOT NULL,
    dw_batch_id integer NOT NULL,
    dw_loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE fact_idsr_report; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_idsr_report IS 'COVERAGE (FACTLESS-STYLE) FACT. Grain: one row per facility per epi week that a report was EXPECTED, whether or not it arrived (reporting completeness and timeliness).';


--
-- Name: COLUMN fact_idsr_report.epi_week_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.epi_week_date_key IS 'FK to dim_date = Monday of the epi week. | Source: scaffold of expected weeks';


--
-- Name: COLUMN fact_idsr_report.facility_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.facility_key IS 'FK to dim_facility. | Source: scaffold of active facilities';


--
-- Name: COLUMN fact_idsr_report.report_expected; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.report_expected IS 'Always 1 (denominator of completeness). | Source: ETL';


--
-- Name: COLUMN fact_idsr_report.report_received; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.report_received IS '1 if any version of the weekly report was received by the extract cut-off. | Source: stg.idsr_submission';


--
-- Name: COLUMN fact_idsr_report.report_on_time; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.report_on_time IS '1 if the first submission arrived by the due time (Tuesday 12:00 after the epi week). | Source: derived (GBHS SOP)';


--
-- Name: COLUMN fact_idsr_report.hours_after_due; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.hours_after_due IS 'Hours between due time and first submission (negative = early; NULL if not received). | Source: derived';


--
-- Name: COLUMN fact_idsr_report.first_submitted_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.first_submitted_at IS 'Timestamp of the first submission. | Source: IDSR submitted_at';


--
-- Name: COLUMN fact_idsr_report.due_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.due_at IS 'Due time of the report. | Source: derived (Sunday + 2 days 12:00)';


--
-- Name: COLUMN fact_idsr_report.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.dw_batch_id IS 'Batch that rebuilt the row. | Source: ETL';


--
-- Name: COLUMN fact_idsr_report.dw_loaded_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_idsr_report.dw_loaded_at IS 'Load timestamp. | Source: ETL';


--
-- Name: fact_population; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_population (
    year_date_key integer NOT NULL,
    region_key integer NOT NULL,
    population integer NOT NULL,
    is_census_count boolean NOT NULL,
    population_source character varying(80) NOT NULL,
    dw_batch_id integer NOT NULL
);


--
-- Name: TABLE fact_population; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_population IS 'ANNUAL SNAPSHOT (external, NSA). Grain: one row per region per year (mid-year, keyed on 1 July). SEMI-ADDITIVE: additive across regions, never summed across years.';


--
-- Name: COLUMN fact_population.year_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_population.year_date_key IS 'FK to dim_date = 1 July of the year (mid-year population). | Source: derived';


--
-- Name: COLUMN fact_population.region_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_population.region_key IS 'FK to dim_region. | Source: NSA region name mapped through ref.region_alias';


--
-- Name: COLUMN fact_population.population; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_population.population IS 'Population (semi-additive). 2023 = census count; other years = 2023 count x (1 + national intercensal growth 2011-2023)^(year-2023). | Source: NSA 2023 PHC preliminary results (EX01)';


--
-- Name: COLUMN fact_population.is_census_count; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_population.is_census_count IS 'True for the census year itself, false for derived estimates. | Source: ETL';


--
-- Name: COLUMN fact_population.population_source; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_population.population_source IS 'Provenance text shown in report tooltips. | Source: ETL';


--
-- Name: COLUMN fact_population.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_population.dw_batch_id IS 'Loading batch. | Source: ETL';


--
-- Name: fact_staff_roster; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_staff_roster (
    roster_date_key integer NOT NULL,
    care_unit_key integer NOT NULL,
    shift_key smallint NOT NULL,
    planned_nurse_hours numeric(7,1),
    rn_hours numeric(7,1),
    en_hours numeric(7,1),
    nurse_hours numeric(7,1),
    doctor_hours numeric(7,1),
    overtime_hours numeric(7,1),
    agency_hours numeric(7,1),
    sick_leave_hours numeric(7,1),
    nurses_on_duty smallint,
    doctors_on_duty smallint,
    dw_batch_id integer NOT NULL,
    dw_loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE fact_staff_roster; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_staff_roster IS 'PERIODIC SNAPSHOT PER SHIFT. Grain: one row per care unit per date per shift. Hours are additive; head counts on duty are semi-additive (sum across units, average across shifts/days).';


--
-- Name: COLUMN fact_staff_roster.roster_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.roster_date_key IS 'FK to dim_date (date the shift starts). | Source: e-roster roster_date';


--
-- Name: COLUMN fact_staff_roster.care_unit_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.care_unit_key IS 'FK to dim_care_unit version valid on the roster date. | Source: e-roster unit_code';


--
-- Name: COLUMN fact_staff_roster.shift_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.shift_key IS 'FK to dim_shift. | Source: e-roster shift (RS01)';


--
-- Name: COLUMN fact_staff_roster.planned_nurse_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.planned_nurse_hours IS 'Nursing hours on the approved roster (additive). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.rn_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.rn_hours IS 'Registered-nurse hours worked (additive). | Source: e-roster (RS02)';


--
-- Name: COLUMN fact_staff_roster.en_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.en_hours IS 'Enrolled-nurse hours worked (additive). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.nurse_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.nurse_hours IS 'Total nursing hours worked = rn_hours + en_hours (additive; numerator of NHPPD). | Source: derived';


--
-- Name: COLUMN fact_staff_roster.doctor_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.doctor_hours IS 'Doctor hours worked in the unit (additive). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.overtime_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.overtime_hours IS 'Overtime nursing hours (additive; NULL when inconsistent, RS04). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.agency_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.agency_hours IS 'Agency (temporary) nursing hours (additive). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.sick_leave_hours; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.sick_leave_hours IS 'Rostered hours lost to sick leave (additive). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.nurses_on_duty; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.nurses_on_duty IS 'Nurses on duty during the shift (semi-additive). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.doctors_on_duty; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.doctors_on_duty IS 'Doctors on duty during the shift (semi-additive). | Source: e-roster';


--
-- Name: COLUMN fact_staff_roster.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.dw_batch_id IS 'Loading batch. | Source: ETL';


--
-- Name: COLUMN fact_staff_roster.dw_loaded_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_staff_roster.dw_loaded_at IS 'Load timestamp. | Source: ETL';


--
-- Name: fact_surveillance_weekly; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_surveillance_weekly (
    epi_week_date_key integer NOT NULL,
    facility_key integer NOT NULL,
    condition_key integer NOT NULL,
    cases_under5 integer,
    cases_5plus integer,
    cases_total integer,
    deaths_under5 integer,
    deaths_5plus integer,
    deaths_total integer,
    tests_done integer,
    tests_positive integer,
    report_version smallint,
    dw_batch_id integer NOT NULL,
    dw_loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE fact_surveillance_weekly; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_surveillance_weekly IS 'PERIODIC SNAPSHOT. Grain: one row per facility per epi week per IDSR priority condition (zero reporting). Counts are fully additive.';


--
-- Name: COLUMN fact_surveillance_weekly.epi_week_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.epi_week_date_key IS 'FK to dim_date = Monday of the ISO epi week. | Source: IDSR epi_week (SV01)';


--
-- Name: COLUMN fact_surveillance_weekly.facility_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.facility_key IS 'FK to dim_facility (reporting facility). | Source: IDSR facility_code';


--
-- Name: COLUMN fact_surveillance_weekly.condition_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.condition_key IS 'FK to dim_condition. | Source: IDSR condition (SV03)';


--
-- Name: COLUMN fact_surveillance_weekly.cases_under5; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.cases_under5 IS 'Cases in children under 5 (additive). | Source: IDSR return (SV06, SV07)';


--
-- Name: COLUMN fact_surveillance_weekly.cases_5plus; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.cases_5plus IS 'Cases aged 5 and over (additive). | Source: IDSR return (SV06, SV07)';


--
-- Name: COLUMN fact_surveillance_weekly.cases_total; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.cases_total IS 'All cases = under 5 + 5 and over (additive). | Source: derived';


--
-- Name: COLUMN fact_surveillance_weekly.deaths_under5; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.deaths_under5 IS 'Deaths in children under 5 (additive). | Source: IDSR return (SV04)';


--
-- Name: COLUMN fact_surveillance_weekly.deaths_5plus; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.deaths_5plus IS 'Deaths aged 5 and over (additive). | Source: IDSR return (SV04)';


--
-- Name: COLUMN fact_surveillance_weekly.deaths_total; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.deaths_total IS 'All deaths (additive). | Source: derived';


--
-- Name: COLUMN fact_surveillance_weekly.tests_done; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.tests_done IS 'Malaria tests performed (RDT/microscopy); NULL for other conditions (additive). | Source: IDSR return (SV05)';


--
-- Name: COLUMN fact_surveillance_weekly.tests_positive; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.tests_positive IS 'Positive malaria tests (additive). | Source: IDSR return (SV05)';


--
-- Name: COLUMN fact_surveillance_weekly.report_version; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.report_version IS 'Version of the report applied (2 = corrected resubmission). | Source: IDSR report_version (SV02)';


--
-- Name: COLUMN fact_surveillance_weekly.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.dw_batch_id IS 'Loading batch. | Source: ETL';


--
-- Name: COLUMN fact_surveillance_weekly.dw_loaded_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_surveillance_weekly.dw_loaded_at IS 'Load timestamp. | Source: ETL';


--
-- Name: fact_ward_census_daily; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_ward_census_daily (
    census_date_key integer NOT NULL,
    care_unit_key integer NOT NULL,
    beds_complement smallint NOT NULL,
    beds_closed smallint DEFAULT 0 NOT NULL,
    beds_available smallint NOT NULL,
    occupied_beds smallint NOT NULL,
    admissions smallint,
    discharges smallint,
    deaths smallint,
    pas_occupied_beds smallint,
    census_source character varying(20) NOT NULL,
    dw_batch_id integer NOT NULL,
    dw_loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE fact_ward_census_daily; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_ward_census_daily IS 'PERIODIC SNAPSHOT. Grain: one row per inpatient ward per day (midnight bed state). Stock measures (beds, occupied) are SEMI-ADDITIVE: sum across wards, average or last value across days; summed over days they equal bed-days.';


--
-- Name: COLUMN fact_ward_census_daily.census_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.census_date_key IS 'FK to dim_date (census date, midnight). | Source: ward return census_date';


--
-- Name: COLUMN fact_ward_census_daily.care_unit_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.care_unit_key IS 'FK to dim_care_unit version valid on the census date. | Source: ward_code';


--
-- Name: COLUMN fact_ward_census_daily.beds_complement; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.beds_complement IS 'Official beds of the ward version (semi-additive). | Source: dim_care_unit.bed_complement';


--
-- Name: COLUMN fact_ward_census_daily.beds_closed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.beds_closed IS 'Beds closed (maintenance, staffing) (semi-additive). | Source: ward return';


--
-- Name: COLUMN fact_ward_census_daily.beds_available; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.beds_available IS 'Beds available = complement - closed (semi-additive; sum over days = available bed-days). | Source: derived';


--
-- Name: COLUMN fact_ward_census_daily.occupied_beds; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.occupied_beds IS 'Patients in the ward at midnight (semi-additive; sum over days = patient days). | Source: ward return (WC02, WC04) or PAS imputation (WC01)';


--
-- Name: COLUMN fact_ward_census_daily.admissions; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.admissions IS 'Admissions to the ward during the day (additive flow). | Source: ward return';


--
-- Name: COLUMN fact_ward_census_daily.discharges; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.discharges IS 'Discharges (incl. deaths and transfers out) during the day (additive flow). | Source: ward return';


--
-- Name: COLUMN fact_ward_census_daily.deaths; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.deaths IS 'In-ward deaths during the day (additive flow). | Source: ward return';


--
-- Name: COLUMN fact_ward_census_daily.pas_occupied_beds; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.pas_occupied_beds IS 'Midnight census derived from PAS spells, kept for reconciliation (semi-additive). | Source: stg.pas_ward_census';


--
-- Name: COLUMN fact_ward_census_daily.census_source; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.census_source IS 'Ward return, Corrected return or Imputed from PAS. | Source: ETL';


--
-- Name: COLUMN fact_ward_census_daily.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.dw_batch_id IS 'Loading batch. | Source: ETL';


--
-- Name: COLUMN fact_ward_census_daily.dw_loaded_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_ward_census_daily.dw_loaded_at IS 'Load timestamp. | Source: ETL';


--
-- Name: fact_weather_daily; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_weather_daily (
    weather_date_key integer NOT NULL,
    facility_key integer NOT NULL,
    rainfall_mm numeric(7,2),
    tmax_c numeric(5,2),
    tmin_c numeric(5,2),
    rh_pct numeric(5,2),
    is_imputed boolean DEFAULT false NOT NULL,
    dw_batch_id integer NOT NULL
);


--
-- Name: TABLE fact_weather_daily; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_weather_daily IS 'PERIODIC SNAPSHOT (external, NASA POWER). Grain: one row per facility location per day. Rainfall is additive over days (not across locations); temperature and humidity are non-additive.';


--
-- Name: COLUMN fact_weather_daily.weather_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.weather_date_key IS 'FK to dim_date. | Source: NASA POWER date (YYYYMMDD)';


--
-- Name: COLUMN fact_weather_daily.facility_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.facility_key IS 'FK to dim_facility (weather point = facility coordinates). | Source: file name';


--
-- Name: COLUMN fact_weather_daily.rainfall_mm; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.rainfall_mm IS 'Corrected precipitation, mm/day (PRECTOTCORR). | Source: NASA POWER (WE02)';


--
-- Name: COLUMN fact_weather_daily.tmax_c; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.tmax_c IS 'Maximum temperature at 2 m, deg C (T2M_MAX). | Source: NASA POWER (WE01)';


--
-- Name: COLUMN fact_weather_daily.tmin_c; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.tmin_c IS 'Minimum temperature at 2 m, deg C (T2M_MIN). | Source: NASA POWER (WE01)';


--
-- Name: COLUMN fact_weather_daily.rh_pct; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.rh_pct IS 'Relative humidity at 2 m, % (RH2M). | Source: NASA POWER (WE01)';


--
-- Name: COLUMN fact_weather_daily.is_imputed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.is_imputed IS 'True if any value of the day was imputed. | Source: ETL';


--
-- Name: COLUMN fact_weather_daily.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.dw_batch_id IS 'Loading batch. | Source: ETL';


--
-- Name: agg_ed_daily; Type: MATERIALIZED VIEW; Schema: mart; Owner: -
--

CREATE MATERIALIZED VIEW mart.agg_ed_daily AS
 SELECT e.arrival_date_key,
    cu.facility_key,
    ep.department_code,
    e.triage_key,
    count(*) AS encounters,
    count(e.door_to_doctor_min) AS seen_with_time,
    sum(e.door_to_doctor_min) AS door_to_doctor_min_sum,
    count(e.seen_within_target) AS triaged_and_seen,
    sum(e.seen_within_target) AS seen_within_target,
    sum(e.is_lwbs) AS lwbs,
    sum(e.is_admitted) AS admitted
   FROM ((dw.fact_encounter e
     JOIN dw.dim_care_unit cu ON ((cu.care_unit_key = e.care_unit_key)))
     JOIN dw.dim_encounter_profile ep ON ((ep.encounter_profile_key = e.encounter_profile_key)))
  GROUP BY e.arrival_date_key, cu.facility_key, ep.department_code, e.triage_key
  WITH NO DATA;


--
-- Name: MATERIALIZED VIEW agg_ed_daily; Type: COMMENT; Schema: mart; Owner: -
--

COMMENT ON MATERIALIZED VIEW mart.agg_ed_daily IS 'Aggregate: attendances per facility x day x department x triage (performance optimisation, report 3.7).';


--
-- Name: analytics_ed_drivers; Type: TABLE; Schema: mart; Owner: -
--

CREATE TABLE mart.analytics_ed_drivers (
    driver text,
    effect_pct numeric,
    ci_low numeric,
    ci_high numeric,
    p_value numeric,
    model text
);


--
-- Name: analytics_malaria_forecast; Type: TABLE; Schema: mart; Owner: -
--

CREATE TABLE mart.analytics_malaria_forecast (
    week_date_key integer,
    kind text,
    model text,
    actual numeric,
    forecast numeric,
    lo numeric,
    hi numeric
);


--
-- Name: analytics_outbreak_alerts; Type: TABLE; Schema: mart; Owner: -
--

CREATE TABLE mart.analytics_outbreak_alerts (
    week_date_key integer,
    facility_key integer,
    condition_key integer,
    method text,
    cases numeric,
    expected numeric,
    threshold_value numeric,
    is_injected_outbreak boolean
);


--
-- Name: analytics_readmission_deciles; Type: TABLE; Schema: mart; Owner: -
--

CREATE TABLE mart.analytics_readmission_deciles (
    decile integer,
    spells integer,
    mean_predicted numeric,
    observed numeric,
    model text
);


--
-- Name: analytics_readmission_drivers; Type: TABLE; Schema: mart; Owner: -
--

CREATE TABLE mart.analytics_readmission_drivers (
    driver text,
    odds_ratio numeric,
    direction text
);


--
-- Name: v_dim_admission_profile; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_admission_profile AS
 SELECT admission_profile_key,
    admission_method_code,
    admission_method_name,
    is_emergency,
    discharge_status_code,
    discharge_status_name
   FROM dw.dim_admission_profile;


--
-- Name: v_dim_age_band; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_age_band AS
 SELECT age_band_key,
    age_band,
    idsr_age_group,
    life_stage
   FROM dw.dim_age_band;


--
-- Name: v_dim_care_unit; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_care_unit AS
 SELECT care_unit_key,
    unit_code,
    unit_name,
    unit_type,
    facility_key,
    specialty,
    bed_complement,
    scd_effective_from,
    scd_effective_to,
    scd_is_current,
    scd_version
   FROM dw.dim_care_unit;


--
-- Name: v_dim_condition; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_condition AS
 SELECT condition_key,
    condition_code,
    condition_name,
    idsr_category,
    notification,
    alert_threshold,
    is_notifiable
   FROM dw.dim_condition;


--
-- Name: v_dim_date; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_date AS
 SELECT date_key,
    full_date,
    day_of_month,
    day_of_week_iso,
    day_name,
    day_short,
    is_weekend,
    is_public_holiday,
    COALESCE(holiday_name, ''::character varying) AS holiday_name,
    epi_year,
    epi_week,
    epi_week_label,
    epi_week_key,
    epi_week_start,
    month_num,
    month_name,
    month_short,
    year_month,
    year_month_key,
    month_start_date,
    quarter_num,
    year_quarter,
    calendar_year,
    fiscal_year_label,
    fiscal_year_start,
    rainy_season_label,
    is_malaria_season,
    is_after_cutoff
   FROM dw.dim_date
  WHERE ((date_key > 0) AND (calendar_year <= ( SELECT (max(fact_encounter.arrival_date_key) / 10000)
           FROM dw.fact_encounter)));


--
-- Name: VIEW v_dim_date; Type: COMMENT; Schema: mart; Owner: -
--

COMMENT ON VIEW mart.v_dim_date IS 'Date table for Power BI: complete calendar years from 2021 up to the latest year with attendances (special members excluded so that it can be marked as a date table; the warehouse calendar itself runs to 2027).';


--
-- Name: v_dim_diagnosis; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_diagnosis AS
 SELECT diagnosis_key,
    icd10_code,
    (((icd10_code)::text || ' '::text) || (icd10_title)::text) AS diagnosis_label,
    icd10_category,
    block_range,
    (((block_range)::text || ' '::text) || (block_title)::text) AS block_label,
    chapter_code,
    chapter_number,
    (((chapter_code)::text || ' '::text) || (chapter_title)::text) AS chapter_label,
    severity_class,
    default_specialty,
    is_chronic,
    condition_key
   FROM dw.dim_diagnosis;


--
-- Name: v_dim_encounter_profile; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_encounter_profile AS
 SELECT encounter_profile_key,
    department_code,
    department_name,
    arrival_mode_name,
    disposition_code,
    disposition_name,
    disposition_group
   FROM dw.dim_encounter_profile;


--
-- Name: v_dim_facility; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_facility AS
 SELECT facility_key,
    facility_code,
    facility_name,
    facility_short_name,
    facility_type,
    region_key,
    town,
    latitude,
    longitude,
    has_emergency_department,
    catchment_share
   FROM dw.dim_facility;


--
-- Name: v_dim_hour; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_hour AS
 SELECT hour_key,
    hour_label,
    hour_band,
    hour_band_sort,
    shift_name,
    is_after_hours
   FROM dw.dim_hour;


--
-- Name: v_dim_patient; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_patient AS
 SELECT patient_key,
    patient_durable_key,
    sex,
        CASE sex
            WHEN 'F'::bpchar THEN 'Female'::text
            WHEN 'M'::bpchar THEN 'Male'::text
            ELSE 'Unknown'::text
        END AS sex_name,
    residence_region_name,
    payer_code,
    payer_name,
    payer_group,
    is_inferred,
    scd_is_current
   FROM dw.dim_patient p;


--
-- Name: VIEW v_dim_patient; Type: COMMENT; Schema: mart; Owner: -
--

COMMENT ON VIEW mart.v_dim_patient IS 'Patient attributes for analysis only: no pseudonym, no birth year (age is carried on the facts as an age band).';


--
-- Name: v_dim_region; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_region AS
 SELECT region_key,
    region_code,
    region_name,
    zone,
    malaria_stratum
   FROM dw.dim_region;


--
-- Name: v_dim_shift; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_shift AS
 SELECT shift_key,
    shift_code,
    shift_name
   FROM dw.dim_shift;


--
-- Name: v_dim_triage; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dim_triage AS
 SELECT triage_key,
    triage_code,
    triage_label,
    priority,
    target_minutes,
    compliance_minutes,
    target_text,
    colour_hex
   FROM dw.dim_triage;


--
-- Name: v_dq_summary; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_dq_summary AS
 SELECT r.rule_code,
    r.rule_name,
    r.dq_dimension,
    r.source_object,
    r.action,
    r.owner_role,
    count(l.issue_id) AS issues,
    max(l.batch_id) AS last_batch
   FROM (audit.dq_rule r
     LEFT JOIN audit.dq_issue_log l ON ((l.rule_code = r.rule_code)))
  GROUP BY r.rule_code, r.rule_name, r.dq_dimension, r.source_object, r.action, r.owner_role;


--
-- Name: v_fact_admission; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_admission AS
 SELECT f.admission_date_key,
    f.discharge_date_key,
    f.care_unit_key,
    f.patient_key,
    p.patient_durable_key,
    f.diagnosis_key,
    f.admission_profile_key,
    f.age_band_key,
    f.admission_count,
    f.los_days,
    f.is_discharged,
    f.is_died,
    f.discharged_before_noon,
    f.is_weekend_discharge,
    f.is_readmission_30d,
    f.readmission_eligible,
    f.readmitted_within_30d,
    f.prior_admissions_12m,
    f.is_open_over_60d
   FROM (dw.fact_admission f
     JOIN dw.dim_patient p ON ((p.patient_key = f.patient_key)));


--
-- Name: v_fact_catchment_population; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_catchment_population AS
 SELECT p.year_date_key,
    f.facility_key,
    (round(((p.population)::numeric * f.catchment_share)))::integer AS catchment_population,
    p.is_census_count
   FROM (dw.fact_population p
     JOIN dw.dim_facility f ON (((f.region_key = p.region_key) AND (f.facility_key > 0))));


--
-- Name: VIEW v_fact_catchment_population; Type: COMMENT; Schema: mart; Owner: -
--

COMMENT ON VIEW mart.v_fact_catchment_population IS 'Derived fact: catchment population per facility and year (denominator of incidence per 100 000).';


--
-- Name: v_fact_encounter; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_encounter AS
 SELECT e.arrival_date_key,
    e.arrival_hour_key,
    e.care_unit_key,
    e.patient_key,
    p.patient_durable_key,
    e.diagnosis_key,
    e.triage_key,
    e.encounter_profile_key,
    e.age_band_key,
    e.encounter_count,
    e.wait_to_triage_min,
    e.door_to_doctor_min,
    e.ed_los_min,
    e.seen_within_target,
    e.is_lwbs,
    e.is_admitted,
    e.is_died
   FROM (dw.fact_encounter e
     JOIN dw.dim_patient p ON ((p.patient_key = e.patient_key)));


--
-- Name: v_fact_idsr_report; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_idsr_report AS
 SELECT epi_week_date_key,
    facility_key,
    report_expected,
    report_received,
    report_on_time,
    hours_after_due
   FROM dw.fact_idsr_report;


--
-- Name: v_fact_population; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_population AS
 SELECT year_date_key,
    region_key,
    population,
    is_census_count,
    population_source
   FROM dw.fact_population;


--
-- Name: v_fact_staff_roster; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_staff_roster AS
 SELECT roster_date_key,
    care_unit_key,
    shift_key,
    planned_nurse_hours,
    nurse_hours,
    rn_hours,
    doctor_hours,
    overtime_hours,
    agency_hours,
    sick_leave_hours,
    nurses_on_duty,
    doctors_on_duty
   FROM dw.fact_staff_roster;


--
-- Name: v_fact_surveillance; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_surveillance AS
 SELECT epi_week_date_key,
    facility_key,
    condition_key,
    cases_under5,
    cases_5plus,
    cases_total,
    deaths_total,
    tests_done,
    tests_positive
   FROM dw.fact_surveillance_weekly;


--
-- Name: v_fact_ward_census; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_ward_census AS
 SELECT census_date_key,
    care_unit_key,
    beds_complement,
    beds_closed,
    beds_available,
    occupied_beds,
    admissions,
    discharges,
    deaths,
    census_source
   FROM dw.fact_ward_census_daily;


--
-- Name: v_fact_weather; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_fact_weather AS
 SELECT weather_date_key,
    facility_key,
    rainfall_mm,
    tmax_c,
    tmin_c,
    rh_pct
   FROM dw.fact_weather_daily;


--
-- Name: v_recon_latest; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_recon_latest AS
 SELECT check_code,
    check_name,
    check_type,
    source_value,
    target_value,
    difference,
    status,
    explanation
   FROM audit.recon_result
  WHERE (batch_id = ( SELECT max(recon_result_1.batch_id) AS max
           FROM audit.recon_result recon_result_1));


--
-- Name: user_facility_access; Type: TABLE; Schema: sec; Owner: -
--

CREATE TABLE sec.user_facility_access (
    user_principal_name character varying(80) NOT NULL,
    facility_code character varying(10) NOT NULL,
    access_role character varying(30) NOT NULL,
    granted_by character varying(40) NOT NULL,
    granted_on date NOT NULL
);


--
-- Name: TABLE user_facility_access; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON TABLE sec.user_facility_access IS 'Dynamic row-level security mapping: which facilities each Power BI user may see (read by the "Facility manager" role).';


--
-- Name: COLUMN user_facility_access.user_principal_name; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_facility_access.user_principal_name IS 'Microsoft Entra ID user principal name (matched with USERPRINCIPALNAME() in DAX). | Source: Information Security Officer';


--
-- Name: COLUMN user_facility_access.facility_code; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_facility_access.facility_code IS 'Facility the user may see. | Source: Information Security Officer';


--
-- Name: COLUMN user_facility_access.access_role; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_facility_access.access_role IS 'Business role of the user (documentation only). | Source: Information Security Officer';


--
-- Name: COLUMN user_facility_access.granted_by; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_facility_access.granted_by IS 'Approver of the access (data owner). | Source: access request';


--
-- Name: COLUMN user_facility_access.granted_on; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_facility_access.granted_on IS 'Approval date (reviewed quarterly). | Source: access request';


--
-- Name: v_sec_user_facility; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.v_sec_user_facility AS
 SELECT lower((u.user_principal_name)::text) AS user_principal_name,
    f.facility_key
   FROM (sec.user_facility_access u
     JOIN dw.dim_facility f ON (((f.facility_code)::text = (u.facility_code)::text)));


--
-- Name: VIEW v_sec_user_facility; Type: COMMENT; Schema: mart; Owner: -
--

COMMENT ON VIEW mart.v_sec_user_facility IS 'Dynamic RLS mapping consumed by the Power BI role "Facility manager".';


--
-- Name: code_map; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.code_map (
    code_type text NOT NULL,
    source_value text NOT NULL,
    standard_code text NOT NULL,
    standard_description text
);


--
-- Name: TABLE code_map; Type: COMMENT; Schema: ref; Owner: -
--

COMMENT ON TABLE ref.code_map IS 'Steward-maintained mapping of raw source codes to standard codes (disposition, triage, shift, sex ...).';


--
-- Name: condition_alias; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.condition_alias (
    alias_norm text NOT NULL,
    condition_code text NOT NULL
);


--
-- Name: TABLE condition_alias; Type: COMMENT; Schema: ref; Owner: -
--

COMMENT ON TABLE ref.condition_alias IS 'Normalised IDSR condition names and aliases -> condition code.';


--
-- Name: payer_alias; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.payer_alias (
    alias_norm text NOT NULL,
    payer_code text NOT NULL
);


--
-- Name: TABLE payer_alias; Type: COMMENT; Schema: ref; Owner: -
--

COMMENT ON TABLE ref.payer_alias IS 'Normalised payer names and aliases -> payer code.';


--
-- Name: region_alias; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.region_alias (
    alias_norm text NOT NULL,
    region_code text NOT NULL
);


--
-- Name: TABLE region_alias; Type: COMMENT; Schema: ref; Owner: -
--

COMMENT ON TABLE ref.region_alias IS 'Normalised region names and aliases -> ISO 3166-2:NA region code.';


--
-- Name: census_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.census_clean (
    census_date date NOT NULL,
    ward_code text NOT NULL,
    beds_closed integer,
    occupied_midnight integer,
    admissions integer,
    discharges integer,
    deaths integer,
    submitted_at timestamp without time zone,
    census_source text,
    batch_id integer
);


--
-- Name: census_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.census_raw (
    source_file text,
    row_num integer,
    census_date text,
    ward_code text,
    beds_closed text,
    occupied_midnight text,
    admissions text,
    discharges text,
    deaths text,
    submitted_at text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE census_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.census_raw IS 'Nurse-reported ward bed state at midnight (one return per ward per day), landed as text.';


--
-- Name: encounter_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.encounter_clean (
    encounter_id text NOT NULL,
    facility_code text,
    unit_code text,
    department text,
    patient_id text,
    arrival_ts timestamp without time zone,
    triage_ts timestamp without time zone,
    seen_ts timestamp without time zone,
    departure_ts timestamp without time zone,
    triage_code text,
    arrival_mode_code text,
    disposition_code text,
    icd10_code text,
    wait_to_triage_min numeric(8,1),
    door_to_doctor_min numeric(8,1),
    ed_los_min numeric(9,1),
    source_file text,
    row_num integer,
    batch_id integer
);


--
-- Name: encounter_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.encounter_raw (
    source_file text,
    row_num integer,
    encounter_id text,
    facility_code text,
    department text,
    patient_id text,
    arrival_datetime text,
    triage_datetime text,
    triage_category text,
    seen_datetime text,
    departure_datetime text,
    arrival_mode text,
    disposition text,
    primary_icd10 text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE encounter_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.encounter_raw IS 'PAS ED and clinic attendance extracts, landed as text (yearly files + daily delta).';


--
-- Name: idsr_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.idsr_clean (
    facility_code text NOT NULL,
    epi_week_start date NOT NULL,
    condition_code text NOT NULL,
    cases_under5 integer,
    cases_5plus integer,
    deaths_under5 integer,
    deaths_5plus integer,
    tests_done integer,
    tests_positive integer,
    submitted_at timestamp without time zone,
    report_version smallint,
    batch_id integer
);


--
-- Name: idsr_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.idsr_raw (
    source_file text,
    row_num integer,
    facility_code text,
    epi_week text,
    condition text,
    cases_under5 text,
    cases_5plus text,
    deaths_under5 text,
    deaths_5plus text,
    tests_done text,
    tests_positive text,
    submitted_at text,
    report_version text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE idsr_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.idsr_raw IS 'IDSR weekly returns (aggregate counts per facility, epi week and priority condition), landed as text.';


--
-- Name: idsr_submission; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.idsr_submission (
    facility_code text NOT NULL,
    epi_week_start date NOT NULL,
    first_submitted_at timestamp without time zone,
    last_submitted_at timestamp without time zone,
    versions smallint,
    batch_id integer
);


--
-- Name: md_code_map_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_code_map_raw (
    extract_name text,
    row_num integer,
    code_type text,
    source_value text,
    standard_code text,
    standard_description text,
    batch_id integer NOT NULL
);


--
-- Name: md_condition_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_condition_clean (
    condition_code text NOT NULL,
    condition_name text,
    idsr_category text,
    notification text,
    alert_threshold text,
    icd10_codes text,
    batch_id integer
);


--
-- Name: md_conditions_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_conditions_raw (
    extract_name text,
    row_num integer,
    condition_code text,
    condition_name text,
    idsr_category text,
    notification text,
    alert_threshold text,
    icd10_codes text,
    known_aliases text,
    batch_id integer NOT NULL
);


--
-- Name: md_facilities_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_facilities_raw (
    extract_name text,
    row_num integer,
    facility_code text,
    facility_name text,
    facility_type text,
    region text,
    town text,
    latitude text,
    longitude text,
    elevation_m text,
    has_emergency_department text,
    catchment_share_pct text,
    opened_date text,
    ownership text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE md_facilities_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.md_facilities_raw IS 'Master data workbook (GBHS_Master_Data.xlsx and day-2 delta), one raw table per sheet.';


--
-- Name: md_facility_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_facility_clean (
    facility_code text NOT NULL,
    facility_name text,
    facility_type text,
    region_code text,
    town text,
    latitude numeric(9,5),
    longitude numeric(9,5),
    elevation_m integer,
    has_emergency_department boolean,
    catchment_share numeric(6,4),
    opened_date date,
    ownership text,
    batch_id integer
);


--
-- Name: md_icd_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_icd_clean (
    icd10_code text NOT NULL,
    icd10_title text,
    chapter text,
    chapter_range text,
    chapter_title text,
    block_range text,
    block_title text,
    severity_class text,
    default_specialty text,
    is_chronic boolean,
    condition_code text,
    batch_id integer
);


--
-- Name: md_icd_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_icd_raw (
    extract_name text,
    row_num integer,
    icd10_code text,
    icd10_title text,
    chapter text,
    chapter_range text,
    chapter_title text,
    block_range text,
    block_title text,
    severity_class text,
    default_specialty text,
    is_chronic_condition text,
    idsr_condition_code text,
    batch_id integer NOT NULL
);


--
-- Name: md_payer_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_payer_clean (
    payer_code text NOT NULL,
    payer_name text,
    payer_group text,
    batch_id integer
);


--
-- Name: md_payers_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_payers_raw (
    extract_name text,
    row_num integer,
    payer_code text,
    payer_name text,
    payer_group text,
    known_aliases text,
    batch_id integer NOT NULL
);


--
-- Name: md_region_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_region_clean (
    region_code text NOT NULL,
    region_name text,
    zone text,
    malaria_stratum text,
    batch_id integer
);


--
-- Name: md_regions_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_regions_raw (
    extract_name text,
    row_num integer,
    region_code text,
    region_name text,
    zone text,
    malaria_stratum text,
    known_aliases text,
    batch_id integer NOT NULL
);


--
-- Name: md_triage_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_triage_clean (
    triage_code text NOT NULL,
    triage_label text,
    priority smallint,
    target_minutes integer,
    target_text text,
    colour_hex text,
    batch_id integer
);


--
-- Name: md_triage_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_triage_raw (
    extract_name text,
    row_num integer,
    triage_code text,
    triage_label text,
    priority text,
    target_minutes text,
    target_text text,
    colour_hex text,
    batch_id integer NOT NULL
);


--
-- Name: md_unit_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_unit_clean (
    unit_code text NOT NULL,
    facility_code text,
    unit_name text,
    unit_type text,
    specialty text,
    bed_complement integer,
    is_active boolean,
    batch_id integer
);


--
-- Name: md_unit_history_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_unit_history_clean (
    change_id integer NOT NULL,
    unit_code text,
    attribute text,
    old_value text,
    new_value text,
    effective_date date,
    approved_by_role text,
    batch_id integer
);


--
-- Name: md_unit_history_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_unit_history_raw (
    extract_name text,
    row_num integer,
    change_id text,
    unit_code text,
    attribute text,
    old_value text,
    new_value text,
    effective_date text,
    approved_by_role text,
    batch_id integer NOT NULL
);


--
-- Name: md_units_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_units_raw (
    extract_name text,
    row_num integer,
    unit_code text,
    facility_code text,
    unit_name text,
    unit_type text,
    specialty text,
    bed_complement text,
    active text,
    batch_id integer NOT NULL
);


--
-- Name: nsa_census_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.nsa_census_raw (
    source_file text,
    row_num integer,
    region_txt text,
    population_txt text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE nsa_census_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.nsa_census_raw IS 'NSA 2023 census regional population table, every CSV row landed (including title, total and note rows).';


--
-- Name: nsa_control_total; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.nsa_control_total (
    census_year smallint NOT NULL,
    national_total integer,
    batch_id integer
);


--
-- Name: nsa_population_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.nsa_population_clean (
    region_code text NOT NULL,
    census_year smallint,
    population integer,
    batch_id integer
);


--
-- Name: pas_ward_census; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.pas_ward_census (
    census_date date NOT NULL,
    ward_code text NOT NULL,
    pas_occupied integer,
    pas_admissions integer,
    pas_discharges integer,
    pas_deaths integer
);


--
-- Name: TABLE pas_ward_census; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.pas_ward_census IS 'Midnight census derived from PAS spells (used to impute missing ward returns and to reconcile).';


--
-- Name: patient_change_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.patient_change_clean (
    change_id integer NOT NULL,
    patient_id text NOT NULL,
    attribute text NOT NULL,
    old_value text,
    new_value text,
    effective_date date NOT NULL,
    batch_id integer
);


--
-- Name: patient_change_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.patient_change_raw (
    source_file text,
    row_num integer,
    change_id text,
    patient_id text,
    attribute text,
    old_value text,
    new_value text,
    effective_date text,
    captured_at text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE patient_change_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.patient_change_raw IS 'Patient-index audit trail (residence region and payer class changes) used to build SCD Type 2 history.';


--
-- Name: patient_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.patient_clean (
    patient_id text NOT NULL,
    sex text,
    birth_year smallint,
    residence_region_code text,
    payer_code text,
    registration_date date,
    last_updated timestamp without time zone,
    batch_id integer
);


--
-- Name: patient_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.patient_raw (
    source_file text,
    row_num integer,
    patient_id text,
    sex text,
    birth_year text,
    residence_region text,
    payer_class text,
    registration_date text,
    last_updated text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE patient_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.patient_raw IS 'Pseudonymised master patient index (no names, ID numbers, dates of birth or addresses), landed as text.';


--
-- Name: roster_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.roster_clean (
    roster_date date NOT NULL,
    unit_code text NOT NULL,
    shift_code text NOT NULL,
    planned_nurse_hours numeric(7,1),
    rn_hours numeric(7,1),
    en_hours numeric(7,1),
    doctor_hours numeric(7,1),
    overtime_hours numeric(7,1),
    agency_hours numeric(7,1),
    sick_leave_hours numeric(7,1),
    nurses_on_duty smallint,
    doctors_on_duty smallint,
    batch_id integer
);


--
-- Name: roster_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.roster_raw (
    source_file text,
    row_num integer,
    roster_date text,
    unit_code text,
    shift text,
    planned_nurse_hours text,
    rn_hours text,
    en_hours text,
    doctor_hours text,
    overtime_hours text,
    agency_hours text,
    sick_leave_hours text,
    nurses_on_duty text,
    doctors_on_duty text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE roster_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.roster_raw IS 'E-rostering shift summary per care unit, date and shift, landed as text.';


--
-- Name: spell_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.spell_clean (
    admission_id text NOT NULL,
    facility_code text,
    ward_code text,
    patient_id text,
    admission_ts timestamp without time zone,
    discharge_ts timestamp without time zone,
    admission_method text,
    discharge_status text,
    icd10_code text,
    ed_encounter_id text,
    last_updated timestamp without time zone,
    batch_id integer
);


--
-- Name: spell_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.spell_raw (
    source_file text,
    row_num integer,
    admission_id text,
    facility_code text,
    ward_code text,
    patient_id text,
    admission_datetime text,
    discharge_datetime text,
    admission_method text,
    discharge_status text,
    principal_icd10 text,
    ed_encounter_id text,
    last_updated text,
    batch_id integer NOT NULL
);


--
-- Name: TABLE spell_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.spell_raw IS 'PAS inpatient spell change-data-capture export (several images per spell), landed as text.';


--
-- Name: weather_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.weather_clean (
    facility_code text NOT NULL,
    obs_date date NOT NULL,
    rainfall_mm numeric(7,2),
    tmax_c numeric(5,2),
    tmin_c numeric(5,2),
    rh_pct numeric(5,2),
    is_imputed boolean,
    batch_id integer
);


--
-- Name: weather_json_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.weather_json_raw (
    source_file text,
    facility_code text,
    payload jsonb,
    batch_id integer NOT NULL
);


--
-- Name: TABLE weather_json_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.weather_json_raw IS 'NASA POWER daily point JSON, one document per facility location.';


--
-- Name: dq_issue_log dq_issue_log_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.dq_issue_log
    ADD CONSTRAINT dq_issue_log_pkey PRIMARY KEY (issue_id);


--
-- Name: dq_rule dq_rule_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.dq_rule
    ADD CONSTRAINT dq_rule_pkey PRIMARY KEY (rule_code);


--
-- Name: etl_batch etl_batch_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.etl_batch
    ADD CONSTRAINT etl_batch_pkey PRIMARY KEY (batch_id);


--
-- Name: etl_step_log etl_step_log_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.etl_step_log
    ADD CONSTRAINT etl_step_log_pkey PRIMARY KEY (step_id);


--
-- Name: recon_result recon_result_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.recon_result
    ADD CONSTRAINT recon_result_pkey PRIMARY KEY (recon_id);


--
-- Name: dim_admission_profile dim_admission_profile_admission_method_code_discharge_statu_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_admission_profile
    ADD CONSTRAINT dim_admission_profile_admission_method_code_discharge_statu_key UNIQUE (admission_method_code, discharge_status_code);


--
-- Name: dim_admission_profile dim_admission_profile_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_admission_profile
    ADD CONSTRAINT dim_admission_profile_pkey PRIMARY KEY (admission_profile_key);


--
-- Name: dim_age_band dim_age_band_age_band_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_age_band
    ADD CONSTRAINT dim_age_band_age_band_key UNIQUE (age_band);


--
-- Name: dim_age_band dim_age_band_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_age_band
    ADD CONSTRAINT dim_age_band_pkey PRIMARY KEY (age_band_key);


--
-- Name: dim_care_unit dim_care_unit_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_care_unit
    ADD CONSTRAINT dim_care_unit_pkey PRIMARY KEY (care_unit_key);


--
-- Name: dim_care_unit dim_care_unit_unit_code_scd_effective_from_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_care_unit
    ADD CONSTRAINT dim_care_unit_unit_code_scd_effective_from_key UNIQUE (unit_code, scd_effective_from);


--
-- Name: dim_condition dim_condition_condition_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_condition
    ADD CONSTRAINT dim_condition_condition_code_key UNIQUE (condition_code);


--
-- Name: dim_condition dim_condition_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_condition
    ADD CONSTRAINT dim_condition_pkey PRIMARY KEY (condition_key);


--
-- Name: dim_date dim_date_full_date_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_date
    ADD CONSTRAINT dim_date_full_date_key UNIQUE (full_date);


--
-- Name: dim_date dim_date_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_date
    ADD CONSTRAINT dim_date_pkey PRIMARY KEY (date_key);


--
-- Name: dim_diagnosis dim_diagnosis_icd10_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_diagnosis
    ADD CONSTRAINT dim_diagnosis_icd10_code_key UNIQUE (icd10_code);


--
-- Name: dim_diagnosis dim_diagnosis_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_diagnosis
    ADD CONSTRAINT dim_diagnosis_pkey PRIMARY KEY (diagnosis_key);


--
-- Name: dim_encounter_profile dim_encounter_profile_department_code_arrival_mode_code_dis_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_encounter_profile
    ADD CONSTRAINT dim_encounter_profile_department_code_arrival_mode_code_dis_key UNIQUE (department_code, arrival_mode_code, disposition_code);


--
-- Name: dim_encounter_profile dim_encounter_profile_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_encounter_profile
    ADD CONSTRAINT dim_encounter_profile_pkey PRIMARY KEY (encounter_profile_key);


--
-- Name: dim_facility dim_facility_facility_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_facility
    ADD CONSTRAINT dim_facility_facility_code_key UNIQUE (facility_code);


--
-- Name: dim_facility dim_facility_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_facility
    ADD CONSTRAINT dim_facility_pkey PRIMARY KEY (facility_key);


--
-- Name: dim_hour dim_hour_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_hour
    ADD CONSTRAINT dim_hour_pkey PRIMARY KEY (hour_key);


--
-- Name: dim_patient dim_patient_patient_pseudo_id_scd_effective_from_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_patient
    ADD CONSTRAINT dim_patient_patient_pseudo_id_scd_effective_from_key UNIQUE (patient_pseudo_id, scd_effective_from);


--
-- Name: dim_patient dim_patient_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_patient
    ADD CONSTRAINT dim_patient_pkey PRIMARY KEY (patient_key);


--
-- Name: dim_region dim_region_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_region
    ADD CONSTRAINT dim_region_pkey PRIMARY KEY (region_key);


--
-- Name: dim_region dim_region_region_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_region
    ADD CONSTRAINT dim_region_region_code_key UNIQUE (region_code);


--
-- Name: dim_shift dim_shift_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_shift
    ADD CONSTRAINT dim_shift_pkey PRIMARY KEY (shift_key);


--
-- Name: dim_shift dim_shift_shift_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_shift
    ADD CONSTRAINT dim_shift_shift_code_key UNIQUE (shift_code);


--
-- Name: dim_triage dim_triage_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_triage
    ADD CONSTRAINT dim_triage_pkey PRIMARY KEY (triage_key);


--
-- Name: dim_triage dim_triage_triage_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_triage
    ADD CONSTRAINT dim_triage_triage_code_key UNIQUE (triage_code);


--
-- Name: fact_admission fact_admission_admission_id_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_admission_id_key UNIQUE (admission_id);


--
-- Name: fact_admission fact_admission_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_pkey PRIMARY KEY (admission_key);


--
-- Name: fact_encounter fact_encounter_encounter_id_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_encounter_id_key UNIQUE (encounter_id);


--
-- Name: fact_encounter fact_encounter_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_pkey PRIMARY KEY (encounter_key);


--
-- Name: fact_idsr_report fact_idsr_report_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_idsr_report
    ADD CONSTRAINT fact_idsr_report_pkey PRIMARY KEY (epi_week_date_key, facility_key);


--
-- Name: fact_population fact_population_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_population
    ADD CONSTRAINT fact_population_pkey PRIMARY KEY (year_date_key, region_key);


--
-- Name: fact_staff_roster fact_staff_roster_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_staff_roster
    ADD CONSTRAINT fact_staff_roster_pkey PRIMARY KEY (roster_date_key, care_unit_key, shift_key);


--
-- Name: fact_surveillance_weekly fact_surveillance_weekly_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_surveillance_weekly
    ADD CONSTRAINT fact_surveillance_weekly_pkey PRIMARY KEY (epi_week_date_key, facility_key, condition_key);


--
-- Name: fact_ward_census_daily fact_ward_census_daily_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_ward_census_daily
    ADD CONSTRAINT fact_ward_census_daily_pkey PRIMARY KEY (census_date_key, care_unit_key);


--
-- Name: fact_weather_daily fact_weather_daily_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_weather_daily
    ADD CONSTRAINT fact_weather_daily_pkey PRIMARY KEY (weather_date_key, facility_key);


--
-- Name: code_map code_map_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.code_map
    ADD CONSTRAINT code_map_pkey PRIMARY KEY (code_type, source_value);


--
-- Name: condition_alias condition_alias_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.condition_alias
    ADD CONSTRAINT condition_alias_pkey PRIMARY KEY (alias_norm);


--
-- Name: payer_alias payer_alias_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.payer_alias
    ADD CONSTRAINT payer_alias_pkey PRIMARY KEY (alias_norm);


--
-- Name: region_alias region_alias_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.region_alias
    ADD CONSTRAINT region_alias_pkey PRIMARY KEY (alias_norm);


--
-- Name: user_facility_access user_facility_access_pkey; Type: CONSTRAINT; Schema: sec; Owner: -
--

ALTER TABLE ONLY sec.user_facility_access
    ADD CONSTRAINT user_facility_access_pkey PRIMARY KEY (user_principal_name, facility_code);


--
-- Name: census_clean census_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.census_clean
    ADD CONSTRAINT census_clean_pkey PRIMARY KEY (census_date, ward_code);


--
-- Name: encounter_clean encounter_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.encounter_clean
    ADD CONSTRAINT encounter_clean_pkey PRIMARY KEY (encounter_id);


--
-- Name: idsr_clean idsr_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.idsr_clean
    ADD CONSTRAINT idsr_clean_pkey PRIMARY KEY (facility_code, epi_week_start, condition_code);


--
-- Name: idsr_submission idsr_submission_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.idsr_submission
    ADD CONSTRAINT idsr_submission_pkey PRIMARY KEY (facility_code, epi_week_start);


--
-- Name: md_condition_clean md_condition_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_condition_clean
    ADD CONSTRAINT md_condition_clean_pkey PRIMARY KEY (condition_code);


--
-- Name: md_facility_clean md_facility_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_facility_clean
    ADD CONSTRAINT md_facility_clean_pkey PRIMARY KEY (facility_code);


--
-- Name: md_icd_clean md_icd_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_icd_clean
    ADD CONSTRAINT md_icd_clean_pkey PRIMARY KEY (icd10_code);


--
-- Name: md_payer_clean md_payer_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_payer_clean
    ADD CONSTRAINT md_payer_clean_pkey PRIMARY KEY (payer_code);


--
-- Name: md_region_clean md_region_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_region_clean
    ADD CONSTRAINT md_region_clean_pkey PRIMARY KEY (region_code);


--
-- Name: md_triage_clean md_triage_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_triage_clean
    ADD CONSTRAINT md_triage_clean_pkey PRIMARY KEY (triage_code);


--
-- Name: md_unit_clean md_unit_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_unit_clean
    ADD CONSTRAINT md_unit_clean_pkey PRIMARY KEY (unit_code);


--
-- Name: md_unit_history_clean md_unit_history_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_unit_history_clean
    ADD CONSTRAINT md_unit_history_clean_pkey PRIMARY KEY (change_id);


--
-- Name: nsa_control_total nsa_control_total_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.nsa_control_total
    ADD CONSTRAINT nsa_control_total_pkey PRIMARY KEY (census_year);


--
-- Name: nsa_population_clean nsa_population_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.nsa_population_clean
    ADD CONSTRAINT nsa_population_clean_pkey PRIMARY KEY (region_code);


--
-- Name: pas_ward_census pas_ward_census_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.pas_ward_census
    ADD CONSTRAINT pas_ward_census_pkey PRIMARY KEY (census_date, ward_code);


--
-- Name: patient_change_clean patient_change_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.patient_change_clean
    ADD CONSTRAINT patient_change_clean_pkey PRIMARY KEY (change_id);


--
-- Name: patient_clean patient_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.patient_clean
    ADD CONSTRAINT patient_clean_pkey PRIMARY KEY (patient_id);


--
-- Name: roster_clean roster_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.roster_clean
    ADD CONSTRAINT roster_clean_pkey PRIMARY KEY (roster_date, unit_code, shift_code);


--
-- Name: spell_clean spell_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.spell_clean
    ADD CONSTRAINT spell_clean_pkey PRIMARY KEY (admission_id);


--
-- Name: weather_clean weather_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.weather_clean
    ADD CONSTRAINT weather_clean_pkey PRIMARY KEY (facility_code, obs_date);


--
-- Name: ix_dq_issue_log_rule; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX ix_dq_issue_log_rule ON audit.dq_issue_log USING btree (batch_id, rule_code);


--
-- Name: brin_fact_encounter_date; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX brin_fact_encounter_date ON dw.fact_encounter USING brin (arrival_date_key);


--
-- Name: ix_dim_care_unit_code; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_dim_care_unit_code ON dw.dim_care_unit USING btree (unit_code, scd_effective_from, scd_effective_to);


--
-- Name: ix_dim_patient_pseudo; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_dim_patient_pseudo ON dw.dim_patient USING btree (patient_pseudo_id, scd_effective_from, scd_effective_to);


--
-- Name: ix_fact_admission_discharge; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_admission_discharge ON dw.fact_admission USING btree (discharge_date_key);


--
-- Name: ix_fact_admission_patient; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_admission_patient ON dw.fact_admission USING btree (patient_key);


--
-- Name: ix_fact_admission_unit_date; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_admission_unit_date ON dw.fact_admission USING btree (care_unit_key, admission_date_key);


--
-- Name: ix_fact_census_unit; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_census_unit ON dw.fact_ward_census_daily USING btree (care_unit_key, census_date_key);


--
-- Name: ix_fact_encounter_diag; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_encounter_diag ON dw.fact_encounter USING btree (diagnosis_key);


--
-- Name: ix_fact_encounter_patient; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_encounter_patient ON dw.fact_encounter USING btree (patient_key);


--
-- Name: ix_fact_encounter_unit_date; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_encounter_unit_date ON dw.fact_encounter USING btree (care_unit_key, arrival_date_key);


--
-- Name: ix_fact_roster_unit; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_roster_unit ON dw.fact_staff_roster USING btree (care_unit_key, roster_date_key);


--
-- Name: ix_fact_surv_cond; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_surv_cond ON dw.fact_surveillance_weekly USING btree (condition_key, epi_week_date_key);


--
-- Name: ux_agg_ed_daily; Type: INDEX; Schema: mart; Owner: -
--

CREATE UNIQUE INDEX ux_agg_ed_daily ON mart.agg_ed_daily USING btree (arrival_date_key, facility_key, department_code, triage_key);


--
-- Name: ix_encounter_clean_batch; Type: INDEX; Schema: stg; Owner: -
--

CREATE INDEX ix_encounter_clean_batch ON stg.encounter_clean USING btree (batch_id);


--
-- Name: ix_patient_change_lookup; Type: INDEX; Schema: stg; Owner: -
--

CREATE INDEX ix_patient_change_lookup ON stg.patient_change_clean USING btree (patient_id, attribute, effective_date);


--
-- Name: ix_spell_clean_batch; Type: INDEX; Schema: stg; Owner: -
--

CREATE INDEX ix_spell_clean_batch ON stg.spell_clean USING btree (batch_id);


--
-- Name: dq_issue_log dq_issue_log_batch_id_fkey; Type: FK CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.dq_issue_log
    ADD CONSTRAINT dq_issue_log_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES audit.etl_batch(batch_id);


--
-- Name: dq_issue_log dq_issue_log_rule_code_fkey; Type: FK CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.dq_issue_log
    ADD CONSTRAINT dq_issue_log_rule_code_fkey FOREIGN KEY (rule_code) REFERENCES audit.dq_rule(rule_code);


--
-- Name: etl_step_log etl_step_log_batch_id_fkey; Type: FK CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.etl_step_log
    ADD CONSTRAINT etl_step_log_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES audit.etl_batch(batch_id);


--
-- Name: recon_result recon_result_batch_id_fkey; Type: FK CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.recon_result
    ADD CONSTRAINT recon_result_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES audit.etl_batch(batch_id);


--
-- Name: dim_care_unit dim_care_unit_facility_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_care_unit
    ADD CONSTRAINT dim_care_unit_facility_key_fkey FOREIGN KEY (facility_key) REFERENCES dw.dim_facility(facility_key);


--
-- Name: dim_diagnosis dim_diagnosis_condition_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_diagnosis
    ADD CONSTRAINT dim_diagnosis_condition_key_fkey FOREIGN KEY (condition_key) REFERENCES dw.dim_condition(condition_key);


--
-- Name: dim_facility dim_facility_region_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_facility
    ADD CONSTRAINT dim_facility_region_key_fkey FOREIGN KEY (region_key) REFERENCES dw.dim_region(region_key);


--
-- Name: fact_admission fact_admission_admission_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_admission_date_key_fkey FOREIGN KEY (admission_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_admission fact_admission_admission_profile_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_admission_profile_key_fkey FOREIGN KEY (admission_profile_key) REFERENCES dw.dim_admission_profile(admission_profile_key);


--
-- Name: fact_admission fact_admission_age_band_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_age_band_key_fkey FOREIGN KEY (age_band_key) REFERENCES dw.dim_age_band(age_band_key);


--
-- Name: fact_admission fact_admission_care_unit_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_care_unit_key_fkey FOREIGN KEY (care_unit_key) REFERENCES dw.dim_care_unit(care_unit_key);


--
-- Name: fact_admission fact_admission_diagnosis_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_diagnosis_key_fkey FOREIGN KEY (diagnosis_key) REFERENCES dw.dim_diagnosis(diagnosis_key);


--
-- Name: fact_admission fact_admission_discharge_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_discharge_date_key_fkey FOREIGN KEY (discharge_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_admission fact_admission_patient_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_admission
    ADD CONSTRAINT fact_admission_patient_key_fkey FOREIGN KEY (patient_key) REFERENCES dw.dim_patient(patient_key);


--
-- Name: fact_encounter fact_encounter_age_band_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_age_band_key_fkey FOREIGN KEY (age_band_key) REFERENCES dw.dim_age_band(age_band_key);


--
-- Name: fact_encounter fact_encounter_arrival_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_arrival_date_key_fkey FOREIGN KEY (arrival_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_encounter fact_encounter_arrival_hour_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_arrival_hour_key_fkey FOREIGN KEY (arrival_hour_key) REFERENCES dw.dim_hour(hour_key);


--
-- Name: fact_encounter fact_encounter_care_unit_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_care_unit_key_fkey FOREIGN KEY (care_unit_key) REFERENCES dw.dim_care_unit(care_unit_key);


--
-- Name: fact_encounter fact_encounter_diagnosis_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_diagnosis_key_fkey FOREIGN KEY (diagnosis_key) REFERENCES dw.dim_diagnosis(diagnosis_key);


--
-- Name: fact_encounter fact_encounter_encounter_profile_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_encounter_profile_key_fkey FOREIGN KEY (encounter_profile_key) REFERENCES dw.dim_encounter_profile(encounter_profile_key);


--
-- Name: fact_encounter fact_encounter_patient_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_patient_key_fkey FOREIGN KEY (patient_key) REFERENCES dw.dim_patient(patient_key);


--
-- Name: fact_encounter fact_encounter_triage_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_encounter
    ADD CONSTRAINT fact_encounter_triage_key_fkey FOREIGN KEY (triage_key) REFERENCES dw.dim_triage(triage_key);


--
-- Name: fact_idsr_report fact_idsr_report_epi_week_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_idsr_report
    ADD CONSTRAINT fact_idsr_report_epi_week_date_key_fkey FOREIGN KEY (epi_week_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_idsr_report fact_idsr_report_facility_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_idsr_report
    ADD CONSTRAINT fact_idsr_report_facility_key_fkey FOREIGN KEY (facility_key) REFERENCES dw.dim_facility(facility_key);


--
-- Name: fact_population fact_population_region_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_population
    ADD CONSTRAINT fact_population_region_key_fkey FOREIGN KEY (region_key) REFERENCES dw.dim_region(region_key);


--
-- Name: fact_population fact_population_year_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_population
    ADD CONSTRAINT fact_population_year_date_key_fkey FOREIGN KEY (year_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_staff_roster fact_staff_roster_care_unit_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_staff_roster
    ADD CONSTRAINT fact_staff_roster_care_unit_key_fkey FOREIGN KEY (care_unit_key) REFERENCES dw.dim_care_unit(care_unit_key);


--
-- Name: fact_staff_roster fact_staff_roster_roster_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_staff_roster
    ADD CONSTRAINT fact_staff_roster_roster_date_key_fkey FOREIGN KEY (roster_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_staff_roster fact_staff_roster_shift_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_staff_roster
    ADD CONSTRAINT fact_staff_roster_shift_key_fkey FOREIGN KEY (shift_key) REFERENCES dw.dim_shift(shift_key);


--
-- Name: fact_surveillance_weekly fact_surveillance_weekly_condition_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_surveillance_weekly
    ADD CONSTRAINT fact_surveillance_weekly_condition_key_fkey FOREIGN KEY (condition_key) REFERENCES dw.dim_condition(condition_key);


--
-- Name: fact_surveillance_weekly fact_surveillance_weekly_epi_week_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_surveillance_weekly
    ADD CONSTRAINT fact_surveillance_weekly_epi_week_date_key_fkey FOREIGN KEY (epi_week_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_surveillance_weekly fact_surveillance_weekly_facility_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_surveillance_weekly
    ADD CONSTRAINT fact_surveillance_weekly_facility_key_fkey FOREIGN KEY (facility_key) REFERENCES dw.dim_facility(facility_key);


--
-- Name: fact_ward_census_daily fact_ward_census_daily_care_unit_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_ward_census_daily
    ADD CONSTRAINT fact_ward_census_daily_care_unit_key_fkey FOREIGN KEY (care_unit_key) REFERENCES dw.dim_care_unit(care_unit_key);


--
-- Name: fact_ward_census_daily fact_ward_census_daily_census_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_ward_census_daily
    ADD CONSTRAINT fact_ward_census_daily_census_date_key_fkey FOREIGN KEY (census_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_weather_daily fact_weather_daily_facility_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_weather_daily
    ADD CONSTRAINT fact_weather_daily_facility_key_fkey FOREIGN KEY (facility_key) REFERENCES dw.dim_facility(facility_key);


--
-- Name: fact_weather_daily fact_weather_daily_weather_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_weather_daily
    ADD CONSTRAINT fact_weather_daily_weather_date_key_fkey FOREIGN KEY (weather_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: SCHEMA audit; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA audit TO gbhs_etl_loader;


--
-- Name: SCHEMA dw; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA dw TO gbhs_etl_loader;


--
-- Name: SCHEMA etl; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA etl TO gbhs_etl_loader;


--
-- Name: SCHEMA mart; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA mart TO gbhs_pbi_reader;
GRANT USAGE ON SCHEMA mart TO gbhs_etl_loader;


--
-- Name: SCHEMA ref; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA ref TO gbhs_etl_loader;


--
-- Name: SCHEMA sec; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA sec TO gbhs_etl_loader;


--
-- Name: SCHEMA stg; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA stg TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_age_band_key(p_age integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_age_band_key(p_age integer) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_batch_cutoff(p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_batch_cutoff(p_batch integer) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_date_key(p_date date); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_date_key(p_date date) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_easter_sunday(p_year integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_easter_sunday(p_year integer) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_icd_clean(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_icd_clean(p_txt text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_log_step(p_batch integer, p_step text, p_target text, p_in bigint, p_out bigint, p_rej bigint, p_started timestamp with time zone, p_msg text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_log_step(p_batch integer, p_step text, p_target text, p_in bigint, p_out bigint, p_rej bigint, p_started timestamp with time zone, p_msg text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_minutes(p_from timestamp without time zone, p_to timestamp without time zone); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_minutes(p_from timestamp without time zone, p_to timestamp without time zone) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_namibian_holiday(p_date date); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_namibian_holiday(p_date date) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_norm(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_norm(p_txt text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_num(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_num(p_txt text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_parse_epi_week(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_parse_epi_week(p_txt text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_parse_ts(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_parse_ts(p_txt text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_patient_attr_asof(p_patient text, p_attr text, p_asof date, p_current text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_patient_attr_asof(p_patient text, p_attr text, p_asof date, p_current text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_recon_add(p_batch integer, p_code text, p_name text, p_type text, p_src numeric, p_tgt numeric, p_tol numeric, p_warn_band numeric, p_expl text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_recon_add(p_batch integer, p_code text, p_name text, p_type text, p_src numeric, p_tgt numeric, p_tol numeric, p_warn_band numeric, p_expl text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_start_batch(p_type text, p_description text, p_cutoff timestamp without time zone); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_start_batch(p_type text, p_description text, p_cutoff timestamp without time zone) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_try_date(p_txt text, p_fmt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_try_date(p_txt text, p_fmt text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_try_numeric(p_txt text, p_decimal_comma boolean); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_try_numeric(p_txt text, p_decimal_comma boolean) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_ts_is_dayfirst(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_ts_is_dayfirst(p_txt text) TO gbhs_etl_loader;


--
-- Name: FUNCTION fn_unit_attr_asof(p_unit text, p_attr text, p_asof date, p_current text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_unit_attr_asof(p_unit text, p_attr text, p_asof date, p_current text) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_add_inferred_patients(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_add_inferred_patients(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_finish_batch(IN p_batch integer, IN p_status text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_finish_batch(IN p_batch integer, IN p_status text) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_care_unit_scd2(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_care_unit_scd2(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_clinical(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_clinical(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_date(IN p_batch integer, IN p_start date, IN p_end date); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_date(IN p_batch integer, IN p_start date, IN p_end date) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_geography(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_geography(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_patient_scd2(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_patient_scd2(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_admission(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_admission(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_encounter(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_encounter(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_population(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_population(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_staff_roster(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_staff_roster(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_surveillance(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_surveillance(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_ward_census(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_ward_census(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_weather(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_weather(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_load_static_dims(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_static_dims(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_reconcile(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_reconcile(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_run_load(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_run_load(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_census(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_census(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_encounters(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_encounters(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_external(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_external(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_idsr(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_idsr(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_master(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_master(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_patients(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_patients(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_roster(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_roster(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: PROCEDURE sp_transform_spells(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_spells(IN p_batch integer) TO gbhs_etl_loader;


--
-- Name: TABLE dq_issue_log; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.dq_issue_log TO gbhs_etl_loader;


--
-- Name: TABLE dq_rule; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.dq_rule TO gbhs_etl_loader;


--
-- Name: TABLE etl_batch; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.etl_batch TO gbhs_etl_loader;


--
-- Name: TABLE etl_step_log; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.etl_step_log TO gbhs_etl_loader;


--
-- Name: TABLE recon_result; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.recon_result TO gbhs_etl_loader;


--
-- Name: TABLE dim_admission_profile; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_admission_profile TO gbhs_etl_loader;


--
-- Name: TABLE dim_age_band; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_age_band TO gbhs_etl_loader;


--
-- Name: TABLE dim_care_unit; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_care_unit TO gbhs_etl_loader;


--
-- Name: TABLE dim_condition; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_condition TO gbhs_etl_loader;


--
-- Name: TABLE dim_date; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_date TO gbhs_etl_loader;


--
-- Name: TABLE dim_diagnosis; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_diagnosis TO gbhs_etl_loader;


--
-- Name: TABLE dim_encounter_profile; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_encounter_profile TO gbhs_etl_loader;


--
-- Name: TABLE dim_facility; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_facility TO gbhs_etl_loader;


--
-- Name: TABLE dim_hour; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_hour TO gbhs_etl_loader;


--
-- Name: TABLE dim_patient; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_patient TO gbhs_etl_loader;


--
-- Name: TABLE dim_region; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_region TO gbhs_etl_loader;


--
-- Name: TABLE dim_shift; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_shift TO gbhs_etl_loader;


--
-- Name: TABLE dim_triage; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_triage TO gbhs_etl_loader;


--
-- Name: TABLE fact_admission; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_admission TO gbhs_etl_loader;


--
-- Name: TABLE fact_encounter; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_encounter TO gbhs_etl_loader;


--
-- Name: TABLE fact_idsr_report; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_idsr_report TO gbhs_etl_loader;


--
-- Name: TABLE fact_population; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_population TO gbhs_etl_loader;


--
-- Name: TABLE fact_staff_roster; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_staff_roster TO gbhs_etl_loader;


--
-- Name: TABLE fact_surveillance_weekly; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_surveillance_weekly TO gbhs_etl_loader;


--
-- Name: TABLE fact_ward_census_daily; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_ward_census_daily TO gbhs_etl_loader;


--
-- Name: TABLE fact_weather_daily; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_weather_daily TO gbhs_etl_loader;


--
-- Name: TABLE agg_ed_daily; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.agg_ed_daily TO gbhs_pbi_reader;


--
-- Name: TABLE analytics_ed_drivers; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.analytics_ed_drivers TO gbhs_pbi_reader;


--
-- Name: TABLE analytics_malaria_forecast; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.analytics_malaria_forecast TO gbhs_pbi_reader;


--
-- Name: TABLE analytics_outbreak_alerts; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.analytics_outbreak_alerts TO gbhs_pbi_reader;


--
-- Name: TABLE analytics_readmission_deciles; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.analytics_readmission_deciles TO gbhs_pbi_reader;


--
-- Name: TABLE analytics_readmission_drivers; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.analytics_readmission_drivers TO gbhs_pbi_reader;


--
-- Name: TABLE v_dim_admission_profile; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_admission_profile TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_admission_profile TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_age_band; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_age_band TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_age_band TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_care_unit; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_care_unit TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_care_unit TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_condition; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_condition TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_condition TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_date; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_date TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_date TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_diagnosis; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_diagnosis TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_diagnosis TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_encounter_profile; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_encounter_profile TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_encounter_profile TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_facility; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_facility TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_facility TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_hour; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_hour TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_hour TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_patient; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_patient TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_patient TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_region; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_region TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_region TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_shift; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_shift TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_shift TO gbhs_etl_loader;


--
-- Name: TABLE v_dim_triage; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dim_triage TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dim_triage TO gbhs_etl_loader;


--
-- Name: TABLE v_dq_summary; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_dq_summary TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_dq_summary TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_admission; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_admission TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_admission TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_catchment_population; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_catchment_population TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_catchment_population TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_encounter; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_encounter TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_encounter TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_idsr_report; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_idsr_report TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_idsr_report TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_population; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_population TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_population TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_staff_roster; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_staff_roster TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_staff_roster TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_surveillance; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_surveillance TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_surveillance TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_ward_census; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_ward_census TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_ward_census TO gbhs_etl_loader;


--
-- Name: TABLE v_fact_weather; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_fact_weather TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_fact_weather TO gbhs_etl_loader;


--
-- Name: TABLE v_recon_latest; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_recon_latest TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_recon_latest TO gbhs_etl_loader;


--
-- Name: TABLE user_facility_access; Type: ACL; Schema: sec; Owner: -
--

GRANT ALL ON TABLE sec.user_facility_access TO gbhs_etl_loader;


--
-- Name: TABLE v_sec_user_facility; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.v_sec_user_facility TO gbhs_pbi_reader;
GRANT ALL ON TABLE mart.v_sec_user_facility TO gbhs_etl_loader;


--
-- Name: TABLE code_map; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.code_map TO gbhs_etl_loader;


--
-- Name: TABLE condition_alias; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.condition_alias TO gbhs_etl_loader;


--
-- Name: TABLE payer_alias; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.payer_alias TO gbhs_etl_loader;


--
-- Name: TABLE region_alias; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.region_alias TO gbhs_etl_loader;


--
-- Name: TABLE census_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.census_clean TO gbhs_etl_loader;


--
-- Name: TABLE census_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.census_raw TO gbhs_etl_loader;


--
-- Name: TABLE encounter_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.encounter_clean TO gbhs_etl_loader;


--
-- Name: TABLE encounter_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.encounter_raw TO gbhs_etl_loader;


--
-- Name: TABLE idsr_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.idsr_clean TO gbhs_etl_loader;


--
-- Name: TABLE idsr_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.idsr_raw TO gbhs_etl_loader;


--
-- Name: TABLE idsr_submission; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.idsr_submission TO gbhs_etl_loader;


--
-- Name: TABLE md_code_map_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_code_map_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_condition_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_condition_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_conditions_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_conditions_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_facilities_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_facilities_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_facility_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_facility_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_icd_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_icd_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_icd_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_icd_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_payer_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_payer_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_payers_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_payers_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_region_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_region_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_regions_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_regions_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_triage_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_triage_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_triage_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_triage_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_unit_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_unit_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_unit_history_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_unit_history_clean TO gbhs_etl_loader;


--
-- Name: TABLE md_unit_history_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_unit_history_raw TO gbhs_etl_loader;


--
-- Name: TABLE md_units_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_units_raw TO gbhs_etl_loader;


--
-- Name: TABLE nsa_census_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.nsa_census_raw TO gbhs_etl_loader;


--
-- Name: TABLE nsa_control_total; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.nsa_control_total TO gbhs_etl_loader;


--
-- Name: TABLE nsa_population_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.nsa_population_clean TO gbhs_etl_loader;


--
-- Name: TABLE pas_ward_census; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.pas_ward_census TO gbhs_etl_loader;


--
-- Name: TABLE patient_change_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.patient_change_clean TO gbhs_etl_loader;


--
-- Name: TABLE patient_change_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.patient_change_raw TO gbhs_etl_loader;


--
-- Name: TABLE patient_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.patient_clean TO gbhs_etl_loader;


--
-- Name: TABLE patient_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.patient_raw TO gbhs_etl_loader;


--
-- Name: TABLE roster_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.roster_clean TO gbhs_etl_loader;


--
-- Name: TABLE roster_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.roster_raw TO gbhs_etl_loader;


--
-- Name: TABLE spell_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.spell_clean TO gbhs_etl_loader;


--
-- Name: TABLE spell_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.spell_raw TO gbhs_etl_loader;


--
-- Name: TABLE weather_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.weather_clean TO gbhs_etl_loader;


--
-- Name: TABLE weather_json_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.weather_json_raw TO gbhs_etl_loader;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: mart; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA mart GRANT SELECT ON TABLES TO gbhs_pbi_reader;


--
-- PostgreSQL database dump complete
--

\unrestrict vJteyUfZUyasIuJ9edVShctWI3QLKgMFgerNsfGAAnTmnG1vESffPsJ35Zoscdv

