--
-- PostgreSQL database dump
--

\restrict SsvayVOYAO7D6M8bDA38VRSJdlD9QxswcgbDybzqOPraMYSq3AvCvaHpzDJEuKG

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

COMMENT ON SCHEMA mart IS 'Presentation views consumed by the Power BI semantic model (only needed columns).';


--
-- Name: ref; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ref;


--
-- Name: SCHEMA ref; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA ref IS 'Reference/mapping tables maintained by data stewards (aliases, unit conversions, FX).';


--
-- Name: sec; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA sec;


--
-- Name: SCHEMA sec; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA sec IS 'Security metadata: user-to-zone mapping for dynamic row-level security.';


--
-- Name: stg; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA stg;


--
-- Name: SCHEMA stg; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA stg IS 'Landing (raw text, one table per source layout) and cleansed staging tables.';


--
-- Name: fn_attr_asof(text, text, text, date, text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_attr_asof(p_entity text, p_code text, p_attr text, p_asof date, p_current text) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce(
        (SELECT h.new_value FROM stg.md_history_clean h
          WHERE h.entity = p_entity AND h.entity_code = p_code AND h.attribute = p_attr AND h.effective_date <= p_asof
          ORDER BY h.effective_date DESC LIMIT 1),
        (SELECT h.old_value FROM stg.md_history_clean h
          WHERE h.entity = p_entity AND h.entity_code = p_code AND h.attribute = p_attr
          ORDER BY h.effective_date ASC LIMIT 1),
        p_current)
$$;


--
-- Name: fn_clean_business_name(text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_clean_business_name(p_txt text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
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
-- Name: fn_start_batch(text, text); Type: FUNCTION; Schema: etl; Owner: -
--

CREATE FUNCTION etl.fn_start_batch(p_type text, p_description text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE v integer;
BEGIN
    INSERT INTO audit.etl_batch (batch_type, description) VALUES (p_type, p_description) RETURNING batch_id INTO v;
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
-- Name: sp_finish_batch(integer, text); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_finish_batch(IN p_batch integer, IN p_status text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE audit.etl_batch SET finished_at = clock_timestamp(), status = p_status WHERE batch_id = p_batch;
END $$;


--
-- Name: sp_load_dim_commodity(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_commodity(IN p_batch integer)
    LANGUAGE plpgsql
    AS $_$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    INSERT INTO dw.dim_commodity (commodity_key, commodity_code, commodity_name, source_series_name, price_unit, commodity_role, crop_key, source_name)
    SELECT m.k, m.code, m.name, m.series, coalesce(u.unit, 'USD/mt'), m.role,
           coalesce((SELECT crop_key FROM dw.dim_crop WHERE crop_code = m.crop), -2), 'World Bank Pink Sheet'
    FROM (VALUES (1, 'MAIZE', 'Maize (US Gulf, f.o.b.)', 'Maize', 'Output price', 'MZW'),
                 (2, 'WHEAT_US_HRW', 'Wheat, US hard red winter', 'Wheat, US HRW', 'Output price', 'WHT'),
                 (3, 'SORGHUM', 'Sorghum (proxy for mahangu)', 'Sorghum', 'Output price', 'MAH'),
                 (4, 'UREA', 'Urea fertiliser', 'Urea', 'Input price', NULL),
                 (5, 'DAP', 'Diammonium phosphate (DAP)', 'DAP', 'Input price', NULL),
                 (6, 'CRUDE_BRENT', 'Crude oil, Brent', 'Crude oil, Brent', 'Input price', NULL)) AS m(k, code, name, series, role, crop)
    LEFT JOIN (SELECT DISTINCT cs.commodity_code,
                      replace(replace(replace(p.unit_txt, '($/', 'USD/'), ')', ''), ' ', '') AS unit
               FROM stg.pink_sheet_raw p JOIN ref.commodity_series cs ON cs.series_header_norm = etl.fn_norm(p.series_header)) u
           ON u.commodity_code = m.code
    ON CONFLICT (commodity_key) DO UPDATE SET commodity_name = EXCLUDED.commodity_name, price_unit = EXCLUDED.price_unit,
                                              crop_key = EXCLUDED.crop_key;
    PERFORM etl.fn_log_step(p_batch, 'load dim_commodity', 'dw.dim_commodity', 6, (SELECT count(*) FROM dw.dim_commodity), 0, t0);
END $_$;


--
-- Name: sp_load_dim_cost_category(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_cost_category(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    INSERT INTO dw.dim_cost_category (cost_category_key, cost_category_code, cost_category_name, cost_group, cost_behaviour, is_crop_specific)
    VALUES (-1, 'UNKN', 'Unknown', 'Unknown', 'Unknown', false) ON CONFLICT (cost_category_key) DO NOTHING;
    INSERT INTO dw.dim_cost_category (cost_category_key, cost_category_code, cost_category_name, cost_group, cost_behaviour,
                                      gl_account, quantity_uom, is_crop_specific)
    SELECT substr(btrim(cost_category_code), 3)::smallint, btrim(cost_category_code), btrim(cost_category_name), btrim(cost_group),
           btrim(cost_behaviour), btrim(gl_account), nullif(btrim(quantity_uom), ''), btrim(cost_behaviour) <> 'Fixed'
    FROM stg.md_cost_categories_raw
    ON CONFLICT (cost_category_key) DO UPDATE
    SET cost_category_name = EXCLUDED.cost_category_name, cost_group = EXCLUDED.cost_group,
        cost_behaviour = EXCLUDED.cost_behaviour, gl_account = EXCLUDED.gl_account,
        quantity_uom = EXCLUDED.quantity_uom, is_crop_specific = EXCLUDED.is_crop_specific;
    PERFORM etl.fn_log_step(p_batch, 'load dim_cost_category', 'dw.dim_cost_category',
                         (SELECT count(*) FROM stg.md_cost_categories_raw), (SELECT count(*) FROM dw.dim_cost_category), 0, t0);
END $$;


--
-- Name: sp_load_dim_crop_hierarchy(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_crop_hierarchy(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    -- level 3: crop category
    INSERT INTO dw.dim_crop_category VALUES (-1, 'UNK', 'Unknown', 'Unknown', now()), (-2, 'N/A', 'Not applicable', 'Not applicable', now())
    ON CONFLICT (crop_category_key) DO NOTHING;
    UPDATE dw.dim_crop_category d SET category_name = btrim(r.category_name), sector = btrim(r.sector)
    FROM stg.md_crop_categories_raw r
    WHERE d.category_code = btrim(r.category_code) AND (d.category_name, d.sector) IS DISTINCT FROM (btrim(r.category_name), btrim(r.sector));
    INSERT INTO dw.dim_crop_category (crop_category_key, category_code, category_name, sector)
    SELECT (SELECT greatest(coalesce(max(crop_category_key), 0), 0) FROM dw.dim_crop_category) + row_number() OVER (ORDER BY btrim(r.category_code)),
           btrim(r.category_code), btrim(r.category_name), btrim(r.sector)
    FROM stg.md_crop_categories_raw r
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_crop_category d WHERE d.category_code = btrim(r.category_code));

    -- level 2: crop
    INSERT INTO dw.dim_crop (crop_key, crop_code, crop_name, crop_category_key)
    VALUES (-1, 'UNK', 'Unknown crop', -1), (-2, 'N/A', 'Not crop-specific (farm overhead)', -2)
    ON CONFLICT (crop_key) DO NOTHING;
    UPDATE dw.dim_crop d
    SET crop_name = btrim(r.crop_name), crop_category_key = c.crop_category_key, scientific_name = btrim(r.scientific_name),
        is_nab_controlled = upper(btrim(r.nab_controlled)) = 'Y', storage_type = btrim(r.storage_type),
        shelf_life_days = etl.fn_try_numeric(r.shelf_life_days)::smallint, typical_cull_pct = etl.fn_try_numeric(r.typical_cull_pct),
        dw_updated_at = now()
    FROM stg.md_crops_raw r JOIN dw.dim_crop_category c ON c.category_code = btrim(r.category_code)
    WHERE d.crop_code = btrim(r.crop_code);
    INSERT INTO dw.dim_crop (crop_key, crop_code, crop_name, crop_category_key, scientific_name, is_nab_controlled,
                             storage_type, shelf_life_days, typical_cull_pct)
    SELECT (SELECT greatest(coalesce(max(crop_key), 0), 0) FROM dw.dim_crop) + row_number() OVER (ORDER BY btrim(r.crop_code)),
           btrim(r.crop_code), btrim(r.crop_name), c.crop_category_key, btrim(r.scientific_name),
           upper(btrim(r.nab_controlled)) = 'Y', btrim(r.storage_type), etl.fn_try_numeric(r.shelf_life_days)::smallint,
           etl.fn_try_numeric(r.typical_cull_pct)
    FROM stg.md_crops_raw r JOIN dw.dim_crop_category c ON c.category_code = btrim(r.category_code)
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_crop d WHERE d.crop_code = btrim(r.crop_code));

    -- level 1: product (MD03 imputes a missing net weight from the pack-type text)
    INSERT INTO dw.dim_product (product_key, product_code, product_name, crop_key, kg_per_sales_uom, is_active)
    VALUES (-1, 'UNKNOWN', 'Unknown product', -1, 1, false) ON CONFLICT (product_key) DO NOTHING;
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'MD03', 'Master data: Products', product_code, 'net_weight_kg', coalesce(net_weight_kg, ''),
           'Imputed ' || (regexp_match(pack_type, '([0-9]+(\.[0-9]+)?)\s*kg'))[1] || ' kg from pack type "' || pack_type || '"'
    FROM stg.md_products_raw
    WHERE etl.fn_try_numeric(net_weight_kg) IS NULL AND sales_uom <> 't';
    INSERT INTO dw.dim_product (product_code, product_name, crop_key, grade, pack_type, sales_uom, net_weight_kg,
                                kg_per_sales_uom, is_export_grade, is_active, net_weight_imputed)
    SELECT btrim(r.product_code), btrim(r.product_name), c.crop_key, btrim(r.grade), btrim(r.pack_type), btrim(r.sales_uom),
           etl.fn_try_numeric(r.net_weight_kg),
           CASE WHEN btrim(r.sales_uom) = 't' THEN 1000
                ELSE coalesce(etl.fn_try_numeric(r.net_weight_kg), (regexp_match(r.pack_type, '([0-9]+(\.[0-9]+)?)\s*kg'))[1]::numeric) END,
           upper(btrim(r.is_export_grade)) = 'Y', upper(btrim(r.active)) = 'Y',
           etl.fn_try_numeric(r.net_weight_kg) IS NULL AND btrim(r.sales_uom) <> 't'
    FROM stg.md_products_raw r JOIN dw.dim_crop c ON c.crop_code = btrim(r.crop_code)
    ON CONFLICT (product_code) DO UPDATE
    SET product_name = EXCLUDED.product_name, crop_key = EXCLUDED.crop_key, grade = EXCLUDED.grade,
        pack_type = EXCLUDED.pack_type, sales_uom = EXCLUDED.sales_uom, net_weight_kg = EXCLUDED.net_weight_kg,
        kg_per_sales_uom = EXCLUDED.kg_per_sales_uom, is_export_grade = EXCLUDED.is_export_grade,
        is_active = EXCLUDED.is_active, net_weight_imputed = EXCLUDED.net_weight_imputed, dw_updated_at = now();
    PERFORM etl.fn_log_step(p_batch, 'load dim_crop_category / dim_crop / dim_product', 'dw.dim_crop*, dw.dim_product',
                         (SELECT count(*) FROM stg.md_products_raw), (SELECT count(*) FROM dw.dim_product), 0, t0);
END $$;


--
-- Name: sp_load_dim_customer_scd2(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_customer_scd2(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    t0 timestamptz := clock_timestamp();
    ev record; cur dw.dim_customer%ROWTYPE; src stg.md_customer_clean%ROWTYPE;
    v_ch text; v_terms text; v_key text; v_hash text;
    n_inferred_fixed int := 0; n_initial int := 0; n_versions int := 0;
BEGIN
    INSERT INTO dw.dim_customer (customer_key, customer_code, customer_name, customer_type, region_key, channel,
                                 scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    VALUES (-1, 'UNKNOWN', 'Unknown customer', 'Unknown', -1, 'Unknown', DATE '1900-01-01', true, 1, md5('unknown'), p_batch)
    ON CONFLICT (customer_key) DO NOTHING;

    -- 0) inferred members whose master record has now arrived: overwrite in place (Kimball inferred-member rule)
    UPDATE dw.dim_customer d
    SET customer_name = c.customer_name, customer_type = c.customer_type, town = c.town,
        channel = etl.fn_attr_asof('CUSTOMER', c.customer_code, 'channel', DATE '1900-01-01', c.channel),
        credit_terms_days = etl.fn_attr_asof('CUSTOMER', c.customer_code, 'credit_terms_days', DATE '1900-01-01', c.credit_terms_days::text)::smallint,
        is_key_account = etl.fn_attr_asof('CUSTOMER', c.customer_code, 'key_account', DATE '1900-01-01', c.key_account) = 'Y',
        is_inferred = false,
        scd_row_hash = md5(concat_ws('|', etl.fn_attr_asof('CUSTOMER', c.customer_code, 'channel', DATE '1900-01-01', c.channel),
                                          etl.fn_attr_asof('CUSTOMER', c.customer_code, 'credit_terms_days', DATE '1900-01-01', c.credit_terms_days::text),
                                          etl.fn_attr_asof('CUSTOMER', c.customer_code, 'key_account', DATE '1900-01-01', c.key_account))),
        dw_batch_id = p_batch, dw_updated_at = now()
    FROM stg.md_customer_clean c
    WHERE d.customer_code = c.customer_code AND d.is_inferred;
    GET DIAGNOSTICS n_inferred_fixed = ROW_COUNT;

    -- 1) first version for new customers
    INSERT INTO dw.dim_customer (customer_code, customer_name, customer_type, town, region_key, country_code, currency_code,
                                 onboarding_date, customer_status, channel, credit_terms_days, is_key_account,
                                 scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    SELECT c.customer_code, c.customer_name, c.customer_type, c.town,
           CASE WHEN c.country_code <> 'NA' THEN -2 ELSE coalesce(r.region_key, -1) END,
           c.country_code, c.currency_code, c.onboarding_date, c.status,
           a.ch, a.terms::smallint, a.ka = 'Y', DATE '1900-01-01', true, 1, md5(concat_ws('|', a.ch, a.terms, a.ka)), p_batch
    FROM stg.md_customer_clean c
    LEFT JOIN dw.dim_region r ON r.region_code = c.region_code
    CROSS JOIN LATERAL (
        SELECT etl.fn_attr_asof('CUSTOMER', c.customer_code, 'channel', DATE '1900-01-01', c.channel) AS ch,
               etl.fn_attr_asof('CUSTOMER', c.customer_code, 'credit_terms_days', DATE '1900-01-01', c.credit_terms_days::text) AS terms,
               etl.fn_attr_asof('CUSTOMER', c.customer_code, 'key_account', DATE '1900-01-01', c.key_account) AS ka) a
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_customer d WHERE d.customer_code = c.customer_code);
    GET DIAGNOSTICS n_initial = ROW_COUNT;

    -- 2) replay Type 2 events
    FOR ev IN
        SELECT entity_code, effective_date FROM stg.md_history_clean
        WHERE entity = 'CUSTOMER' AND attribute IN ('channel', 'credit_terms_days', 'key_account')
        GROUP BY entity_code, effective_date ORDER BY effective_date, entity_code
    LOOP
        SELECT * INTO cur FROM dw.dim_customer WHERE customer_code = ev.entity_code AND scd_is_current;
        CONTINUE WHEN NOT FOUND OR ev.effective_date <= cur.scd_effective_from;
        SELECT * INTO src FROM stg.md_customer_clean WHERE customer_code = ev.entity_code;
        CONTINUE WHEN NOT FOUND;
        v_ch    := etl.fn_attr_asof('CUSTOMER', ev.entity_code, 'channel', ev.effective_date, src.channel);
        v_terms := etl.fn_attr_asof('CUSTOMER', ev.entity_code, 'credit_terms_days', ev.effective_date, src.credit_terms_days::text);
        v_key   := etl.fn_attr_asof('CUSTOMER', ev.entity_code, 'key_account', ev.effective_date, src.key_account);
        v_hash  := md5(concat_ws('|', v_ch, v_terms, v_key));
        CONTINUE WHEN v_hash = cur.scd_row_hash;
        UPDATE dw.dim_customer SET scd_effective_to = ev.effective_date - 1, scd_is_current = false,
                                   dw_batch_id = p_batch, dw_updated_at = now()
        WHERE customer_key = cur.customer_key;
        INSERT INTO dw.dim_customer (customer_code, customer_name, customer_type, town, region_key, country_code, currency_code,
                                     onboarding_date, customer_status, channel, credit_terms_days, is_key_account,
                                     scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
        VALUES (cur.customer_code, cur.customer_name, cur.customer_type, cur.town, cur.region_key, cur.country_code,
                cur.currency_code, cur.onboarding_date, cur.customer_status, v_ch, v_terms::smallint, v_key = 'Y',
                ev.effective_date, true, cur.scd_version + 1, v_hash, p_batch);
        n_versions := n_versions + 1;
    END LOOP;

    -- 3) Type 1 attributes on every version
    UPDATE dw.dim_customer d
    SET customer_name = c.customer_name, customer_type = c.customer_type, town = c.town,
        region_key = CASE WHEN c.country_code <> 'NA' THEN -2 ELSE coalesce(r.region_key, -1) END,
        country_code = c.country_code, country_name = co.country_name, market_group = co.region_group,
        currency_code = c.currency_code, onboarding_date = c.onboarding_date, customer_status = c.status,
        merged_codes = (SELECT string_agg(x.duplicate_code, ', ' ORDER BY x.duplicate_code) FROM ref.customer_xref x
                        WHERE x.survivor_code = c.customer_code),
        dw_updated_at = now()
    FROM stg.md_customer_clean c
    LEFT JOIN dw.dim_region r ON r.region_code = c.region_code
    LEFT JOIN ref.country co ON co.country_code = c.country_code
    WHERE d.customer_code = c.customer_code;

    PERFORM etl.fn_log_step(p_batch, 'load dim_customer (SCD2)', 'dw.dim_customer', (SELECT count(*) FROM stg.md_customer_clean),
                         (SELECT count(*) FROM dw.dim_customer), 0, t0,
                         format('%s initial rows, %s new versions, %s inferred members completed', n_initial, n_versions, n_inferred_fixed));
END $$;


--
-- Name: sp_load_dim_date(integer, date, date, date); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_date(IN p_batch integer, IN p_start date, IN p_end date, IN p_cutoff date)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    INSERT INTO dw.dim_date (date_key, day_name, day_short, month_name, month_short, year_month, year_quarter,
                             fiscal_year_label, fiscal_quarter_label, crop_season_label, holiday_name, is_weekend,
                             is_public_holiday, is_working_day, is_month_end, is_current_month)
    VALUES (-1, 'Unknown', 'N/A', 'Unknown', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', NULL, false, false, false, false, false)
    ON CONFLICT (date_key) DO NOTHING;

    INSERT INTO dw.dim_date
    SELECT to_char(d, 'YYYYMMDD')::int, d,
           extract(day FROM d), extract(doy FROM d), extract(isodow FROM d),
           to_char(d, 'FMDay'), to_char(d, 'Dy'), extract(isodow FROM d) IN (6, 7),
           h.name IS NOT NULL, h.name, extract(isodow FROM d) <> 7 AND h.name IS NULL,
           extract(week FROM d), date_trunc('week', d)::date,
           extract(month FROM d), to_char(d, 'FMMonth'), to_char(d, 'Mon'), to_char(d, 'YYYY-MM'), to_char(d, 'YYYYMM')::int,
           date_trunc('month', d)::date, me.month_end, d = me.month_end, extract(day FROM me.month_end),
           extract(quarter FROM d), to_char(d, 'YYYY-"Q"Q'), extract(year FROM d),
           fy.fy, 'FY' || fy.fy, ((extract(month FROM d)::int + 8) % 12) / 3 + 1,
           'FY' || fy.fy || '-FQ' || (((extract(month FROM d)::int + 8) % 12) / 3 + 1),
           ((extract(month FROM d)::int + 8) % 12) + 1,
           make_date(fy.fy - 1, 4, 1), make_date(fy.fy, 3, 31),
           s.sy, s.sy || '/' || right((s.sy + 1)::text, 2), ((extract(month FROM d)::int + 2) % 12) + 1,
           date_trunc('month', d) = date_trunc('month', p_cutoff),
           now()
    FROM generate_series(p_start, p_end, interval '1 day') AS g(ts)
    CROSS JOIN LATERAL (SELECT g.ts::date AS d) x(d)
    CROSS JOIN LATERAL (SELECT (date_trunc('month', x.d) + interval '1 month - 1 day')::date AS month_end) me
    CROSS JOIN LATERAL (SELECT CASE WHEN extract(month FROM x.d) >= 4 THEN extract(year FROM x.d)::int + 1
                                    ELSE extract(year FROM x.d)::int END AS fy) fy
    CROSS JOIN LATERAL (SELECT CASE WHEN extract(month FROM x.d) >= 10 THEN extract(year FROM x.d)::int
                                    ELSE extract(year FROM x.d)::int - 1 END AS sy) s
    CROSS JOIN LATERAL (SELECT etl.fn_namibian_holiday(x.d) AS name) h
    ON CONFLICT (date_key) DO UPDATE SET is_current_month = EXCLUDED.is_current_month,
                                         is_public_holiday = EXCLUDED.is_public_holiday,
                                         holiday_name = EXCLUDED.holiday_name,
                                         is_working_day = EXCLUDED.is_working_day;
    PERFORM etl.fn_log_step(p_batch, 'load dim_date', 'dw.dim_date', NULL, (SELECT count(*) FROM dw.dim_date), 0, t0);
END $$;


--
-- Name: sp_load_dim_farm_scd2(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_farm_scd2(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    t0 timestamptz := clock_timestamp();
    ev record; cur dw.dim_farm%ROWTYPE; src stg.md_farm_clean%ROWTYPE;
    v_cult text; v_irr text; v_water text; v_mgr text; v_gap text; v_hash text;
    n_initial int := 0; n_versions int := 0; n_t1 int := 0;
BEGIN
    INSERT INTO dw.dim_farm (farm_key, farm_code, farm_name, region_key, irrigation_type, is_irrigated, scd_effective_from,
                             scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    VALUES (-1, 'UNKNOWN', 'Unknown farm', -1, 'Unknown', false, DATE '1900-01-01', true, 1, md5('unknown'), p_batch)
    ON CONFLICT (farm_key) DO NOTHING;

    -- 1) first version for farms not yet in the dimension = state as at 1900-01-01
    INSERT INTO dw.dim_farm (farm_code, farm_name, region_key, town, latitude, longitude, elevation_m, total_ha, established_year,
                             harvest_log_template, cultivated_ha, irrigation_type, is_irrigated, water_source, farm_manager_code,
                             is_globalgap_certified, scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    SELECT f.farm_code, f.farm_name, coalesce(r.region_key, -1), f.town, f.latitude, f.longitude, f.elevation_m, f.total_ha,
           f.established_year, f.harvest_log_template,
           a.cult::numeric, a.irr, a.irr <> 'Dryland', a.water, a.mgr, a.gap = 'Y',
           DATE '1900-01-01', true, 1, md5(concat_ws('|', a.cult, a.irr, a.water, a.mgr, a.gap)), p_batch
    FROM stg.md_farm_clean f
    LEFT JOIN dw.dim_region r ON r.region_code = f.region_code
    CROSS JOIN LATERAL (
        SELECT trim_scale(etl.fn_attr_asof('FARM', f.farm_code, 'cultivated_ha', DATE '1900-01-01', f.cultivated_ha::text)::numeric)::text AS cult,
               etl.fn_attr_asof('FARM', f.farm_code, 'irrigation_type', DATE '1900-01-01', f.irrigation_type) AS irr,
               etl.fn_attr_asof('FARM', f.farm_code, 'water_source', DATE '1900-01-01', f.water_source) AS water,
               etl.fn_attr_asof('FARM', f.farm_code, 'farm_manager_code', DATE '1900-01-01', f.farm_manager_code) AS mgr,
               etl.fn_attr_asof('FARM', f.farm_code, 'globalgap_certified', DATE '1900-01-01', f.globalgap_certified) AS gap) a
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_farm d WHERE d.farm_code = f.farm_code);
    GET DIAGNOSTICS n_initial = ROW_COUNT;

    -- 2) replay Type 2 change events in date order (one new version per farm per effective date)
    FOR ev IN
        SELECT entity_code, effective_date FROM stg.md_history_clean
        WHERE entity = 'FARM' AND attribute IN ('cultivated_ha', 'irrigation_type', 'water_source', 'farm_manager_code', 'globalgap_certified')
        GROUP BY entity_code, effective_date ORDER BY effective_date, entity_code
    LOOP
        SELECT * INTO cur FROM dw.dim_farm WHERE farm_code = ev.entity_code AND scd_is_current;
        CONTINUE WHEN NOT FOUND OR ev.effective_date <= cur.scd_effective_from;
        SELECT * INTO src FROM stg.md_farm_clean WHERE farm_code = ev.entity_code;
        v_cult  := trim_scale(etl.fn_attr_asof('FARM', ev.entity_code, 'cultivated_ha', ev.effective_date, src.cultivated_ha::text)::numeric)::text;
        v_irr   := etl.fn_attr_asof('FARM', ev.entity_code, 'irrigation_type', ev.effective_date, src.irrigation_type);
        v_water := etl.fn_attr_asof('FARM', ev.entity_code, 'water_source', ev.effective_date, src.water_source);
        v_mgr   := etl.fn_attr_asof('FARM', ev.entity_code, 'farm_manager_code', ev.effective_date, src.farm_manager_code);
        v_gap   := etl.fn_attr_asof('FARM', ev.entity_code, 'globalgap_certified', ev.effective_date, src.globalgap_certified);
        v_hash  := md5(concat_ws('|', v_cult, v_irr, v_water, v_mgr, v_gap));
        CONTINUE WHEN v_hash = cur.scd_row_hash;
        UPDATE dw.dim_farm SET scd_effective_to = ev.effective_date - 1, scd_is_current = false,
                               dw_batch_id = p_batch, dw_updated_at = now()
        WHERE farm_key = cur.farm_key;
        INSERT INTO dw.dim_farm (farm_code, farm_name, region_key, town, latitude, longitude, elevation_m, total_ha, established_year,
                                 harvest_log_template, cultivated_ha, irrigation_type, is_irrigated, water_source, farm_manager_code,
                                 is_globalgap_certified, scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
        VALUES (cur.farm_code, cur.farm_name, cur.region_key, cur.town, cur.latitude, cur.longitude, cur.elevation_m, cur.total_ha,
                cur.established_year, cur.harvest_log_template, v_cult::numeric, v_irr, v_irr <> 'Dryland', v_water, v_mgr,
                v_gap = 'Y', ev.effective_date, true, cur.scd_version + 1, v_hash, p_batch);
        n_versions := n_versions + 1;
    END LOOP;

    -- 3) Type 1 attributes overwrite every version (corrections, e.g. farm-name spelling)
    UPDATE dw.dim_farm d
    SET farm_name = f.farm_name, region_key = coalesce(r.region_key, -1), town = f.town, latitude = f.latitude,
        longitude = f.longitude, elevation_m = f.elevation_m, total_ha = f.total_ha, established_year = f.established_year,
        harvest_log_template = f.harvest_log_template, dw_updated_at = now()
    FROM stg.md_farm_clean f LEFT JOIN dw.dim_region r ON r.region_code = f.region_code
    WHERE d.farm_code = f.farm_code
      AND (d.farm_name, d.region_key, d.town, d.total_ha) IS DISTINCT FROM (f.farm_name, coalesce(r.region_key, -1), f.town, f.total_ha);
    GET DIAGNOSTICS n_t1 = ROW_COUNT;

    PERFORM etl.fn_log_step(p_batch, 'load dim_farm (SCD2)', 'dw.dim_farm', (SELECT count(*) FROM stg.md_farm_clean),
                         (SELECT count(*) FROM dw.dim_farm), 0, t0,
                         format('%s initial rows, %s new versions, %s Type 1 updates', n_initial, n_versions, n_t1));
END $$;


--
-- Name: sp_load_dim_region(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_dim_region(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    INSERT INTO dw.dim_region (region_key, region_code, region_name, zone_code, zone_name, capital_town, is_northern_crop_region)
    VALUES (-1, 'UNK', 'Unknown', 'XX', 'Unknown', NULL, false),
           (-2, 'N/A', 'Outside Namibia', 'EX', 'Export markets', NULL, false)
    ON CONFLICT (region_key) DO NOTHING;
    -- Type 1: update changed attributes, then add new codes with the next keys
    UPDATE dw.dim_region d
    SET region_name = btrim(r.region_name), zone_code = btrim(r.zone_code), zone_name = btrim(r.zone_name),
        capital_town = btrim(r.capital_town), is_northern_crop_region = btrim(r.zone_code) IN ('NC', 'NE', 'NW'), dw_updated_at = now()
    FROM stg.md_regions_raw r
    WHERE d.region_code = btrim(r.region_code)
      AND (d.region_name, d.zone_code, d.zone_name, d.capital_town) IS DISTINCT FROM
          (btrim(r.region_name), btrim(r.zone_code), btrim(r.zone_name), btrim(r.capital_town));
    INSERT INTO dw.dim_region (region_key, region_code, region_name, zone_code, zone_name, capital_town, is_northern_crop_region)
    SELECT (SELECT greatest(coalesce(max(region_key), 0), 0) FROM dw.dim_region) + row_number() OVER (ORDER BY btrim(r.region_code)),
           btrim(r.region_code), btrim(r.region_name), btrim(r.zone_code), btrim(r.zone_name), btrim(r.capital_town),
           btrim(r.zone_code) IN ('NC', 'NE', 'NW')
    FROM stg.md_regions_raw r
    WHERE NOT EXISTS (SELECT 1 FROM dw.dim_region d WHERE d.region_code = btrim(r.region_code));
    PERFORM etl.fn_log_step(p_batch, 'load dim_region', 'dw.dim_region', (SELECT count(*) FROM stg.md_regions_raw),
                         (SELECT count(*) FROM dw.dim_region), 0, t0);
END $$;


--
-- Name: sp_load_fact_crop_cycle(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_crop_cycle(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    -- PL03: register status contradicting the harvest log
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'PL03', 'Planting register', p.cycle_id || '|' || p.block_id, 'status', p.register_status,
           CASE WHEN h.n > 0 THEN 'Status set to Harvesting (harvest records exist)' ELSE 'Kept (no harvest records yet)' END
    FROM stg.planting_clean p
    LEFT JOIN (SELECT cycle_id, block_id, count(*) AS n FROM stg.harvest_clean
               WHERE dq_status IN ('OK', 'CORRECTED') GROUP BY 1, 2) h USING (cycle_id, block_id)
    WHERE (p.register_status = 'Growing' AND h.n > 0) OR (p.register_status = 'Completed' AND h.n IS NULL);

    WITH h AS (
        SELECT cycle_id, block_id, min(harvest_date) AS first_d, max(harvest_date) AS last_d,
               sum(harvested_kg) AS kg, count(*) AS n
        FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED') AND cycle_id IS NOT NULL GROUP BY 1, 2
    ), area AS (
        SELECT cycle_id, sum(planted_ha) AS cycle_ha FROM stg.planting_clean GROUP BY 1
    ), cost AS (
        SELECT cost_centre AS cycle_id, sum(amount_nad) AS amt,
               coalesce(sum(input_qty) FILTER (WHERE cost_category_code = 'CC02'), 0) AS fert
        FROM stg.cost_clean WHERE dq_status IN ('OK', 'CORRECTED') GROUP BY 1
    ), delay AS (
        SELECT p.crop_code, avg(h.first_d - p.planting_date)::int AS avg_days
        FROM stg.planting_clean p JOIN h USING (cycle_id, block_id) GROUP BY 1
    )
    INSERT INTO dw.fact_crop_cycle (cycle_id, block_id, farm_key, crop_key, planting_date_key, first_harvest_date_key,
                                    last_harvest_date_key, harvest_season_end_date_key, cycle_status, variety,
                                    irrigation_method, is_irrigated, planted_ha,
                                    harvested_ha, planned_yield_t_ha, planned_production_kg, harvested_kg, harvest_event_count,
                                    days_to_first_harvest, harvest_duration_days, direct_cost_nad, fertiliser_kg,
                                    planted_ha_imputed, dw_batch_id)
    SELECT p.cycle_id, p.block_id, coalesce(f.farm_key, -1), c.crop_key,
           to_char(p.planting_date, 'YYYYMMDD')::int,
           coalesce(to_char(h.first_d, 'YYYYMMDD')::int, -1),
           coalesce(to_char(h.last_d, 'YYYYMMDD')::int, -1),
           to_char(make_date(extract(year FROM (coalesce(h.first_d, p.planting_date + coalesce(dl.avg_days, 120)) - interval '9 months'))::int + 1, 9, 30), 'YYYYMMDD')::int,
           CASE WHEN p.register_status = 'Growing' AND h.n > 0 THEN 'Harvesting' ELSE p.register_status END,
           p.variety, coalesce(p.irrigation_method, f.irrigation_type, 'Unknown'), coalesce(p.is_irrigated, f.is_irrigated, false),
           p.planted_ha, p.harvested_ha, p.planned_yield_t_ha,
           round(p.planned_yield_t_ha * p.planted_ha * 1000, 1),
           coalesce(h.kg, 0), coalesce(h.n, 0), h.first_d - p.planting_date, h.last_d - h.first_d,
           round(coalesce(cost.amt, 0) * p.planted_ha / nullif(a.cycle_ha, 0), 2),
           round(coalesce(cost.fert, 0) * p.planted_ha / nullif(a.cycle_ha, 0), 1),
           coalesce(p.dq_note, '') LIKE '%PL02%', p_batch
    FROM stg.planting_clean p
    JOIN dw.dim_crop c ON c.crop_code = p.crop_code
    JOIN area a ON a.cycle_id = p.cycle_id
    LEFT JOIN h ON h.cycle_id = p.cycle_id AND h.block_id = p.block_id
    LEFT JOIN cost ON cost.cycle_id = p.cycle_id
    LEFT JOIN delay dl ON dl.crop_code = p.crop_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = p.farm_code AND p.planting_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    ON CONFLICT (cycle_id, block_id) DO UPDATE
    SET first_harvest_date_key = EXCLUDED.first_harvest_date_key, last_harvest_date_key = EXCLUDED.last_harvest_date_key,
        harvest_season_end_date_key = EXCLUDED.harvest_season_end_date_key, cycle_status = EXCLUDED.cycle_status,
        irrigation_method = EXCLUDED.irrigation_method, is_irrigated = EXCLUDED.is_irrigated,
        harvested_ha = EXCLUDED.harvested_ha, harvested_kg = EXCLUDED.harvested_kg,
        harvest_event_count = EXCLUDED.harvest_event_count, days_to_first_harvest = EXCLUDED.days_to_first_harvest,
        harvest_duration_days = EXCLUDED.harvest_duration_days, direct_cost_nad = EXCLUDED.direct_cost_nad,
        fertiliser_kg = EXCLUDED.fertiliser_kg, dw_batch_id = EXCLUDED.dw_batch_id, dw_updated_at = now();
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_crop_cycle (accumulating snapshot)', 'dw.fact_crop_cycle',
                         (SELECT count(*) FROM stg.planting_clean), n, 0, t0);
END $$;


--
-- Name: sp_load_fact_crop_estimate(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_crop_estimate(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_crop_estimate (season_end_date_key, region_key, crop_key, farming_sector, area_planted_ha, production_t,
                                       yield_t_ha, is_yield_derived, release_date, source_table, dw_batch_id)
    SELECT to_char(make_date(e.season_start_year + 1, 9, 30), 'YYYYMMDD')::int, r.region_key, c.crop_key, e.farming_sector,
           e.area_planted_ha, e.production_t, e.yield_t_ha, e.yield_derived, e.release_date, e.source_table, p_batch
    FROM stg.crop_estimate_clean e
    JOIN dw.dim_region r ON r.region_code = e.region_code
    JOIN dw.dim_crop c ON c.crop_code = e.crop_code
    WHERE e.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (season_end_date_key, region_key, crop_key, farming_sector) DO UPDATE
    SET area_planted_ha = EXCLUDED.area_planted_ha, production_t = EXCLUDED.production_t, yield_t_ha = EXCLUDED.yield_t_ha,
        is_yield_derived = EXCLUDED.is_yield_derived, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_crop_estimate', 'dw.fact_crop_estimate',
                         (SELECT count(*) FROM stg.crop_estimate_clean WHERE dq_status <> 'REJECTED'), n, 0, t0);
END $$;


--
-- Name: sp_load_fact_harvest(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_harvest(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_harvest (harvest_date_key, farm_key, crop_key, cycle_id, block_id, recorder_code, harvested_kg,
                                 is_corrected, source_file, source_row_num, dw_batch_id)
    SELECT to_char(h.harvest_date, 'YYYYMMDD')::int, coalesce(f.farm_key, -1), c.crop_key, h.cycle_id, h.block_id,
           h.recorder_code, h.harvested_kg, coalesce(h.dq_note, '') LIKE '%HV06%', h.source_file, h.row_num, p_batch
    FROM stg.harvest_clean h
    JOIN dw.dim_crop c ON c.crop_code = h.crop_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = h.farm_code AND h.harvest_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    WHERE h.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (source_file, source_row_num) DO UPDATE
    SET harvest_date_key = EXCLUDED.harvest_date_key, farm_key = EXCLUDED.farm_key, crop_key = EXCLUDED.crop_key,
        cycle_id = EXCLUDED.cycle_id, harvested_kg = EXCLUDED.harvested_kg, is_corrected = EXCLUDED.is_corrected,
        dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_harvest', 'dw.fact_harvest',
                         (SELECT count(*) FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED')), n, 0, t0);
END $$;


--
-- Name: sp_load_fact_inventory(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_inventory(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_inventory_monthly (snapshot_date_key, farm_key, product_key, opening_stock_kg, received_kg,
                                           dispatched_kg, shrinkage_kg, closing_stock_kg, closing_stock_value_nad,
                                           is_imputed, is_sign_corrected, dw_batch_id)
    SELECT to_char(s.snapshot_date, 'YYYYMMDD')::int, coalesce(f.farm_key, -1), p.product_key, s.opening_kg, s.received_kg,
           s.dispatched_kg, s.shrinkage_kg, s.closing_kg, s.closing_value_nad, s.is_imputed,
           coalesce(s.dq_note, '') LIKE '%ST01%', p_batch
    FROM stg.stock_clean s
    JOIN dw.dim_product p ON p.product_code = s.product_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = s.farm_code AND s.snapshot_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    ON CONFLICT (snapshot_date_key, farm_key, product_key) DO UPDATE
    SET opening_stock_kg = EXCLUDED.opening_stock_kg, received_kg = EXCLUDED.received_kg, dispatched_kg = EXCLUDED.dispatched_kg,
        shrinkage_kg = EXCLUDED.shrinkage_kg, closing_stock_kg = EXCLUDED.closing_stock_kg,
        closing_stock_value_nad = EXCLUDED.closing_stock_value_nad, is_imputed = EXCLUDED.is_imputed,
        is_sign_corrected = EXCLUDED.is_sign_corrected, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_inventory_monthly (periodic snapshot)', 'dw.fact_inventory_monthly',
                         (SELECT count(*) FROM stg.stock_clean), n, 0, t0);
END $$;


--
-- Name: sp_load_fact_market_price(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_market_price(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_market_price_monthly (month_date_key, commodity_key, crop_key, price_usd, fx_nad_per_usd, price_nad,
                                              is_imputed, dw_batch_id)
    SELECT to_char((m.month_start + interval '1 month - 1 day')::date, 'YYYYMMDD')::int, d.commodity_key, d.crop_key,
           m.price_usd, fx.nad_per_unit, round(m.price_usd * fx.nad_per_unit, 2), m.is_imputed, p_batch
    FROM stg.market_price_clean m
    JOIN dw.dim_commodity d ON d.commodity_code = m.commodity_code
    JOIN ref.fx_rate_monthly fx ON fx.currency_code = 'USD' AND fx.month_start = m.month_start
    WHERE m.price_usd IS NOT NULL
    ON CONFLICT (month_date_key, commodity_key) DO UPDATE
    SET price_usd = EXCLUDED.price_usd, fx_nad_per_usd = EXCLUDED.fx_nad_per_usd, price_nad = EXCLUDED.price_nad,
        is_imputed = EXCLUDED.is_imputed, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_market_price_monthly', 'dw.fact_market_price_monthly',
                         (SELECT count(*) FROM stg.market_price_clean), n, 0, t0);
END $$;


--
-- Name: sp_load_fact_production_cost(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_production_cost(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_production_cost (posting_date_key, farm_key, crop_key, cost_category_key, posting_id, cost_centre,
                                         supplier_code, amount_nad, input_qty, input_uom, is_reversal, dw_batch_id)
    SELECT to_char(c.posting_date, 'YYYYMMDD')::int, coalesce(f.farm_key, -1),
           CASE WHEN c.crop_code IS NOT NULL THEN coalesce(cr.crop_key, -1)
                WHEN cc.is_crop_specific THEN -1 ELSE -2 END,
           cc.cost_category_key, c.posting_id, c.cost_centre, c.supplier_code, c.amount_nad, c.input_qty, c.input_uom,
           c.is_reversal, p_batch
    FROM stg.cost_clean c
    JOIN dw.dim_cost_category cc ON cc.cost_category_code = c.cost_category_code
    LEFT JOIN dw.dim_crop cr ON cr.crop_code = c.crop_code
    LEFT JOIN dw.dim_farm f ON f.farm_code = c.farm_code AND c.posting_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    WHERE c.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (posting_id) DO UPDATE
    SET amount_nad = EXCLUDED.amount_nad, input_qty = EXCLUDED.input_qty, farm_key = EXCLUDED.farm_key,
        crop_key = EXCLUDED.crop_key, cost_category_key = EXCLUDED.cost_category_key, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_production_cost', 'dw.fact_production_cost',
                         (SELECT count(*) FROM stg.cost_clean WHERE dq_status IN ('OK', 'CORRECTED')), n, 0, t0);
END $$;


--
-- Name: sp_load_fact_sales(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_sales(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n_inferred int; n bigint;
BEGIN
    -- SA04: late-arriving customers become inferred members (completed later by sp_load_dim_customer_scd2)
    INSERT INTO dw.dim_customer (customer_code, customer_name, customer_type, region_key, channel, is_inferred,
                                 scd_effective_from, scd_is_current, scd_version, scd_row_hash, dw_batch_id)
    SELECT DISTINCT s.customer_code, 'Inferred customer ' || s.customer_code || ' (awaiting master data)', 'Unknown', -1,
           'Unassigned', true, DATE '1900-01-01', true, 1, md5('inferred'), p_batch
    FROM stg.sales_clean s
    WHERE s.dq_status IN ('OK', 'CORRECTED')
      AND NOT EXISTS (SELECT 1 FROM dw.dim_customer d WHERE d.customer_code = s.customer_code);
    GET DIAGNOSTICS n_inferred = ROW_COUNT;

    INSERT INTO dw.fact_sales (invoice_date_key, dispatch_date_key, product_key, customer_key, farm_key, invoice_no, line_no,
                               doc_type, ref_invoice_no, sales_rep_code, currency_code, quantity_sales_uom, quantity_kg,
                               unit_price_txn, fx_rate_nad, gross_revenue_nad, discount_nad, net_revenue_nad, cogs_nad,
                               freight_cost_nad, is_price_anomaly, dw_batch_id)
    SELECT to_char(s.invoice_date, 'YYYYMMDD')::int,
           to_char(coalesce(s.dispatch_date, s.invoice_date), 'YYYYMMDD')::int,
           p.product_key, coalesce(c.customer_key, -1), coalesce(f.farm_key, -1),
           s.invoice_no, s.line_no, s.doc_type, s.ref_invoice_no, s.sales_rep_code, s.currency_code,
           s.quantity, s.quantity_kg, s.unit_price, s.fx_rate_nad, s.gross_revenue_nad, s.discount_nad, s.net_revenue_nad,
           s.cogs_nad, s.freight_nad, s.is_price_anomaly, p_batch
    FROM stg.sales_clean s
    JOIN dw.dim_product p ON p.product_code = s.product_code
    LEFT JOIN dw.dim_customer c ON c.customer_code = s.customer_code
                               AND s.invoice_date BETWEEN c.scd_effective_from AND c.scd_effective_to
    LEFT JOIN dw.dim_farm f ON f.farm_code = s.farm_code
                           AND s.invoice_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    WHERE s.dq_status IN ('OK', 'CORRECTED')
    ON CONFLICT (invoice_no, line_no) DO UPDATE
    SET invoice_date_key = EXCLUDED.invoice_date_key, dispatch_date_key = EXCLUDED.dispatch_date_key,
        product_key = EXCLUDED.product_key, customer_key = EXCLUDED.customer_key, farm_key = EXCLUDED.farm_key,
        quantity_sales_uom = EXCLUDED.quantity_sales_uom, quantity_kg = EXCLUDED.quantity_kg,
        unit_price_txn = EXCLUDED.unit_price_txn, fx_rate_nad = EXCLUDED.fx_rate_nad,
        gross_revenue_nad = EXCLUDED.gross_revenue_nad, discount_nad = EXCLUDED.discount_nad,
        net_revenue_nad = EXCLUDED.net_revenue_nad, cogs_nad = EXCLUDED.cogs_nad, freight_cost_nad = EXCLUDED.freight_cost_nad,
        is_price_anomaly = EXCLUDED.is_price_anomaly, dw_batch_id = EXCLUDED.dw_batch_id
    WHERE (dw.fact_sales.customer_key, dw.fact_sales.farm_key, dw.fact_sales.net_revenue_nad, dw.fact_sales.quantity_kg)
          IS DISTINCT FROM (EXCLUDED.customer_key, EXCLUDED.farm_key, EXCLUDED.net_revenue_nad, EXCLUDED.quantity_kg);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_sales', 'dw.fact_sales',
                         (SELECT count(*) FROM stg.sales_clean WHERE dq_status IN ('OK', 'CORRECTED')), n, 0, t0,
                         n_inferred || ' inferred customer members created');
END $$;


--
-- Name: sp_load_fact_weather(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_load_fact_weather(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    INSERT INTO dw.fact_weather_daily (date_key, farm_key, rainfall_mm, t_max_c, t_min_c, rh_pct, solar_mj_m2, is_heat_day,
                                       is_rain_day, rainfall_imputed, temp_imputed, dw_batch_id)
    SELECT to_char(w.obs_date, 'YYYYMMDD')::int, f.farm_key, w.rainfall_mm, w.t_max_c, w.t_min_c, w.rh_pct, w.solar_mj_m2,
           w.t_max_c >= 35, w.rainfall_mm >= 1, w.rainfall_imputed, w.temp_imputed, p_batch
    FROM stg.weather_clean w
    JOIN dw.dim_farm f ON f.farm_code = w.farm_code AND w.obs_date BETWEEN f.scd_effective_from AND f.scd_effective_to
    ON CONFLICT (date_key, farm_key) DO UPDATE
    SET rainfall_mm = EXCLUDED.rainfall_mm, t_max_c = EXCLUDED.t_max_c, t_min_c = EXCLUDED.t_min_c, rh_pct = EXCLUDED.rh_pct,
        solar_mj_m2 = EXCLUDED.solar_mj_m2, is_heat_day = EXCLUDED.is_heat_day, is_rain_day = EXCLUDED.is_rain_day,
        rainfall_imputed = EXCLUDED.rainfall_imputed, temp_imputed = EXCLUDED.temp_imputed, dw_batch_id = EXCLUDED.dw_batch_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM etl.fn_log_step(p_batch, 'load fact_weather_daily', 'dw.fact_weather_daily', (SELECT count(*) FROM stg.weather_clean), n, 0, t0);
END $$;


--
-- Name: sp_reconcile(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_reconcile(IN p_batch integer)
    LANGUAGE plpgsql
    AS $_$
DECLARE
    a numeric; b numeric; c numeric; d numeric; e numeric;
BEGIN
    DELETE FROM audit.recon_result WHERE batch_id = p_batch;

    -- R01 harvest rows: raw = loaded + rejected + duplicates
    SELECT count(*) INTO a FROM stg.harvest_log_raw;
    SELECT count(*) FILTER (WHERE dq_status IN ('OK', 'CORRECTED')), count(*) FILTER (WHERE dq_status = 'REJECTED'),
           count(*) FILTER (WHERE dq_status = 'DUPLICATE') INTO b, c, d FROM stg.harvest_clean;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R01', 'Harvest log rows: raw = loaded + rejected + duplicates', 'ROW_COUNT', a, b + c + d, 0,
            CASE WHEN a = b + c + d THEN 'PASS' ELSE 'FAIL' END,
            format('%s loaded, %s rejected to quarantine, %s duplicates removed', b, c, d));

    SELECT count(*) INTO e FROM dw.fact_harvest;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R02', 'Harvest rows: cleansed staging = fact_harvest', 'ROW_COUNT', b, e, 0,
            CASE WHEN b = e THEN 'PASS' ELSE 'FAIL' END, 'Every accepted harvest record loaded once');

    -- R03 harvest control total (kg)
    SELECT sum(harvested_kg) INTO a FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED');
    SELECT sum(harvested_kg) INTO b FROM dw.fact_harvest;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R03', 'Harvest control total (kg): staging = warehouse', 'CONTROL_TOTAL', a, b, 0.5,
            CASE WHEN abs(a - b) <= 0.5 THEN 'PASS' ELSE 'FAIL' END, 'Sum of standardised kilograms');

    -- R04 sales rows
    SELECT count(*) INTO a FROM stg.sales_raw;
    SELECT count(*) FILTER (WHERE dq_status IN ('OK', 'CORRECTED')), count(*) FILTER (WHERE dq_status = 'REJECTED'),
           count(*) FILTER (WHERE dq_status = 'DUPLICATE') INTO b, c, d FROM stg.sales_clean;
    SELECT count(*) INTO e FROM dw.fact_sales;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R04', 'ERP sales rows: raw = loaded + rejected + duplicates', 'ROW_COUNT', a, e + c + d, 0,
            CASE WHEN a = e + c + d THEN 'PASS' ELSE 'FAIL' END,
            format('%s lines in fact_sales, %s rejected, %s duplicate lines from overlapping extracts removed', e, c, d));

    -- R05 sales control total (net revenue N$)
    SELECT sum(net_revenue_nad) INTO a FROM stg.sales_clean WHERE dq_status IN ('OK', 'CORRECTED');
    SELECT sum(net_revenue_nad) INTO b FROM dw.fact_sales;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R05', 'Net revenue control total (N$): staging = warehouse', 'CONTROL_TOTAL', a, b, 1,
            CASE WHEN abs(a - b) <= 1 THEN 'PASS' ELSE 'FAIL' END, 'Includes credit notes (negative)');

    -- R06 cross-source: ERP invoiced kg vs stock-system dispatched kg (whole period)
    SELECT sum(quantity_kg) INTO a FROM dw.fact_sales WHERE doc_type = 'INV';
    SELECT sum(dispatched_kg) INTO b FROM dw.fact_inventory_monthly;
    SELECT coalesce(sum(s.quantity_kg), 0) INTO c
    FROM dw.fact_sales s WHERE s.doc_type = 'INV' AND s.invoice_date_key / 100 <> s.dispatch_date_key / 100;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R06', 'Cross-source: ERP invoiced kg vs stock-system dispatched kg', 'CROSS_SOURCE', a, b, 0.002 * a,
            CASE WHEN abs(b - a) <= 0.002 * a THEN 'PASS' WHEN abs(b - a) <= 0.01 * a THEN 'WARN' ELSE 'FAIL' END,
            format('Difference = goods dispatched on 29-30 Sep 2026 and invoiced after the extract (unbilled at cut-off). %s kg were invoiced in a later month than dispatched (timing only).', round(c)));

    -- R07 stock-flow identity after cleansing
    SELECT count(*) INTO a FROM dw.fact_inventory_monthly
    WHERE abs(opening_stock_kg + received_kg - dispatched_kg - shrinkage_kg - closing_stock_kg) > 1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R07', 'Stock-flow identity exceptions (opening + in - out - loss = closing)', 'INTEGRITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'FAIL' END, 'After sign-error correction (ST01) and gap imputation (ST03)');

    -- R08 stock continuity: closing(m-1) = opening(m)
    WITH s AS (
        SELECT f.farm_code, i.product_key, i.snapshot_date_key, i.opening_stock_kg,
               lag(i.closing_stock_kg) OVER (PARTITION BY f.farm_code, i.product_key ORDER BY i.snapshot_date_key) AS prev_close,
               lag(i.snapshot_date_key) OVER (PARTITION BY f.farm_code, i.product_key ORDER BY i.snapshot_date_key) AS prev_key
        FROM dw.fact_inventory_monthly i JOIN dw.dim_farm f USING (farm_key)
    )
    SELECT count(*) INTO a FROM s
    WHERE prev_key IS NOT NULL AND abs(opening_stock_kg - prev_close) > 1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R08', 'Stock continuity breaks (closing of month m-1 <> opening of month m)', 'INTEGRITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'FAIL' END, 'Gaps imputed by rule ST03');

    -- R09 cost ledger control total
    SELECT sum(etl.fn_try_numeric(r.amount_nad)) INTO a
    FROM stg.cost_ledger_raw r JOIN stg.cost_clean c USING (source_file, row_num) WHERE c.dq_status <> 'DUPLICATE';
    SELECT sum(amount_nad) INTO b FROM dw.fact_production_cost;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R09', 'Cost ledger control total (N$): raw (excl. duplicates) = warehouse', 'CONTROL_TOTAL', a, b, 1,
            CASE WHEN abs(a - b) <= 1 THEN 'PASS' ELSE 'FAIL' END, 'Reversal/correction pairs retained (they are legitimate postings)');

    SELECT count(*) INTO a FROM stg.cost_ledger_raw;
    SELECT count(*) INTO b FROM dw.fact_production_cost;
    SELECT count(*) INTO c FROM stg.cost_clean WHERE dq_status IN ('DUPLICATE', 'REJECTED');
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R10', 'Cost ledger rows: raw = loaded + duplicates/rejected', 'ROW_COUNT', a, b + c, 0,
            CASE WHEN a = b + c THEN 'PASS' ELSE 'FAIL' END, format('%s duplicate/rejected postings', c));

    -- R11 unknown-member share in fact_sales
    SELECT count(*) FILTER (WHERE farm_key = -1), count(*) INTO a, b FROM dw.fact_sales;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R11', 'Sales lines on Unknown farm (-1), % of lines', 'REFERENTIAL', 2.0, round(100 * a / b, 3), 2.0,
            CASE WHEN 100 * a / b <= 2 THEN 'PASS' ELSE 'WARN' END,
            format('%s of %s lines lack farm of origin (rule SA05); threshold 2 %%', a, b));

    SELECT count(*) INTO a FROM dw.dim_customer WHERE is_inferred;
    SELECT count(*) INTO b FROM dw.fact_sales WHERE customer_key = -1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R12', 'Sales lines with Unknown customer (-1) / open inferred members', 'REFERENTIAL', 0, b, 0,
            CASE WHEN b = 0 THEN 'PASS' ELSE 'FAIL' END,
            format('%s inferred customer member(s) currently awaiting master data (rule SA04)', a));

    -- R13 SCD2 integrity: one current row per key, no overlaps, no gaps
    SELECT (SELECT count(*) FROM (SELECT farm_code FROM dw.dim_farm GROUP BY farm_code HAVING count(*) FILTER (WHERE scd_is_current) <> 1) x)
         + (SELECT count(*) FROM (SELECT customer_code FROM dw.dim_customer GROUP BY customer_code HAVING count(*) FILTER (WHERE scd_is_current) <> 1) y)
         + (SELECT count(*) FROM (SELECT farm_code, scd_effective_from,
                                         lag(scd_effective_to) OVER (PARTITION BY farm_code ORDER BY scd_effective_from) AS prev_to
                                  FROM dw.dim_farm) z WHERE prev_to IS NOT NULL AND scd_effective_from <> prev_to + 1)
         + (SELECT count(*) FROM (SELECT customer_code, scd_effective_from,
                                         lag(scd_effective_to) OVER (PARTITION BY customer_code ORDER BY scd_effective_from) AS prev_to
                                  FROM dw.dim_customer) z WHERE prev_to IS NOT NULL AND scd_effective_from <> prev_to + 1)
    INTO a;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R13', 'SCD2 integrity violations (current-row count, overlaps, gaps)', 'INTEGRITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'FAIL' END,
            format('dim_farm %s versions / %s farms; dim_customer %s versions / %s customers',
                   (SELECT count(*) FROM dw.dim_farm WHERE farm_key > 0), (SELECT count(DISTINCT farm_code) FROM dw.dim_farm WHERE farm_key > 0),
                   (SELECT count(*) FROM dw.dim_customer WHERE customer_key > 0), (SELECT count(DISTINCT customer_code) FROM dw.dim_customer WHERE customer_key > 0)));

    -- R14 date dimension completeness
    SELECT count(*) INTO a FROM dw.dim_date WHERE date_key > 0;
    b := DATE '2027-12-31' - DATE '2020-01-01' + 1;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R14', 'Date dimension: contiguous days 2020-01-01..2027-12-31', 'COMPLETENESS', b, a, 0,
            CASE WHEN a = b THEN 'PASS' ELSE 'FAIL' END, 'Required for Power BI time intelligence (mark as date table)');

    -- R15 weather completeness
    SELECT count(*), count(rainfall_mm), count(t_max_c) INTO a, b, c FROM dw.fact_weather_daily;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R15', 'Weather completeness: farm-days with rainfall (%)', 'COMPLETENESS', 100, round(100 * b / a, 3), 0.5,
            CASE WHEN 100 * b / a >= 99.5 THEN 'PASS' ELSE 'WARN' END,
            format('%s farm-days; temperature complete for %s after interpolation (WE01)', a, c));

    -- R16 market price completeness
    SELECT count(*) INTO a FROM dw.fact_market_price_monthly;
    SELECT count(DISTINCT month_start) * 6 INTO b FROM stg.market_price_clean;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R16', 'Commodity prices: months x 6 series loaded', 'COMPLETENESS', b, a, 0,
            CASE WHEN a = b THEN 'PASS' ELSE 'FAIL' END, 'Missing Pink Sheet markers interpolated (MP01)');

    -- R17 plausibility: Green Basket output <= regional estimate (region x crop x season)
    WITH gb AS (
        SELECT f.region_key, h.crop_key, (extract(year FROM d.full_date - interval '9 months'))::int AS season, sum(h.harvested_kg) / 1000 AS t
        FROM dw.fact_harvest h JOIN dw.dim_farm f USING (farm_key) JOIN dw.dim_date d ON d.date_key = h.harvest_date_key
        GROUP BY 1, 2, 3
    ), est AS (
        SELECT e.region_key, e.crop_key, (e.season_end_date_key / 10000) - 1 AS season, sum(e.production_t) AS t
        FROM dw.fact_crop_estimate e GROUP BY 1, 2, 3
    )
    SELECT count(*) FILTER (WHERE gb.t > est.t * 1.001), count(*) INTO a, b FROM gb JOIN est USING (region_key, crop_key, season);
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R17', 'Plausibility: Green Basket harvest exceeds the NSA regional estimate', 'PLAUSIBILITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'WARN' END, format('%s region-crop-season combinations compared', b));

    -- R18 cross-source: harvest (net of typical cull) vs stock received
    SELECT round(sum(h.harvested_kg * (1 - c.typical_cull_pct / 100)), 1) INTO a
    FROM dw.fact_harvest h JOIN dw.dim_crop c USING (crop_key) JOIN dw.dim_date d ON d.date_key = h.harvest_date_key
    WHERE d.full_date >= DATE '2021-04-01';
    SELECT sum(received_kg) INTO b FROM dw.fact_inventory_monthly WHERE is_imputed = false;
    SELECT coalesce(sum(etl.fn_try_numeric(r.qty_txt, r.template_code = 'B')
                        * coalesce(u.kg_factor, 1)), 0) INTO c
    FROM stg.harvest_clean h JOIN stg.harvest_log_raw r USING (source_file, row_num)
    LEFT JOIN ref.uom_conversion u ON u.uom_norm = h.unit_norm
    WHERE h.dq_status = 'REJECTED' AND coalesce(h.dq_note, '') NOT LIKE '%HV03%';
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R18', 'Cross-source: harvest net of cull (kg) vs stock received (kg)', 'CROSS_SOURCE', a, b, 0.005 * a,
            CASE WHEN abs(a - b) <= 0.005 * a THEN 'PASS' ELSE 'WARN' END,
            format('Net residual %s kg (%s %%): harvest rows quarantined for invalid date/quantity (%s kg as keyed; blank and negative entries carry no usable value until resubmitted) plus the gap between crop-level typical cull and actual grading losses; within the 0.5 %% tolerance.', round(a - b), round(100 * (a - b) / b, 2), round(c)));

    -- R19 price anomalies flagged for review
    SELECT count(*), coalesce(sum(net_revenue_nad), 0) INTO a, b FROM dw.fact_sales WHERE is_price_anomaly;
    INSERT INTO audit.recon_result (batch_id, check_code, check_name, check_type, source_value, target_value, tolerance, status, explanation)
    VALUES (p_batch, 'R19', 'Invoice lines flagged as price anomalies (SA07), count', 'PLAUSIBILITY', 0, a, 0,
            CASE WHEN a = 0 THEN 'PASS' ELSE 'WARN' END,
            format('N$ %s of revenue on flagged lines awaiting Sales Data Steward review', to_char(b, 'FM999,999,999,990')));
END $_$;


--
-- Name: sp_run_full_load(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_run_full_load(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    CALL etl.sp_transform_master_data(p_batch);
    CALL etl.sp_load_dim_date(p_batch, DATE '2020-01-01', DATE '2027-12-31', DATE '2026-09-30');
    CALL etl.sp_load_dim_region(p_batch);
    CALL etl.sp_load_dim_crop_hierarchy(p_batch);
    CALL etl.sp_load_dim_cost_category(p_batch);
    CALL etl.sp_load_dim_farm_scd2(p_batch);
    CALL etl.sp_load_dim_customer_scd2(p_batch);
    CALL etl.sp_transform_market_fx(p_batch);
    CALL etl.sp_load_dim_commodity(p_batch);
    CALL etl.sp_transform_planting(p_batch);
    CALL etl.sp_transform_harvest(p_batch);
    CALL etl.sp_transform_sales(p_batch);
    CALL etl.sp_transform_costs(p_batch);
    CALL etl.sp_transform_stock(p_batch);
    CALL etl.sp_transform_weather(p_batch);
    CALL etl.sp_transform_crop_estimates(p_batch);
    CALL etl.sp_load_fact_sales(p_batch);
    CALL etl.sp_load_fact_harvest(p_batch);
    CALL etl.sp_load_fact_crop_cycle(p_batch);
    CALL etl.sp_load_fact_production_cost(p_batch);
    CALL etl.sp_load_fact_inventory(p_batch);
    CALL etl.sp_load_fact_weather(p_batch);
    CALL etl.sp_load_fact_market_price(p_batch);
    CALL etl.sp_load_fact_crop_estimate(p_batch);
END $$;


--
-- Name: sp_run_master_delta(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_run_master_delta(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    CALL etl.sp_transform_master_data(p_batch);
    CALL etl.sp_load_dim_farm_scd2(p_batch);
    CALL etl.sp_load_dim_customer_scd2(p_batch);
END $$;


--
-- Name: sp_transform_costs(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_costs(IN p_batch integer)
    LANGUAGE plpgsql
    AS $_$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    DELETE FROM stg.cost_clean;
    INSERT INTO stg.cost_clean (source_file, row_num, posting_id, posting_date, farm_code, cost_centre, crop_code,
                                cost_category_code, gl_account, amount_nad, input_qty, input_uom, supplier_code, is_reversal)
    SELECT r.source_file, r.row_num, btrim(r.posting_id), etl.fn_try_date(r.posting_date, 'YYYY-MM-DD'),
           upper(btrim(r.farm_code)), btrim(r.cost_centre), nullif(upper(btrim(r.crop_code)), ''),
           a.cost_category_code, btrim(r.gl_account), etl.fn_try_numeric(r.amount_nad),
           etl.fn_try_numeric(r.input_qty), nullif(btrim(r.input_uom), ''), nullif(btrim(r.supplier_code), ''),
           r.posting_id LIKE '%-R'
    FROM stg.cost_ledger_raw r
    LEFT JOIN ref.cost_category_alias a ON a.alias_norm = etl.fn_norm(r.cost_category);

    UPDATE stg.cost_clean c SET dq_status = 'DUPLICATE', dq_note = 'CL01'
    FROM (SELECT source_file, row_num, row_number() OVER (PARTITION BY posting_id ORDER BY source_file, row_num) AS rn
          FROM stg.cost_clean) d
    WHERE d.source_file = c.source_file AND d.row_num = c.row_num AND d.rn > 1;
    UPDATE stg.cost_clean SET dq_status = 'REJECTED', dq_note = 'CL02'
    WHERE dq_status = 'OK' AND (cost_category_code IS NULL OR amount_nad IS NULL OR posting_date IS NULL);

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'CL01', 'Cost ledger', posting_id, 'posting_id', posting_id, 'Removed duplicate'
    FROM stg.cost_clean WHERE dq_status = 'DUPLICATE'
    UNION ALL
    SELECT p_batch, 'CL02', 'Cost ledger', c.posting_id, 'cost_category', r.cost_category, 'Mapped to ' || c.cost_category_code
    FROM stg.cost_clean c JOIN stg.cost_ledger_raw r USING (source_file, row_num)
    JOIN stg.md_cost_categories_raw m ON m.cost_category_code = c.cost_category_code
    WHERE c.dq_status = 'OK' AND btrim(r.cost_category) <> m.cost_category_name
    UNION ALL
    SELECT p_batch, 'CL04', 'Cost ledger', c.posting_id, 'amount_nad', r.amount_nad, 'Parsed to ' || c.amount_nad
    FROM stg.cost_clean c JOIN stg.cost_ledger_raw r USING (source_file, row_num)
    WHERE c.dq_status = 'OK' AND r.amount_nad !~ '^-?[0-9]+(\.[0-9]+)?$'
    UNION ALL
    SELECT p_batch, 'CL03', 'Cost ledger', c.posting_id, 'crop_code', '', 'Loaded to Unknown crop (-1)'
    FROM stg.cost_clean c JOIN stg.md_cost_categories_raw m ON m.cost_category_code = c.cost_category_code
    WHERE c.dq_status = 'OK' AND c.crop_code IS NULL AND m.cost_behaviour <> 'Fixed';

    UPDATE stg.cost_clean c SET dq_status = 'CORRECTED', dq_note = 'CL04'
    FROM stg.cost_ledger_raw r
    WHERE r.source_file = c.source_file AND r.row_num = c.row_num AND c.dq_status = 'OK'
      AND r.amount_nad !~ '^-?[0-9]+(\.[0-9]+)?$';

    PERFORM etl.fn_log_step(p_batch, 'transform cost ledger', 'stg.cost_clean',
                         (SELECT count(*) FROM stg.cost_ledger_raw),
                         (SELECT count(*) FROM stg.cost_clean WHERE dq_status IN ('OK', 'CORRECTED')),
                         (SELECT count(*) FROM stg.cost_clean WHERE dq_status IN ('REJECTED', 'DUPLICATE')), t0);
END $_$;


--
-- Name: sp_transform_crop_estimates(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_crop_estimates(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    DELETE FROM stg.crop_estimate_clean;
    INSERT INTO stg.crop_estimate_clean (season_start_year, region_code, crop_code, farming_sector, area_planted_ha,
                                         production_t, yield_t_ha, yield_derived, release_date, source_table, dq_status, dq_note)
    SELECT left(r.season, 4)::smallint, ra.region_code, ca.crop_code, btrim(r.sector),
           etl.fn_try_numeric(r.area_planted_ha), etl.fn_try_numeric(r.production_tonnes),
           coalesce(etl.fn_try_numeric(r.yield_t_per_ha),
                    round(etl.fn_try_numeric(r.production_tonnes) / nullif(etl.fn_try_numeric(r.area_planted_ha), 0), 3)),
           etl.fn_try_numeric(r.yield_t_per_ha) IS NULL,
           etl.fn_try_date(r.release_date, 'YYYY-MM-DD'), r.source_table,
           CASE WHEN ca.crop_code IS NULL OR ra.region_code IS NULL THEN 'REJECTED'
                WHEN etl.fn_try_numeric(r.yield_t_per_ha) IS NULL THEN 'CORRECTED' ELSE 'OK' END,
           CASE WHEN ca.crop_code IS NULL OR ra.region_code IS NULL THEN 'CE01'
                WHEN etl.fn_try_numeric(r.yield_t_per_ha) IS NULL THEN 'CE02' END
    FROM stg.crop_estimate_raw r
    LEFT JOIN ref.region_alias ra ON ra.alias_norm = etl.fn_norm(r.region)
    LEFT JOIN ref.crop_alias ca ON ca.alias_norm = etl.fn_norm(r.crop);

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'CE01', 'NSA crop estimates', r.season || '/' || r.region || '/' || r.crop, 'crop', r.crop, 'Excluded (out of scope)'
    FROM stg.crop_estimate_raw r LEFT JOIN ref.crop_alias ca ON ca.alias_norm = etl.fn_norm(r.crop)
    WHERE ca.crop_code IS NULL
    UNION ALL
    SELECT p_batch, 'MD01', 'NSA crop estimates', r.season || '/' || r.region || '/' || r.crop, 'region', r.region, 'Mapped to ' || ra.region_code
    FROM stg.crop_estimate_raw r JOIN ref.region_alias ra ON ra.alias_norm = etl.fn_norm(r.region)
    JOIN stg.md_regions_raw m ON m.region_code = ra.region_code WHERE btrim(r.region) <> m.region_name
    UNION ALL
    SELECT p_batch, 'CE02', 'NSA crop estimates', r.season || '/' || r.region || '/' || r.crop, 'yield_t_per_ha', r.yield_t_per_ha, 'Derived as production / area'
    FROM stg.crop_estimate_raw r WHERE etl.fn_try_numeric(r.yield_t_per_ha) IS NULL;

    PERFORM etl.fn_log_step(p_batch, 'transform NSA crop estimates', 'stg.crop_estimate_clean',
                         (SELECT count(*) FROM stg.crop_estimate_raw),
                         (SELECT count(*) FROM stg.crop_estimate_clean WHERE dq_status <> 'REJECTED'),
                         (SELECT count(*) FROM stg.crop_estimate_clean WHERE dq_status = 'REJECTED'), t0);
END $$;


--
-- Name: sp_transform_harvest(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_harvest(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    DELETE FROM stg.harvest_clean;
    INSERT INTO stg.harvest_clean (source_file, row_num, template_code, farm_code, harvest_date, crop_code, block_id,
                                   recorder_code, qty_raw, unit_norm, kg_factor, harvested_kg)
    SELECT r.source_file, r.row_num, r.template_code,
           upper(replace(btrim(r.farm_txt), '_', '-')),
           CASE r.template_code WHEN 'A' THEN etl.fn_try_date(r.date_txt, 'DD/MM/YYYY')
                                WHEN 'B' THEN etl.fn_try_date(r.date_txt, 'YYYY-MM-DD')
                                ELSE etl.fn_try_date(r.date_txt, 'DD-Mon-YY') END,
           ca.crop_code, upper(btrim(r.block_txt)), btrim(r.recorder_txt),
           etl.fn_try_numeric(r.qty_txt, r.template_code = 'B'),
           u.uom_norm, u.kg_factor,
           round(etl.fn_try_numeric(r.qty_txt, r.template_code = 'B') * u.kg_factor, 1)
    FROM stg.harvest_log_raw r
    LEFT JOIN ref.crop_alias ca ON ca.alias_norm = etl.fn_norm(r.crop_txt)
    LEFT JOIN ref.uom_conversion u
           ON u.uom_norm = CASE r.template_code WHEN 'A' THEN 'KG' WHEN 'B' THEN 'T' ELSE etl.fn_norm(r.unit_txt) END;

    -- HV08 farm-code formatting (standardised above; log the variants)
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'HV08', 'Harvest log', r.source_file || ':' || r.row_num, 'farm_code', r.farm_txt, 'Standardised to ' || c.farm_code
    FROM stg.harvest_log_raw r JOIN stg.harvest_clean c USING (source_file, row_num)
    WHERE r.farm_txt IS DISTINCT FROM c.farm_code;
    UPDATE stg.harvest_clean c SET dq_status = 'CORRECTED', dq_note = 'HV08'
    FROM stg.harvest_log_raw r
    WHERE r.source_file = c.source_file AND r.row_num = c.row_num AND r.farm_txt IS DISTINCT FROM c.farm_code;

    -- rejection rules, in order of precedence
    UPDATE stg.harvest_clean SET dq_status = 'REJECTED', dq_note = 'HV01' WHERE harvest_date IS NULL;
    UPDATE stg.harvest_clean SET dq_status = 'REJECTED', dq_note = 'HV02' WHERE dq_status <> 'REJECTED' AND qty_raw IS NULL;
    UPDATE stg.harvest_clean SET dq_status = 'REJECTED', dq_note = 'HV03' WHERE dq_status <> 'REJECTED' AND qty_raw <= 0;
    UPDATE stg.harvest_clean SET dq_status = 'REJECTED', dq_note = 'HV04'
    WHERE dq_status <> 'REJECTED'
      AND (crop_code IS NULL OR kg_factor IS NULL OR farm_code NOT IN (SELECT farm_code FROM stg.md_farm_clean));

    -- HV05 exact duplicate re-submissions (identical raw text within a file)
    UPDATE stg.harvest_clean c SET dq_status = 'DUPLICATE', dq_note = 'HV05'
    FROM (SELECT source_file, row_num,
                 row_number() OVER (PARTITION BY source_file, farm_txt, date_txt, crop_txt, block_txt, qty_txt, unit_txt,
                                                 recorder_txt, remarks_txt ORDER BY row_num) AS rn
          FROM stg.harvest_log_raw) d
    WHERE d.source_file = c.source_file AND d.row_num = c.row_num AND d.rn > 1 AND c.dq_status <> 'REJECTED';

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, c.dq_note, 'Harvest log', c.source_file || ':' || c.row_num,
           CASE c.dq_note WHEN 'HV01' THEN 'date' WHEN 'HV04' THEN 'farm/crop' ELSE 'quantity' END,
           CASE c.dq_note WHEN 'HV01' THEN r.date_txt WHEN 'HV04' THEN r.farm_txt || '/' || r.crop_txt ELSE r.qty_txt END,
           CASE c.dq_status WHEN 'DUPLICATE' THEN 'Removed duplicate' ELSE 'Rejected to quarantine' END
    FROM stg.harvest_clean c JOIN stg.harvest_log_raw r USING (source_file, row_num)
    WHERE c.dq_status IN ('REJECTED', 'DUPLICATE');

    -- assign each harvest record to its crop cycle (latest planting of the block on/before the date)
    UPDATE stg.harvest_clean c
    SET cycle_id = m.cycle_id
    FROM (
        SELECT h.source_file, h.row_num,
               (SELECT p.cycle_id FROM stg.planting_clean p
                 WHERE p.farm_code = h.farm_code AND p.crop_code = h.crop_code AND p.block_id = h.block_id
                   AND p.planting_date <= h.harvest_date
                 ORDER BY p.planting_date DESC LIMIT 1) AS cycle_id
        FROM stg.harvest_clean h WHERE h.dq_status IN ('OK', 'CORRECTED')
    ) m
    WHERE m.source_file = c.source_file AND m.row_num = c.row_num;

    -- HV06 unit / decimal-shift errors (precision first: a value is only changed when a keying mechanism explains it)
    --   method 1 "neighbour spike": > 5x the median of the 2 previous and 2 next records of the same field block;
    --   method 2 "block yield": the block's implied t/ha is > 2.5x the median of its sister blocks in the cycle
    --   (leave-one-out: the block under test is excluded, otherwise in a 2-block cycle the outlier masks itself;
    --   with a single sister the block must also exceed 2.5x its planned yield).
    -- Correction factor 10 or 1000 is applied only if it brings the value back within 3x of its reference;
    -- unexplained outliers are flagged for the Farm Data Steward and left unchanged.
    WITH seq AS (
        SELECT source_file, row_num, harvested_kg, cycle_id, block_id,
               lag(harvested_kg, 1) OVER w AS p1, lag(harvested_kg, 2) OVER w AS p2,
               lead(harvested_kg, 1) OVER w AS n1, lead(harvested_kg, 2) OVER w AS n2
        FROM stg.harvest_clean
        WHERE dq_status IN ('OK', 'CORRECTED') AND cycle_id IS NOT NULL
        WINDOW w AS (PARTITION BY cycle_id, block_id ORDER BY harvest_date, row_num)
    ), nb AS (
        SELECT s.source_file, s.row_num, s.harvested_kg, x.med, x.cnt
        FROM seq s CROSS JOIN LATERAL (
            SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) AS med, count(v) AS cnt
            FROM unnest(ARRAY[s.p1, s.p2, s.n1, s.n2]) AS v) x
    ), spike AS (
        SELECT source_file, row_num, harvested_kg, harvested_kg / med AS ratio, 'neighbour spike' AS method,
               CASE WHEN abs(ln(harvested_kg / 1000 / med)) < ln(3) THEN 1000
                    WHEN abs(ln(harvested_kg / 10 / med)) < ln(3) THEN 10 END AS factor
        FROM nb WHERE cnt >= 2 AND harvested_kg > 5 * med
    ), blk AS (
        SELECT h.cycle_id, h.block_id, sum(h.harvested_kg) AS kg, max(h.harvested_kg) AS mx,
               nullif(max(p.planted_ha), 0) AS ha, max(p.planned_yield_t_ha) * 1000 AS plan_kg_ha
        FROM stg.harvest_clean h JOIN stg.planting_clean p USING (cycle_id, block_id)
        WHERE h.dq_status IN ('OK', 'CORRECTED') GROUP BY h.cycle_id, h.block_id
    ), ref AS (
        SELECT b.*, nullif(s.med_y, 0) AS med_y, s.n
        FROM blk b CROSS JOIN LATERAL (
            SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o.kg / o.ha) AS med_y, count(o.ha) AS n
            FROM blk o WHERE o.cycle_id = b.cycle_id AND o.block_id <> b.block_id) s
    ), yld AS (
        SELECT DISTINCT ON (h.source_file, h.row_num) h.source_file, h.row_num, h.harvested_kg,
               (r.kg / r.ha) / r.med_y AS ratio, 'block yield' AS method, 10 AS factor
        FROM ref r
        JOIN stg.harvest_clean h ON h.cycle_id = r.cycle_id AND h.block_id = r.block_id AND h.harvested_kg = r.mx
                                AND h.dq_status IN ('OK', 'CORRECTED')
        WHERE r.n >= 1 AND r.kg / r.ha > 2.5 * r.med_y
          AND (r.n >= 2 OR r.kg / r.ha > 2.5 * r.plan_kg_ha)
          AND ((r.kg - r.mx + r.mx / 10) / r.ha) / r.med_y BETWEEN 0.5 AND 1.6
    ), fix AS (
        SELECT DISTINCT ON (source_file, row_num) * FROM (SELECT * FROM spike UNION ALL SELECT * FROM yld) u
        ORDER BY source_file, row_num, (factor IS NULL), method DESC
    ), logged AS (
        INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
        SELECT p_batch, 'HV06', 'Harvest log', source_file || ':' || row_num, 'quantity', harvested_kg::text,
               CASE WHEN factor IS NULL THEN 'Flagged for review: ' || method || ' ' || round(ratio::numeric, 1) || 'x, no unit explanation'
                    ELSE 'Divided by ' || factor || ' (' || method || ' ' || round(ratio::numeric, 1) || 'x)' END
        FROM fix RETURNING source_key
    )
    UPDATE stg.harvest_clean c
    SET harvested_kg = CASE WHEN f.factor IS NULL THEN c.harvested_kg ELSE round(c.harvested_kg / f.factor, 1) END,
        dq_status    = CASE WHEN f.factor IS NULL THEN c.dq_status ELSE 'CORRECTED' END,
        dq_note      = concat_ws(',', c.dq_note, 'HV06')
    FROM fix f WHERE f.source_file = c.source_file AND f.row_num = c.row_num;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'HV07', 'Harvest log', source_file || ':' || row_num, 'block_id', farm_code || '/' || crop_code || '/' || block_id,
           'Loaded without cycle link'
    FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED') AND cycle_id IS NULL;

    PERFORM etl.fn_log_step(p_batch, 'transform harvest logs', 'stg.harvest_clean',
                         (SELECT count(*) FROM stg.harvest_log_raw),
                         (SELECT count(*) FROM stg.harvest_clean WHERE dq_status IN ('OK', 'CORRECTED')),
                         (SELECT count(*) FROM stg.harvest_clean WHERE dq_status IN ('REJECTED', 'DUPLICATE')), t0);
END $$;


--
-- Name: sp_transform_market_fx(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_market_fx(IN p_batch integer)
    LANGUAGE plpgsql
    AS $_$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    -- FX: daily FRED observations -> monthly averages (FX01 logs blanks)
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'FX01', 'FRED ' || series_id, observation_date, 'value', coalesce(value_txt, ''), 'Excluded from monthly average'
    FROM stg.fred_raw WHERE etl.fn_try_numeric(value_txt) IS NULL;

    DELETE FROM ref.fx_rate_monthly;
    WITH d AS (
        SELECT etl.fn_try_date(observation_date, 'YYYY-MM-DD') AS obs_date, series_id, etl.fn_try_numeric(value_txt) AS v
        FROM stg.fred_raw
    ), w AS (
        SELECT obs_date,
               max(v) FILTER (WHERE series_id = 'DEXSFUS') AS zar_usd,
               max(v) FILTER (WHERE series_id = 'DEXUSEU') AS usd_eur,
               max(v) FILTER (WHERE series_id = 'DEXUSUK') AS usd_gbp
        FROM d WHERE v IS NOT NULL GROUP BY obs_date
    )
    INSERT INTO ref.fx_rate_monthly (currency_code, month_start, nad_per_unit, observations, source)
    SELECT 'USD', date_trunc('month', obs_date)::date, avg(zar_usd), count(zar_usd), 'FRED DEXSFUS (NAD = ZAR)'
    FROM w WHERE zar_usd IS NOT NULL GROUP BY 2
    UNION ALL
    SELECT 'EUR', date_trunc('month', obs_date)::date, avg(zar_usd * usd_eur), count(*), 'FRED DEXSFUS x DEXUSEU'
    FROM w WHERE zar_usd IS NOT NULL AND usd_eur IS NOT NULL GROUP BY 2
    UNION ALL
    SELECT 'GBP', date_trunc('month', obs_date)::date, avg(zar_usd * usd_gbp), count(*), 'FRED DEXSFUS x DEXUSUK'
    FROM w WHERE zar_usd IS NOT NULL AND usd_gbp IS NOT NULL GROUP BY 2;
    INSERT INTO ref.fx_rate_monthly (currency_code, month_start, nad_per_unit, observations, source)
    SELECT c, m.month_start, 1, NULL, 'CMA peg: NAD = ZAR 1:1'
    FROM (VALUES ('NAD'), ('ZAR')) AS t(c), (SELECT DISTINCT month_start FROM ref.fx_rate_monthly) m;

    -- Pink Sheet prices (MP01 interpolation of missing markers)
    DELETE FROM stg.market_price_clean;
    INSERT INTO stg.market_price_clean (commodity_code, month_start, price_usd)
    SELECT cs.commodity_code,
           make_date(left(p.period_txt, 4)::int, right(p.period_txt, 2)::int, 1),
           etl.fn_try_numeric(p.value_txt)
    FROM stg.pink_sheet_raw p
    JOIN ref.commodity_series cs ON cs.series_header_norm = etl.fn_norm(p.series_header)
    WHERE p.period_txt ~ '^\d{4}M\d{2}$'
      AND make_date(left(p.period_txt, 4)::int, right(p.period_txt, 2)::int, 1) BETWEEN DATE '2020-01-01' AND DATE '2027-12-01';  -- dim_date range

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'MP01', 'World Bank Pink Sheet', commodity_code || ' ' || to_char(month_start, 'YYYY-MM'), 'price', 'missing', 'Linearly interpolated'
    FROM stg.market_price_clean WHERE price_usd IS NULL;

    UPDATE stg.market_price_clean m
    SET price_usd = round(((prev.price_usd * (nxt.month_start - m.month_start) + nxt.price_usd * (m.month_start - prev.month_start))
                           / nullif(nxt.month_start - prev.month_start, 0))::numeric, 2),
        is_imputed = true
    FROM stg.market_price_clean m2
    CROSS JOIN LATERAL (SELECT month_start, price_usd FROM stg.market_price_clean x
                        WHERE x.commodity_code = m2.commodity_code AND x.month_start < m2.month_start AND x.price_usd IS NOT NULL
                        ORDER BY x.month_start DESC LIMIT 1) prev
    CROSS JOIN LATERAL (SELECT month_start, price_usd FROM stg.market_price_clean x
                        WHERE x.commodity_code = m2.commodity_code AND x.month_start > m2.month_start AND x.price_usd IS NOT NULL
                        ORDER BY x.month_start ASC LIMIT 1) nxt
    WHERE m.commodity_code = m2.commodity_code AND m.month_start = m2.month_start AND m2.price_usd IS NULL;

    PERFORM etl.fn_log_step(p_batch, 'transform market prices & FX', 'stg.market_price_clean / ref.fx_rate_monthly',
                         (SELECT count(*) FROM stg.pink_sheet_raw) + (SELECT count(*) FROM stg.fred_raw),
                         (SELECT count(*) FROM stg.market_price_clean) + (SELECT count(*) FROM ref.fx_rate_monthly), 0, t0);
END $_$;


--
-- Name: sp_transform_master_data(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_master_data(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp(); n bigint;
BEGIN
    -- region aliases from the Regions sheet (code, name and known aliases)
    DELETE FROM ref.region_alias;
    INSERT INTO ref.region_alias (alias_norm, region_code, source)
    SELECT DISTINCT ON (alias_norm) alias_norm, region_code, src
    FROM (
        SELECT etl.fn_norm(region_code) AS alias_norm, region_code, '1 code' AS src FROM stg.md_regions_raw
        UNION ALL SELECT etl.fn_norm(region_name), region_code, '2 name' FROM stg.md_regions_raw
        UNION ALL SELECT etl.fn_norm(btrim(a)), region_code, '3 alias'
                  FROM stg.md_regions_raw, unnest(string_to_array(known_aliases, ';')) AS a
    ) x
    WHERE alias_norm IS NOT NULL
    ORDER BY alias_norm, src;

    -- crop aliases: codes and official names (steward aliases already seeded)
    INSERT INTO ref.crop_alias (alias_norm, crop_code, source)
    SELECT etl.fn_norm(v), crop_code, 'master data'
    FROM stg.md_crops_raw, LATERAL (VALUES (crop_code), (crop_name)) AS t(v)
    ON CONFLICT (alias_norm) DO NOTHING;

    -- cost category aliases: code, standard name and ledger free-text variants
    DELETE FROM ref.cost_category_alias;
    INSERT INTO ref.cost_category_alias (alias_norm, cost_category_code)
    SELECT DISTINCT ON (alias_norm) alias_norm, cost_category_code
    FROM (
        SELECT etl.fn_norm(cost_category_code) AS alias_norm, cost_category_code FROM stg.md_cost_categories_raw
        UNION ALL SELECT etl.fn_norm(cost_category_name), cost_category_code FROM stg.md_cost_categories_raw
        UNION ALL SELECT etl.fn_norm(btrim(a)), cost_category_code
                  FROM stg.md_cost_categories_raw, unnest(string_to_array(ledger_aliases, ';')) AS a
    ) x WHERE alias_norm IS NOT NULL ORDER BY alias_norm;

    -- duplicate customer accounts approved for merge (MD04)
    DELETE FROM ref.customer_xref;
    INSERT INTO ref.customer_xref
    SELECT btrim(duplicate_code), btrim(survivor_code), etl.fn_try_date(merge_date, 'YYYY-MM-DD'), reason
    FROM stg.md_customer_merge_raw;

    -- farms (current snapshot) -------------------------------------------------
    DELETE FROM stg.md_farm_clean;
    INSERT INTO stg.md_farm_clean
    SELECT upper(btrim(f.farm_code)), btrim(f.farm_name), ra.region_code, btrim(f.town),
           etl.fn_try_numeric(f.latitude), etl.fn_try_numeric(f.longitude), etl.fn_try_numeric(f.elevation_m)::int,
           etl.fn_try_numeric(f.total_ha), etl.fn_try_numeric(f.cultivated_ha), btrim(f.irrigation_type),
           btrim(f.water_source), upper(btrim(f.farm_manager_code)), upper(btrim(f.globalgap_certified)),
           etl.fn_try_numeric(f.established_year)::smallint, upper(btrim(f.harvest_log_template))
    FROM stg.md_farms_raw f
    LEFT JOIN ref.region_alias ra ON ra.alias_norm = etl.fn_norm(f.region)
    WHERE f.extract_name = 'main';
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'MD01', 'Master data: Farms', f.farm_code, 'region', f.region, 'Mapped to ' || ra.region_code
    FROM stg.md_farms_raw f JOIN ref.region_alias ra ON ra.alias_norm = etl.fn_norm(f.region)
    JOIN stg.md_regions_raw r ON r.region_code = ra.region_code
    WHERE f.extract_name = 'main' AND btrim(f.region) <> r.region_name;

    -- customers (main extract + day-2 delta rows) ------------------------------
    DELETE FROM stg.md_customer_clean;
    INSERT INTO stg.md_customer_clean
    SELECT DISTINCT ON (btrim(c.customer_code))
           btrim(c.customer_code), etl.fn_clean_business_name(c.customer_name), btrim(c.customer_type), btrim(c.channel),
           btrim(c.town), ra.region_code, upper(btrim(c.country_code)), upper(btrim(c.currency_code)),
           etl.fn_try_numeric(c.credit_terms_days)::smallint, upper(btrim(c.key_account)),
           coalesce(etl.fn_try_date(left(c.onboarding_date, 10), 'YYYY-MM-DD'), DATE '1900-01-01'), btrim(c.status), c.extract_name
    FROM stg.md_customers_raw c
    LEFT JOIN ref.region_alias ra ON ra.alias_norm = etl.fn_norm(c.region)
    WHERE btrim(c.customer_code) NOT IN (SELECT duplicate_code FROM ref.customer_xref)
    ORDER BY btrim(c.customer_code), CASE c.extract_name WHEN 'delta' THEN 0 ELSE 1 END;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'MD01', 'Master data: Customers', c.customer_code, 'region', c.region, 'Mapped to ' || ra.region_code
    FROM stg.md_customers_raw c JOIN ref.region_alias ra ON ra.alias_norm = etl.fn_norm(c.region)
    JOIN stg.md_regions_raw r ON r.region_code = ra.region_code
    WHERE btrim(c.region) <> r.region_name
    UNION ALL
    SELECT p_batch, 'MD02', 'Master data: Customers', c.customer_code, 'region', coalesce(c.region, ''), 'Loaded with Unknown region (-1)'
    FROM stg.md_customers_raw c
    WHERE upper(btrim(c.country_code)) = 'NA' AND coalesce(btrim(c.region), '') = ''
    UNION ALL
    SELECT p_batch, 'MD04', 'Master data: Customers', x.duplicate_code, 'customer_code', x.duplicate_code, 'Merged into survivor ' || x.survivor_code
    FROM ref.customer_xref x
    UNION ALL
    SELECT p_batch, 'MD05', 'Master data: Customers', c.customer_code, 'customer_name', c.customer_name, 'Cleaned to: ' || etl.fn_clean_business_name(c.customer_name)
    FROM stg.md_customers_raw c
    WHERE c.customer_name <> etl.fn_clean_business_name(c.customer_name)
      AND btrim(c.customer_code) NOT IN (SELECT duplicate_code FROM ref.customer_xref);

    -- attribute history (farms + customers, main + delta) -----------------------
    DELETE FROM stg.md_history_clean;
    INSERT INTO stg.md_history_clean
    SELECT entity, upper(btrim(entity_code)), btrim(attribute), btrim(old_value), btrim(new_value),
           etl.fn_try_date(left(effective_date, 10), 'YYYY-MM-DD'), extract_name
    FROM stg.md_history_raw;

    -- product weight imputation evidence (MD03) is logged when dim_product loads
    SELECT count(*) INTO n FROM stg.md_customer_clean;
    PERFORM etl.fn_log_step(p_batch, 'transform master data', 'stg.md_*_clean', (SELECT count(*) FROM stg.md_customers_raw), n,
                         (SELECT count(*) FROM ref.customer_xref), t0, 'customers after merge of duplicates');
END $$;


--
-- Name: sp_transform_planting(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_planting(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    DELETE FROM stg.planting_clean;
    INSERT INTO stg.planting_clean (cycle_id, block_id, farm_code, crop_code, planting_date, planted_ha, variety,
                                    irrigation_method, is_irrigated, planned_yield_t_ha, harvested_ha, register_status,
                                    dq_status, dq_note)
    SELECT btrim(r.cycle_id), upper(btrim(r.block_id)), upper(btrim(r.farm_code)), ca.crop_code,
           coalesce(etl.fn_try_date(r.planting_date, 'YYYY-MM-DD'), etl.fn_try_date(r.planting_date, 'DD/MM/YYYY')),
           etl.fn_try_numeric(r.planted_ha), btrim(r.variety),
           nullif(btrim(r.irrigation_method), ''), nullif(btrim(r.irrigation_method), '') <> 'Dryland',
           etl.fn_try_numeric(r.planned_yield_t_ha),
           etl.fn_try_numeric(r.harvested_ha), btrim(r.status),
           CASE WHEN etl.fn_try_date(r.planting_date, 'YYYY-MM-DD') IS NULL THEN 'CORRECTED' ELSE 'OK' END,
           CASE WHEN etl.fn_try_date(r.planting_date, 'YYYY-MM-DD') IS NULL THEN 'PL01' END
    FROM stg.planting_register_raw r
    LEFT JOIN ref.crop_alias ca ON ca.alias_norm = etl.fn_norm(r.crop_code);

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'PL01', 'Planting register', r.cycle_id || '|' || r.block_id, 'planting_date', r.planting_date, 'Parsed as DD/MM/YYYY'
    FROM stg.planting_register_raw r WHERE etl.fn_try_date(r.planting_date, 'YYYY-MM-DD') IS NULL
    UNION ALL
    SELECT p_batch, 'PL02', 'Planting register', r.cycle_id || '|' || r.block_id, 'planted_ha', coalesce(r.planted_ha, ''),
           'Imputed with mean block area of the cycle'
    FROM stg.planting_register_raw r WHERE etl.fn_try_numeric(r.planted_ha) IS NULL;

    UPDATE stg.planting_clean p
    SET planted_ha = round(x.avg_ha, 2), dq_status = 'CORRECTED', dq_note = concat_ws(',', p.dq_note, 'PL02')
    FROM (SELECT cycle_id, avg(planted_ha) AS avg_ha FROM stg.planting_clean WHERE planted_ha IS NOT NULL GROUP BY cycle_id) x
    WHERE p.cycle_id = x.cycle_id AND p.planted_ha IS NULL;

    PERFORM etl.fn_log_step(p_batch, 'transform planting register', 'stg.planting_clean',
                         (SELECT count(*) FROM stg.planting_register_raw), (SELECT count(*) FROM stg.planting_clean), 0, t0);
END $$;


--
-- Name: sp_transform_sales(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_sales(IN p_batch integer)
    LANGUAGE plpgsql
    AS $_$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    DELETE FROM stg.sales_clean;
    INSERT INTO stg.sales_clean (source_file, row_num, invoice_no, line_no, doc_type, invoice_date, dispatch_date,
                                 customer_code_raw, customer_code, product_code_raw, product_code, farm_code, quantity, uom,
                                 unit_price, currency_code, discount_pct, unit_std_cost_nad, freight_nad, sales_rep_code,
                                 ref_invoice_no, kg_per_uom)
    SELECT r.source_file, r.row_num, btrim(r.invoice_no), etl.fn_try_numeric(r.line_no)::smallint, upper(btrim(r.doc_type)),
           etl.fn_try_date(r.invoice_date, 'YYYY-MM-DD'), etl.fn_try_date(r.dispatch_date, 'YYYY-MM-DD'),
           btrim(r.customer_code), coalesce(x.survivor_code, btrim(r.customer_code)),
           btrim(r.product_code), p.product_code,
           nullif(upper(btrim(r.farm_code)), ''),
           etl.fn_try_numeric(r.quantity), btrim(r.uom), etl.fn_try_numeric(r.unit_price),
           coalesce(nullif(upper(btrim(r.currency_code)), ''), c.currency_code),
           coalesce(etl.fn_try_numeric(r.discount_pct), 0), etl.fn_try_numeric(r.unit_std_cost_nad),
           coalesce(etl.fn_try_numeric(r.freight_nad), 0), btrim(r.sales_rep_code), nullif(btrim(r.ref_invoice_no), ''),
           p.kg_per_sales_uom
    FROM stg.sales_raw r
    LEFT JOIN ref.customer_xref x ON x.duplicate_code = btrim(r.customer_code)
    LEFT JOIN (SELECT product_code, kg_per_sales_uom, etl.fn_norm(product_code) AS n FROM dw.dim_product WHERE product_key > 0) p
           ON p.n = etl.fn_norm(r.product_code)
    LEFT JOIN stg.md_customer_clean c ON c.customer_code = coalesce(x.survivor_code, btrim(r.customer_code));

    -- SA01 duplicates (overlapping extracts / repeated lines): keep the first occurrence
    UPDATE stg.sales_clean s SET dq_status = 'DUPLICATE', dq_note = 'SA01'
    FROM (SELECT source_file, row_num,
                 row_number() OVER (PARTITION BY invoice_no, line_no ORDER BY source_file, row_num) AS rn
          FROM stg.sales_clean) d
    WHERE d.source_file = s.source_file AND d.row_num = s.row_num AND d.rn > 1;

    -- SA08 sign check, unparseable keys
    UPDATE stg.sales_clean SET dq_status = 'REJECTED', dq_note = 'SA08'
    WHERE dq_status = 'OK' AND ((doc_type = 'INV' AND quantity <= 0) OR (doc_type = 'CRN' AND quantity >= 0)
                                OR invoice_date IS NULL OR product_code IS NULL OR quantity IS NULL OR unit_price IS NULL);

    -- corrections & flags (status CORRECTED keeps the row loadable)
    UPDATE stg.sales_clean SET dq_status = 'CORRECTED', dq_note = concat_ws(',', dq_note, 'SA02')
    WHERE dq_status IN ('OK', 'CORRECTED') AND product_code_raw IS DISTINCT FROM product_code;
    UPDATE stg.sales_clean SET dq_status = 'CORRECTED', dq_note = concat_ws(',', dq_note, 'SA03')
    WHERE dq_status IN ('OK', 'CORRECTED') AND customer_code_raw IS DISTINCT FROM customer_code;
    UPDATE stg.sales_clean s SET dq_note = concat_ws(',', dq_note, 'SA04')
    WHERE dq_status IN ('OK', 'CORRECTED') AND NOT EXISTS (SELECT 1 FROM stg.md_customer_clean c WHERE c.customer_code = s.customer_code);
    UPDATE stg.sales_clean SET dq_note = concat_ws(',', dq_note, 'SA05')
    WHERE dq_status IN ('OK', 'CORRECTED') AND farm_code IS NULL;
    UPDATE stg.sales_clean s SET dq_status = 'CORRECTED', dq_note = concat_ws(',', s.dq_note, 'SA06')
    FROM stg.sales_raw r
    WHERE r.source_file = s.source_file AND r.row_num = s.row_num AND s.dq_status IN ('OK', 'CORRECTED')
      AND coalesce(btrim(r.currency_code), '') = '';

    -- derived measures in N$
    UPDATE stg.sales_clean s
    SET quantity_kg       = round(s.quantity * s.kg_per_uom, 3),
        fx_rate_nad       = fx.nad_per_unit,
        gross_revenue_nad = round(s.quantity * s.unit_price * fx.nad_per_unit, 2),
        discount_nad      = round(s.quantity * s.unit_price * fx.nad_per_unit * s.discount_pct / 100, 2),
        net_revenue_nad   = round(s.quantity * s.unit_price * fx.nad_per_unit, 2)
                            - round(s.quantity * s.unit_price * fx.nad_per_unit * s.discount_pct / 100, 2),
        cogs_nad          = CASE WHEN s.doc_type = 'CRN' THEN 0 ELSE round(s.quantity * s.unit_std_cost_nad, 2) END
    FROM ref.fx_rate_monthly fx
    WHERE fx.currency_code = s.currency_code AND fx.month_start = date_trunc('month', s.invoice_date)::date
      AND s.dq_status IN ('OK', 'CORRECTED');
    UPDATE stg.sales_clean SET price_per_kg_nad = net_revenue_nad / nullif(quantity_kg, 0)
    WHERE dq_status IN ('OK', 'CORRECTED') AND doc_type = 'INV';

    -- SA07 unit-price anomaly versus product-month median (flag only - revenue is not altered)
    UPDATE stg.sales_clean s SET is_price_anomaly = true, dq_note = concat_ws(',', s.dq_note, 'SA07')
    FROM (SELECT product_code, date_trunc('month', invoice_date) AS m,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_kg_nad) AS med
          FROM stg.sales_clean WHERE dq_status IN ('OK', 'CORRECTED') AND doc_type = 'INV'
          GROUP BY 1, 2) md
    WHERE md.product_code = s.product_code AND md.m = date_trunc('month', s.invoice_date)
      AND s.dq_status IN ('OK', 'CORRECTED') AND s.doc_type = 'INV'
      AND (s.price_per_kg_nad > 4 * md.med OR s.price_per_kg_nad < 0.25 * md.med);

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, rule, 'ERP sales', s.invoice_no || '/' || s.line_no || ' (' || s.source_file || ':' || s.row_num || ')',
           CASE rule WHEN 'SA01' THEN 'invoice_no+line_no' WHEN 'SA02' THEN 'product_code' WHEN 'SA03' THEN 'customer_code'
                     WHEN 'SA04' THEN 'customer_code' WHEN 'SA05' THEN 'farm_code' WHEN 'SA06' THEN 'currency_code'
                     WHEN 'SA07' THEN 'unit_price' ELSE 'quantity' END,
           CASE rule WHEN 'SA02' THEN s.product_code_raw WHEN 'SA03' THEN s.customer_code_raw WHEN 'SA04' THEN s.customer_code
                     WHEN 'SA07' THEN s.unit_price::text || ' ' || s.currency_code ELSE NULL END,
           CASE rule WHEN 'SA01' THEN 'Removed duplicate' WHEN 'SA02' THEN 'Mapped to ' || s.product_code
                     WHEN 'SA03' THEN 'Merged to survivor ' || s.customer_code WHEN 'SA04' THEN 'Inferred member created'
                     WHEN 'SA05' THEN 'Loaded to Unknown farm (-1)' WHEN 'SA06' THEN 'Defaulted to ' || s.currency_code
                     WHEN 'SA07' THEN 'Flagged for review (price ' || round(s.price_per_kg_nad, 2) || ' N$/kg)' ELSE 'Rejected' END
    FROM stg.sales_clean s, unnest(string_to_array(s.dq_note, ',')) AS rule
    WHERE s.dq_note IS NOT NULL;

    PERFORM etl.fn_log_step(p_batch, 'transform ERP sales', 'stg.sales_clean',
                         (SELECT count(*) FROM stg.sales_raw),
                         (SELECT count(*) FROM stg.sales_clean WHERE dq_status IN ('OK', 'CORRECTED')),
                         (SELECT count(*) FROM stg.sales_clean WHERE dq_status IN ('REJECTED', 'DUPLICATE')), t0);
END $_$;


--
-- Name: sp_transform_stock(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_stock(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    DELETE FROM stg.stock_clean;
    INSERT INTO stg.stock_clean (farm_code, product_code, snapshot_date, opening_kg, received_kg, dispatched_kg,
                                 shrinkage_kg, closing_kg, closing_value_nad)
    SELECT upper(btrim(farm_code)), upper(btrim(product_code)),
           (to_date(period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date,
           etl.fn_try_numeric(opening_kg), etl.fn_try_numeric(received_kg), etl.fn_try_numeric(dispatched_kg),
           etl.fn_try_numeric(shrinkage_kg), etl.fn_try_numeric(closing_kg), etl.fn_try_numeric(closing_value_nad)
    FROM stg.stock_raw;

    -- ST01 sign error: |closing| satisfies the stock-flow identity
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'ST01', 'Stock system', farm_code || '/' || product_code || '/' || snapshot_date, 'closing_kg', closing_kg::text, 'Sign corrected'
    FROM stg.stock_clean
    WHERE closing_kg < 0 AND abs(opening_kg + received_kg - dispatched_kg - shrinkage_kg + closing_kg) <= 1;
    UPDATE stg.stock_clean SET closing_kg = -closing_kg, dq_status = 'CORRECTED', dq_note = 'ST01'
    WHERE closing_kg < 0 AND abs(opening_kg + received_kg - dispatched_kg - shrinkage_kg + closing_kg) <= 1;

    -- ST02 identity check
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'ST02', 'Stock system', farm_code || '/' || product_code || '/' || snapshot_date, 'closing_kg',
           (opening_kg + received_kg - dispatched_kg - shrinkage_kg - closing_kg)::text, 'Flagged'
    FROM stg.stock_clean WHERE abs(opening_kg + received_kg - dispatched_kg - shrinkage_kg - closing_kg) > 1;

    -- ST03 gaps: month missing although stock was carried (previous closing > 0)
    WITH bounds AS (
        SELECT farm_code, product_code, min(snapshot_date) AS a, max(snapshot_date) AS b FROM stg.stock_clean GROUP BY 1, 2
    ), expected AS (
        SELECT b.farm_code, b.product_code, (g + interval '1 month - 1 day')::date AS snapshot_date
        FROM bounds b, generate_series(date_trunc('month', b.a), date_trunc('month', b.b), interval '1 month') g
    ), series AS (
        SELECT e.farm_code, e.product_code, e.snapshot_date, s.opening_kg, s.closing_kg, s.closing_value_nad,
               count(s.snapshot_date) OVER w AS grp
        FROM expected e
        LEFT JOIN stg.stock_clean s USING (farm_code, product_code, snapshot_date)
        WINDOW w AS (PARTITION BY e.farm_code, e.product_code ORDER BY e.snapshot_date)
    ), gaps AS (
        SELECT g.*,
               first_value(g.closing_kg) OVER (PARTITION BY g.farm_code, g.product_code, g.grp ORDER BY g.snapshot_date) AS prev_close,
               first_value(g.closing_value_nad) OVER (PARTITION BY g.farm_code, g.product_code, g.grp ORDER BY g.snapshot_date) AS prev_value,
               row_number() OVER (PARTITION BY g.farm_code, g.product_code, g.grp ORDER BY g.snapshot_date) - 1 AS k,
               count(*) OVER (PARTITION BY g.farm_code, g.product_code, g.grp) - 1 AS n_missing
        FROM series g
    ), missing AS (
        SELECT m.*,
               (SELECT s.opening_kg FROM stg.stock_clean s WHERE s.farm_code = m.farm_code AND s.product_code = m.product_code
                  AND s.snapshot_date > m.snapshot_date ORDER BY s.snapshot_date LIMIT 1) AS next_open
        FROM gaps m WHERE m.opening_kg IS NULL AND m.k > 0 AND m.prev_close > 0
    ), disp AS (
        SELECT farm_code, product_code, (date_trunc('month', dispatch_date) + interval '1 month - 1 day')::date AS snapshot_date,
               sum(quantity_kg) AS kg
        FROM stg.sales_clean WHERE dq_status IN ('OK', 'CORRECTED') AND doc_type = 'INV' GROUP BY 1, 2, 3
    ), imputed AS (
        SELECT m.farm_code, m.product_code, m.snapshot_date,
               round(m.prev_close + (coalesce(m.next_open, m.prev_close) - m.prev_close) * (m.k - 1) / m.n_missing, 1) AS opening,
               round(m.prev_close + (coalesce(m.next_open, m.prev_close) - m.prev_close) * m.k / m.n_missing, 1) AS closing,
               coalesce(d.kg, 0) AS dispatched,
               m.prev_value / nullif(m.prev_close, 0) AS unit_value
        FROM missing m LEFT JOIN disp d USING (farm_code, product_code, snapshot_date)
    )
    INSERT INTO stg.stock_clean (farm_code, product_code, snapshot_date, opening_kg, received_kg, dispatched_kg, shrinkage_kg,
                                 closing_kg, closing_value_nad, is_imputed, dq_status, dq_note)
    SELECT farm_code, product_code, snapshot_date, opening,
           greatest(0, closing - opening + dispatched), dispatched,
           greatest(0, opening - dispatched - closing),
           closing, round(closing * coalesce(unit_value, 0), 2), true, 'CORRECTED', 'ST03'
    FROM imputed;

    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'ST03', 'Stock system', farm_code || '/' || product_code || '/' || snapshot_date, 'row', 'missing',
           'Imputed from adjacent snapshots and ERP dispatches'
    FROM stg.stock_clean WHERE is_imputed;

    PERFORM etl.fn_log_step(p_batch, 'transform stock movements', 'stg.stock_clean',
                         (SELECT count(*) FROM stg.stock_raw), (SELECT count(*) FROM stg.stock_clean),
                         0, t0, (SELECT count(*) FROM stg.stock_clean WHERE is_imputed) || ' rows imputed');
END $$;


--
-- Name: sp_transform_weather(integer); Type: PROCEDURE; Schema: etl; Owner: -
--

CREATE PROCEDURE etl.sp_transform_weather(IN p_batch integer)
    LANGUAGE plpgsql
    AS $$
DECLARE t0 timestamptz := clock_timestamp();
BEGIN
    DELETE FROM stg.weather_clean;
    INSERT INTO stg.weather_clean (farm_code, obs_date, rainfall_mm, t_max_c, t_min_c, rh_pct, solar_mj_m2)
    WITH doc AS (
        SELECT farm_code, payload -> 'properties' -> 'parameter' AS prm FROM stg.weather_json_raw
    ), longf AS (
        SELECT d.farm_code, prm_name, e.key, nullif(e.value::numeric, -999) AS v
        FROM doc d
        CROSS JOIN unnest(ARRAY['PRECTOTCORR', 'T2M_MAX', 'T2M_MIN', 'RH2M', 'ALLSKY_SFC_SW_DWN']) AS prm_name
        CROSS JOIN LATERAL jsonb_each_text(d.prm -> prm_name) AS e
    )
    SELECT farm_code, to_date(key, 'YYYYMMDD'),
           max(v) FILTER (WHERE prm_name = 'PRECTOTCORR'), max(v) FILTER (WHERE prm_name = 'T2M_MAX'),
           max(v) FILTER (WHERE prm_name = 'T2M_MIN'), max(v) FILTER (WHERE prm_name = 'RH2M'),
           max(v) FILTER (WHERE prm_name = 'ALLSKY_SFC_SW_DWN')
    FROM longf GROUP BY farm_code, key;

    -- WE01 temperatures: interpolate between neighbouring observed days (carry forward at series end)
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'WE01', 'NASA POWER', farm_code || '/' || obs_date, 'T2M_MAX/T2M_MIN', '-999', 'Interpolated'
    FROM stg.weather_clean WHERE t_max_c IS NULL OR t_min_c IS NULL;
    UPDATE stg.weather_clean w
    SET t_max_c = coalesce(w.t_max_c, round((coalesce(px.t_max_c, nx.t_max_c) + coalesce(nx.t_max_c, px.t_max_c)) / 2, 2)),
        t_min_c = coalesce(w.t_min_c, round((coalesce(pn.t_min_c, nn.t_min_c) + coalesce(nn.t_min_c, pn.t_min_c)) / 2, 2)),
        temp_imputed = true
    FROM stg.weather_clean w2
    LEFT JOIN LATERAL (SELECT t_max_c FROM stg.weather_clean x WHERE x.farm_code = w2.farm_code AND x.obs_date < w2.obs_date
                       AND x.t_max_c IS NOT NULL ORDER BY x.obs_date DESC LIMIT 1) px ON true
    LEFT JOIN LATERAL (SELECT t_max_c FROM stg.weather_clean x WHERE x.farm_code = w2.farm_code AND x.obs_date > w2.obs_date
                       AND x.t_max_c IS NOT NULL ORDER BY x.obs_date LIMIT 1) nx ON true
    LEFT JOIN LATERAL (SELECT t_min_c FROM stg.weather_clean x WHERE x.farm_code = w2.farm_code AND x.obs_date < w2.obs_date
                       AND x.t_min_c IS NOT NULL ORDER BY x.obs_date DESC LIMIT 1) pn ON true
    LEFT JOIN LATERAL (SELECT t_min_c FROM stg.weather_clean x WHERE x.farm_code = w2.farm_code AND x.obs_date > w2.obs_date
                       AND x.t_min_c IS NOT NULL ORDER BY x.obs_date LIMIT 1) nn ON true
    WHERE w.farm_code = w2.farm_code AND w.obs_date = w2.obs_date AND (w2.t_max_c IS NULL OR w2.t_min_c IS NULL);

    -- WE02 rainfall: 0 in the dry season (May-Sep), otherwise leave NULL and flag
    INSERT INTO audit.dq_issue_log (batch_id, rule_code, source_object, source_key, column_name, raw_value, action_taken)
    SELECT p_batch, 'WE02', 'NASA POWER', farm_code || '/' || obs_date, 'PRECTOTCORR', '-999',
           CASE WHEN extract(month FROM obs_date) BETWEEN 5 AND 9 THEN 'Set to 0 (dry season)' ELSE 'Left NULL, flagged' END
    FROM stg.weather_clean WHERE rainfall_mm IS NULL;
    UPDATE stg.weather_clean SET rainfall_mm = 0, rainfall_imputed = true
    WHERE rainfall_mm IS NULL AND extract(month FROM obs_date) BETWEEN 5 AND 9;
    UPDATE stg.weather_clean SET rainfall_missing = true WHERE rainfall_mm IS NULL;

    PERFORM etl.fn_log_step(p_batch, 'transform weather', 'stg.weather_clean', (SELECT count(*) FROM stg.weather_json_raw),
                         (SELECT count(*) FROM stg.weather_clean), 0, t0, 'JSON documents expanded to farm-days');
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

COMMENT ON TABLE audit.dq_issue_log IS 'Row-level record of every data-quality rule hit and the action taken.';


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
    CONSTRAINT dq_rule_action_check CHECK ((action = ANY (ARRAY['REJECT'::text, 'CORRECT'::text, 'FLAG'::text, 'MAP'::text, 'IMPUTE'::text, 'MERGE'::text, 'INFER'::text]))),
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

COMMENT ON TABLE audit.etl_batch IS 'One row per pipeline execution (full rebuild or incremental delta).';


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
-- Name: customer_segment; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.customer_segment (
    customer_code character varying(10) NOT NULL,
    segment_id smallint NOT NULL,
    segment_name character varying(40) NOT NULL,
    recency_days integer NOT NULL,
    frequency_invoices integer NOT NULL,
    monetary_nad numeric(16,2) NOT NULL,
    avg_order_kg numeric(14,1) NOT NULL,
    product_breadth smallint NOT NULL,
    silhouette_sample numeric(6,4),
    model_run_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE customer_segment; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.customer_segment IS 'Model output: K-means customer segment per durable customer code (RFM + basket features, trailing 12 months).';


--
-- Name: COLUMN customer_segment.customer_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.customer_code IS 'Durable customer code. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.segment_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.segment_id IS 'Cluster number. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.segment_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.segment_name IS 'Business label of the cluster. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.recency_days; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.recency_days IS 'Days since last invoice at 30 Sep 2026. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.frequency_invoices; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.frequency_invoices IS 'Distinct invoices in the trailing 12 months. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.monetary_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.monetary_nad IS 'Net revenue in the trailing 12 months, N$. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.avg_order_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.avg_order_kg IS 'Average kg per invoice line. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.product_breadth; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.product_breadth IS 'Distinct products bought. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.silhouette_sample; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.silhouette_sample IS 'Silhouette value of the customer within its cluster. | Source: clustering.py';


--
-- Name: COLUMN customer_segment.model_run_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.customer_segment.model_run_at IS 'Audit: model run timestamp. | Source: clustering.py';


--
-- Name: dim_commodity; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_commodity (
    commodity_key smallint NOT NULL,
    commodity_code character varying(16) NOT NULL,
    commodity_name character varying(40) NOT NULL,
    source_series_name character varying(30) NOT NULL,
    price_unit character varying(10) NOT NULL,
    commodity_role character varying(14) NOT NULL,
    crop_key smallint NOT NULL,
    source_name character varying(40) NOT NULL,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_commodity; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_commodity IS 'International commodity price series (output prices for crops, input prices for fertiliser and fuel). SCD Type 1.';


--
-- Name: COLUMN dim_commodity.commodity_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.commodity_key IS 'Surrogate key. | Source: ETL';


--
-- Name: COLUMN dim_commodity.commodity_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.commodity_code IS 'Series code (natural key), e.g. MAIZE, UREA. | Source: ref.commodity_series';


--
-- Name: COLUMN dim_commodity.commodity_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.commodity_name IS 'Descriptive series name. | Source: World Bank Pink Sheet header';


--
-- Name: COLUMN dim_commodity.source_series_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.source_series_name IS 'Column header in the Pink Sheet workbook. | Source: World Bank Pink Sheet';


--
-- Name: COLUMN dim_commodity.price_unit; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.price_unit IS 'Unit of the published price (USD/mt, USD/bbl). | Source: World Bank Pink Sheet';


--
-- Name: COLUMN dim_commodity.commodity_role; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.commodity_role IS 'Output price (crop sold) or Input price (cost driver). | Source: derived';


--
-- Name: COLUMN dim_commodity.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.crop_key IS 'Crop benchmarked by the series (sorghum proxies mahangu; -2 for input series). | Source: ETL mapping';


--
-- Name: COLUMN dim_commodity.source_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.source_name IS 'Publisher of the series. | Source: derived';


--
-- Name: COLUMN dim_commodity.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_commodity.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: dim_cost_category; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_cost_category (
    cost_category_key smallint NOT NULL,
    cost_category_code character(4) NOT NULL,
    cost_category_name character varying(40) NOT NULL,
    cost_group character varying(30) NOT NULL,
    cost_behaviour character varying(15) NOT NULL,
    gl_account character(4),
    quantity_uom character varying(6),
    is_crop_specific boolean NOT NULL,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_cost_category; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_cost_category IS 'Production cost category with cost group and behaviour (variable/fixed). SCD Type 1.';


--
-- Name: COLUMN dim_cost_category.cost_category_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.cost_category_key IS 'Surrogate key (-1 Unknown). | Source: ETL';


--
-- Name: COLUMN dim_cost_category.cost_category_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.cost_category_code IS 'Cost category code CC01..CC14 (natural key). | Source: Master data workbook, sheet Cost_Categories';


--
-- Name: COLUMN dim_cost_category.cost_category_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.cost_category_name IS 'Cost category name. | Source: Master data workbook';


--
-- Name: COLUMN dim_cost_category.cost_group; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.cost_group IS 'Cost group: Direct inputs, Labour, Energy & water, Mechanisation, Packaging & logistics, Overheads. | Source: Master data workbook';


--
-- Name: COLUMN dim_cost_category.cost_behaviour; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.cost_behaviour IS 'Variable, Semi-variable or Fixed. | Source: Master data workbook';


--
-- Name: COLUMN dim_cost_category.gl_account; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.gl_account IS 'General-ledger account number. | Source: Master data workbook';


--
-- Name: COLUMN dim_cost_category.quantity_uom; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.quantity_uom IS 'Unit of the physical input quantity (kg, l, hours, kWh, m3) where captured. | Source: Master data workbook';


--
-- Name: COLUMN dim_cost_category.is_crop_specific; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.is_crop_specific IS 'False for farm overheads that are not allocated to a crop cycle. | Source: derived (Fixed behaviour)';


--
-- Name: COLUMN dim_cost_category.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_cost_category.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: dim_crop; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_crop (
    crop_key smallint NOT NULL,
    crop_code character(3) NOT NULL,
    crop_name character varying(40) NOT NULL,
    crop_category_key smallint NOT NULL,
    scientific_name character varying(60),
    is_nab_controlled boolean,
    storage_type character varying(30),
    shelf_life_days smallint,
    typical_cull_pct numeric(5,2),
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_crop; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_crop IS 'Crop (middle level of the product snowflake). Also a conformed shrunken dimension: harvest, cost, cycle, market-price and NSA facts are recorded at crop grain. SCD Type 1.';


--
-- Name: COLUMN dim_crop.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.crop_key IS 'Surrogate key (-1 Unknown, -2 Not crop-specific / farm overhead). | Source: ETL';


--
-- Name: COLUMN dim_crop.crop_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.crop_code IS 'Three-letter crop code (natural key), e.g. MZW = white maize. | Source: Master data workbook, sheet Crops';


--
-- Name: COLUMN dim_crop.crop_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.crop_name IS 'Crop name. | Source: Master data workbook, sheet Crops';


--
-- Name: COLUMN dim_crop.crop_category_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.crop_category_key IS 'FK to dim_crop_category (snowflake). | Source: ETL lookup on category_code';


--
-- Name: COLUMN dim_crop.scientific_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.scientific_name IS 'Botanical name. | Source: Master data workbook';


--
-- Name: COLUMN dim_crop.is_nab_controlled; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.is_nab_controlled IS 'True if the crop is a Namibian Agronomic Board controlled product (border closures / Market Share Promotion apply). | Source: Master data workbook';


--
-- Name: COLUMN dim_crop.storage_type; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.storage_type IS 'Post-harvest storage type (Silo, Cold room, ...). | Source: Master data workbook';


--
-- Name: COLUMN dim_crop.shelf_life_days; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.shelf_life_days IS 'Typical shelf life in days. | Source: Master data workbook';


--
-- Name: COLUMN dim_crop.typical_cull_pct; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.typical_cull_pct IS 'Typical % of harvested mass culled at grading. | Source: Master data workbook';


--
-- Name: COLUMN dim_crop.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: COLUMN dim_crop.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop.dw_updated_at IS 'Audit: last Type 1 update timestamp. | Source: ETL';


--
-- Name: dim_crop_category; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_crop_category (
    crop_category_key smallint NOT NULL,
    category_code character(3) NOT NULL,
    category_name character varying(30) NOT NULL,
    sector character varying(20) NOT NULL,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_crop_category; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_crop_category IS 'Top level of the snowflaked product hierarchy (Cereals & grains, Vegetables, Fruit). SCD Type 1.';


--
-- Name: COLUMN dim_crop_category.crop_category_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop_category.crop_category_key IS 'Surrogate key (-1 Unknown, -2 Not applicable). | Source: ETL';


--
-- Name: COLUMN dim_crop_category.category_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop_category.category_code IS 'Category code (natural key): CER, VEG, FRU. | Source: Master data workbook, sheet Crop_Categories';


--
-- Name: COLUMN dim_crop_category.category_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop_category.category_name IS 'Category name. | Source: Master data workbook, sheet Crop_Categories';


--
-- Name: COLUMN dim_crop_category.sector; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop_category.sector IS 'Agricultural sector: Field crops or Horticulture. | Source: Master data workbook';


--
-- Name: COLUMN dim_crop_category.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_crop_category.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: dim_customer; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_customer (
    customer_key integer NOT NULL,
    customer_code character varying(10) NOT NULL,
    customer_name character varying(80) NOT NULL,
    customer_type character varying(24),
    town character varying(40),
    region_key smallint NOT NULL,
    country_code character(2),
    country_name character varying(30),
    market_group character varying(20),
    currency_code character(3),
    onboarding_date date,
    customer_status character varying(10),
    channel character varying(20),
    credit_terms_days smallint,
    is_key_account boolean,
    is_inferred boolean DEFAULT false NOT NULL,
    merged_codes text,
    scd_effective_from date NOT NULL,
    scd_effective_to date DEFAULT '9999-12-31'::date NOT NULL,
    scd_is_current boolean NOT NULL,
    scd_version smallint NOT NULL,
    scd_row_hash character(32) NOT NULL,
    dw_batch_id integer,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_dim_customer_dates CHECK ((scd_effective_to >= scd_effective_from))
);


--
-- Name: TABLE dim_customer; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_customer IS 'Customer (business, institution, pseudonymised informal trader or export buyer). SCD Type 2 on channel, credit terms and key-account flag; Type 1 elsewhere. Supports inferred (late-arriving) members.';


--
-- Name: COLUMN dim_customer.customer_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.customer_key IS 'Surrogate key per customer VERSION (-1 Unknown). | Source: ETL identity';


--
-- Name: COLUMN dim_customer.customer_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.customer_code IS 'Durable natural key from ERP/MDM, e.g. C00042 (duplicates merged to survivor). | Source: Master data workbook, sheet Customers';


--
-- Name: COLUMN dim_customer.customer_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.customer_name IS 'Trading name (Type 1). Informal traders carry a pseudonymous label only. | Source: Master data workbook (rule MD05 formatting)';


--
-- Name: COLUMN dim_customer.customer_type; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.customer_type IS 'Business, Government institution, Informal trader or Export (Type 1). | Source: Master data workbook';


--
-- Name: COLUMN dim_customer.town; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.town IS 'Delivery town (Type 1). | Source: Master data workbook';


--
-- Name: COLUMN dim_customer.region_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.region_key IS 'FK to dim_region for domestic customers; -2 for foreign customers, -1 when missing (rule MD02). | Source: ETL via ref.region_alias';


--
-- Name: COLUMN dim_customer.country_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.country_code IS 'ISO 3166-1 alpha-2 country. | Source: Master data workbook';


--
-- Name: COLUMN dim_customer.country_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.country_name IS 'Country name. | Source: ref.country';


--
-- Name: COLUMN dim_customer.market_group; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.market_group IS 'Market grouping: Domestic, SACU, SADC (non-SACU), Europe, Middle East. | Source: ref.country';


--
-- Name: COLUMN dim_customer.currency_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.currency_code IS 'Invoicing currency (NAD, ZAR, USD, EUR, GBP). | Source: Master data workbook';


--
-- Name: COLUMN dim_customer.onboarding_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.onboarding_date IS 'Date the account was opened. | Source: Master data workbook';


--
-- Name: COLUMN dim_customer.customer_status; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.customer_status IS 'Active or Inactive at extract date (Type 1). | Source: Master data workbook';


--
-- Name: COLUMN dim_customer.channel; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.channel IS 'Sales channel in this version: Miller/Processor, Wholesale, Retail, Informal market, Institutional, Export (Type 2). | Source: Master data + Customer_History';


--
-- Name: COLUMN dim_customer.credit_terms_days; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.credit_terms_days IS 'Payment terms in days in this version (0 = cash on delivery) (Type 2). | Source: Master data + Customer_History';


--
-- Name: COLUMN dim_customer.is_key_account; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.is_key_account IS 'Key-account flag in this version (Type 2). | Source: Master data + Customer_History';


--
-- Name: COLUMN dim_customer.is_inferred; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.is_inferred IS 'True for an inferred member created from a fact before the master record arrived (rule SA04). | Source: ETL';


--
-- Name: COLUMN dim_customer.merged_codes; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.merged_codes IS 'Duplicate customer codes merged into this survivor (rule MD04). | Source: ref.customer_xref';


--
-- Name: COLUMN dim_customer.scd_effective_from; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.scd_effective_from IS 'First date this version is valid. | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_customer.scd_effective_to; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.scd_effective_to IS 'Last date this version is valid (9999-12-31 = open). | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_customer.scd_is_current; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.scd_is_current IS 'True for the current version. | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_customer.scd_version; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.scd_version IS 'Version sequence number per customer_code. | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_customer.scd_row_hash; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.scd_row_hash IS 'MD5 of the Type 2 attributes. | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_customer.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.dw_batch_id IS 'Audit: ETL batch that created/last updated the row. | Source: ETL';


--
-- Name: COLUMN dim_customer.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: COLUMN dim_customer.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_customer.dw_updated_at IS 'Audit: last update timestamp. | Source: ETL';


--
-- Name: dim_customer_customer_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.dim_customer ALTER COLUMN customer_key ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME dw.dim_customer_customer_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


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
    iso_week smallint,
    week_start_date date,
    month_num smallint,
    month_name character varying(9),
    month_short character(3),
    year_month character(7),
    year_month_key integer,
    month_start_date date,
    month_end_date date,
    is_month_end boolean,
    days_in_month smallint,
    quarter_num smallint,
    year_quarter character(7),
    calendar_year smallint,
    fiscal_year smallint,
    fiscal_year_label character(6),
    fiscal_quarter_num smallint,
    fiscal_quarter_label character(10),
    fiscal_month_num smallint,
    fiscal_year_start date,
    fiscal_year_end date,
    crop_season_start_year smallint,
    crop_season_label character(7),
    season_month_num smallint,
    is_current_month boolean,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_date IS 'Conformed calendar dimension, one row per day 2020-01-01..2027-12-31 plus -1 Unknown; carries calendar, fiscal (Apr-Mar) and agricultural season (Oct-Sep) hierarchies.';


--
-- Name: COLUMN dim_date.date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.date_key IS 'Smart surrogate key YYYYMMDD (-1 = unknown / not yet occurred). | Source: generated by etl.sp_load_dim_date';


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

COMMENT ON COLUMN dw.dim_date.day_short IS 'Three-letter weekday abbreviation. | Source: derived';


--
-- Name: COLUMN dim_date.is_weekend; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_weekend IS 'True for Saturday and Sunday. | Source: derived';


--
-- Name: COLUMN dim_date.is_public_holiday; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_public_holiday IS 'True on Namibian public holidays (Public Holidays Act 26 of 1990 incl. Sunday->Monday rule). | Source: etl.fn_namibian_holiday';


--
-- Name: COLUMN dim_date.holiday_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.holiday_name IS 'Name of the Namibian public holiday, NULL otherwise. | Source: etl.fn_namibian_holiday';


--
-- Name: COLUMN dim_date.is_working_day; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_working_day IS 'Farm working day: Monday-Saturday and not a public holiday. | Source: derived';


--
-- Name: COLUMN dim_date.iso_week; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.iso_week IS 'ISO-8601 week number. | Source: derived';


--
-- Name: COLUMN dim_date.week_start_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.week_start_date IS 'Monday of the ISO week. | Source: derived';


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

COMMENT ON COLUMN dw.dim_date.month_short IS 'Three-letter month abbreviation. | Source: derived';


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

COMMENT ON COLUMN dw.dim_date.month_end_date IS 'Last day of the month (key used by month-grain facts). | Source: derived';


--
-- Name: COLUMN dim_date.is_month_end; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_month_end IS 'True on the last day of the month. | Source: derived';


--
-- Name: COLUMN dim_date.days_in_month; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.days_in_month IS 'Number of days in the month. | Source: derived';


--
-- Name: COLUMN dim_date.quarter_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.quarter_num IS 'Calendar quarter 1-4. | Source: derived';


--
-- Name: COLUMN dim_date.year_quarter; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.year_quarter IS 'Calendar year-quarter label YYYY-Qn. | Source: derived';


--
-- Name: COLUMN dim_date.calendar_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.calendar_year IS 'Calendar year. | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_year IS 'Green Basket fiscal year (1 April - 31 March) named by its end year, e.g. FY2026 = Apr 2025-Mar 2026. | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_year_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_year_label IS 'Fiscal year label FYyyyy. | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_quarter_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_quarter_num IS 'Fiscal quarter 1-4 (FQ1 = Apr-Jun). | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_quarter_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_quarter_label IS 'Fiscal quarter label, e.g. FY2026-FQ1. | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_month_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_month_num IS 'Month number within the fiscal year (April = 1). | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_year_start; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_year_start IS 'First day of the fiscal year. | Source: derived';


--
-- Name: COLUMN dim_date.fiscal_year_end; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.fiscal_year_end IS 'Last day of the fiscal year. | Source: derived';


--
-- Name: COLUMN dim_date.crop_season_start_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.crop_season_start_year IS 'Start year of the agricultural season (1 October - 30 September). | Source: derived';


--
-- Name: COLUMN dim_date.crop_season_label; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.crop_season_label IS 'Agricultural season label, e.g. 2023/24 (NSA/MAFWLR convention). | Source: derived';


--
-- Name: COLUMN dim_date.season_month_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.season_month_num IS 'Month number within the agricultural season (October = 1). | Source: derived';


--
-- Name: COLUMN dim_date.is_current_month; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.is_current_month IS 'True for days in the month of the data cut-off (30 Sep 2026). | Source: derived';


--
-- Name: COLUMN dim_date.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_date.dw_created_at IS 'Audit: timestamp the row was created. | Source: ETL';


--
-- Name: dim_farm; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_farm (
    farm_key integer NOT NULL,
    farm_code character varying(10) NOT NULL,
    farm_name character varying(60) NOT NULL,
    region_key smallint NOT NULL,
    town character varying(40),
    latitude numeric(9,5),
    longitude numeric(9,5),
    elevation_m integer,
    total_ha numeric(10,1),
    established_year smallint,
    harvest_log_template character(1),
    cultivated_ha numeric(10,1),
    irrigation_type character varying(24),
    is_irrigated boolean,
    water_source character varying(40),
    farm_manager_code character varying(10),
    is_globalgap_certified boolean,
    scd_effective_from date NOT NULL,
    scd_effective_to date DEFAULT '9999-12-31'::date NOT NULL,
    scd_is_current boolean NOT NULL,
    scd_version smallint NOT NULL,
    scd_row_hash character(32) NOT NULL,
    dw_batch_id integer,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_dim_farm_dates CHECK ((scd_effective_to >= scd_effective_from))
);


--
-- Name: TABLE dim_farm; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_farm IS 'Farm unit. SCD Type 2 on cultivated_ha, irrigation_type, water_source, farm_manager_code and GlobalG.A.P. status; Type 1 on name/location. Snowflaked to dim_region.';


--
-- Name: COLUMN dim_farm.farm_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.farm_key IS 'Surrogate key: one value per farm VERSION (-1 Unknown). Facts store the version valid on the event date. | Source: ETL identity';


--
-- Name: COLUMN dim_farm.farm_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.farm_code IS 'Durable natural key, e.g. GB-KAW-01. | Source: Master data workbook, sheet Farms';


--
-- Name: COLUMN dim_farm.farm_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.farm_name IS 'Farm unit name (Type 1 - corrections overwrite all versions). | Source: Master data workbook, sheet Farms';


--
-- Name: COLUMN dim_farm.region_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.region_key IS 'FK to dim_region (snowflake outrigger). | Source: ETL via ref.region_alias (rule MD01)';


--
-- Name: COLUMN dim_farm.town; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.town IS 'Nearest town (Type 1). | Source: Master data workbook';


--
-- Name: COLUMN dim_farm.latitude; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.latitude IS 'Latitude in decimal degrees (WGS84), used to request NASA POWER weather. | Source: Master data workbook';


--
-- Name: COLUMN dim_farm.longitude; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.longitude IS 'Longitude in decimal degrees (WGS84). | Source: Master data workbook';


--
-- Name: COLUMN dim_farm.elevation_m; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.elevation_m IS 'Elevation in metres. | Source: Master data workbook';


--
-- Name: COLUMN dim_farm.total_ha; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.total_ha IS 'Total farm area in hectares (Type 1). | Source: Master data workbook';


--
-- Name: COLUMN dim_farm.established_year; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.established_year IS 'Year the farm unit joined Green Basket (Type 1). | Source: Master data workbook';


--
-- Name: COLUMN dim_farm.harvest_log_template; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.harvest_log_template IS 'Layout of the farm''s harvest log export (A, B, C). | Source: Master data workbook';


--
-- Name: COLUMN dim_farm.cultivated_ha; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.cultivated_ha IS 'Cultivated (arable) hectares in this version (Type 2). | Source: Master data workbook + Farm_History';


--
-- Name: COLUMN dim_farm.irrigation_type; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.irrigation_type IS 'Primary irrigation system in this version: Dryland, Centre pivot, Drip, Drip + shade-net, Flood (canal) (Type 2). | Source: Master data workbook + Farm_History';


--
-- Name: COLUMN dim_farm.is_irrigated; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.is_irrigated IS 'True when irrigation_type <> Dryland (Type 2, derived). | Source: derived';


--
-- Name: COLUMN dim_farm.water_source; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.water_source IS 'Main water source in this version (Type 2). | Source: Master data workbook + Farm_History';


--
-- Name: COLUMN dim_farm.farm_manager_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.farm_manager_code IS 'Pseudonymised employee code of the farm manager in this version (Type 2; no names stored). | Source: Master data workbook + Farm_History';


--
-- Name: COLUMN dim_farm.is_globalgap_certified; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.is_globalgap_certified IS 'GlobalG.A.P. certification status in this version; gates export-grade sales (Type 2). | Source: Master data workbook + Farm_History';


--
-- Name: COLUMN dim_farm.scd_effective_from; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.scd_effective_from IS 'First date this version is valid (1900-01-01 for the first version). | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_farm.scd_effective_to; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.scd_effective_to IS 'Last date this version is valid (9999-12-31 for the current version). | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_farm.scd_is_current; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.scd_is_current IS 'True for the current version (exactly one per farm_code). | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_farm.scd_version; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.scd_version IS 'Version sequence number per farm_code. | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_farm.scd_row_hash; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.scd_row_hash IS 'MD5 of the Type 2 attributes, used for change detection and idempotent re-runs. | Source: ETL (SCD2)';


--
-- Name: COLUMN dim_farm.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.dw_batch_id IS 'Audit: ETL batch that created/last updated the row. | Source: ETL';


--
-- Name: COLUMN dim_farm.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: COLUMN dim_farm.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_farm.dw_updated_at IS 'Audit: last update timestamp. | Source: ETL';


--
-- Name: dim_farm_farm_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.dim_farm ALTER COLUMN farm_key ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME dw.dim_farm_farm_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dim_product; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_product (
    product_key integer NOT NULL,
    product_code character varying(16) NOT NULL,
    product_name character varying(60) NOT NULL,
    crop_key smallint NOT NULL,
    grade character varying(12),
    pack_type character varying(24),
    sales_uom character varying(8),
    net_weight_kg numeric(10,3),
    kg_per_sales_uom numeric(10,3) NOT NULL,
    is_export_grade boolean,
    is_active boolean,
    net_weight_imputed boolean DEFAULT false NOT NULL,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_product; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_product IS 'Saleable SKU (crop x grade x pack). Lowest level of the snowflake product -> crop -> category. SCD Type 1 (attributes are corrections, not business changes).';


--
-- Name: COLUMN dim_product.product_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.product_key IS 'Surrogate key (identity; -1 Unknown). | Source: ETL';


--
-- Name: COLUMN dim_product.product_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.product_code IS 'ERP product code (natural key), e.g. TOM-C1-C10. | Source: Master data workbook, sheet Products';


--
-- Name: COLUMN dim_product.product_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.product_name IS 'Product description. | Source: Master data workbook, sheet Products';


--
-- Name: COLUMN dim_product.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.crop_key IS 'FK to dim_crop (snowflake). | Source: ETL lookup on crop_code';


--
-- Name: COLUMN dim_product.grade; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.grade IS 'Quality grade (WM1/WM2 maize grades, B1/B3 wheat grades, Class 1/2, Export/Local). | Source: Master data workbook';


--
-- Name: COLUMN dim_product.pack_type; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.pack_type IS 'Packaging format (Bulk, 10kg crate, 4.5kg carton ...). | Source: Master data workbook';


--
-- Name: COLUMN dim_product.sales_uom; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.sales_uom IS 'Unit of measure used on invoices (t, crate, bag, head ...). | Source: Master data workbook';


--
-- Name: COLUMN dim_product.net_weight_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.net_weight_kg IS 'Net kg per pack unit as recorded in master data (NULL for bulk). | Source: Master data workbook';


--
-- Name: COLUMN dim_product.kg_per_sales_uom; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.kg_per_sales_uom IS 'Conversion factor from invoice quantity to kg (1000 for tonnes). | Source: derived (rule MD03 imputes missing weights)';


--
-- Name: COLUMN dim_product.is_export_grade; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.is_export_grade IS 'True for export-grade SKUs (requires GlobalG.A.P.-certified farm). | Source: Master data workbook';


--
-- Name: COLUMN dim_product.is_active; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.is_active IS 'Product currently sold. | Source: Master data workbook';


--
-- Name: COLUMN dim_product.net_weight_imputed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.net_weight_imputed IS 'True when kg_per_sales_uom was imputed by rule MD03. | Source: ETL';


--
-- Name: COLUMN dim_product.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: COLUMN dim_product.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_product.dw_updated_at IS 'Audit: last Type 1 update timestamp. | Source: ETL';


--
-- Name: dim_product_product_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.dim_product ALTER COLUMN product_key ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME dw.dim_product_product_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dim_region; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.dim_region (
    region_key smallint NOT NULL,
    region_code character(5) NOT NULL,
    region_name character varying(30) NOT NULL,
    zone_code character(2) NOT NULL,
    zone_name character varying(20) NOT NULL,
    capital_town character varying(30),
    is_northern_crop_region boolean NOT NULL,
    dw_created_at timestamp with time zone DEFAULT now() NOT NULL,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dim_region; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.dim_region IS 'Conformed geography (Namibia''s 14 regions) with management zone. Outrigger of dim_farm/dim_customer and the region grain of fact_crop_estimate. SCD Type 1.';


--
-- Name: COLUMN dim_region.region_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.region_key IS 'Surrogate key (-1 = Unknown). | Source: ETL';


--
-- Name: COLUMN dim_region.region_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.region_code IS 'ISO 3166-2:NA region code (natural key), e.g. NA-KE. | Source: Master data workbook, sheet Regions';


--
-- Name: COLUMN dim_region.region_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.region_name IS 'Official region name. | Source: Master data workbook, sheet Regions';


--
-- Name: COLUMN dim_region.zone_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.zone_code IS 'Green Basket management zone code (NC, NE, NW, CE, SO); drives row-level security. | Source: Master data workbook, sheet Regions';


--
-- Name: COLUMN dim_region.zone_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.zone_name IS 'Management zone name (North-Central, North-East, North-West, Central, South). | Source: Master data workbook';


--
-- Name: COLUMN dim_region.capital_town; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.capital_town IS 'Regional capital. | Source: Master data workbook';


--
-- Name: COLUMN dim_region.is_northern_crop_region; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.is_northern_crop_region IS 'True for the northern communal crop-growing regions (NC, NE, NW zones) used in NSA crop reports. | Source: derived from zone_code';


--
-- Name: COLUMN dim_region.dw_created_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.dw_created_at IS 'Audit: row creation timestamp. | Source: ETL';


--
-- Name: COLUMN dim_region.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.dim_region.dw_updated_at IS 'Audit: last Type 1 update timestamp. | Source: ETL';


--
-- Name: fact_crop_cycle; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_crop_cycle (
    crop_cycle_key bigint NOT NULL,
    cycle_id character varying(24) NOT NULL,
    block_id character varying(6) NOT NULL,
    farm_key integer NOT NULL,
    crop_key smallint NOT NULL,
    planting_date_key integer NOT NULL,
    first_harvest_date_key integer NOT NULL,
    last_harvest_date_key integer NOT NULL,
    harvest_season_end_date_key integer NOT NULL,
    cycle_status character varying(10) NOT NULL,
    variety character varying(30),
    irrigation_method character varying(20) NOT NULL,
    is_irrigated boolean NOT NULL,
    planted_ha numeric(10,2) NOT NULL,
    harvested_ha numeric(10,2),
    planned_yield_t_ha numeric(8,2),
    planned_production_kg numeric(14,1),
    harvested_kg numeric(14,1) DEFAULT 0 NOT NULL,
    harvest_event_count integer DEFAULT 0 NOT NULL,
    days_to_first_harvest integer,
    harvest_duration_days integer,
    direct_cost_nad numeric(16,2) DEFAULT 0 NOT NULL,
    fertiliser_kg numeric(14,1) DEFAULT 0 NOT NULL,
    planted_ha_imputed boolean DEFAULT false NOT NULL,
    dw_batch_id integer NOT NULL,
    dw_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fact_crop_cycle_cycle_status_check CHECK (((cycle_status)::text = ANY ((ARRAY['Growing'::character varying, 'Harvesting'::character varying, 'Completed'::character varying, 'Failed'::character varying])::text[])))
);


--
-- Name: TABLE fact_crop_cycle; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_crop_cycle IS 'Accumulating snapshot. GRAIN: one row per planted field block per crop cycle; milestone dates and measures are updated as the cycle moves from Growing to Harvesting to Completed.';


--
-- Name: COLUMN fact_crop_cycle.crop_cycle_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.crop_cycle_key IS 'Fact surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_crop_cycle.cycle_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.cycle_id IS 'Degenerate: crop-cycle id farm/crop/year+slot, e.g. GB-KAW-01/MZW/2023S. | Source: planting register';


--
-- Name: COLUMN fact_crop_cycle.block_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.block_id IS 'Degenerate: field block code. | Source: planting register';


--
-- Name: COLUMN fact_crop_cycle.farm_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.farm_key IS 'FK to the dim_farm version valid on the planting date (as-was irrigation regime). | Source: planting register farm_code';


--
-- Name: COLUMN fact_crop_cycle.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.crop_key IS 'FK to dim_crop. | Source: planting register crop_code';


--
-- Name: COLUMN fact_crop_cycle.planting_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.planting_date_key IS 'Milestone 1 (role-playing date, active in BI): planting / bud-break date. | Source: planting register (rule PL01)';


--
-- Name: COLUMN fact_crop_cycle.first_harvest_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.first_harvest_date_key IS 'Milestone 2 (role-playing date): first harvest record (-1 = not yet). | Source: derived from fact_harvest';


--
-- Name: COLUMN fact_crop_cycle.last_harvest_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.last_harvest_date_key IS 'Milestone 3 (role-playing date): latest harvest record to date (-1 = not yet). | Source: derived from fact_harvest';


--
-- Name: COLUMN fact_crop_cycle.harvest_season_end_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.harvest_season_end_date_key IS 'Role-playing date: 30 September closing the agricultural season of the (expected) first harvest; conforms with fact_crop_estimate. | Source: derived';


--
-- Name: COLUMN fact_crop_cycle.cycle_status; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.cycle_status IS 'Growing, Harvesting, Completed or Failed as at the extract date. | Source: planting register validated against harvest log (rule PL03)';


--
-- Name: COLUMN fact_crop_cycle.variety; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.variety IS 'Cultivar planted. | Source: planting register';


--
-- Name: COLUMN fact_crop_cycle.irrigation_method; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.irrigation_method IS 'Degenerate: irrigation method of THIS block in this cycle (Dryland, Centre pivot, Drip, ...); can differ from the farm''s main system, e.g. a borehole pivot block on a dryland farm. | Source: planting register (fallback: dim_farm as-was)';


--
-- Name: COLUMN fact_crop_cycle.is_irrigated; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.is_irrigated IS 'Degenerate: true when the block was irrigated in this cycle. | Source: derived from irrigation_method';


--
-- Name: COLUMN fact_crop_cycle.planted_ha; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.planted_ha IS 'Planted area of the block in hectares (additive). | Source: planting register (rule PL02 imputes)';


--
-- Name: COLUMN fact_crop_cycle.harvested_ha; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.harvested_ha IS 'Harvested area in hectares once Completed (0 if Failed, NULL while open) (additive). | Source: planting register';


--
-- Name: COLUMN fact_crop_cycle.planned_yield_t_ha; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.planned_yield_t_ha IS 'Budgeted yield t/ha at planting (non-additive). | Source: planting register';


--
-- Name: COLUMN fact_crop_cycle.planned_production_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.planned_production_kg IS 'Budgeted production = planned yield x planted ha x 1000 (additive). | Source: derived';


--
-- Name: COLUMN fact_crop_cycle.harvested_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.harvested_kg IS 'Cumulative harvested kg to date (additive). | Source: aggregated from fact_harvest';


--
-- Name: COLUMN fact_crop_cycle.harvest_event_count; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.harvest_event_count IS 'Number of harvest records to date (additive). | Source: aggregated from fact_harvest';


--
-- Name: COLUMN fact_crop_cycle.days_to_first_harvest; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.days_to_first_harvest IS 'Days from planting to first harvest (non-additive; average in BI). | Source: derived';


--
-- Name: COLUMN fact_crop_cycle.harvest_duration_days; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.harvest_duration_days IS 'Days between first and last harvest record (non-additive). | Source: derived';


--
-- Name: COLUMN fact_crop_cycle.direct_cost_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.direct_cost_nad IS 'Crop-cycle direct cost allocated to the block by planted-area share, N$ (additive). | Source: cost ledger cost_centre = cycle_id';


--
-- Name: COLUMN fact_crop_cycle.fertiliser_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.fertiliser_kg IS 'Fertiliser applied, allocated by area share (additive). | Source: cost ledger input_qty (CC02)';


--
-- Name: COLUMN fact_crop_cycle.planted_ha_imputed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.planted_ha_imputed IS 'True when planted_ha was imputed by rule PL02. | Source: ETL';


--
-- Name: COLUMN fact_crop_cycle.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.dw_batch_id IS 'Audit: ETL batch that last updated the row. | Source: ETL';


--
-- Name: COLUMN fact_crop_cycle.dw_updated_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_cycle.dw_updated_at IS 'Audit: last update timestamp (accumulating snapshot rows are updated in place). | Source: ETL';


--
-- Name: fact_crop_cycle_crop_cycle_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_crop_cycle ALTER COLUMN crop_cycle_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_crop_cycle_crop_cycle_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_crop_estimate; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_crop_estimate (
    crop_estimate_key bigint NOT NULL,
    season_end_date_key integer NOT NULL,
    region_key smallint NOT NULL,
    crop_key smallint NOT NULL,
    farming_sector character varying(10) NOT NULL,
    area_planted_ha numeric(12,1),
    production_t numeric(14,1),
    yield_t_ha numeric(8,3),
    is_yield_derived boolean DEFAULT false NOT NULL,
    release_date date,
    source_table character varying(80),
    dw_batch_id integer NOT NULL,
    CONSTRAINT fact_crop_estimate_farming_sector_check CHECK (((farming_sector)::text = ANY ((ARRAY['Communal'::character varying, 'Commercial'::character varying])::text[])))
);


--
-- Name: TABLE fact_crop_estimate; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_crop_estimate IS 'Benchmark fact (external). GRAIN: one row per agricultural season x region x crop x farming sector. Area/production additive; yield non-additive (recompute as production/area).';


--
-- Name: COLUMN fact_crop_estimate.crop_estimate_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.crop_estimate_key IS 'Fact surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_crop_estimate.season_end_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.season_end_date_key IS 'FK to dim_date: 30 September closing the agricultural season. | Source: NSA season text e.g. 2023/2024';


--
-- Name: COLUMN fact_crop_estimate.region_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.region_key IS 'FK to dim_region (conformed geography). | Source: NSA region text via ref.region_alias';


--
-- Name: COLUMN fact_crop_estimate.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.crop_key IS 'FK to dim_crop (rule CE01 excludes out-of-scope crops). | Source: NSA crop text via ref.crop_alias';


--
-- Name: COLUMN fact_crop_estimate.farming_sector; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.farming_sector IS 'Communal or Commercial farming sector. | Source: NSA / MAFWLR table';


--
-- Name: COLUMN fact_crop_estimate.area_planted_ha; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.area_planted_ha IS 'Area planted, ha (additive). | Source: NSA / MAFWLR crop estimates';


--
-- Name: COLUMN fact_crop_estimate.production_t; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.production_t IS 'Production, tonnes (additive). | Source: NSA / MAFWLR crop estimates';


--
-- Name: COLUMN fact_crop_estimate.yield_t_ha; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.yield_t_ha IS 'Published (or derived) yield, t/ha (non-additive). | Source: NSA (rule CE02)';


--
-- Name: COLUMN fact_crop_estimate.is_yield_derived; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.is_yield_derived IS 'True when yield was derived as production/area. | Source: ETL';


--
-- Name: COLUMN fact_crop_estimate.release_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.release_date IS 'Publication date of the estimate. | Source: NSA';


--
-- Name: COLUMN fact_crop_estimate.source_table; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.source_table IS 'Lineage: report/table of origin. | Source: NSA';


--
-- Name: COLUMN fact_crop_estimate.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_crop_estimate.dw_batch_id IS 'Audit: ETL batch. | Source: ETL';


--
-- Name: fact_crop_estimate_crop_estimate_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_crop_estimate ALTER COLUMN crop_estimate_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_crop_estimate_crop_estimate_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_forecast_monthly; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_forecast_monthly (
    forecast_key bigint NOT NULL,
    month_date_key integer NOT NULL,
    crop_category_key smallint NOT NULL,
    model_name character varying(30) NOT NULL,
    scenario character varying(12) NOT NULL,
    actual_net_revenue_nad numeric(16,2),
    forecast_net_revenue_nad numeric(16,2) NOT NULL,
    lower_80_nad numeric(16,2),
    upper_80_nad numeric(16,2),
    lower_95_nad numeric(16,2),
    upper_95_nad numeric(16,2),
    model_run_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fact_forecast_monthly_scenario_check CHECK (((scenario)::text = ANY ((ARRAY['Backtest'::character varying, 'Forecast'::character varying])::text[])))
);


--
-- Name: TABLE fact_forecast_monthly; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_forecast_monthly IS 'Model output. GRAIN: one row per month x crop category x model x scenario (12-month back-test on hold-out data, then 12-month forward forecast).';


--
-- Name: COLUMN fact_forecast_monthly.forecast_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.forecast_key IS 'Surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_forecast_monthly.month_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.month_date_key IS 'FK to dim_date: month-end of the forecast month. | Source: 03_analytics/forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.crop_category_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.crop_category_key IS 'FK to dim_crop_category. | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.model_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.model_name IS 'Model: Seasonal naive, Holt-Winters ETS, SARIMA. | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.scenario; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.scenario IS 'Backtest (hold-out evaluation) or Forecast (forward). | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.actual_net_revenue_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.actual_net_revenue_nad IS 'Actual net revenue for back-test months, N$. | Source: fact_sales';


--
-- Name: COLUMN fact_forecast_monthly.forecast_net_revenue_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.forecast_net_revenue_nad IS 'Point forecast of net revenue, N$. | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.lower_80_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.lower_80_nad IS 'Lower bound of the 80% prediction interval. | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.upper_80_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.upper_80_nad IS 'Upper bound of the 80% prediction interval. | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.lower_95_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.lower_95_nad IS 'Lower bound of the 95% prediction interval. | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.upper_95_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.upper_95_nad IS 'Upper bound of the 95% prediction interval. | Source: forecasting.py';


--
-- Name: COLUMN fact_forecast_monthly.model_run_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_forecast_monthly.model_run_at IS 'Audit: model run timestamp. | Source: forecasting.py';


--
-- Name: fact_forecast_monthly_forecast_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_forecast_monthly ALTER COLUMN forecast_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_forecast_monthly_forecast_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_harvest; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_harvest (
    harvest_event_key bigint NOT NULL,
    harvest_date_key integer NOT NULL,
    farm_key integer NOT NULL,
    crop_key smallint NOT NULL,
    cycle_id character varying(24),
    block_id character varying(6) NOT NULL,
    recorder_code character varying(10),
    harvested_kg numeric(14,1) NOT NULL,
    is_corrected boolean DEFAULT false NOT NULL,
    source_file character varying(40) NOT NULL,
    source_row_num integer NOT NULL,
    dw_batch_id integer NOT NULL,
    CONSTRAINT fact_harvest_harvested_kg_check CHECK ((harvested_kg > (0)::numeric))
);


--
-- Name: TABLE fact_harvest; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_harvest IS 'Transaction fact. GRAIN: one row per harvest record = farm x crop x field block x harvest day (weighbridge/packhouse slip).';


--
-- Name: COLUMN fact_harvest.harvest_event_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.harvest_event_key IS 'Fact surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_harvest.harvest_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.harvest_date_key IS 'FK to dim_date: harvest day. | Source: harvest log date (template-specific format)';


--
-- Name: COLUMN fact_harvest.farm_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.farm_key IS 'FK to the dim_farm version valid on the harvest date. | Source: harvest log farm code (rule HV08)';


--
-- Name: COLUMN fact_harvest.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.crop_key IS 'FK to dim_crop (crop grain - conformed rollup of dim_product). | Source: harvest log crop text via ref.crop_alias';


--
-- Name: COLUMN fact_harvest.cycle_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.cycle_id IS 'Degenerate: crop-cycle identifier from the planting register (links to fact_crop_cycle). | Source: ETL block matching';


--
-- Name: COLUMN fact_harvest.block_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.block_id IS 'Degenerate: field block / pivot / vineyard block code. | Source: harvest log';


--
-- Name: COLUMN fact_harvest.recorder_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.recorder_code IS 'Pseudonymised clerk code that captured the record. | Source: harvest log';


--
-- Name: COLUMN fact_harvest.harvested_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.harvested_kg IS 'Field mass harvested in kg after unit standardisation (additive). | Source: harvest log quantity x ref.uom_conversion';


--
-- Name: COLUMN fact_harvest.is_corrected; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.is_corrected IS 'True when rule HV06 corrected a unit/decimal error. | Source: ETL';


--
-- Name: COLUMN fact_harvest.source_file; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.source_file IS 'Lineage: source file name. | Source: ETL';


--
-- Name: COLUMN fact_harvest.source_row_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.source_row_num IS 'Lineage: row number in the source file. | Source: ETL';


--
-- Name: COLUMN fact_harvest.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_harvest.dw_batch_id IS 'Audit: ETL batch. | Source: ETL';


--
-- Name: fact_harvest_harvest_event_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_harvest ALTER COLUMN harvest_event_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_harvest_harvest_event_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_inventory_monthly; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_inventory_monthly (
    inventory_snapshot_key bigint NOT NULL,
    snapshot_date_key integer NOT NULL,
    farm_key integer NOT NULL,
    product_key integer NOT NULL,
    opening_stock_kg numeric(14,1) NOT NULL,
    received_kg numeric(14,1) NOT NULL,
    dispatched_kg numeric(14,1) NOT NULL,
    shrinkage_kg numeric(14,1) NOT NULL,
    closing_stock_kg numeric(14,1) NOT NULL,
    closing_stock_value_nad numeric(16,2) NOT NULL,
    is_imputed boolean DEFAULT false NOT NULL,
    is_sign_corrected boolean DEFAULT false NOT NULL,
    dw_batch_id integer NOT NULL
);


--
-- Name: TABLE fact_inventory_monthly; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_inventory_monthly IS 'Periodic snapshot. GRAIN: one row per farm store x product x month-end. Stock levels are SEMI-ADDITIVE (sum across farms/products, never across months); flows are additive.';


--
-- Name: COLUMN fact_inventory_monthly.inventory_snapshot_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.inventory_snapshot_key IS 'Fact surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_inventory_monthly.snapshot_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.snapshot_date_key IS 'FK to dim_date: month-end count date. | Source: stock system period';


--
-- Name: COLUMN fact_inventory_monthly.farm_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.farm_key IS 'FK to the dim_farm version valid at month-end. | Source: stock system farm_code';


--
-- Name: COLUMN fact_inventory_monthly.product_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.product_key IS 'FK to dim_product. | Source: stock system product_code';


--
-- Name: COLUMN fact_inventory_monthly.opening_stock_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.opening_stock_kg IS 'Stock on hand at the start of the month, kg (semi-additive). | Source: stock system';


--
-- Name: COLUMN fact_inventory_monthly.received_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.received_kg IS 'Graded produce received from the field in the month, kg (additive). | Source: stock system';


--
-- Name: COLUMN fact_inventory_monthly.dispatched_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.dispatched_kg IS 'Produce dispatched to customers in the month, kg (additive; reconciles to ERP dispatches). | Source: stock system';


--
-- Name: COLUMN fact_inventory_monthly.shrinkage_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.shrinkage_kg IS 'Losses (spoilage, moisture, theft) in the month, kg (additive). | Source: stock system';


--
-- Name: COLUMN fact_inventory_monthly.closing_stock_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.closing_stock_kg IS 'Stock on hand at month-end, kg (semi-additive: use closing-balance logic over time). | Source: stock system (rule ST01)';


--
-- Name: COLUMN fact_inventory_monthly.closing_stock_value_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.closing_stock_value_nad IS 'Closing stock at standard cost, N$ (semi-additive). | Source: stock system';


--
-- Name: COLUMN fact_inventory_monthly.is_imputed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.is_imputed IS 'True when the snapshot row was imputed for a missing month (rule ST03). | Source: ETL';


--
-- Name: COLUMN fact_inventory_monthly.is_sign_corrected; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.is_sign_corrected IS 'True when rule ST01 corrected a sign error. | Source: ETL';


--
-- Name: COLUMN fact_inventory_monthly.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_inventory_monthly.dw_batch_id IS 'Audit: ETL batch. | Source: ETL';


--
-- Name: fact_inventory_monthly_inventory_snapshot_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_inventory_monthly ALTER COLUMN inventory_snapshot_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_inventory_monthly_inventory_snapshot_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_market_price_monthly; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_market_price_monthly (
    market_price_key bigint NOT NULL,
    month_date_key integer NOT NULL,
    commodity_key smallint NOT NULL,
    crop_key smallint NOT NULL,
    price_usd numeric(12,2) NOT NULL,
    fx_nad_per_usd numeric(12,6) NOT NULL,
    price_nad numeric(14,2) NOT NULL,
    is_imputed boolean DEFAULT false NOT NULL,
    dw_batch_id integer NOT NULL
);


--
-- Name: TABLE fact_market_price_monthly; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_market_price_monthly IS 'Periodic fact (external). GRAIN: one row per commodity series per month (keyed on the month-end date). Prices are NON-ADDITIVE (average only).';


--
-- Name: COLUMN fact_market_price_monthly.market_price_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.market_price_key IS 'Fact surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_market_price_monthly.month_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.month_date_key IS 'FK to dim_date: last day of the price month. | Source: Pink Sheet period YYYYMmm';


--
-- Name: COLUMN fact_market_price_monthly.commodity_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.commodity_key IS 'FK to dim_commodity. | Source: Pink Sheet column header';


--
-- Name: COLUMN fact_market_price_monthly.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.crop_key IS 'FK to dim_crop of the benchmarked crop (-2 for input series). | Source: dim_commodity mapping';


--
-- Name: COLUMN fact_market_price_monthly.price_usd; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.price_usd IS 'Monthly average price in USD per published unit (non-additive). | Source: World Bank Pink Sheet (rule MP01)';


--
-- Name: COLUMN fact_market_price_monthly.fx_nad_per_usd; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.fx_nad_per_usd IS 'Monthly average N$ per USD (non-additive). | Source: FRED DEXSFUS (NAD = ZAR)';


--
-- Name: COLUMN fact_market_price_monthly.price_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.price_nad IS 'Price converted to N$ per published unit (non-additive). | Source: derived';


--
-- Name: COLUMN fact_market_price_monthly.is_imputed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.is_imputed IS 'True when the price was interpolated (rule MP01). | Source: ETL';


--
-- Name: COLUMN fact_market_price_monthly.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_market_price_monthly.dw_batch_id IS 'Audit: ETL batch. | Source: ETL';


--
-- Name: fact_market_price_monthly_market_price_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_market_price_monthly ALTER COLUMN market_price_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_market_price_monthly_market_price_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_production_cost; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_production_cost (
    cost_posting_key bigint NOT NULL,
    posting_date_key integer NOT NULL,
    farm_key integer NOT NULL,
    crop_key smallint NOT NULL,
    cost_category_key smallint NOT NULL,
    posting_id character varying(24) NOT NULL,
    cost_centre character varying(30) NOT NULL,
    supplier_code character varying(8),
    amount_nad numeric(16,2) NOT NULL,
    input_qty numeric(14,2),
    input_uom character varying(6),
    is_reversal boolean DEFAULT false NOT NULL,
    dw_batch_id integer NOT NULL
);


--
-- Name: TABLE fact_production_cost; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_production_cost IS 'Transaction fact. GRAIN: one row per cost-ledger posting (farm x crop cycle or overhead x cost category x posting date).';


--
-- Name: COLUMN fact_production_cost.cost_posting_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.cost_posting_key IS 'Fact surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_production_cost.posting_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.posting_date_key IS 'FK to dim_date: posting date. | Source: cost ledger';


--
-- Name: COLUMN fact_production_cost.farm_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.farm_key IS 'FK to the dim_farm version valid on the posting date. | Source: cost ledger farm_code';


--
-- Name: COLUMN fact_production_cost.crop_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.crop_key IS 'FK to dim_crop (-2 farm overhead, -1 crop missing - rule CL03). | Source: cost ledger crop_code';


--
-- Name: COLUMN fact_production_cost.cost_category_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.cost_category_key IS 'FK to dim_cost_category. | Source: cost ledger free text via ref.cost_category_alias (rule CL02)';


--
-- Name: COLUMN fact_production_cost.posting_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.posting_id IS 'Degenerate: journal posting id (suffix -R reversal, -C correction). | Source: cost ledger';


--
-- Name: COLUMN fact_production_cost.cost_centre; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.cost_centre IS 'Degenerate: cost centre = crop cycle id, FARM/OVERHEAD or FARM/UNALLOCATED. | Source: cost ledger';


--
-- Name: COLUMN fact_production_cost.supplier_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.supplier_code IS 'Pseudonymised supplier code. | Source: cost ledger';


--
-- Name: COLUMN fact_production_cost.amount_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.amount_nad IS 'Posted cost amount in N$ (additive; reversals negative). | Source: cost ledger (rule CL04)';


--
-- Name: COLUMN fact_production_cost.input_qty; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.input_qty IS 'Physical input quantity where captured (additive within one category). | Source: cost ledger';


--
-- Name: COLUMN fact_production_cost.input_uom; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.input_uom IS 'Unit of input_qty. | Source: cost ledger';


--
-- Name: COLUMN fact_production_cost.is_reversal; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.is_reversal IS 'True for reversal postings. | Source: derived from posting_id';


--
-- Name: COLUMN fact_production_cost.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_production_cost.dw_batch_id IS 'Audit: ETL batch. | Source: ETL';


--
-- Name: fact_production_cost_cost_posting_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_production_cost ALTER COLUMN cost_posting_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_production_cost_cost_posting_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_sales; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_sales (
    sales_line_key bigint NOT NULL,
    invoice_date_key integer NOT NULL,
    dispatch_date_key integer NOT NULL,
    product_key integer NOT NULL,
    customer_key integer NOT NULL,
    farm_key integer NOT NULL,
    invoice_no character varying(16) NOT NULL,
    line_no smallint NOT NULL,
    doc_type character(3) NOT NULL,
    ref_invoice_no character varying(16),
    sales_rep_code character varying(6),
    currency_code character(3) NOT NULL,
    quantity_sales_uom numeric(14,3) NOT NULL,
    quantity_kg numeric(14,3) NOT NULL,
    unit_price_txn numeric(14,4) NOT NULL,
    fx_rate_nad numeric(12,6) NOT NULL,
    gross_revenue_nad numeric(16,2) NOT NULL,
    discount_nad numeric(16,2) NOT NULL,
    net_revenue_nad numeric(16,2) NOT NULL,
    cogs_nad numeric(16,2) NOT NULL,
    freight_cost_nad numeric(16,2) NOT NULL,
    gross_margin_nad numeric(16,2) GENERATED ALWAYS AS ((net_revenue_nad - cogs_nad)) STORED,
    is_price_anomaly boolean DEFAULT false NOT NULL,
    dw_batch_id integer NOT NULL,
    CONSTRAINT fact_sales_doc_type_check CHECK ((doc_type = ANY (ARRAY['INV'::bpchar, 'CRN'::bpchar])))
);


--
-- Name: TABLE fact_sales; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_sales IS 'Transaction fact. GRAIN: one row per ERP invoice or credit-note line. All monetary measures are additive (N$).';


--
-- Name: COLUMN fact_sales.sales_line_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.sales_line_key IS 'Fact surrogate key (technical; hidden in BI). | Source: ETL identity';


--
-- Name: COLUMN fact_sales.invoice_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.invoice_date_key IS 'FK to dim_date: invoice (revenue recognition) date. | Source: ERP invoice_date';


--
-- Name: COLUMN fact_sales.dispatch_date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.dispatch_date_key IS 'FK to dim_date (role-playing): physical dispatch date used for stock reconciliation. | Source: ERP dispatch_date';


--
-- Name: COLUMN fact_sales.product_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.product_key IS 'FK to dim_product. | Source: ERP product_code (rule SA02)';


--
-- Name: COLUMN fact_sales.customer_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.customer_key IS 'FK to the dim_customer version valid on the invoice date. | Source: ERP customer_code (rules SA03/SA04)';


--
-- Name: COLUMN fact_sales.farm_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.farm_key IS 'FK to the dim_farm version of the farm of origin on the invoice date (-1 when missing, rule SA05). | Source: ERP farm_code';


--
-- Name: COLUMN fact_sales.invoice_no; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.invoice_no IS 'Degenerate dimension: ERP document number. | Source: ERP';


--
-- Name: COLUMN fact_sales.line_no; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.line_no IS 'Degenerate dimension: line number within the document. | Source: ERP';


--
-- Name: COLUMN fact_sales.doc_type; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.doc_type IS 'INV = invoice, CRN = credit note (quality claim). | Source: ERP';


--
-- Name: COLUMN fact_sales.ref_invoice_no; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.ref_invoice_no IS 'For credit notes: the invoice being credited. | Source: ERP';


--
-- Name: COLUMN fact_sales.sales_rep_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.sales_rep_code IS 'Pseudonymised sales representative code. | Source: ERP';


--
-- Name: COLUMN fact_sales.currency_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.currency_code IS 'Invoicing currency (rule SA06 defaults missing values). | Source: ERP / customer master';


--
-- Name: COLUMN fact_sales.quantity_sales_uom; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.quantity_sales_uom IS 'Quantity in the invoice unit of measure (negative on credit notes). Additive only within one product. | Source: ERP quantity';


--
-- Name: COLUMN fact_sales.quantity_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.quantity_kg IS 'Quantity converted to kilograms (additive). | Source: derived quantity x dim_product.kg_per_sales_uom';


--
-- Name: COLUMN fact_sales.unit_price_txn; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.unit_price_txn IS 'Unit price in transaction currency per sales UoM (non-additive). | Source: ERP';


--
-- Name: COLUMN fact_sales.fx_rate_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.fx_rate_nad IS 'N$ per unit of transaction currency, monthly average of the invoice month (non-additive). | Source: ref.fx_rate_monthly (FRED)';


--
-- Name: COLUMN fact_sales.gross_revenue_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.gross_revenue_nad IS 'quantity x unit price x FX before discount, N$ (additive). | Source: derived';


--
-- Name: COLUMN fact_sales.discount_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.discount_nad IS 'Discount granted, N$ (additive). | Source: derived from ERP discount_pct';


--
-- Name: COLUMN fact_sales.net_revenue_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.net_revenue_nad IS 'Gross revenue less discount, N$ (additive) - the headline revenue measure. | Source: derived';


--
-- Name: COLUMN fact_sales.cogs_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.cogs_nad IS 'Standard cost of goods sold, N$ (0 on credit notes: returned produce is written off). | Source: ERP unit_std_cost_nad x quantity';


--
-- Name: COLUMN fact_sales.freight_cost_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.freight_cost_nad IS 'Outbound freight cost borne by Green Basket, N$ (additive). | Source: ERP freight_nad';


--
-- Name: COLUMN fact_sales.gross_margin_nad; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.gross_margin_nad IS 'Net revenue less COGS, N$ (additive, computed column). | Source: derived';


--
-- Name: COLUMN fact_sales.is_price_anomaly; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.is_price_anomaly IS 'True when the N$/kg price deviates > 4x from the product-month median (rule SA07). | Source: ETL';


--
-- Name: COLUMN fact_sales.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_sales.dw_batch_id IS 'Audit: ETL batch that loaded the row. | Source: ETL';


--
-- Name: fact_sales_sales_line_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_sales ALTER COLUMN sales_line_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_sales_sales_line_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_weather_daily; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.fact_weather_daily (
    weather_key bigint NOT NULL,
    date_key integer NOT NULL,
    farm_key integer NOT NULL,
    rainfall_mm numeric(7,2),
    t_max_c numeric(5,2),
    t_min_c numeric(5,2),
    rh_pct numeric(5,2),
    solar_mj_m2 numeric(6,2),
    is_heat_day boolean,
    is_rain_day boolean,
    rainfall_imputed boolean DEFAULT false NOT NULL,
    temp_imputed boolean DEFAULT false NOT NULL,
    dw_batch_id integer NOT NULL
);


--
-- Name: TABLE fact_weather_daily; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.fact_weather_daily IS 'Periodic fact (external). GRAIN: one row per farm location per day. Rainfall additive over time but averaged across locations; temperatures non-additive.';


--
-- Name: COLUMN fact_weather_daily.weather_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.weather_key IS 'Fact surrogate key. | Source: ETL identity';


--
-- Name: COLUMN fact_weather_daily.date_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.date_key IS 'FK to dim_date. | Source: NASA POWER date key YYYYMMDD';


--
-- Name: COLUMN fact_weather_daily.farm_key; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.farm_key IS 'FK to the dim_farm version valid on the day (weather point = farm coordinates). | Source: NASA POWER request per farm';


--
-- Name: COLUMN fact_weather_daily.rainfall_mm; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.rainfall_mm IS 'Corrected precipitation, mm/day (PRECTOTCORR). | Source: NASA POWER (rule WE02)';


--
-- Name: COLUMN fact_weather_daily.t_max_c; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.t_max_c IS 'Maximum 2 m air temperature, deg C (T2M_MAX). | Source: NASA POWER (rule WE01)';


--
-- Name: COLUMN fact_weather_daily.t_min_c; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.t_min_c IS 'Minimum 2 m air temperature, deg C (T2M_MIN). | Source: NASA POWER (rule WE01)';


--
-- Name: COLUMN fact_weather_daily.rh_pct; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.rh_pct IS 'Relative humidity at 2 m, % (RH2M). | Source: NASA POWER';


--
-- Name: COLUMN fact_weather_daily.solar_mj_m2; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.solar_mj_m2 IS 'All-sky surface shortwave irradiance, MJ/m2/day. | Source: NASA POWER';


--
-- Name: COLUMN fact_weather_daily.is_heat_day; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.is_heat_day IS 'True when t_max_c >= 35 deg C (crop heat-stress day). | Source: derived';


--
-- Name: COLUMN fact_weather_daily.is_rain_day; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.is_rain_day IS 'True when rainfall_mm >= 1. | Source: derived';


--
-- Name: COLUMN fact_weather_daily.rainfall_imputed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.rainfall_imputed IS 'True when rainfall was imputed by rule WE02. | Source: ETL';


--
-- Name: COLUMN fact_weather_daily.temp_imputed; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.temp_imputed IS 'True when temperature was imputed by rule WE01. | Source: ETL';


--
-- Name: COLUMN fact_weather_daily.dw_batch_id; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.fact_weather_daily.dw_batch_id IS 'Audit: ETL batch. | Source: ETL';


--
-- Name: fact_weather_daily_weather_key_seq; Type: SEQUENCE; Schema: dw; Owner: -
--

ALTER TABLE dw.fact_weather_daily ALTER COLUMN weather_key ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME dw.fact_weather_daily_weather_key_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: harvest_anomaly; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.harvest_anomaly (
    source_file character varying(40) NOT NULL,
    source_row_num integer NOT NULL,
    farm_code character varying(10),
    crop_code character(3),
    harvest_date date,
    harvested_kg numeric(14,1),
    anomaly_score numeric(10,4),
    method character varying(30) NOT NULL
);


--
-- Name: TABLE harvest_anomaly; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.harvest_anomaly IS 'Model output: harvest records scored as anomalous by Isolation Forest / robust z-score (for steward review).';


--
-- Name: COLUMN harvest_anomaly.source_file; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.source_file IS 'Lineage: harvest log file. | Source: anomaly_detection.py';


--
-- Name: COLUMN harvest_anomaly.source_row_num; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.source_row_num IS 'Lineage: row in the file. | Source: anomaly_detection.py';


--
-- Name: COLUMN harvest_anomaly.farm_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.farm_code IS 'Farm code. | Source: anomaly_detection.py';


--
-- Name: COLUMN harvest_anomaly.crop_code; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.crop_code IS 'Crop code. | Source: anomaly_detection.py';


--
-- Name: COLUMN harvest_anomaly.harvest_date; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.harvest_date IS 'Harvest date. | Source: anomaly_detection.py';


--
-- Name: COLUMN harvest_anomaly.harvested_kg; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.harvested_kg IS 'Harvested kg as loaded. | Source: anomaly_detection.py';


--
-- Name: COLUMN harvest_anomaly.anomaly_score; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.anomaly_score IS 'Anomaly score (higher = more anomalous). | Source: anomaly_detection.py';


--
-- Name: COLUMN harvest_anomaly.method; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.harvest_anomaly.method IS 'Detection method. | Source: anomaly_detection.py';


--
-- Name: yield_driver_importance; Type: TABLE; Schema: dw; Owner: -
--

CREATE TABLE dw.yield_driver_importance (
    model_name character varying(40) NOT NULL,
    feature character varying(40) NOT NULL,
    importance numeric(10,4),
    coefficient numeric(12,4),
    p_value numeric(10,6),
    rank_order smallint,
    model_run_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE yield_driver_importance; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON TABLE dw.yield_driver_importance IS 'Model output: yield-driver coefficients (OLS) and permutation importances (random forest).';


--
-- Name: COLUMN yield_driver_importance.model_name; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.yield_driver_importance.model_name IS 'Model identifier. | Source: yield_drivers.py';


--
-- Name: COLUMN yield_driver_importance.feature; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.yield_driver_importance.feature IS 'Explanatory feature. | Source: yield_drivers.py';


--
-- Name: COLUMN yield_driver_importance.importance; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.yield_driver_importance.importance IS 'Permutation importance (drop in R2). | Source: yield_drivers.py';


--
-- Name: COLUMN yield_driver_importance.coefficient; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.yield_driver_importance.coefficient IS 'OLS coefficient on log-yield (approx. % effect). | Source: yield_drivers.py';


--
-- Name: COLUMN yield_driver_importance.p_value; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.yield_driver_importance.p_value IS 'OLS p-value. | Source: yield_drivers.py';


--
-- Name: COLUMN yield_driver_importance.rank_order; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.yield_driver_importance.rank_order IS 'Rank by importance. | Source: yield_drivers.py';


--
-- Name: COLUMN yield_driver_importance.model_run_at; Type: COMMENT; Schema: dw; Owner: -
--

COMMENT ON COLUMN dw.yield_driver_importance.model_run_at IS 'Audit: model run timestamp. | Source: yield_drivers.py';


--
-- Name: agg_sales_monthly; Type: MATERIALIZED VIEW; Schema: mart; Owner: -
--

CREATE MATERIALIZED VIEW mart.agg_sales_monthly AS
 SELECT d.month_end_date,
    (to_char((d.month_end_date)::timestamp with time zone, 'YYYYMMDD'::text))::integer AS month_date_key,
    f.product_key,
    f.farm_key,
    c.channel,
    sum(f.net_revenue_nad) AS net_revenue_nad,
    sum(f.cogs_nad) AS cogs_nad,
    sum(f.quantity_kg) AS quantity_kg,
    count(*) AS invoice_lines
   FROM ((dw.fact_sales f
     JOIN dw.dim_date d ON ((d.date_key = f.invoice_date_key)))
     JOIN dw.dim_customer c ON ((c.customer_key = f.customer_key)))
  GROUP BY d.month_end_date, (to_char((d.month_end_date)::timestamp with time zone, 'YYYYMMDD'::text))::integer, f.product_key, f.farm_key, c.channel
  WITH NO DATA;


--
-- Name: dim_commodity; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_commodity AS
 SELECT commodity_key,
    commodity_code,
    commodity_name,
    price_unit,
    commodity_role
   FROM dw.dim_commodity;


--
-- Name: dim_cost_category; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_cost_category AS
 SELECT cost_category_key,
    cost_category_code,
    cost_category_name,
    cost_group,
    cost_behaviour,
    is_crop_specific
   FROM dw.dim_cost_category;


--
-- Name: dim_crop; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_crop AS
 SELECT crop_key,
    crop_code,
    crop_name,
    crop_category_key,
    is_nab_controlled,
    storage_type,
    shelf_life_days
   FROM dw.dim_crop;


--
-- Name: dim_crop_category; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_crop_category AS
 SELECT crop_category_key,
    category_code,
    category_name,
    sector
   FROM dw.dim_crop_category;


--
-- Name: dim_customer; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_customer AS
 SELECT c.customer_key,
    c.customer_code,
    c.customer_name,
    c.customer_type,
    c.channel,
    c.credit_terms_days,
    c.is_key_account,
    c.town,
    r.region_name AS customer_region,
        CASE
            WHEN (c.region_key = '-2'::integer) THEN 'Export markets'::character varying
            ELSE r.zone_name
        END AS customer_zone,
    COALESCE(c.country_name, 'Unknown'::character varying) AS country_name,
    COALESCE(c.market_group, 'Unknown'::character varying) AS market_group,
    c.customer_status,
    c.is_inferred,
    COALESCE(s.segment_name, 'Not segmented'::character varying) AS customer_segment,
    cur.channel AS channel_current,
    c.scd_version,
    c.scd_is_current
   FROM (((dw.dim_customer c
     JOIN dw.dim_region r ON ((r.region_key = c.region_key)))
     LEFT JOIN dw.customer_segment s ON (((s.customer_code)::text = (c.customer_code)::text)))
     LEFT JOIN dw.dim_customer cur ON ((((cur.customer_code)::text = (c.customer_code)::text) AND cur.scd_is_current)));


--
-- Name: dim_date; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_date AS
 SELECT date_key,
    full_date,
    day_of_month,
    day_of_week_iso,
    day_name,
    day_short,
    is_weekend,
    is_public_holiday,
    holiday_name,
    is_working_day,
    iso_week,
    week_start_date,
    month_num,
    month_name,
    month_short,
    year_month,
    year_month_key,
    month_start_date,
    month_end_date,
    is_month_end,
    quarter_num,
    year_quarter,
    calendar_year,
    fiscal_year,
    fiscal_year_label,
    fiscal_quarter_num,
    fiscal_quarter_label,
    fiscal_month_num,
    month_short AS fiscal_month_name,
    crop_season_start_year,
    crop_season_label,
    season_month_num,
    is_current_month
   FROM dw.dim_date
  WHERE (date_key > 0);


--
-- Name: dim_farm; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_farm AS
 SELECT f.farm_key,
    f.farm_code,
    f.farm_name,
    f.region_key,
    r.zone_code,
    f.town,
    f.latitude,
    f.longitude,
    f.cultivated_ha,
    f.irrigation_type,
    f.is_irrigated,
    f.water_source,
    f.farm_manager_code,
    f.is_globalgap_certified,
    COALESCE(cur.irrigation_type, f.irrigation_type) AS irrigation_type_current,
    COALESCE(cur.farm_manager_code, f.farm_manager_code) AS farm_manager_current,
    f.scd_version,
    f.scd_effective_from,
    f.scd_effective_to,
    f.scd_is_current,
    ((((((((f.farm_name)::text || ' v'::text) || f.scd_version) || ' ('::text) ||
        CASE
            WHEN (f.scd_effective_from = '1900-01-01'::date) THEN 'start'::text
            ELSE to_char((f.scd_effective_from)::timestamp with time zone, 'YYYY-MM-DD'::text)
        END) || ' to '::text) ||
        CASE
            WHEN f.scd_is_current THEN 'current'::text
            ELSE to_char((f.scd_effective_to)::timestamp with time zone, 'YYYY-MM-DD'::text)
        END) || ')'::text) AS farm_version_label
   FROM ((dw.dim_farm f
     JOIN dw.dim_region r ON ((r.region_key = f.region_key)))
     LEFT JOIN dw.dim_farm cur ON ((((cur.farm_code)::text = (f.farm_code)::text) AND cur.scd_is_current AND (f.farm_key > 0))));


--
-- Name: dim_product; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_product AS
 SELECT product_key,
    product_code,
    product_name,
    crop_key,
    grade,
    pack_type,
    sales_uom,
    kg_per_sales_uom,
    is_export_grade
   FROM dw.dim_product;


--
-- Name: dim_region; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dim_region AS
 SELECT region_key,
    region_code,
    region_name,
    zone_code,
    zone_name,
    capital_town,
    is_northern_crop_region
   FROM dw.dim_region;


--
-- Name: dq_summary; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.dq_summary AS
 SELECT r.rule_code,
    r.rule_name,
    r.dq_dimension,
    r.action,
    r.owner_role,
    r.source_object,
    count(l.issue_id) AS issues_logged,
    max(l.batch_id) AS last_batch_id
   FROM (audit.dq_rule r
     LEFT JOIN audit.dq_issue_log l ON (((l.rule_code = r.rule_code) AND (l.batch_id = ( SELECT max(etl_batch.batch_id) AS max
           FROM audit.etl_batch
          WHERE ((etl_batch.batch_type = 'FULL'::text) AND (etl_batch.status = 'SUCCEEDED'::text)))))))
  GROUP BY r.rule_code, r.rule_name, r.dq_dimension, r.action, r.owner_role, r.source_object;


--
-- Name: fact_crop_cycle; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_crop_cycle AS
 SELECT cycle_id,
    block_id,
    farm_key,
    crop_key,
    planting_date_key,
    first_harvest_date_key,
    last_harvest_date_key,
    harvest_season_end_date_key,
    cycle_status,
    irrigation_method,
    is_irrigated,
    planted_ha,
    harvested_ha,
    planned_production_kg,
    harvested_kg,
    days_to_first_harvest,
    direct_cost_nad,
    fertiliser_kg
   FROM dw.fact_crop_cycle;


--
-- Name: fact_crop_estimate; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_crop_estimate AS
 SELECT season_end_date_key,
    region_key,
    crop_key,
    farming_sector,
    area_planted_ha,
    production_t
   FROM dw.fact_crop_estimate;


--
-- Name: fact_forecast_monthly; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_forecast_monthly AS
 SELECT month_date_key,
    crop_category_key,
    model_name,
    scenario,
    actual_net_revenue_nad,
    forecast_net_revenue_nad,
    lower_80_nad,
    upper_80_nad,
    lower_95_nad,
    upper_95_nad
   FROM dw.fact_forecast_monthly;


--
-- Name: fact_harvest; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_harvest AS
 SELECT harvest_date_key,
    farm_key,
    crop_key,
    harvested_kg,
    is_corrected
   FROM dw.fact_harvest;


--
-- Name: fact_inventory_monthly; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_inventory_monthly AS
 SELECT snapshot_date_key,
    farm_key,
    product_key,
    opening_stock_kg,
    received_kg,
    dispatched_kg,
    shrinkage_kg,
    closing_stock_kg,
    closing_stock_value_nad
   FROM dw.fact_inventory_monthly;


--
-- Name: fact_market_price_monthly; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_market_price_monthly AS
 SELECT month_date_key,
    commodity_key,
    crop_key,
    price_usd,
    fx_nad_per_usd,
    price_nad
   FROM dw.fact_market_price_monthly;


--
-- Name: fact_production_cost; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_production_cost AS
 SELECT posting_date_key,
    farm_key,
    crop_key,
    cost_category_key,
    amount_nad,
    input_qty
   FROM dw.fact_production_cost;


--
-- Name: fact_sales; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_sales AS
 SELECT invoice_date_key,
    dispatch_date_key,
    product_key,
    customer_key,
    farm_key,
    (
        CASE
            WHEN (doc_type = 'CRN'::bpchar) THEN '-1'::integer
            ELSE 1
        END * (((substr((invoice_no)::text, 4, 4))::bigint * 1000000) + (split_part((invoice_no)::text, '-'::text, 2))::bigint)) AS invoice_id,
    doc_type,
    quantity_kg,
    gross_revenue_nad,
    discount_nad,
    net_revenue_nad,
    cogs_nad,
    freight_cost_nad,
    is_price_anomaly
   FROM dw.fact_sales;


--
-- Name: fact_weather_daily; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.fact_weather_daily AS
 SELECT date_key,
    farm_key,
    rainfall_mm,
    t_max_c,
    t_min_c,
        CASE
            WHEN is_heat_day THEN 1
            ELSE 0
        END AS heat_day
   FROM dw.fact_weather_daily;


--
-- Name: recon_latest; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.recon_latest AS
 SELECT check_code,
    check_name,
    check_type,
    source_value,
    target_value,
    difference,
    tolerance,
    status,
    explanation
   FROM audit.recon_result
  WHERE (batch_id = ( SELECT max(etl_batch.batch_id) AS max
           FROM audit.etl_batch
          WHERE ((etl_batch.batch_type = 'FULL'::text) AND (etl_batch.status = 'SUCCEEDED'::text))));


--
-- Name: user_zone_access; Type: TABLE; Schema: sec; Owner: -
--

CREATE TABLE sec.user_zone_access (
    user_upn character varying(80) NOT NULL,
    zone_code character(2) NOT NULL,
    granted_by character varying(40) NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL
);


--
-- Name: TABLE user_zone_access; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON TABLE sec.user_zone_access IS 'Maps Power BI user principal names to the management zones they may see (dynamic RLS).';


--
-- Name: COLUMN user_zone_access.user_upn; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_zone_access.user_upn IS 'User principal name (Entra ID sign-in) matched by USERPRINCIPALNAME() in the RLS rule. | Source: Head of Agriculture access request';


--
-- Name: COLUMN user_zone_access.zone_code; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_zone_access.zone_code IS 'Management zone the user may see (NC, NE, NW, CE, SO); one row per zone granted. | Source: access request';


--
-- Name: COLUMN user_zone_access.granted_by; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_zone_access.granted_by IS 'Role that approved the access (accountability). | Source: access request';


--
-- Name: COLUMN user_zone_access.valid_from; Type: COMMENT; Schema: sec; Owner: -
--

COMMENT ON COLUMN sec.user_zone_access.valid_from IS 'Date the access became effective (recertified quarterly). | Source: access request';


--
-- Name: sec_user_zone; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.sec_user_zone AS
 SELECT user_upn,
    zone_code
   FROM sec.user_zone_access;


--
-- Name: yield_driver_importance; Type: VIEW; Schema: mart; Owner: -
--

CREATE VIEW mart.yield_driver_importance AS
 SELECT model_name,
    feature,
    importance,
    coefficient,
    p_value,
    rank_order
   FROM dw.yield_driver_importance;


--
-- Name: commodity_series; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.commodity_series (
    series_header_norm text NOT NULL,
    commodity_code text NOT NULL
);


--
-- Name: cost_category_alias; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.cost_category_alias (
    alias_norm text NOT NULL,
    cost_category_code character(4) NOT NULL
);


--
-- Name: country; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.country (
    country_code character(2) NOT NULL,
    country_name text NOT NULL,
    region_group text NOT NULL
);


--
-- Name: crop_alias; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.crop_alias (
    alias_norm text NOT NULL,
    crop_code character(3),
    source text NOT NULL
);


--
-- Name: TABLE crop_alias; Type: COMMENT; Schema: ref; Owner: -
--

COMMENT ON TABLE ref.crop_alias IS 'Crop names/codes seen in farm logs and NSA tables -> crop code (NULL = known out-of-scope crop).';


--
-- Name: customer_xref; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.customer_xref (
    duplicate_code text NOT NULL,
    survivor_code text NOT NULL,
    merge_date date,
    reason text
);


--
-- Name: fx_rate_monthly; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.fx_rate_monthly (
    currency_code character(3) NOT NULL,
    month_start date NOT NULL,
    nad_per_unit numeric(12,6) NOT NULL,
    observations integer,
    source text
);


--
-- Name: TABLE fx_rate_monthly; Type: COMMENT; Schema: ref; Owner: -
--

COMMENT ON TABLE ref.fx_rate_monthly IS 'Monthly average N$ per currency unit from FRED daily series (NAD = ZAR 1:1 under the Common Monetary Area).';


--
-- Name: region_alias; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.region_alias (
    alias_norm text NOT NULL,
    region_code character(5) NOT NULL,
    source text NOT NULL
);


--
-- Name: TABLE region_alias; Type: COMMENT; Schema: ref; Owner: -
--

COMMENT ON TABLE ref.region_alias IS 'Normalised region spellings (upper, alphanumeric) -> ISO 3166-2:NA code.';


--
-- Name: uom_conversion; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.uom_conversion (
    uom_norm text NOT NULL,
    kg_factor numeric(12,4) NOT NULL,
    note text
);


--
-- Name: cost_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.cost_clean (
    source_file text NOT NULL,
    row_num integer NOT NULL,
    posting_id text,
    posting_date date,
    farm_code text,
    cost_centre text,
    crop_code text,
    cost_category_code character(4),
    gl_account text,
    amount_nad numeric(16,2),
    input_qty numeric(14,2),
    input_uom text,
    supplier_code text,
    is_reversal boolean,
    dq_status text DEFAULT 'OK'::text NOT NULL,
    dq_note text
);


--
-- Name: cost_ledger_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.cost_ledger_raw (
    source_file text NOT NULL,
    row_num integer NOT NULL,
    posting_id text,
    posting_date text,
    farm_code text,
    cost_centre text,
    crop_code text,
    cost_category text,
    gl_account text,
    description text,
    amount_nad text,
    input_qty text,
    input_uom text,
    supplier_code text,
    batch_id integer
);


--
-- Name: crop_estimate_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.crop_estimate_clean (
    season_start_year smallint,
    region_code character(5),
    crop_code character(3),
    farming_sector text,
    area_planted_ha numeric(12,1),
    production_t numeric(14,1),
    yield_t_ha numeric(8,3),
    yield_derived boolean,
    release_date date,
    source_table text,
    dq_status text DEFAULT 'OK'::text NOT NULL,
    dq_note text
);


--
-- Name: crop_estimate_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.crop_estimate_raw (
    source_file text,
    row_num integer,
    season text,
    region text,
    crop text,
    sector text,
    area_planted_ha text,
    production_tonnes text,
    yield_t_per_ha text,
    source_table text,
    release_date text,
    batch_id integer
);


--
-- Name: fred_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.fred_raw (
    source_file text,
    series_id text,
    observation_date text,
    value_txt text,
    batch_id integer
);


--
-- Name: harvest_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.harvest_clean (
    source_file text NOT NULL,
    row_num integer NOT NULL,
    template_code character(1),
    farm_code text,
    harvest_date date,
    crop_code character(3),
    block_id text,
    recorder_code text,
    qty_raw numeric,
    unit_norm text,
    kg_factor numeric,
    harvested_kg numeric(14,1),
    cycle_id text,
    dq_status text DEFAULT 'OK'::text NOT NULL,
    dq_note text,
    CONSTRAINT harvest_clean_dq_status_check CHECK ((dq_status = ANY (ARRAY['OK'::text, 'CORRECTED'::text, 'REJECTED'::text, 'DUPLICATE'::text])))
);


--
-- Name: harvest_log_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.harvest_log_raw (
    source_file text NOT NULL,
    template_code character(1) NOT NULL,
    row_num integer NOT NULL,
    farm_txt text,
    date_txt text,
    crop_txt text,
    block_txt text,
    qty_txt text,
    unit_txt text,
    recorder_txt text,
    remarks_txt text,
    batch_id integer,
    CONSTRAINT harvest_log_raw_template_code_check CHECK ((template_code = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar])))
);


--
-- Name: TABLE harvest_log_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.harvest_log_raw IS 'S1 farm harvest logs (14 files, templates A/B/C) harmonised to common text columns.';


--
-- Name: market_price_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.market_price_clean (
    commodity_code text NOT NULL,
    month_start date NOT NULL,
    price_usd numeric(12,2),
    is_imputed boolean DEFAULT false NOT NULL
);


--
-- Name: md_cost_categories_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_cost_categories_raw (
    extract_name text,
    row_num integer,
    cost_category_code text,
    cost_category_name text,
    cost_group text,
    cost_behaviour text,
    gl_account text,
    quantity_uom text,
    ledger_aliases text,
    batch_id integer
);


--
-- Name: md_crop_categories_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_crop_categories_raw (
    extract_name text,
    row_num integer,
    category_code text,
    category_name text,
    sector text,
    batch_id integer
);


--
-- Name: md_crops_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_crops_raw (
    extract_name text,
    row_num integer,
    crop_code text,
    crop_name text,
    category_code text,
    scientific_name text,
    nab_controlled text,
    storage_type text,
    shelf_life_days text,
    typical_cull_pct text,
    batch_id integer
);


--
-- Name: md_customer_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_customer_clean (
    customer_code text NOT NULL,
    customer_name text,
    customer_type text,
    channel text,
    town text,
    region_code character(5),
    country_code character(2),
    currency_code character(3),
    credit_terms_days smallint,
    key_account text,
    onboarding_date date,
    status text,
    extract_name text
);


--
-- Name: md_customer_merge_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_customer_merge_raw (
    extract_name text,
    row_num integer,
    duplicate_code text,
    survivor_code text,
    merge_date text,
    reason text,
    batch_id integer
);


--
-- Name: md_customers_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_customers_raw (
    extract_name text,
    row_num integer,
    customer_code text,
    customer_name text,
    customer_type text,
    channel text,
    town text,
    region text,
    country_code text,
    currency_code text,
    credit_terms_days text,
    key_account text,
    onboarding_date text,
    status text,
    batch_id integer
);


--
-- Name: md_farm_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_farm_clean (
    farm_code text NOT NULL,
    farm_name text,
    region_code character(5),
    town text,
    latitude numeric(9,5),
    longitude numeric(9,5),
    elevation_m integer,
    total_ha numeric(10,1),
    cultivated_ha numeric(10,1),
    irrigation_type text,
    water_source text,
    farm_manager_code text,
    globalgap_certified text,
    established_year smallint,
    harvest_log_template character(1)
);


--
-- Name: md_farms_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_farms_raw (
    extract_name text,
    row_num integer,
    farm_code text,
    farm_name text,
    region text,
    town text,
    latitude text,
    longitude text,
    elevation_m text,
    total_ha text,
    cultivated_ha text,
    irrigation_type text,
    water_source text,
    farm_manager_code text,
    globalgap_certified text,
    established_year text,
    harvest_log_template text,
    batch_id integer
);


--
-- Name: md_history_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_history_clean (
    entity text,
    entity_code text,
    attribute text,
    old_value text,
    new_value text,
    effective_date date,
    extract_name text
);


--
-- Name: md_history_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_history_raw (
    extract_name text,
    entity text,
    row_num integer,
    change_id text,
    entity_code text,
    attribute text,
    old_value text,
    new_value text,
    effective_date text,
    approved_by_role text,
    batch_id integer,
    CONSTRAINT md_history_raw_entity_check CHECK ((entity = ANY (ARRAY['FARM'::text, 'CUSTOMER'::text])))
);


--
-- Name: md_products_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.md_products_raw (
    extract_name text,
    row_num integer,
    product_code text,
    product_name text,
    crop_code text,
    grade text,
    pack_type text,
    sales_uom text,
    net_weight_kg text,
    is_export_grade text,
    active text,
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
    zone_code text,
    zone_name text,
    capital_town text,
    known_aliases text,
    batch_id integer
);


--
-- Name: pink_sheet_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.pink_sheet_raw (
    source_file text,
    period_txt text,
    series_header text,
    unit_txt text,
    value_txt text,
    batch_id integer
);


--
-- Name: planting_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.planting_clean (
    cycle_id text NOT NULL,
    block_id text NOT NULL,
    farm_code text,
    crop_code character(3),
    planting_date date,
    planted_ha numeric(10,2),
    variety text,
    irrigation_method text,
    is_irrigated boolean,
    planned_yield_t_ha numeric(8,2),
    harvested_ha numeric(10,2),
    register_status text,
    dq_status text DEFAULT 'OK'::text NOT NULL,
    dq_note text
);


--
-- Name: planting_register_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.planting_register_raw (
    source_file text NOT NULL,
    row_num integer NOT NULL,
    cycle_id text,
    farm_code text,
    crop_code text,
    block_id text,
    planting_date text,
    planted_ha text,
    variety text,
    irrigation_method text,
    planned_yield_t_ha text,
    harvested_ha text,
    status text,
    last_updated text,
    batch_id integer
);


--
-- Name: sales_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.sales_clean (
    source_file text NOT NULL,
    row_num integer NOT NULL,
    invoice_no text,
    line_no smallint,
    doc_type character(3),
    invoice_date date,
    dispatch_date date,
    customer_code_raw text,
    customer_code text,
    product_code_raw text,
    product_code text,
    farm_code text,
    quantity numeric(14,3),
    uom text,
    unit_price numeric(14,4),
    currency_code character(3),
    discount_pct numeric(6,2),
    unit_std_cost_nad numeric(14,4),
    freight_nad numeric(14,2),
    sales_rep_code text,
    ref_invoice_no text,
    kg_per_uom numeric(12,4),
    quantity_kg numeric(14,3),
    fx_rate_nad numeric(12,6),
    gross_revenue_nad numeric(16,2),
    discount_nad numeric(16,2),
    net_revenue_nad numeric(16,2),
    cogs_nad numeric(16,2),
    price_per_kg_nad numeric(14,4),
    is_price_anomaly boolean DEFAULT false NOT NULL,
    dq_status text DEFAULT 'OK'::text NOT NULL,
    dq_note text
);


--
-- Name: sales_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.sales_raw (
    source_file text NOT NULL,
    row_num integer NOT NULL,
    invoice_no text,
    line_no text,
    doc_type text,
    invoice_date text,
    dispatch_date text,
    customer_code text,
    product_code text,
    farm_code text,
    quantity text,
    uom text,
    unit_price text,
    currency_code text,
    discount_pct text,
    unit_std_cost_nad text,
    freight_nad text,
    sales_rep_code text,
    ref_invoice_no text,
    batch_id integer
);


--
-- Name: TABLE sales_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.sales_raw IS 'S3 ERP invoice-line extracts (one file per fiscal year, overlapping windows).';


--
-- Name: stock_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.stock_clean (
    farm_code text NOT NULL,
    product_code text NOT NULL,
    snapshot_date date NOT NULL,
    opening_kg numeric(14,1),
    received_kg numeric(14,1),
    dispatched_kg numeric(14,1),
    shrinkage_kg numeric(14,1),
    closing_kg numeric(14,1),
    closing_value_nad numeric(16,2),
    is_imputed boolean DEFAULT false NOT NULL,
    dq_status text DEFAULT 'OK'::text NOT NULL,
    dq_note text
);


--
-- Name: stock_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.stock_raw (
    source_file text NOT NULL,
    row_num integer NOT NULL,
    farm_code text,
    product_code text,
    period text,
    opening_kg text,
    received_kg text,
    dispatched_kg text,
    shrinkage_kg text,
    closing_kg text,
    closing_value_nad text,
    count_date text,
    batch_id integer
);


--
-- Name: weather_clean; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.weather_clean (
    farm_code text NOT NULL,
    obs_date date NOT NULL,
    rainfall_mm numeric(7,2),
    t_max_c numeric(5,2),
    t_min_c numeric(5,2),
    rh_pct numeric(5,2),
    solar_mj_m2 numeric(6,2),
    rainfall_imputed boolean DEFAULT false NOT NULL,
    temp_imputed boolean DEFAULT false NOT NULL,
    rainfall_missing boolean DEFAULT false NOT NULL
);


--
-- Name: weather_json_raw; Type: TABLE; Schema: stg; Owner: -
--

CREATE TABLE stg.weather_json_raw (
    source_file text NOT NULL,
    farm_code text NOT NULL,
    payload jsonb NOT NULL,
    batch_id integer
);


--
-- Name: TABLE weather_json_raw; Type: COMMENT; Schema: stg; Owner: -
--

COMMENT ON TABLE stg.weather_json_raw IS 'S6 NASA POWER daily point JSON, one document per farm location (expanded in SQL with jsonb_each).';


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
-- Name: customer_segment customer_segment_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.customer_segment
    ADD CONSTRAINT customer_segment_pkey PRIMARY KEY (customer_code);


--
-- Name: dim_commodity dim_commodity_commodity_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_commodity
    ADD CONSTRAINT dim_commodity_commodity_code_key UNIQUE (commodity_code);


--
-- Name: dim_commodity dim_commodity_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_commodity
    ADD CONSTRAINT dim_commodity_pkey PRIMARY KEY (commodity_key);


--
-- Name: dim_cost_category dim_cost_category_cost_category_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_cost_category
    ADD CONSTRAINT dim_cost_category_cost_category_code_key UNIQUE (cost_category_code);


--
-- Name: dim_cost_category dim_cost_category_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_cost_category
    ADD CONSTRAINT dim_cost_category_pkey PRIMARY KEY (cost_category_key);


--
-- Name: dim_crop_category dim_crop_category_category_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_crop_category
    ADD CONSTRAINT dim_crop_category_category_code_key UNIQUE (category_code);


--
-- Name: dim_crop_category dim_crop_category_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_crop_category
    ADD CONSTRAINT dim_crop_category_pkey PRIMARY KEY (crop_category_key);


--
-- Name: dim_crop dim_crop_crop_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_crop
    ADD CONSTRAINT dim_crop_crop_code_key UNIQUE (crop_code);


--
-- Name: dim_crop dim_crop_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_crop
    ADD CONSTRAINT dim_crop_pkey PRIMARY KEY (crop_key);


--
-- Name: dim_customer dim_customer_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_customer
    ADD CONSTRAINT dim_customer_pkey PRIMARY KEY (customer_key);


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
-- Name: dim_farm dim_farm_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_farm
    ADD CONSTRAINT dim_farm_pkey PRIMARY KEY (farm_key);


--
-- Name: dim_product dim_product_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_product
    ADD CONSTRAINT dim_product_pkey PRIMARY KEY (product_key);


--
-- Name: dim_product dim_product_product_code_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_product
    ADD CONSTRAINT dim_product_product_code_key UNIQUE (product_code);


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
-- Name: fact_crop_cycle fact_crop_cycle_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT fact_crop_cycle_pkey PRIMARY KEY (crop_cycle_key);


--
-- Name: fact_crop_estimate fact_crop_estimate_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_estimate
    ADD CONSTRAINT fact_crop_estimate_pkey PRIMARY KEY (crop_estimate_key);


--
-- Name: fact_forecast_monthly fact_forecast_monthly_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_forecast_monthly
    ADD CONSTRAINT fact_forecast_monthly_pkey PRIMARY KEY (forecast_key);


--
-- Name: fact_harvest fact_harvest_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_harvest
    ADD CONSTRAINT fact_harvest_pkey PRIMARY KEY (harvest_event_key);


--
-- Name: fact_inventory_monthly fact_inventory_monthly_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_inventory_monthly
    ADD CONSTRAINT fact_inventory_monthly_pkey PRIMARY KEY (inventory_snapshot_key);


--
-- Name: fact_market_price_monthly fact_market_price_monthly_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_market_price_monthly
    ADD CONSTRAINT fact_market_price_monthly_pkey PRIMARY KEY (market_price_key);


--
-- Name: fact_production_cost fact_production_cost_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_production_cost
    ADD CONSTRAINT fact_production_cost_pkey PRIMARY KEY (cost_posting_key);


--
-- Name: fact_production_cost fact_production_cost_posting_id_key; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_production_cost
    ADD CONSTRAINT fact_production_cost_posting_id_key UNIQUE (posting_id);


--
-- Name: fact_sales fact_sales_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_pkey PRIMARY KEY (sales_line_key);


--
-- Name: fact_weather_daily fact_weather_daily_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_weather_daily
    ADD CONSTRAINT fact_weather_daily_pkey PRIMARY KEY (weather_key);


--
-- Name: harvest_anomaly harvest_anomaly_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.harvest_anomaly
    ADD CONSTRAINT harvest_anomaly_pkey PRIMARY KEY (source_file, source_row_num, method);


--
-- Name: dim_customer uq_dim_customer_version; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_customer
    ADD CONSTRAINT uq_dim_customer_version UNIQUE (customer_code, scd_effective_from);


--
-- Name: dim_farm uq_dim_farm_version; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_farm
    ADD CONSTRAINT uq_dim_farm_version UNIQUE (farm_code, scd_effective_from);


--
-- Name: fact_crop_cycle uq_fact_crop_cycle; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT uq_fact_crop_cycle UNIQUE (cycle_id, block_id);


--
-- Name: fact_crop_estimate uq_fact_crop_estimate; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_estimate
    ADD CONSTRAINT uq_fact_crop_estimate UNIQUE (season_end_date_key, region_key, crop_key, farming_sector);


--
-- Name: fact_forecast_monthly uq_fact_forecast; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_forecast_monthly
    ADD CONSTRAINT uq_fact_forecast UNIQUE (month_date_key, crop_category_key, model_name, scenario);


--
-- Name: fact_harvest uq_fact_harvest_source; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_harvest
    ADD CONSTRAINT uq_fact_harvest_source UNIQUE (source_file, source_row_num);


--
-- Name: fact_inventory_monthly uq_fact_inventory; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_inventory_monthly
    ADD CONSTRAINT uq_fact_inventory UNIQUE (snapshot_date_key, farm_key, product_key);


--
-- Name: fact_market_price_monthly uq_fact_market_price; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_market_price_monthly
    ADD CONSTRAINT uq_fact_market_price UNIQUE (month_date_key, commodity_key);


--
-- Name: fact_sales uq_fact_sales_line; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT uq_fact_sales_line UNIQUE (invoice_no, line_no);


--
-- Name: fact_weather_daily uq_fact_weather; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_weather_daily
    ADD CONSTRAINT uq_fact_weather UNIQUE (date_key, farm_key);


--
-- Name: yield_driver_importance yield_driver_importance_pkey; Type: CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.yield_driver_importance
    ADD CONSTRAINT yield_driver_importance_pkey PRIMARY KEY (model_name, feature);


--
-- Name: commodity_series commodity_series_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.commodity_series
    ADD CONSTRAINT commodity_series_pkey PRIMARY KEY (series_header_norm);


--
-- Name: cost_category_alias cost_category_alias_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.cost_category_alias
    ADD CONSTRAINT cost_category_alias_pkey PRIMARY KEY (alias_norm);


--
-- Name: country country_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.country
    ADD CONSTRAINT country_pkey PRIMARY KEY (country_code);


--
-- Name: crop_alias crop_alias_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.crop_alias
    ADD CONSTRAINT crop_alias_pkey PRIMARY KEY (alias_norm);


--
-- Name: customer_xref customer_xref_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.customer_xref
    ADD CONSTRAINT customer_xref_pkey PRIMARY KEY (duplicate_code);


--
-- Name: fx_rate_monthly fx_rate_monthly_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.fx_rate_monthly
    ADD CONSTRAINT fx_rate_monthly_pkey PRIMARY KEY (currency_code, month_start);


--
-- Name: region_alias region_alias_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.region_alias
    ADD CONSTRAINT region_alias_pkey PRIMARY KEY (alias_norm);


--
-- Name: uom_conversion uom_conversion_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.uom_conversion
    ADD CONSTRAINT uom_conversion_pkey PRIMARY KEY (uom_norm);


--
-- Name: user_zone_access user_zone_access_pkey; Type: CONSTRAINT; Schema: sec; Owner: -
--

ALTER TABLE ONLY sec.user_zone_access
    ADD CONSTRAINT user_zone_access_pkey PRIMARY KEY (user_upn, zone_code);


--
-- Name: cost_clean cost_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.cost_clean
    ADD CONSTRAINT cost_clean_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: cost_ledger_raw cost_ledger_raw_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.cost_ledger_raw
    ADD CONSTRAINT cost_ledger_raw_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: harvest_clean harvest_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.harvest_clean
    ADD CONSTRAINT harvest_clean_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: harvest_log_raw harvest_log_raw_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.harvest_log_raw
    ADD CONSTRAINT harvest_log_raw_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: market_price_clean market_price_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.market_price_clean
    ADD CONSTRAINT market_price_clean_pkey PRIMARY KEY (commodity_code, month_start);


--
-- Name: md_customer_clean md_customer_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_customer_clean
    ADD CONSTRAINT md_customer_clean_pkey PRIMARY KEY (customer_code);


--
-- Name: md_farm_clean md_farm_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.md_farm_clean
    ADD CONSTRAINT md_farm_clean_pkey PRIMARY KEY (farm_code);


--
-- Name: planting_clean planting_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.planting_clean
    ADD CONSTRAINT planting_clean_pkey PRIMARY KEY (cycle_id, block_id);


--
-- Name: planting_register_raw planting_register_raw_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.planting_register_raw
    ADD CONSTRAINT planting_register_raw_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: sales_clean sales_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.sales_clean
    ADD CONSTRAINT sales_clean_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: sales_raw sales_raw_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.sales_raw
    ADD CONSTRAINT sales_raw_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: stock_clean stock_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.stock_clean
    ADD CONSTRAINT stock_clean_pkey PRIMARY KEY (farm_code, product_code, snapshot_date);


--
-- Name: stock_raw stock_raw_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.stock_raw
    ADD CONSTRAINT stock_raw_pkey PRIMARY KEY (source_file, row_num);


--
-- Name: weather_clean weather_clean_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.weather_clean
    ADD CONSTRAINT weather_clean_pkey PRIMARY KEY (farm_code, obs_date);


--
-- Name: weather_json_raw weather_json_raw_pkey; Type: CONSTRAINT; Schema: stg; Owner: -
--

ALTER TABLE ONLY stg.weather_json_raw
    ADD CONSTRAINT weather_json_raw_pkey PRIMARY KEY (source_file);


--
-- Name: ix_dq_issue_log_rule; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX ix_dq_issue_log_rule ON audit.dq_issue_log USING btree (batch_id, rule_code);


--
-- Name: brin_fact_sales_invoice_date; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX brin_fact_sales_invoice_date ON dw.fact_sales USING brin (invoice_date_key) WITH (pages_per_range='16');


--
-- Name: ix_dim_customer_code_range; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_dim_customer_code_range ON dw.dim_customer USING btree (customer_code, scd_effective_from, scd_effective_to);


--
-- Name: ix_dim_farm_code_range; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_dim_farm_code_range ON dw.dim_farm USING btree (farm_code, scd_effective_from, scd_effective_to);


--
-- Name: ix_fact_cost_date; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_cost_date ON dw.fact_production_cost USING btree (posting_date_key);


--
-- Name: ix_fact_cost_farm_crop; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_cost_farm_crop ON dw.fact_production_cost USING btree (farm_key, crop_key);


--
-- Name: ix_fact_cycle_farm_crop; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_cycle_farm_crop ON dw.fact_crop_cycle USING btree (farm_key, crop_key);


--
-- Name: ix_fact_harvest_date; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_harvest_date ON dw.fact_harvest USING btree (harvest_date_key);


--
-- Name: ix_fact_harvest_farm_crop; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_harvest_farm_crop ON dw.fact_harvest USING btree (farm_key, crop_key);


--
-- Name: ix_fact_sales_customer; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_sales_customer ON dw.fact_sales USING btree (customer_key);


--
-- Name: ix_fact_sales_customer_date; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_sales_customer_date ON dw.fact_sales USING btree (customer_key, invoice_date_key) INCLUDE (net_revenue_nad, quantity_kg);


--
-- Name: ix_fact_sales_farm; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_sales_farm ON dw.fact_sales USING btree (farm_key);


--
-- Name: ix_fact_sales_product; Type: INDEX; Schema: dw; Owner: -
--

CREATE INDEX ix_fact_sales_product ON dw.fact_sales USING btree (product_key);


--
-- Name: ux_dim_customer_current; Type: INDEX; Schema: dw; Owner: -
--

CREATE UNIQUE INDEX ux_dim_customer_current ON dw.dim_customer USING btree (customer_code) WHERE scd_is_current;


--
-- Name: ux_dim_farm_current; Type: INDEX; Schema: dw; Owner: -
--

CREATE UNIQUE INDEX ux_dim_farm_current ON dw.dim_farm USING btree (farm_code) WHERE scd_is_current;


--
-- Name: ix_agg_sales_monthly_date; Type: INDEX; Schema: mart; Owner: -
--

CREATE INDEX ix_agg_sales_monthly_date ON mart.agg_sales_monthly USING btree (month_date_key);


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
-- Name: dim_commodity dim_commodity_crop_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_commodity
    ADD CONSTRAINT dim_commodity_crop_key_fkey FOREIGN KEY (crop_key) REFERENCES dw.dim_crop(crop_key);


--
-- Name: dim_crop dim_crop_crop_category_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_crop
    ADD CONSTRAINT dim_crop_crop_category_key_fkey FOREIGN KEY (crop_category_key) REFERENCES dw.dim_crop_category(crop_category_key);


--
-- Name: dim_customer dim_customer_region_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_customer
    ADD CONSTRAINT dim_customer_region_key_fkey FOREIGN KEY (region_key) REFERENCES dw.dim_region(region_key);


--
-- Name: dim_farm dim_farm_region_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_farm
    ADD CONSTRAINT dim_farm_region_key_fkey FOREIGN KEY (region_key) REFERENCES dw.dim_region(region_key);


--
-- Name: dim_product dim_product_crop_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.dim_product
    ADD CONSTRAINT dim_product_crop_key_fkey FOREIGN KEY (crop_key) REFERENCES dw.dim_crop(crop_key);


--
-- Name: fact_crop_cycle fact_crop_cycle_crop_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT fact_crop_cycle_crop_key_fkey FOREIGN KEY (crop_key) REFERENCES dw.dim_crop(crop_key);


--
-- Name: fact_crop_cycle fact_crop_cycle_farm_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT fact_crop_cycle_farm_key_fkey FOREIGN KEY (farm_key) REFERENCES dw.dim_farm(farm_key);


--
-- Name: fact_crop_cycle fact_crop_cycle_first_harvest_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT fact_crop_cycle_first_harvest_date_key_fkey FOREIGN KEY (first_harvest_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_crop_cycle fact_crop_cycle_harvest_season_end_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT fact_crop_cycle_harvest_season_end_date_key_fkey FOREIGN KEY (harvest_season_end_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_crop_cycle fact_crop_cycle_last_harvest_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT fact_crop_cycle_last_harvest_date_key_fkey FOREIGN KEY (last_harvest_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_crop_cycle fact_crop_cycle_planting_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_cycle
    ADD CONSTRAINT fact_crop_cycle_planting_date_key_fkey FOREIGN KEY (planting_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_crop_estimate fact_crop_estimate_crop_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_estimate
    ADD CONSTRAINT fact_crop_estimate_crop_key_fkey FOREIGN KEY (crop_key) REFERENCES dw.dim_crop(crop_key);


--
-- Name: fact_crop_estimate fact_crop_estimate_region_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_estimate
    ADD CONSTRAINT fact_crop_estimate_region_key_fkey FOREIGN KEY (region_key) REFERENCES dw.dim_region(region_key);


--
-- Name: fact_crop_estimate fact_crop_estimate_season_end_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_crop_estimate
    ADD CONSTRAINT fact_crop_estimate_season_end_date_key_fkey FOREIGN KEY (season_end_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_forecast_monthly fact_forecast_monthly_crop_category_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_forecast_monthly
    ADD CONSTRAINT fact_forecast_monthly_crop_category_key_fkey FOREIGN KEY (crop_category_key) REFERENCES dw.dim_crop_category(crop_category_key);


--
-- Name: fact_forecast_monthly fact_forecast_monthly_month_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_forecast_monthly
    ADD CONSTRAINT fact_forecast_monthly_month_date_key_fkey FOREIGN KEY (month_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_harvest fact_harvest_crop_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_harvest
    ADD CONSTRAINT fact_harvest_crop_key_fkey FOREIGN KEY (crop_key) REFERENCES dw.dim_crop(crop_key);


--
-- Name: fact_harvest fact_harvest_farm_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_harvest
    ADD CONSTRAINT fact_harvest_farm_key_fkey FOREIGN KEY (farm_key) REFERENCES dw.dim_farm(farm_key);


--
-- Name: fact_harvest fact_harvest_harvest_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_harvest
    ADD CONSTRAINT fact_harvest_harvest_date_key_fkey FOREIGN KEY (harvest_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_inventory_monthly fact_inventory_monthly_farm_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_inventory_monthly
    ADD CONSTRAINT fact_inventory_monthly_farm_key_fkey FOREIGN KEY (farm_key) REFERENCES dw.dim_farm(farm_key);


--
-- Name: fact_inventory_monthly fact_inventory_monthly_product_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_inventory_monthly
    ADD CONSTRAINT fact_inventory_monthly_product_key_fkey FOREIGN KEY (product_key) REFERENCES dw.dim_product(product_key);


--
-- Name: fact_inventory_monthly fact_inventory_monthly_snapshot_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_inventory_monthly
    ADD CONSTRAINT fact_inventory_monthly_snapshot_date_key_fkey FOREIGN KEY (snapshot_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_market_price_monthly fact_market_price_monthly_commodity_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_market_price_monthly
    ADD CONSTRAINT fact_market_price_monthly_commodity_key_fkey FOREIGN KEY (commodity_key) REFERENCES dw.dim_commodity(commodity_key);


--
-- Name: fact_market_price_monthly fact_market_price_monthly_crop_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_market_price_monthly
    ADD CONSTRAINT fact_market_price_monthly_crop_key_fkey FOREIGN KEY (crop_key) REFERENCES dw.dim_crop(crop_key);


--
-- Name: fact_market_price_monthly fact_market_price_monthly_month_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_market_price_monthly
    ADD CONSTRAINT fact_market_price_monthly_month_date_key_fkey FOREIGN KEY (month_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_production_cost fact_production_cost_cost_category_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_production_cost
    ADD CONSTRAINT fact_production_cost_cost_category_key_fkey FOREIGN KEY (cost_category_key) REFERENCES dw.dim_cost_category(cost_category_key);


--
-- Name: fact_production_cost fact_production_cost_crop_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_production_cost
    ADD CONSTRAINT fact_production_cost_crop_key_fkey FOREIGN KEY (crop_key) REFERENCES dw.dim_crop(crop_key);


--
-- Name: fact_production_cost fact_production_cost_farm_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_production_cost
    ADD CONSTRAINT fact_production_cost_farm_key_fkey FOREIGN KEY (farm_key) REFERENCES dw.dim_farm(farm_key);


--
-- Name: fact_production_cost fact_production_cost_posting_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_production_cost
    ADD CONSTRAINT fact_production_cost_posting_date_key_fkey FOREIGN KEY (posting_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_sales fact_sales_customer_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_customer_key_fkey FOREIGN KEY (customer_key) REFERENCES dw.dim_customer(customer_key);


--
-- Name: fact_sales fact_sales_dispatch_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_dispatch_date_key_fkey FOREIGN KEY (dispatch_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_sales fact_sales_farm_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_farm_key_fkey FOREIGN KEY (farm_key) REFERENCES dw.dim_farm(farm_key);


--
-- Name: fact_sales fact_sales_invoice_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_invoice_date_key_fkey FOREIGN KEY (invoice_date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_sales fact_sales_product_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_product_key_fkey FOREIGN KEY (product_key) REFERENCES dw.dim_product(product_key);


--
-- Name: fact_weather_daily fact_weather_daily_date_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_weather_daily
    ADD CONSTRAINT fact_weather_daily_date_key_fkey FOREIGN KEY (date_key) REFERENCES dw.dim_date(date_key);


--
-- Name: fact_weather_daily fact_weather_daily_farm_key_fkey; Type: FK CONSTRAINT; Schema: dw; Owner: -
--

ALTER TABLE ONLY dw.fact_weather_daily
    ADD CONSTRAINT fact_weather_daily_farm_key_fkey FOREIGN KEY (farm_key) REFERENCES dw.dim_farm(farm_key);


--
-- Name: SCHEMA audit; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA audit TO gb_etl_loader;


--
-- Name: SCHEMA dw; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA dw TO gb_etl_loader;


--
-- Name: SCHEMA etl; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA etl TO gb_etl_loader;


--
-- Name: SCHEMA mart; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA mart TO gb_etl_loader;
GRANT USAGE ON SCHEMA mart TO gb_pbi_reader;


--
-- Name: SCHEMA ref; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA ref TO gb_etl_loader;


--
-- Name: SCHEMA sec; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA sec TO gb_etl_loader;


--
-- Name: SCHEMA stg; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA stg TO gb_etl_loader;


--
-- Name: FUNCTION fn_attr_asof(p_entity text, p_code text, p_attr text, p_asof date, p_current text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_attr_asof(p_entity text, p_code text, p_attr text, p_asof date, p_current text) TO gb_etl_loader;


--
-- Name: FUNCTION fn_clean_business_name(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_clean_business_name(p_txt text) TO gb_etl_loader;


--
-- Name: FUNCTION fn_easter_sunday(p_year integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_easter_sunday(p_year integer) TO gb_etl_loader;


--
-- Name: FUNCTION fn_log_step(p_batch integer, p_step text, p_target text, p_in bigint, p_out bigint, p_rej bigint, p_started timestamp with time zone, p_msg text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_log_step(p_batch integer, p_step text, p_target text, p_in bigint, p_out bigint, p_rej bigint, p_started timestamp with time zone, p_msg text) TO gb_etl_loader;


--
-- Name: FUNCTION fn_namibian_holiday(p_date date); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_namibian_holiday(p_date date) TO gb_etl_loader;


--
-- Name: FUNCTION fn_norm(p_txt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_norm(p_txt text) TO gb_etl_loader;


--
-- Name: FUNCTION fn_start_batch(p_type text, p_description text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_start_batch(p_type text, p_description text) TO gb_etl_loader;


--
-- Name: FUNCTION fn_try_date(p_txt text, p_fmt text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_try_date(p_txt text, p_fmt text) TO gb_etl_loader;


--
-- Name: FUNCTION fn_try_numeric(p_txt text, p_decimal_comma boolean); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON FUNCTION etl.fn_try_numeric(p_txt text, p_decimal_comma boolean) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_finish_batch(IN p_batch integer, IN p_status text); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_finish_batch(IN p_batch integer, IN p_status text) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_commodity(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_commodity(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_cost_category(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_cost_category(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_crop_hierarchy(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_crop_hierarchy(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_customer_scd2(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_customer_scd2(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_date(IN p_batch integer, IN p_start date, IN p_end date, IN p_cutoff date); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_date(IN p_batch integer, IN p_start date, IN p_end date, IN p_cutoff date) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_farm_scd2(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_farm_scd2(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_dim_region(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_dim_region(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_crop_cycle(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_crop_cycle(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_crop_estimate(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_crop_estimate(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_harvest(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_harvest(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_inventory(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_inventory(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_market_price(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_market_price(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_production_cost(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_production_cost(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_sales(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_sales(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_load_fact_weather(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_load_fact_weather(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_reconcile(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_reconcile(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_run_full_load(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_run_full_load(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_run_master_delta(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_run_master_delta(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_costs(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_costs(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_crop_estimates(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_crop_estimates(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_harvest(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_harvest(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_market_fx(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_market_fx(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_master_data(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_master_data(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_planting(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_planting(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_sales(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_sales(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_stock(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_stock(IN p_batch integer) TO gb_etl_loader;


--
-- Name: PROCEDURE sp_transform_weather(IN p_batch integer); Type: ACL; Schema: etl; Owner: -
--

GRANT ALL ON PROCEDURE etl.sp_transform_weather(IN p_batch integer) TO gb_etl_loader;


--
-- Name: TABLE dq_issue_log; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.dq_issue_log TO gb_etl_loader;


--
-- Name: SEQUENCE dq_issue_log_issue_id_seq; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON SEQUENCE audit.dq_issue_log_issue_id_seq TO gb_etl_loader;


--
-- Name: TABLE dq_rule; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.dq_rule TO gb_etl_loader;


--
-- Name: TABLE etl_batch; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.etl_batch TO gb_etl_loader;


--
-- Name: SEQUENCE etl_batch_batch_id_seq; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON SEQUENCE audit.etl_batch_batch_id_seq TO gb_etl_loader;


--
-- Name: TABLE etl_step_log; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.etl_step_log TO gb_etl_loader;


--
-- Name: SEQUENCE etl_step_log_step_id_seq; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON SEQUENCE audit.etl_step_log_step_id_seq TO gb_etl_loader;


--
-- Name: TABLE recon_result; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON TABLE audit.recon_result TO gb_etl_loader;


--
-- Name: SEQUENCE recon_result_recon_id_seq; Type: ACL; Schema: audit; Owner: -
--

GRANT ALL ON SEQUENCE audit.recon_result_recon_id_seq TO gb_etl_loader;


--
-- Name: TABLE customer_segment; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.customer_segment TO gb_etl_loader;


--
-- Name: TABLE dim_commodity; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_commodity TO gb_etl_loader;


--
-- Name: TABLE dim_cost_category; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_cost_category TO gb_etl_loader;


--
-- Name: TABLE dim_crop; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_crop TO gb_etl_loader;


--
-- Name: TABLE dim_crop_category; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_crop_category TO gb_etl_loader;


--
-- Name: TABLE dim_customer; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_customer TO gb_etl_loader;


--
-- Name: SEQUENCE dim_customer_customer_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.dim_customer_customer_key_seq TO gb_etl_loader;


--
-- Name: TABLE dim_date; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_date TO gb_etl_loader;


--
-- Name: TABLE dim_farm; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_farm TO gb_etl_loader;


--
-- Name: SEQUENCE dim_farm_farm_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.dim_farm_farm_key_seq TO gb_etl_loader;


--
-- Name: TABLE dim_product; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_product TO gb_etl_loader;


--
-- Name: SEQUENCE dim_product_product_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.dim_product_product_key_seq TO gb_etl_loader;


--
-- Name: TABLE dim_region; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.dim_region TO gb_etl_loader;


--
-- Name: TABLE fact_crop_cycle; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_crop_cycle TO gb_etl_loader;


--
-- Name: SEQUENCE fact_crop_cycle_crop_cycle_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_crop_cycle_crop_cycle_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_crop_estimate; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_crop_estimate TO gb_etl_loader;


--
-- Name: SEQUENCE fact_crop_estimate_crop_estimate_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_crop_estimate_crop_estimate_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_forecast_monthly; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_forecast_monthly TO gb_etl_loader;


--
-- Name: SEQUENCE fact_forecast_monthly_forecast_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_forecast_monthly_forecast_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_harvest; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_harvest TO gb_etl_loader;


--
-- Name: SEQUENCE fact_harvest_harvest_event_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_harvest_harvest_event_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_inventory_monthly; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_inventory_monthly TO gb_etl_loader;


--
-- Name: SEQUENCE fact_inventory_monthly_inventory_snapshot_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_inventory_monthly_inventory_snapshot_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_market_price_monthly; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_market_price_monthly TO gb_etl_loader;


--
-- Name: SEQUENCE fact_market_price_monthly_market_price_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_market_price_monthly_market_price_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_production_cost; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_production_cost TO gb_etl_loader;


--
-- Name: SEQUENCE fact_production_cost_cost_posting_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_production_cost_cost_posting_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_sales; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_sales TO gb_etl_loader;


--
-- Name: SEQUENCE fact_sales_sales_line_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_sales_sales_line_key_seq TO gb_etl_loader;


--
-- Name: TABLE fact_weather_daily; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.fact_weather_daily TO gb_etl_loader;


--
-- Name: SEQUENCE fact_weather_daily_weather_key_seq; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON SEQUENCE dw.fact_weather_daily_weather_key_seq TO gb_etl_loader;


--
-- Name: TABLE harvest_anomaly; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.harvest_anomaly TO gb_etl_loader;


--
-- Name: TABLE yield_driver_importance; Type: ACL; Schema: dw; Owner: -
--

GRANT ALL ON TABLE dw.yield_driver_importance TO gb_etl_loader;


--
-- Name: TABLE agg_sales_monthly; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.agg_sales_monthly TO gb_pbi_reader;


--
-- Name: TABLE dim_commodity; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_commodity TO gb_pbi_reader;


--
-- Name: TABLE dim_cost_category; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_cost_category TO gb_pbi_reader;


--
-- Name: TABLE dim_crop; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_crop TO gb_pbi_reader;


--
-- Name: TABLE dim_crop_category; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_crop_category TO gb_pbi_reader;


--
-- Name: TABLE dim_customer; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_customer TO gb_pbi_reader;


--
-- Name: TABLE dim_date; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_date TO gb_pbi_reader;


--
-- Name: TABLE dim_farm; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_farm TO gb_pbi_reader;


--
-- Name: TABLE dim_product; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_product TO gb_pbi_reader;


--
-- Name: TABLE dim_region; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dim_region TO gb_pbi_reader;


--
-- Name: TABLE dq_summary; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.dq_summary TO gb_pbi_reader;


--
-- Name: TABLE fact_crop_cycle; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_crop_cycle TO gb_pbi_reader;


--
-- Name: TABLE fact_crop_estimate; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_crop_estimate TO gb_pbi_reader;


--
-- Name: TABLE fact_forecast_monthly; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_forecast_monthly TO gb_pbi_reader;


--
-- Name: TABLE fact_harvest; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_harvest TO gb_pbi_reader;


--
-- Name: TABLE fact_inventory_monthly; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_inventory_monthly TO gb_pbi_reader;


--
-- Name: TABLE fact_market_price_monthly; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_market_price_monthly TO gb_pbi_reader;


--
-- Name: TABLE fact_production_cost; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_production_cost TO gb_pbi_reader;


--
-- Name: TABLE fact_sales; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_sales TO gb_pbi_reader;


--
-- Name: TABLE fact_weather_daily; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.fact_weather_daily TO gb_pbi_reader;


--
-- Name: TABLE recon_latest; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.recon_latest TO gb_pbi_reader;


--
-- Name: TABLE user_zone_access; Type: ACL; Schema: sec; Owner: -
--

GRANT ALL ON TABLE sec.user_zone_access TO gb_etl_loader;


--
-- Name: TABLE sec_user_zone; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.sec_user_zone TO gb_pbi_reader;


--
-- Name: TABLE yield_driver_importance; Type: ACL; Schema: mart; Owner: -
--

GRANT SELECT ON TABLE mart.yield_driver_importance TO gb_pbi_reader;


--
-- Name: TABLE commodity_series; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.commodity_series TO gb_etl_loader;


--
-- Name: TABLE cost_category_alias; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.cost_category_alias TO gb_etl_loader;


--
-- Name: TABLE country; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.country TO gb_etl_loader;


--
-- Name: TABLE crop_alias; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.crop_alias TO gb_etl_loader;


--
-- Name: TABLE customer_xref; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.customer_xref TO gb_etl_loader;


--
-- Name: TABLE fx_rate_monthly; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.fx_rate_monthly TO gb_etl_loader;


--
-- Name: TABLE region_alias; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.region_alias TO gb_etl_loader;


--
-- Name: TABLE uom_conversion; Type: ACL; Schema: ref; Owner: -
--

GRANT ALL ON TABLE ref.uom_conversion TO gb_etl_loader;


--
-- Name: TABLE cost_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.cost_clean TO gb_etl_loader;


--
-- Name: TABLE cost_ledger_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.cost_ledger_raw TO gb_etl_loader;


--
-- Name: TABLE crop_estimate_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.crop_estimate_clean TO gb_etl_loader;


--
-- Name: TABLE crop_estimate_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.crop_estimate_raw TO gb_etl_loader;


--
-- Name: TABLE fred_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.fred_raw TO gb_etl_loader;


--
-- Name: TABLE harvest_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.harvest_clean TO gb_etl_loader;


--
-- Name: TABLE harvest_log_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.harvest_log_raw TO gb_etl_loader;


--
-- Name: TABLE market_price_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.market_price_clean TO gb_etl_loader;


--
-- Name: TABLE md_cost_categories_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_cost_categories_raw TO gb_etl_loader;


--
-- Name: TABLE md_crop_categories_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_crop_categories_raw TO gb_etl_loader;


--
-- Name: TABLE md_crops_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_crops_raw TO gb_etl_loader;


--
-- Name: TABLE md_customer_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_customer_clean TO gb_etl_loader;


--
-- Name: TABLE md_customer_merge_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_customer_merge_raw TO gb_etl_loader;


--
-- Name: TABLE md_customers_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_customers_raw TO gb_etl_loader;


--
-- Name: TABLE md_farm_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_farm_clean TO gb_etl_loader;


--
-- Name: TABLE md_farms_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_farms_raw TO gb_etl_loader;


--
-- Name: TABLE md_history_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_history_clean TO gb_etl_loader;


--
-- Name: TABLE md_history_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_history_raw TO gb_etl_loader;


--
-- Name: TABLE md_products_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_products_raw TO gb_etl_loader;


--
-- Name: TABLE md_regions_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.md_regions_raw TO gb_etl_loader;


--
-- Name: TABLE pink_sheet_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.pink_sheet_raw TO gb_etl_loader;


--
-- Name: TABLE planting_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.planting_clean TO gb_etl_loader;


--
-- Name: TABLE planting_register_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.planting_register_raw TO gb_etl_loader;


--
-- Name: TABLE sales_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.sales_clean TO gb_etl_loader;


--
-- Name: TABLE sales_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.sales_raw TO gb_etl_loader;


--
-- Name: TABLE stock_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.stock_clean TO gb_etl_loader;


--
-- Name: TABLE stock_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.stock_raw TO gb_etl_loader;


--
-- Name: TABLE weather_clean; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.weather_clean TO gb_etl_loader;


--
-- Name: TABLE weather_json_raw; Type: ACL; Schema: stg; Owner: -
--

GRANT ALL ON TABLE stg.weather_json_raw TO gb_etl_loader;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: mart; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA mart GRANT SELECT ON TABLES TO gb_pbi_reader;


--
-- PostgreSQL database dump complete
--

\unrestrict SsvayVOYAO7D6M8bDA38VRSJdlD9QxswcgbDybzqOPraMYSq3AvCvaHpzDJEuKG

