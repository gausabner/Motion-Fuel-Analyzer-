# 3.2 Data warehouse design

## Architecture

The warehouse follows the Kimball bus architecture (Kimball & Ross, 2013): conformed dimensions are shared by
process-oriented fact tables. It is implemented in **PostgreSQL 16** as an **ELT** pipeline. Raw extracts are landed
unchanged, then cleansed and conformed in SQL inside the database, where the transformations are versioned,
testable and close to the data. The schemas below separate concerns and privileges.

```mermaid name=architecture caption="Solution architecture: sources, ELT layers in PostgreSQL, semantic model and consumers" width=100%
flowchart LR
  subgraph SRC["Sources S1-S9"]
    direction TB
    S1["S1 Farm harvest logs, 14 CSV,<br/>3 layouts + planting register"]
    S2["S2 Master data workbook<br/>10 sheets + day-2 delta"]
    S3["S3 ERP invoice lines<br/>6 gz CSV, overlapping"]
    S4["S4 Stock system, monthly CSV"]
    S5["S5 Finance cost ledger, gz CSV"]
    S6["S6 NASA POWER daily JSON"]
    S7["S7 World Bank Pink Sheet xlsx"]
    S8["S8 FRED FX, 3 CSV"]
    S9["S9 NSA / MAFWLR estimates"]
    S1 ~~~ S2 ~~~ S3 ~~~ S4 ~~~ S5 ~~~ S6 ~~~ S7 ~~~ S8 ~~~ S9
  end
  subgraph PG["PostgreSQL 16 - green_basket_dw"]
    direction TB
    L["stg.*_raw - landing<br/>all text, lossless,<br/>source_file + row_num"]
    C["stg.*_clean - typed,<br/>conformed codes,<br/>dq_status / dq_note"]
    R["ref.* - alias + xref,<br/>UoM, FX, country"]
    W["dw.* - 9 facts,<br/>9 conformed dims, SCD2"]
    M["mart.* - BI views,<br/>aggregate table"]
    A["audit.* - batches, steps,<br/>DQ issues, reconciliation"]
    L --> C --> W --> M
    R --> C
    C -.-> A
    W -.-> A
  end
  subgraph AN["Python analytics"]
    direction TB
    PY["forecast, segments,<br/>yield drivers, anomalies"]
  end
  subgraph PBI["Power BI"]
    direction TB
    SM["Semantic model, Import<br/>79 measures, 3 RLS roles,<br/>incremental refresh"] --> RP["Report: 4 pages<br/>app + subscriptions"]
  end
  SRC --> PG
  PG <--> AN
  PG --> PBI
```

<!-- table: Schemas and their role (least privilege per schema; grants in 02_sql/10_security_grants.sql) -->

| Schema | Content | Written by | Read by |
|---|---|---|---|
| `stg` | Landing tables (`*_raw`, everything as text plus source file and row number) and cleansed tables (`*_clean`, typed, with `dq_status` and `dq_note`) | `gb_etl_loader` | ETL only |
| `ref` | Mapping and reference data: region, crop and cost-category aliases; customer cross-reference; units of measure; monthly FX; countries | ETL and stewards | ETL |
| `dw` | Dimensional model: 9 dimensions and 9 facts, plus 3 analytics-output tables | `gb_etl_loader` | ETL, analytics |
| `mart` | Views shaped for Power BI (friendly names, only the columns needed) plus the aggregate `agg_sales_monthly` | ETL | `gb_pbi_reader` |
| `audit` | `etl_batch`, `etl_step_log`, `dq_rule`, `dq_issue_log`, `recon_result` | ETL | stewards, developers |
| `etl` | Functions and stored procedures (`sp_*`, `fn_*`) | developers | ETL |
| `sec` | RLS mapping of user principal name to zone (`user_zone_access`) | data owner | Power BI (RLS) |

## Bus matrix

Each row is a business process measured by a fact table. Each column is a conformed dimension. A tick means the
process carries that dimension's key, directly or through a snowflaked parent ("via").

<!-- table: Enterprise bus matrix: 9 business processes x conformed dimensions -->

| Business process (fact table) | Fact type | Date | Farm | Region | Crop | Crop category | Product | Customer | Cost category | Commodity |
|---|---|---|---|---|---|---|---|---|---|---|
| Sales invoicing (`fact_sales`) | Transaction | ✔ invoice + dispatch (role-playing) | ✔ origin | via farm | via product | via crop | ✔ | ✔ SCD2 | | |
| Harvest recording (`fact_harvest`) | Transaction | ✔ harvest | ✔ | via farm | ✔ | via crop | | | | |
| Crop-cycle management (`fact_crop_cycle`) | Accumulating snapshot | ✔ planting, first and last harvest, season end | ✔ as-was | via farm | ✔ | via crop | | | | |
| Production costing (`fact_production_cost`) | Transaction | ✔ posting | ✔ | via farm | ✔ (−2 = overhead) | via crop | | | ✔ | |
| Inventory control (`fact_inventory_monthly`) | Periodic snapshot | ✔ month-end | ✔ | via farm | via product | via crop | ✔ | | | |
| Weather monitoring (`fact_weather_daily`) | Periodic snapshot (day) | ✔ | ✔ location | via farm | | | | | | |
| World price monitoring (`fact_market_price_monthly`) | Periodic snapshot (month) | ✔ month | | | ✔ mapped | via crop | | | | ✔ |
| National benchmark (`fact_crop_estimate`) | Periodic snapshot (season) | ✔ season end | | ✔ direct | ✔ | via crop | | | | |
| Revenue forecasting (`fact_forecast_monthly`) | Periodic snapshot (model output) | ✔ month | | | | ✔ | | | | |

**Why it matters.** Date, Farm, Region and Crop are **conformed**: they carry identical keys and attributes in every
fact. That makes drill-across possible:

- yield (crop cycle) against national yield (NSA estimate) on region × crop × season (§3.5);
- harvest against stock received on farm × month (reconciliation R18);
- revenue against rainfall on farm × season.

## Grain of every fact table

<!-- table: Declared grain, measures and additivity of each fact (row counts after the 30 Sep 2026 load) -->

| Fact | Grain (one row per ...) | Measures and additivity | Degenerate dims | Rows |
|---|---|---|---|---:|
| `fact_sales` | invoice or credit-note **line** (`invoice_no` + `line_no`) | quantity_kg, gross revenue, discount, **net revenue**, COGS, freight: additive. unit_price_txn, fx_rate_nad: non-additive | invoice_no, line_no, doc_type, currency | 302,903 |
| `fact_harvest` | harvest **weighing record** of a field block on a day (source file + row) | harvested_kg: additive | block_id, recorder_code | 7,368 |
| `fact_crop_cycle` | planted **field block × crop cycle**; milestones updated in place | planted, harvested and planned kg, ha, direct cost, fertiliser: additive. planned_yield_t_ha, days_to_first_harvest: non-additive | cycle_id, block_id, variety, irrigation_method, status | 1,327 |
| `fact_production_cost` | **ledger posting line** | amount_nad: additive. input_qty: additive within one cost category | posting_id, cost_centre | 15,382 |
| `fact_inventory_monthly` | **farm × product × month-end** | opening and closing stock (kg, N$): **semi-additive** (not over time). received, dispatched, shrinkage: additive | – | 6,521 |
| `fact_weather_daily` | **farm location × day** | rainfall: additive over time, *averaged* across locations. temperatures, humidity, radiation: non-additive | – | 30,674 |
| `fact_market_price_monthly` | **commodity series × month** | price USD and N$ per tonne: non-additive (average) | – | 486 |
| `fact_crop_estimate` | **region × crop × season × farming sector** | area planted (ha), production (t): additive. yield (t/ha): non-additive | farming_sector | 324 |
| `fact_forecast_monthly` | **month × crop category × model × scenario** | actual, forecast and interval bounds (N$): additive across categories within one model | model_name, scenario | 216 |

Three fact types are used on purpose:

- **Transaction facts** (sales, harvest, cost) keep the lowest grain, so every aggregate can be derived from them.
- **The accumulating snapshot** (crop cycle) answers "how is this planting doing?" without re-aggregating thousands
  of harvest rows.
- **The periodic snapshot** (inventory) stores balances. Stock levels cannot be summed over time, so the DAX
  measure takes the last snapshot (§3.4) and the SQL roll-up does the same (§3.5, semi-additive example).

## Dimensional model (ERD)

The model is a **constellation**: nine star schemas share their dimensions. It is shown in three diagrams for
legibility. Primary keys (PK) and foreign keys (FK) are marked. The complete column list is in Appendix A.

```mermaid name=erd_sales caption="ERD 1 - Sales and inventory stars with the snowflaked product > crop > crop category and farm > region hierarchies (rotated to use the full page)" width=rotate
erDiagram
  DIM_DATE ||--o{ FACT_SALES : "invoice_date_key (active), dispatch_date_key"
  DIM_PRODUCT ||--o{ FACT_SALES : product_key
  DIM_CUSTOMER ||--o{ FACT_SALES : "customer_key (SCD2 as-was)"
  DIM_FARM ||--o{ FACT_SALES : "farm_key (origin, SCD2)"
  DIM_DATE ||--o{ FACT_INVENTORY_MONTHLY : snapshot_date_key
  DIM_FARM ||--o{ FACT_INVENTORY_MONTHLY : farm_key
  DIM_PRODUCT ||--o{ FACT_INVENTORY_MONTHLY : product_key
  DIM_CROP ||--o{ DIM_PRODUCT : "crop_key (snowflake)"
  DIM_CROP_CATEGORY ||--o{ DIM_CROP : "crop_category_key (snowflake)"
  DIM_REGION ||--o{ DIM_FARM : "region_key (snowflake)"
  FACT_SALES {
    bigint sales_line_key PK
    int invoice_date_key FK
    int dispatch_date_key FK
    int product_key FK
    int customer_key FK
    int farm_key FK
    varchar invoice_no "degenerate"
    smallint line_no "degenerate"
    numeric quantity_kg "additive"
    numeric net_revenue_nad "additive"
    numeric cogs_nad "additive"
    boolean is_price_anomaly "DQ flag SA07"
  }
  FACT_INVENTORY_MONTHLY {
    bigint inventory_snapshot_key PK
    int snapshot_date_key FK
    int farm_key FK
    int product_key FK
    numeric closing_stock_kg "semi-additive"
    numeric received_kg "additive"
    numeric dispatched_kg "additive"
  }
  DIM_DATE {
    int date_key PK "YYYYMMDD"
    date full_date
    smallint fiscal_year "Apr-Mar"
    char crop_season_label "Oct-Sep"
    boolean is_public_holiday "Namibia"
  }
  DIM_PRODUCT {
    smallint product_key PK
    varchar product_code "natural key"
    smallint crop_key FK
    varchar pack_type
    numeric net_weight_kg
  }
  DIM_CROP {
    smallint crop_key PK
    char crop_code "natural key"
    smallint crop_category_key FK
    boolean is_nab_controlled
    numeric typical_cull_pct
  }
  DIM_CROP_CATEGORY {
    smallint crop_category_key PK
    varchar category_name
  }
  DIM_CUSTOMER {
    int customer_key PK
    varchar customer_code "natural key"
    varchar channel "SCD2"
    smallint credit_terms_days "SCD2"
    date scd_effective_from
    date scd_effective_to
    boolean scd_is_current
  }
  DIM_FARM {
    int farm_key PK
    varchar farm_code "natural key"
    smallint region_key FK
    varchar irrigation_type "SCD2"
    numeric cultivated_ha "SCD2"
    date scd_effective_from
    date scd_effective_to
  }
  DIM_REGION {
    smallint region_key PK
    char region_code "ISO 3166-2"
    varchar zone_code "management zone"
  }
```

```mermaid name=erd_production caption="ERD 2 - Production and cost facts sharing the conformed Date, Farm and Crop dimensions" width=88%
%%{init: {"er": {"layoutDirection": "LR"}}}%%
erDiagram
  DIM_DATE ||--o{ FACT_HARVEST : harvest_date_key
  DIM_FARM ||--o{ FACT_HARVEST : farm_key
  DIM_CROP ||--o{ FACT_HARVEST : crop_key
  DIM_DATE ||--o{ FACT_CROP_CYCLE : "planting (active), first/last harvest, season end"
  DIM_FARM ||--o{ FACT_CROP_CYCLE : "farm_key (as-was at planting)"
  DIM_CROP ||--o{ FACT_CROP_CYCLE : crop_key
  DIM_DATE ||--o{ FACT_PRODUCTION_COST : posting_date_key
  DIM_FARM ||--o{ FACT_PRODUCTION_COST : farm_key
  DIM_CROP ||--o{ FACT_PRODUCTION_COST : "crop_key (-2 = overhead)"
  DIM_COST_CATEGORY ||--o{ FACT_PRODUCTION_COST : cost_category_key
  FACT_HARVEST {
    bigint harvest_event_key PK
    int harvest_date_key FK
    int farm_key FK
    smallint crop_key FK
    varchar block_id "degenerate"
    numeric harvested_kg "additive"
    boolean is_corrected "rule HV06"
  }
  FACT_CROP_CYCLE {
    bigint crop_cycle_key PK
    int farm_key FK
    smallint crop_key FK
    int planting_date_key FK
    int harvest_season_end_date_key FK
    varchar cycle_id "degenerate"
    varchar irrigation_method "block level"
    numeric planted_ha "additive"
    numeric harvested_kg "additive"
    numeric direct_cost_nad "additive"
  }
  FACT_PRODUCTION_COST {
    bigint cost_posting_key PK
    int posting_date_key FK
    int farm_key FK
    smallint crop_key FK
    smallint cost_category_key FK
    numeric amount_nad "additive"
  }
  DIM_COST_CATEGORY {
    smallint cost_category_key PK
    varchar cost_group
  }
  DIM_DATE {
    int date_key PK
  }
  DIM_FARM {
    int farm_key PK
  }
  DIM_CROP {
    smallint crop_key PK
  }
```

```mermaid name=erd_external caption="ERD 3 - External benchmark facts (weather, world prices, NSA estimates) and the forecast output" width=84%
%%{init: {"er": {"layoutDirection": "LR"}}}%%
erDiagram
  DIM_DATE ||--o{ FACT_WEATHER_DAILY : date_key
  DIM_FARM ||--o{ FACT_WEATHER_DAILY : "farm_key (location)"
  DIM_DATE ||--o{ FACT_MARKET_PRICE_MONTHLY : month_date_key
  DIM_COMMODITY ||--o{ FACT_MARKET_PRICE_MONTHLY : commodity_key
  DIM_CROP ||--o{ FACT_MARKET_PRICE_MONTHLY : "crop_key (mapped)"
  DIM_DATE ||--o{ FACT_CROP_ESTIMATE : season_end_date_key
  DIM_REGION ||--o{ FACT_CROP_ESTIMATE : region_key
  DIM_CROP ||--o{ FACT_CROP_ESTIMATE : crop_key
  DIM_DATE ||--o{ FACT_FORECAST_MONTHLY : month_date_key
  DIM_CROP_CATEGORY ||--o{ FACT_FORECAST_MONTHLY : crop_category_key
  FACT_WEATHER_DAILY {
    bigint weather_key PK
    int date_key FK
    int farm_key FK
    numeric rainfall_mm
    numeric t_max_c
  }
  FACT_MARKET_PRICE_MONTHLY {
    bigint market_price_key PK
    int month_date_key FK
    smallint commodity_key FK
    numeric price_nad "non-additive"
  }
  FACT_CROP_ESTIMATE {
    bigint crop_estimate_key PK
    int season_end_date_key FK
    smallint region_key FK
    smallint crop_key FK
    numeric production_t "additive"
    numeric yield_t_ha "non-additive"
  }
  FACT_FORECAST_MONTHLY {
    int month_date_key FK
    smallint crop_category_key FK
    varchar model_name
    varchar scenario
    numeric forecast_net_revenue_nad
  }
  DIM_COMMODITY {
    smallint commodity_key PK
  }
  DIM_REGION {
    smallint region_key PK
  }
  DIM_CROP_CATEGORY {
    smallint crop_category_key PK
  }
  DIM_DATE {
    int date_key PK
  }
  DIM_FARM {
    int farm_key PK
  }
  DIM_CROP {
    smallint crop_key PK
  }
```

### Dimensions

The model has nine dimensions, well above the required four.

- **`dim_date` is complete.** It has one row per day from 1 Jan 2020 to 31 Dec 2027: 2,922 days plus the −1
  "unknown" row. Reconciliation check R14 verifies there are no gaps.
- **Calendar attributes** cover week, month and quarter, with sort keys.
- **The April–March fiscal calendar** gives `fiscal_year`, `fiscal_quarter_label` and `fiscal_month_num`, used for
  sort-by-column in Power BI.
- **The October–September agricultural season** gives `crop_season_label`, which conforms with the NSA estimates.
- **Working-day logic** includes **Namibian public holidays**, computed by `etl.fn_namibian_holiday`:
  - fixed dates such as Independence Day (21 March) and Heroes' Day (26 August);
  - Easter-dependent holidays: Good Friday, Easter Monday and Ascension Day, from `etl.fn_easter_sunday`;
  - the rule that a holiday falling on a Sunday moves to the Monday.

The function is reproduced below because the brief asks for a *complete* date dimension.

<!-- code: 02_sql/04_etl_functions.sql | from=CREATE OR REPLACE FUNCTION etl.fn_easter_sunday | to=^END \$\$; | lang=sql -->

<!-- code: 02_sql/04_etl_functions.sql | from=CREATE OR REPLACE FUNCTION etl.fn_namibian_holiday | to=^END \$\$; | lang=sql -->

The other dimensions:

- `dim_farm`: SCD Type 2, 14 farms with 20 versions.
- `dim_customer`: SCD Type 2, 240 customers with 277 versions, including late-arriving inferred members.
- `dim_product` → `dim_crop` → `dim_crop_category`: the snowflake.
- `dim_region`: 14 ISO 3166-2 regions plus the management zones.
- `dim_cost_category`: 14 ledger categories in 6 cost groups.
- `dim_commodity`: 6 World Bank series.

### Snowflaked dimensions and their trade-offs

There are two deliberate snowflakes: **product → crop → crop category**, and **farm → region**, with management zone
as an attribute of region. Customer geography, by contrast, is flattened into `dim_customer`. Each dimension is
designed for its use, not for a rule.

<!-- table: Star (flattened) vs snowflake for the crop hierarchy -->

| Criterion | Flattened `dim_product` (star) | Snowflake product → crop → category (chosen) |
|---|---|---|
| **Conformance** | Fails. Harvest, crop-cycle, cost, market-price and NSA-estimate facts are recorded **per crop, not per product**, so they would need fake "product = crop" rows or their own crop dimension. Two crop dimensions would drift. | One `dim_crop` is shared by 6 facts directly and reached from sales and inventory through product. Drill-across on crop is exact. |
| **Maintainability** | Crop attributes (NAB-controlled, cull %, shelf life) are repeated on 21 product rows. Every correction touches several rows (update anomaly). | Each attribute is stored once. Rule MD03 and steward edits touch one row. |
| **Storage** | 21 rows × about 8 repeated crop attributes: negligible. | Two small extra tables: negligible. Storage is **not** the deciding factor at this size. |
| **Query performance (SQL)** | One join fewer. | One or two extra joins on tables of 12 and 5 rows. The measured cost is below 1 ms. Fact access dominates (§3.7). |
| **Power BI usability** | Simplest field list. | Two extra 1:* relationships, and filters flow one way. Drill-down Category › Crop › Product works by stacking the three fields on a visual axis. VertiPaq cost is negligible. |
| **Risk** | Grain mismatch, so totals are wrong when crop-level facts are joined to products. | Users must understand that Crop filters Sales through Product. The display folders and the hierarchy hide this. |

Region is snowflaked off farm for the same reason: `fact_crop_estimate` is recorded per **region**, and farm
location rolls up to region. Customer geography (town, region, zone, country, market group) is **flattened**. No
fact is recorded at customer-region grain, so a snowflake there would add joins without adding conformance.

### Surrogate keys, special members and natural keys

- **Integer surrogate keys** on every dimension:
  - identity columns for the SCD Type 2 dimensions, because each version needs a new key;
  - managed keys for the small reference dimensions.
- **The smart date key `YYYYMMDD`** (for example 20260930) is a deliberate exception. It is readable, sorts
  correctly, and lets the Power BI incremental-refresh filter fold into PostgreSQL as an integer range (§3.4, §3.7).
- **Special members** are always present and keep facts referentially complete with `NOT NULL` foreign keys:
  - **−1 Unknown**, for an unmatched or missing code, such as the 2,466 sales lines without a farm of origin (rule SA05);
  - **−2 Not applicable**, for example farm-overhead costs that belong to no crop.
- **Natural keys** (`farm_code`, `customer_code`, `product_code`, `crop_code`, `region_code`) are kept as alternate
  keys for lookup and lineage, but never used as relationship keys.
- **Degenerate dimensions** (`invoice_no`, `cycle_id`, `block_id`) stay on the facts.

### Slowly changing dimension strategy

<!-- table: SCD decision per dimension attribute -->

| Dimension | Attributes | SCD type | Reason |
|---|---|---|---|
| `dim_farm` | irrigation_type, cultivated_ha, water_source, farm_manager_code, GlobalGAP certification | **Type 2** | They change the farm's cost and yield structure. History must stay *as-was*. A season planted under dryland must not be re-labelled "centre pivot" after an upgrade. |
| `dim_farm` | farm_name, town, coordinates, region, total ha | Type 1 | Corrections, not business changes (e.g. the GB-KAE-02 name fix of 15 Jul 2022). |
| `dim_customer` | channel, credit_terms_days, is_key_account | **Type 2** | Revenue by channel must reflect the channel *at the time of sale* (e.g. C00105 moved from retail to wholesale on 10 Jan 2024). |
| `dim_customer` | name, town, contact formatting | Type 1 | Data cleaning (rule MD05). |
| `dim_customer` | inferred (late-arriving) members | Type 1 completion | A placeholder created by the sales load (rule SA04) is completed in place when master data arrives, so no version is created. |
| `dim_product`, `dim_crop`, `dim_region`, `dim_cost_category` | all | Type 1 | Reference data. Changes are corrections. |
| `dim_date` | all | Type 0 | Fixed. |

We also considered **Type 3** (a "previous value" column) and rejected it. Attributes change more than once: customer
C00105 has three versions in ten months, and farms change irrigation, area, water source, certification and
manager on different dates, so one previous-value column is not enough. For "as-is" reporting, the mart view of `dim_farm` adds **current-value columns**, for example
`irrigation_type_current` taken from the current version. This hybrid of Type 2 history plus current attributes
(sometimes called Type 6) serves both questions without a second dimension.

**How SCD Type 2 is implemented** (`etl.sp_load_dim_farm_scd2`):

1. Each farm's first version is reconstructed as at 1 Jan 1900 from the change log (`Farm_History` sheet), using
   `etl.fn_attr_asof`.
2. Change events are replayed in date order, grouped by farm and effective date.
3. Each candidate version is compared by an **MD5 hash** of its Type 2 attributes, so a re-run creates nothing (idempotent).
4. When the hash differs, the current row is expired (`scd_effective_to = effective_date − 1`) and a new current row is inserted.
5. Type 1 attributes are overwritten on all versions.

Facts pick the version valid on the event date with `event_date BETWEEN scd_effective_from AND scd_effective_to`
(see the `fact_sales` loader in §3.3).

<!-- code: 02_sql/06_etl_load_dimensions.sql | from=CREATE OR REPLACE PROCEDURE etl.sp_load_dim_farm_scd2 | to=^END \$\$; | lang=sql -->

**SCD Type 2 evidence** (query `ev_scd2_farm` in `02_sql/12_evidence_queries.sql`). The day-2 delta of 5 Oct 2026
added version 2 of GB-ERO-01, so the incremental path is proven as well.

<!-- include: evidence/ev_scd2_farm.md -->

<!-- include: evidence/ev_scd2_customer.md -->

**The business effect is visible.** For Nkurenkuru Valley Farm (GB-KAW-01), yield per planted hectare grouped by the
farm version valid at planting:

<!-- include: evidence/ev_scd2_effect.md -->

With a Type 1 dimension, all six seasons would read "Centre pivot". The drought-hit dryland seasons would then
wrongly drag down the pivot's apparent performance.

## Data dictionary

The complete data dictionary covers every warehouse table and column: data type, nullability, key role, business
definition and source or lineage. It is **generated from the database catalogue**: each column carries a
`COMMENT ON` in `03_ddl_warehouse.sql`, and `03_analytics/build_data_dictionary.py` exports them, so the dictionary
cannot drift from the schema. It is reproduced in full in **Appendix A** and delivered as
`06_report/data_dictionary.xlsx`. The table below summarises it.

<!-- table: Warehouse tables at a glance (row counts after the 30 Sep 2026 load and 5 Oct 2026 delta) -->

<!-- include: evidence/ev_row_counts.md -->

## Comparison with alternative designs

<!-- table: Chosen design vs fully snowflaked and flat (denormalised) alternatives -->

| Criterion | Fully snowflaked (normalised dimensions) | **Chosen: star core + 2 targeted snowflakes, 9-fact constellation** | Flat / denormalised "one big table" per process |
|---|---|---|---|
| Shape | Every hierarchy level is a table: product › crop › category; farm › region › zone; customer › town › region › country; date › month › quarter › year | Star around each fact. Snowflake only where a hierarchy level is itself a conformed grain (crop, region) | One wide table, e.g. sales plus all customer, product, farm and date attributes (about 60 columns) |
| Query complexity (SQL / DAX) | High: 5–8 joins per query; DAX filters travel long chains | Low: 1–3 joins; short filter paths | Lowest for a single process |
| Power BI performance | More relationships; long chains slow filter propagation; harder to optimise | Recommended shape for VertiPaq (Microsoft, 2024b): narrow facts, small dimensions | Wide fact with repeated text columns. Compression helps, but every attribute is stored per row and time intelligence needs a separate date table anyway |
| Storage | Smallest | Small (fact_sales 14 columns in the mart) | Largest: our model test shows 24 vs 14 fact columns, 16.0 vs 10.8 MB for the more denormalised import (§3.7) |
| Maintainability and SCD | Good for Type 1; Type 2 at several levels is hard | SCD Type 2 handled in two dimensions | Very poor: a customer channel change means rewriting history rows or losing as-was |
| Conformance and drill-across | Good | Good: conformed Date, Farm, Region and Crop are shared by 9 facts | None: each process has its own copies of attributes, so harvest vs sales vs NSA drill-across is impossible without re-joining |
| Fit for this case | Over-engineered for small dimensions (12 crops, 14 regions) | **Best balance** | Acceptable only for a one-off extract or a single dataset |

**Conclusion.** The flat design fails the brief's core need, which is to integrate production, cost, sales and
external benchmarks through shared dimensions. Full normalisation adds joins without a benefit at this
dimension size. The chosen design normalises exactly where a level is shared by facts at a coarser grain.
We also considered an Inmon-style 3NF enterprise warehouse with dependent marts and Data Vault 2.0. Both were rejected
as disproportionate for a single division with nine sources: their auditability benefit is delivered more cheaply
by the landing layer, which stores source file and row lineage, and by the audit schema.
