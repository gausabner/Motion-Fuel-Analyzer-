# 3.3 ETL and data integration

## Platform choice: PostgreSQL 16

<!-- table: PostgreSQL 16 vs SQL Server Express for this warehouse -->

| Criterion | PostgreSQL 16 (chosen) | SQL Server 2022 Express |
|---|---|---|
| Licence and cost | Open source (PostgreSQL Licence), no edition limits | Free, but capped |
| Hard limits | None relevant (single-table and database limits are in terabytes) | **10 GB per database**, about 1.4 GB buffer-pool memory, lesser of 1 socket or 4 cores (Microsoft, 2024c) |
| Scheduling | `pg_cron` or the OS scheduler running `run_all.py` | **No SQL Server Agent** in Express; needs Windows Task Scheduler |
| Semi-structured sources | Native JSON/JSONB: NASA POWER JSON is expanded in SQL (`jsonb_each_text`) | `OPENJSON` (adequate) |
| Analytical features used | BRIN indexes, covering `INCLUDE` indexes, materialized views, `GROUPING SETS`/`CUBE`/`ROLLUP`, `percentile_cont`, procedures with `CALL` | Mostly equivalent: columnstore and indexed views, `GROUPING SETS` |
| Power BI connectivity | Built-in PostgreSQL connector (Npgsql), supported by the on-premises data gateway; query folding verified for the incremental-refresh filter | Native connector; best tooling integration |
| Team skills and portability | Runs identically on Windows, Linux and cloud (Azure Database for PostgreSQL) | Windows/Linux, Microsoft stack |

**Decision.** PostgreSQL removes Express's 10 GB ceiling, which five years of invoice lines plus daily weather for
more farms would reach as the division grows. It also parses the external JSON natively and has no edition-based
feature gaps. The trade-off is less integrated Microsoft tooling (no SSMS or SSIS). That is mitigated by using
plain SQL scripts and Python, which are version-controlled and run from one command.

## Sources and conformed keys

<!-- table: The nine sources integrated (S1-S5 internal synthetic; S6-S9 public layouts) -->

| ID | Source | Format (as landed) | Volume | Refresh | Owner | Conformed keys produced |
|---|---|---|---:|---|---|---|
| S1 | Farm harvest logs (14 files, layouts A/B/C) + planting register | CSV | 7,476 + 1,327 rows | Daily in season | Farm managers | farm_code, crop_code, block_id, cycle_id, date |
| S2 | Master data workbook + day-2 delta | XLSX, 10 sheets | 238 rows + change logs | On change | Master data steward | farm, customer, product, crop, region, cost category |
| S3 | ERP invoice and credit-note lines (6 overlapping annual files) | gzip CSV | 305,490 rows | Daily | Sales administration | invoice_no + line_no, customer_code, product_code, farm_code |
| S4 | Stock system month-end movements | CSV | 6,519 rows | Monthly | Inventory controller | farm_code, product_code, month |
| S5 | Finance cost ledger | gzip CSV | 15,428 rows | Daily | Finance | posting_id, farm_code, crop_code, cost category, cost_centre = cycle_id |
| S6 | NASA POWER daily point data (Agroclimatology) | JSON, 1 per farm | 14 × 2,191 days | Daily | External data steward | farm location (lat/long from S2), date |
| S7 | World Bank Commodity Price Data (Pink Sheet), monthly | XLSX (wide) | 6 series × 81 months | Monthly | External data steward | commodity → crop, month |
| S8 | FRED exchange rates DEXSFUS, DEXUSEU, DEXUSUK | CSV | 5,283 daily rows | Daily | External data steward | currency, month (monthly mean) |
| S9 | NSA / MAFWLR crop estimates by region | CSV (transcribed) | 348 rows | Per season | External data steward | region, crop, season, farming sector |

**Integration** depends on six conformance mechanisms, all held in `ref.*` and steward-maintained:

1. **Farm codes:** 217 non-standard variants in the logs (`' gb-ero-01'`, `GB_OHA_01`) are standardised by rule
   HV08. ERP lines without a farm go to member −1 (SA05).
2. **Crops:** 47 spellings across logs, ledger and NSA map to 10 codes through `ref.crop_alias`.
   Pink Sheet series map to crops through `dim_commodity.crop_key`.
3. **Regions:** NSA and master-data spellings ("Zambezi (Caprivi)", "Kavango") map to ISO 3166-2 codes through
   `ref.region_alias` (MD01).
4. **Customers:** 3 duplicate accounts are merged to a survivor through `ref.customer_xref` (MD04/SA03).
   5 customers that appear in invoices before master data become **inferred members** (SA04).
5. **Units and currency:**
   - kg, t, ton, 10 kg crates and 400 kg bins convert to kg via `ref.uom_conversion`.
   - USD, EUR and GBP convert to N$ via the FRED monthly means, using the N$/ZAR parity (`ref.fx_rate_monthly`).
6. **Dates:** three layouts (DD/MM/YYYY, ISO, DD-Mon-YY) are parsed by `etl.fn_try_date`. It accepts a value only
   if formatting the parsed date reproduces the input exactly, so 13/02 cannot silently become 2 December.

## Pipeline: source → staging → warehouse

```mermaid name=lineage caption="Data lineage and run order (run_pipeline.py); every arrow is logged in audit.etl_step_log" width=100%
flowchart LR
  subgraph E["1 Extract - Python"]
    direction TB
    E1["COPY raw files into stg.*_raw<br/>all columns as text<br/>+ source_file + row_num"]
    E2["harvest layout detection<br/>templates A / B / C"]
    E1 --- E2
  end
  subgraph T["2 Transform - 05_etl_transform.sql"]
    direction TB
    T1["master data MD01-05"] --> T2["market + FX MP01, FX01"] --> T3["planting PL01-02"]
    T3 --> T4["harvest HV01-08"] --> T5["sales SA01-08"] --> T6["costs CL01-04"]
    T6 --> T7["stock ST01-03"] --> T8["weather WE01-02"] --> T9["NSA CE01-02"]
  end
  subgraph LD["3 Load - 06 / 07"]
    direction TB
    D1["dimensions: date, region,<br/>crop hierarchy, cost category,<br/>commodity, farm SCD2,<br/>customer SCD2"] --> F1["facts: sales, harvest,<br/>crop cycle, cost, inventory,<br/>weather, prices, estimates"]
  end
  subgraph Q["4 Control"]
    direction TB
    R1["sp_reconcile R01-R19"] --> O1["13_optimisation.sql<br/>indexes, BRIN, aggregate"] --> B2["batch 2: day-2 delta<br/>SCD2 master data"]
  end
  E --> T --> LD --> Q
```

The scripts run in the order shown. One command builds a fresh warehouse from the raw files:
`python 02_sql/run_pipeline.py --create-db --with-delta` (or `python run_all.py` for everything).

<!-- table: SQL and Python deliverables of the pipeline (all in the submission package) -->

| File | Purpose |
|---|---|
| `02_sql/00_create_database.sql` | Database and least-privilege login roles (`gb_etl_loader`, `gb_pbi_reader`) |
| `02_sql/01_ddl_schemas_audit.sql` | Schemas, audit tables (`etl_batch`, `etl_step_log`, `dq_rule`, `dq_issue_log`, `recon_result`), DQ rule catalogue |
| `02_sql/02_ddl_staging_ref.sql` | Landing (`*_raw`) and cleansed (`*_clean`) staging tables; reference and mapping tables with steward seed data |
| `02_sql/03_ddl_warehouse.sql` | **Warehouse DDL**: 9 dimensions, 9 facts, analytics-output tables, `COMMENT ON` for every column (Appendix C) |
| `02_sql/04_etl_functions.sql` | Parsing, normalisation, holiday, SCD-history and batch-logging functions |
| `02_sql/05_etl_transform.sql` | Nine transform procedures implementing the 37 DQ rules |
| `02_sql/06_etl_load_dimensions.sql` | Dimension loads including SCD Type 2 |
| `02_sql/07_etl_load_facts.sql` | Fact loads (surrogate-key lookups, upserts), `sp_run_full_load`, `sp_run_master_delta` |
| `02_sql/08_reconciliation.sql` | `sp_reconcile`: 19 checks |
| `02_sql/09_mart_views.sql` | BI-facing views, `mart.dq_summary`, `mart.recon_latest` |
| `02_sql/10_security_grants.sql` | Grants |
| `02_sql/11_olap_queries.sql`, `12_evidence_queries.sql`, `13_optimisation.sql` | OLAP demonstrations (§3.5), evidence queries, performance tuning (§3.7) |
| `02_sql/run_pipeline.py` | Orchestration: build, extract, `CALL`s, reconcile, optimise, delta |

**Design principles.**

1. **Lossless landing.** Every raw value is stored as text with its source file and row number, so any warehouse
   figure can be traced back to a source row.
2. **Never silently drop.** Each rule logs the raw value and the action taken (`audit.dq_issue_log`). Rejected rows
   stay in staging with `dq_status = 'REJECTED'` as a quarantine for the steward to resubmit.
3. **Idempotent and re-runnable.**
   - Facts are upserted with `ON CONFLICT ... DO UPDATE` on their natural keys.
   - SCD Type 2 uses hash comparison.
   - Re-running a batch changes nothing.
4. **Incremental.** Batch 2 (`sp_run_master_delta`) applies the 5 Oct 2026 master-data delta. It creates new SCD
   versions only for changed rows.
5. **Auditable.** Every step writes rows in, rows out, rows rejected and duration to `audit.etl_step_log` under a
   batch id stamped on every warehouse row (`dw_batch_id`).

The fact loader shows the **as-was surrogate-key lookup** (an SCD date-range join), inferred members and the
idempotent upsert:

<!-- code: 02_sql/07_etl_load_facts.sql | from=CREATE OR REPLACE PROCEDURE etl.sp_load_fact_sales | to=^END \$\$; | lang=sql -->

## Data profiling

Before any rule was written, every source was profiled with `03_analytics/data_profiling.py` for:

- row and column counts;
- duplicates;
- missing keys;
- unparseable values;
- spelling variants;
- outliers, flagged when beyond Q3 + 3 × IQR.

<!-- table: Profiling summary by source (03_analytics/data_profiling.py) -->

<!-- include: evidence/profile_summary.md -->

<!-- table: Harvest-log layouts, date formats and units of measure found by profiling -->

<!-- include: evidence/profile_harvest_formats.md | head=12 -->

<!-- table: Numeric distributions and outliers (beyond Q3 + 3 IQR) -->

<!-- include: evidence/profile_numeric.md -->

**Reading the outliers.** Not every statistical outlier is an error. Bulk maize sales and export grape containers
are legitimately 100× larger than informal-market sales. A global screen on unit price (log-price beyond
Q3 + 3 IQR within product) gives 160 candidates, many of them legitimate premium or clearance sales.

The production rule SA07 is therefore narrower. It compares each line's realised N$/kg with the **median of the
same product in the same month** and flags lines above 4× or below 0.25× of it. It flags 119 lines, and all 119 are
injected ×10 price errors (precision and recall 1.0, below).

Similarly, the harvest rule HV06 compares a record with its *own block* and sister blocks, not with all harvests.

## Data-quality rules and how each problem was handled

The rule catalogue (`audit.dq_rule`, seeded in `01_ddl_schemas_audit.sql`) holds 37 rules. Each rule has:

- a DQ dimension (validity, completeness, consistency, uniqueness, accuracy, integrity, timeliness);
- an action: **REJECT** (quarantine), **CORRECT**, **MAP**, **MERGE**, **IMPUTE**, **INFER** or **FLAG**;
- an accountable steward role.

The results of the full load are below, with an example per rule taken from the issue log.

<!-- table: DQ rule results for the full load (batch 1) -->

<!-- include: evidence/ev_dq_summary.md -->

<!-- table: One logged example per rule (raw value and action) -->

<!-- include: evidence/ev_dq_examples.md -->

<!-- table: How each class of problem was handled -->

| Problem class | Examples | Treatment | Rationale |
|---|---|---|---|
| **Missing values** | Blank harvest quantity (HV02); blank planted area (PL02); missing product weight (MD03); weather −999 (WE01/02); Pink Sheet "…" (MP01) | Reject if a measure is unusable. Impute when a defensible estimate exists: the cycle's mean block area, the pack type's weight, linear interpolation for temperature and prices. Leave rainfall NULL rather than invent rain. | Imputation only where the error is bounded. Rainfall drives yield analysis, so fabricated rain would bias §3.5. |
| **Duplicates** | Overlapping ERP extracts (SA01, 2,587 lines); re-keyed harvest rows (HV05, 89); duplicate postings (CL01, 46); duplicate customers (MD04, 3) | Deduplicate on the natural key, keeping the first occurrence. Merge customers to a survivor with a cross-reference so history moves with them. | Prevents double-counted revenue (R04/R05 prove totals match). |
| **Outliers / keying errors** | ×10 harvest quantities (HV06, 7); ×10 unit prices (SA07, 119); negative stock (ST01, 3) | **Correct** only when a mechanism explains the value (÷10 restores it to its reference; a sign flip restores the stock identity); otherwise **flag** for review | Precision first: genuine extremes such as grape containers are never "fixed". |
| **Inconsistent formats** | 3 date layouts; 47 crop spellings; 4,556 product-code variants; amount text "N$25,149.46"; region aliases | Strict parsing (`fn_try_date`, `fn_try_numeric`), alias and xref tables, normalisation (`fn_norm`) | Repeatable and steward-maintainable, instead of one-off Excel fixes. |
| **Referential gaps** | Lines without farm (SA05); customers missing from master data (SA04); harvest rows without a planting block (HV07) | Unknown member −1, or inferred member completed later | Facts are never lost and gaps stay measurable (R11, R12). |

### Validating the rules against ground truth

Because the internal data is synthetic, the generator records **every defect it injects**. That allows something
rarely possible with real data: scoring the DQ rules themselves (`03_analytics/validate_dq_rules.py`).

<!-- table: DQ rule validation against the generator's injected defects -->

<!-- include: evidence/dq_rule_validation.md -->

The three count-level differences ("see note") were investigated record by record:

- **HV08 (+2):** the two extra fixes are the duplicate copies of rows with malformed farm codes. Both copies are
  standardised before deduplication.
- **CL04 (+1):** includes 2 duplicate copies of formatted amounts, so at most one formatted amount parsed correctly
  without being logged. The ledger control total (R09) matches to the cent.
- **CL03 (+2):** a reversal and its correction re-posting copied a posting whose crop was already missing. They are
  correctly flagged too.

**Two genuine bugs were found by this validation and fixed before submission.** We report them because they show
why row counts alone do not prove data quality.

1. **HV06 masked itself.**
   - The first version compared a block's yield with the median of *all* blocks in the cycle, including itself.
   - At Hardap Dam (2025/26 maize), the cycle has only two blocks. A ×10 record (1,571 t instead of 157 t) pushed
     the median up so far that the ratio fell to 1.7 and escaped the 2.5 threshold. The block showed 47 t/ha of
     maize on the dashboard.
   - The rule now uses a **leave-one-out** median of the *sister* blocks. When only one sister exists, the planned
     yield must agree too.
   - Recall rose from 6/8 to 7/8, with still no false positives. The remaining miss (a 1,090 kg tomato pick keyed
     as ten times 109 kg) lies within the normal range of picks and cannot be distinguished by any rule.
2. **"NA" is a country.**
   - pandas' default missing-value list includes the string "NA", which is Namibia's ISO 3166 code. Reading the
     master-data workbook therefore turned the country of 226 domestic customers into NULL ("Unknown" on the
     dashboard).
   - The extract now reads Excel with `keep_default_na=False`, so landing is lossless.
   - The defect would have passed every row-count check. It was caught by a plausibility review of dimension values.

The corrected HV06 rule:

<!-- code: 02_sql/05_etl_transform.sql | from=-- HV06 unit / decimal-shift errors | to=FROM fix f WHERE f.source_file | lang=sql -->

## Reconciliation checks

`etl.sp_reconcile` runs 19 checks after every load and stores them in `audit.recon_result`, with tolerance, status
and a generated explanation. They are of six types:

- **row counts:** raw = loaded + rejected + duplicates;
- **control totals:** kg, N$;
- **cross-source:** ERP kg vs stock dispatches; harvest vs stock receipts;
- **integrity:** stock-flow identity, SCD Type 2 overlaps and gaps, date continuity;
- **referential and completeness:** unknown members, weather coverage, price coverage;
- **plausibility:** Green Basket harvest vs NSA regional totals; price anomalies.

<!-- table: Reconciliation results for the latest full batch (mart.recon_latest) -->

<!-- include: evidence/ev_recon.md -->

The single **WARN** (R19) is a business action, not a load failure: 119 invoice lines worth N$ 4.9 m carry a ×10
unit price and wait for the Sales Data Steward to issue credit notes. The revenue stays in the warehouse
(it was invoiced) but is flagged and visible on page 4.

The two cross-source checks show how integration exposes business timing:

- **R06** (ERP vs stock dispatches) differs by goods dispatched on 29–30 September and invoiced after the cut-off.
- **R18** (harvest vs stock receipts) differs by 0.27 %. That is the quarantined harvest rows plus the gap between
  standard cull rates and actual grading losses.

## Evidence that the warehouse was loaded

<!-- table: Load batches (audit.etl_batch) -->

<!-- include: evidence/ev_batches.md -->

<!-- table: Step log of the full load (audit.etl_step_log): rows in, out, rejected and duration -->

<!-- include: evidence/ev_steps.md -->

<!-- table: Sample query output: fact_sales joined to its dimensions (query ev_sample_fact_sales) -->

<!-- include: evidence/ev_sample_fact_sales.md -->

The extract log (`audit.etl_step_log`, query `ev_extract_files`) lists 44 landed files and their row counts. It is
part of the evidence pack in `06_report/evidence/ev_extract_files.md`.

**Screenshots to include in the final PDF** (captured by the team on the demo machine; see `04_powerbi/BUILD_GUIDE.md` §9):

1. pgAdmin object browser showing the schemas `stg`, `ref`, `dw`, `mart`, `audit`, `etl`, `sec`.
2. The console output of `run_pipeline.py`, ending in the reconciliation table.
3. `SELECT * FROM mart.recon_latest;` in pgAdmin.
4. The `dw.dim_farm` rows for GB-KAW-01 (SCD Type 2).
5. Power BI *Table view* of `Sales` showing 302,903 rows.

## Synthetic and public data

**Generator design** (`01_data/generate_synthetic_data.py`, about 1,900 lines). It is seeded (20261028) and fully
reproducible: two runs produce identical files, and its manifest records counts and ground truth. It simulates the
business rather than random rows:

- **Weather first.** A daily climate is generated per farm location. Season rainfall factors are anchored on the
  observed pattern: the 2023/24 El Niño drought at 0.50 of normal, and the good 2024/25 rains at 1.22.
- **Crop cycles.** Each farm's crop plan generates field blocks. Yield follows an agronomic response model.
  Plans are set at the budgeted yield, so yield vs plan is meaningful.
- **Downstream flows.** Harvests flow into stock after cull. Stock is sold through the six channels at
  channel-specific prices linked to World Bank and NAB-type price levels, FX and seasonality (grapes
  November–January). Costs are posted by cost centre (cycle).
- **Defects at realistic rates.** Duplicates from overlapping extracts, three harvest-log layouts, keying errors,
  missing values, late-arriving customers, master-data changes with effective dates, and a day-2 delta file.

<!-- code: 01_data/generate_synthetic_data.py | from=# yield drivers | to=plan_yield = round | lang=python -->

The response model is known exactly, so §3.5 can test whether the analytics **recover the truth**: rainfall
elasticity, heat and fertiliser effects. That is a stronger validation than fit statistics alone.

**Public data and reproducible links.** The external sources are public, free and need no API key.
`01_data/fetch_public_data.py` downloads them into the same paths the pipeline reads:

- NASA POWER daily point API, Agroclimatology community: <https://power.larc.nasa.gov/api/temporal/daily/point>
  (parameters PRECTOTCORR, T2M_MAX, T2M_MIN, RH2M, ALLSKY_SFC_SW_DWN), one request per farm coordinate
  (NASA Langley Research Center, 2024).
- World Bank Commodity Price Data ("Pink Sheet"), monthly historical workbook: <https://www.worldbank.org/en/research/commodity-markets>
  (World Bank, 2026).
- FRED series DEXSFUS, DEXUSEU and DEXUSUK: <https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXSFUS>
  (Federal Reserve Bank of St. Louis, 2026).
- NSA / MAFWLR crop estimates: published as PDF reports by the Namibia Statistics Agency and the Ministry of
  Agriculture, Fisheries, Water and Land Reform. They are transcribed into
  `raw/external/nsa/crop_estimates_by_region.csv` in the layout of the stand-in file.

During the build, outbound access to these hosts was blocked. The generator therefore writes stand-ins that copy the
published layouts exactly: the POWER JSON structure with −999 fill values, the Pink Sheet's three title rows and "…"
markers, and FRED's blank holiday observations. The ETL already handles the real files. This is stated as
assumption A2, and the stand-ins are never presented as real observations.
