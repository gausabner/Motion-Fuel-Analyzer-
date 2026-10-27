-- =============================================================================
-- 05_etl_transform.sql
-- Staging -> cleansed staging. One procedure per source; each applies the DQ
-- rules catalogued in audit.dq_rule and logs every hit in audit.dq_issue_log.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- S2 master data (must run first: provides the mappings used by other sources)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_master_data(p_batch integer)
LANGUAGE plpgsql AS $$
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

-- ---------------------------------------------------------------------------
-- S7/S8 market prices and FX (needed before sales currency conversion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_market_fx(p_batch integer)
LANGUAGE plpgsql AS $$
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
END $$;

-- ---------------------------------------------------------------------------
-- S1 planting register
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_planting(p_batch integer)
LANGUAGE plpgsql AS $$
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

-- ---------------------------------------------------------------------------
-- S1 harvest logs (three templates)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_harvest(p_batch integer)
LANGUAGE plpgsql AS $$
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

-- ---------------------------------------------------------------------------
-- S3 ERP sales lines (requires dim_product, dim_customer and FX)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_sales(p_batch integer)
LANGUAGE plpgsql AS $$
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
END $$;

-- ---------------------------------------------------------------------------
-- S5 cost ledger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_costs(p_batch integer)
LANGUAGE plpgsql AS $$
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
END $$;

-- ---------------------------------------------------------------------------
-- S4 stock system (requires cleansed sales for gap imputation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_stock(p_batch integer)
LANGUAGE plpgsql AS $$
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

-- ---------------------------------------------------------------------------
-- S6 NASA POWER weather JSON
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_weather(p_batch integer)
LANGUAGE plpgsql AS $$
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

-- ---------------------------------------------------------------------------
-- S9 NSA / MAFWLR crop estimates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE etl.sp_transform_crop_estimates(p_batch integer)
LANGUAGE plpgsql AS $$
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
