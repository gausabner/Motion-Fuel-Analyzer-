-- =============================================================================
-- 06_etl_load_dimensions.sql
-- Dimension load procedures. Type 1 dimensions are upserted; dim_farm and
-- dim_customer are SCD Type 2 using one idempotent algorithm for both the
-- historical back-fill (replaying the master-data change log) and incremental
-- deltas: for each (entity, effective_date) event the full Type 2 attribute set
-- as-at that date is rebuilt, hashed, and - only if the hash differs from the
-- current row - the current row is expired (effective_to = date - 1) and a new
-- version inserted. Re-running a batch therefore never creates duplicates.
-- =============================================================================

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_date(p_batch integer, p_start date, p_end date, p_cutoff date)
LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_region(p_batch integer)
LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_crop_hierarchy(p_batch integer)
LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_cost_category(p_batch integer)
LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE PROCEDURE etl.sp_load_dim_commodity(p_batch integer)
LANGUAGE plpgsql AS $$
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
END $$;

-- ---------------------------------------------------------------------------
-- dim_farm : SCD Type 2
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_load_dim_farm_scd2(p_batch integer)
LANGUAGE plpgsql AS $$
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

-- ---------------------------------------------------------------------------
-- dim_customer : SCD Type 2 + inferred members
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_load_dim_customer_scd2(p_batch integer)
LANGUAGE plpgsql AS $$
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
