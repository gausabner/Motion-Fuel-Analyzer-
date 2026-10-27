-- =============================================================================
-- 04_etl_functions.sql
-- Reusable parsing / standardisation functions and audit-logging helpers.
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

-- Business-name clean-up (rule MD05): trim, collapse blanks, title-case ALL-CAPS
-- names while preserving legal suffixes
CREATE OR REPLACE FUNCTION etl.fn_clean_business_name(p_txt text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s text;
BEGIN
    s := regexp_replace(btrim(coalesce(p_txt, '')), '\s+', ' ', 'g');
    IF s = upper(s) AND s ~ '[A-Z]{3,}' THEN
        s := initcap(lower(s));
        s := regexp_replace(s, '\mCc\M', 'CC', 'g');
        s := regexp_replace(s, '\(Pty\) Ltd|\mPty Ltd\M', '(Pty) Ltd', 'g');
        s := regexp_replace(s, '\mBv\M', 'BV', 'g');
        s := regexp_replace(s, '\mLlc\M', 'LLC', 'g');
        s := regexp_replace(s, '\mGmbh\M', 'GmbH', 'g');
    END IF;
    RETURN s;
END $$;

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

-- SCD helper: value of an attribute as at a date, replaying stg.md_history_clean
CREATE OR REPLACE FUNCTION etl.fn_attr_asof(p_entity text, p_code text, p_attr text, p_asof date, p_current text)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        (SELECT h.new_value FROM stg.md_history_clean h
          WHERE h.entity = p_entity AND h.entity_code = p_code AND h.attribute = p_attr AND h.effective_date <= p_asof
          ORDER BY h.effective_date DESC LIMIT 1),
        (SELECT h.old_value FROM stg.md_history_clean h
          WHERE h.entity = p_entity AND h.entity_code = p_code AND h.attribute = p_attr
          ORDER BY h.effective_date ASC LIMIT 1),
        p_current)
$$;

-- Audit helpers -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION etl.fn_start_batch(p_type text, p_description text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
    INSERT INTO audit.etl_batch (batch_type, description) VALUES (p_type, p_description) RETURNING batch_id INTO v;
    RETURN v;
END $$;

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
