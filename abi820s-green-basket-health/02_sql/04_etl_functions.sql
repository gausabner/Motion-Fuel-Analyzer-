-- =============================================================================
-- 04_etl_functions.sql
-- Reusable parsing / standardisation functions and audit-logging helpers
-- (Green Basket Health Services warehouse).
-- =============================================================================

-- Safe date parsing: returns NULL instead of raising on invalid input
CREATE OR REPLACE FUNCTION etl.fn_try_date(p_txt text, p_fmt text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
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

-- Safe numeric parsing of free-form amounts: strips currency symbols, blanks and
-- thousands separators ("N$12,345.67" -> 12345.67); optional decimal-comma mode
CREATE OR REPLACE FUNCTION etl.fn_try_numeric(p_txt text, p_decimal_comma boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
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
END $$;

-- Normalised code for fuzzy key matching: upper-case alphanumerics only
CREATE OR REPLACE FUNCTION etl.fn_norm(p_txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT nullif(regexp_replace(upper(coalesce(p_txt, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

-- Gregorian Easter Sunday (anonymous Gregorian algorithm)
CREATE OR REPLACE FUNCTION etl.fn_easter_sunday(p_year int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mon int; dy int;
BEGIN
    a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4;
    f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
    i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
    mon := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
    RETURN make_date(p_year, mon, dy);
END $$;

-- Namibian public holidays (Public Holidays Act 26 of 1990; a holiday falling on a
-- Sunday is observed on the Monday). Genocide Remembrance Day (28 May) from 2025.
CREATE OR REPLACE FUNCTION etl.fn_namibian_holiday(p_date date)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
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


-- Fast numeric conversion for already-clean numeric text (no exception handling needed)
CREATE OR REPLACE FUNCTION etl.fn_num(p_txt text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN btrim(p_txt) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(p_txt)::numeric END
$$;

-- Timestamp parser for the two PAS layouts: ISO "YYYY-MM-DD HH:MI[:SS]" and day-first
-- "DD/MM/YYYY HH:MI" (rule EN02). A single CASE expression, so PostgreSQL inlines it into the
-- calling query (no per-row function call); the regular expressions only accept real calendar
-- dates (month lengths and leap years 2000-2099), so an impossible date returns NULL instead of
-- failing the batch.
CREATE OR REPLACE FUNCTION etl.fn_parse_ts(p_txt text)
RETURNS timestamp LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
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
$$;

CREATE OR REPLACE FUNCTION etl.fn_ts_is_dayfirst(p_txt text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(btrim(p_txt) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4} ', false)
$$;

-- Minutes between two timestamps
CREATE OR REPLACE FUNCTION etl.fn_minutes(p_from timestamp, p_to timestamp)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT round((extract(epoch FROM (p_to - p_from)) / 60.0)::numeric, 1)
$$;

-- ICD-10 code standardisation (rule EN07): upper case, strip blanks/hyphens, restore the dot
CREATE OR REPLACE FUNCTION etl.fn_icd_clean(p_txt text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE s text := regexp_replace(upper(btrim(coalesce(p_txt, ''))), '[^A-Z0-9.]', '', 'g');
BEGIN
    IF s = '' THEN RETURN NULL; END IF;
    IF s ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$' THEN RETURN s; END IF;
    IF s ~ '^[A-Z][0-9]{3,4}$' THEN RETURN substr(s, 1, 3) || '.' || substr(s, 4); END IF;
    RETURN s;
END $$;

-- IDSR epidemiological week -> Monday of the ISO week (rule SV01: "2024-W05" or "W05/2024")
CREATE OR REPLACE FUNCTION etl.fn_parse_epi_week(p_txt text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN m IS NULL OR m[2]::int NOT BETWEEN 1 AND 53 THEN NULL
                WHEN to_char(to_date(m[1] || '-' || lpad(m[2], 2, '0'), 'IYYY-IW'), 'IYYY-IW') <> m[1] || '-' || lpad(m[2], 2, '0') THEN NULL
                ELSE to_date(m[1] || '-' || lpad(m[2], 2, '0'), 'IYYY-IW') END
    FROM (SELECT coalesce(regexp_match(btrim(p_txt), '^([0-9]{4})-?W([0-9]{1,2})$'),
                          (SELECT ARRAY[x[2], x[1]] FROM regexp_match(btrim(p_txt), '^W([0-9]{1,2})/([0-9]{4})$') x)) AS m) s
$$;

-- Date key helpers
CREATE OR REPLACE FUNCTION etl.fn_date_key(p_date date)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_date IS NULL THEN -1 ELSE to_char(p_date, 'YYYYMMDD')::int END
$$;

CREATE OR REPLACE FUNCTION etl.fn_age_band_key(p_age integer)
RETURNS smallint LANGUAGE sql IMMUTABLE AS $$
    SELECT (CASE WHEN p_age IS NULL OR p_age < 0 OR p_age > 115 THEN -1
                 WHEN p_age < 5 THEN 1 WHEN p_age < 15 THEN 2 WHEN p_age < 25 THEN 3
                 WHEN p_age < 45 THEN 4 WHEN p_age < 65 THEN 5 ELSE 6 END)::smallint
$$;

-- SCD helpers: value of an attribute as at a date, replaying the change logs
CREATE OR REPLACE FUNCTION etl.fn_unit_attr_asof(p_unit text, p_attr text, p_asof date, p_current text)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        (SELECT h.new_value FROM stg.md_unit_history_clean h
          WHERE h.unit_code = p_unit AND h.attribute = p_attr AND h.effective_date <= p_asof
          ORDER BY h.effective_date DESC, h.change_id DESC LIMIT 1),
        (SELECT h.old_value FROM stg.md_unit_history_clean h
          WHERE h.unit_code = p_unit AND h.attribute = p_attr
          ORDER BY h.effective_date ASC, h.change_id ASC LIMIT 1),
        p_current)
$$;

CREATE OR REPLACE FUNCTION etl.fn_patient_attr_asof(p_patient text, p_attr text, p_asof date, p_current text)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        (SELECT h.new_value FROM stg.patient_change_clean h
          WHERE h.patient_id = p_patient AND h.attribute = p_attr AND h.effective_date <= p_asof
          ORDER BY h.effective_date DESC, h.change_id DESC LIMIT 1),
        (SELECT h.old_value FROM stg.patient_change_clean h
          WHERE h.patient_id = p_patient AND h.attribute = p_attr
          ORDER BY h.effective_date ASC, h.change_id ASC LIMIT 1),
        p_current)
$$;

-- Audit helpers -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION etl.fn_start_batch(p_type text, p_description text, p_cutoff timestamp DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
    INSERT INTO audit.etl_batch (batch_type, description, extract_cutoff) VALUES (p_type, p_description, p_cutoff)
    RETURNING batch_id INTO v;
    RETURN v;
END $$;

-- Extract cut-off of a batch (end of the last day contained in the extract)
CREATE OR REPLACE FUNCTION etl.fn_batch_cutoff(p_batch integer)
RETURNS timestamp LANGUAGE sql STABLE AS $$
    SELECT extract_cutoff FROM audit.etl_batch WHERE batch_id = p_batch
$$;

CREATE OR REPLACE FUNCTION etl.fn_log_step(p_batch integer, p_step text, p_target text, p_in bigint, p_out bigint,
                                           p_rej bigint, p_started timestamptz, p_msg text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit.etl_step_log (batch_id, step_name, target_table, rows_in, rows_out, rows_rejected, started_at, message)
    VALUES (p_batch, p_step, p_target, p_in, p_out, p_rej, p_started, p_msg);
END $$;

CREATE OR REPLACE PROCEDURE etl.sp_finish_batch(p_batch integer, p_status text)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE audit.etl_batch SET finished_at = clock_timestamp(), status = p_status WHERE batch_id = p_batch;
END $$;
