# 3.3 ETL, data integration and data quality

## Pipeline: source → staging → warehouse

The pipeline is **ELT**:

1. Python lands each file unchanged.
2. Every transformation, quality rule and load runs as a set-based PostgreSQL procedure.
3. Every step writes its row counts and timings to the `audit` schema.

`run_all.py` rebuilds everything from the raw files in about 5 minutes (full load 128 s; day-2 delta 6 s). A batch
is the unit of work: it carries an **extract cut-off timestamp**, and every landed row, issue, log line and loaded
fact row is stamped with its `batch_id` (lineage).

```mermaid name=pipeline caption="Pipeline steps per batch (02_sql/run_pipeline.py calls etl.sp_run_load, then etl.sp_reconcile)" width=100%
flowchart LR
  subgraph E["1 Extract - Python"]
    direction TB
    E1["COPY each file into stg.*_raw<br/>every column as text<br/>+ source_file, row_num, batch_id"]
    E2["Excel sheets, NSA CSV with<br/>title rows, NASA JSON:<br/>landed as delivered"]
    E1 --- E2
  end
  subgraph T["2 Transform - 05_etl_transform.sql"]
    direction TB
    T1["master data MD01-06"] --> T2["patients MD01-05"] --> T3["attendances EN01-12"]
    T3 --> T4["spells AD01-07"] --> T5["census WC01-04"] --> T6["roster RS01-04"]
    T6 --> T7["IDSR SV01-07"] --> T8["NSA + NASA EX01-02, WE01-02"]
  end
  subgraph LD["3 Load - 06 / 07"]
    direction TB
    D1["dimensions: date, static,<br/>region + facility (Type 1),<br/>diagnosis + condition,<br/>care unit SCD2, patient SCD2,<br/>inferred members"] --> F1["facts: encounter, admission<br/>(accumulating), census, roster,<br/>surveillance + IDSR coverage,<br/>population, weather"]
  end
  subgraph Q["4 Control"]
    direction TB
    R1["sp_reconcile R01-R22"] --> O1["mart views + grants,<br/>13_optimisation.sql"] --> B2["batch 2: 1 Oct delta<br/>same procedures"]
  end
  E --> T --> LD --> Q
```

<!-- table: Scripts of the pipeline (all submitted in 02_sql/ and 01_data/) -->

| Step | Script | What it does |
|---|---|---|
| Generate | `01_data/generate_synthetic_data.py` | Writes the synthetic source extracts, the delta files, `generator_manifest.json` and `dq_ground_truth.json` (seed 20261028) |
| Fetch public data | `01_data/fetch_public_data.py` | Downloads the real NASA POWER files into the same paths; checks the NSA regional totals against the national total |
| Database | `02_sql/00_create_database.sql`, `01_ddl_schemas_audit.sql` | Database, least-privilege roles, schemas, audit tables, catalogue of 44 DQ rules |
| Staging DDL | `02_sql/02_ddl_staging_ref.sql` | `stg.*_raw` landing tables, `stg.*_clean` typed tables, `ref.*` mapping tables |
| Warehouse DDL | `02_sql/03_ddl_warehouse.sql` | 13 dimensions, 8 facts, constraints, a `COMMENT` on every column, RLS mapping table |
| Functions | `02_sql/04_etl_functions.sql` | Parsing (timestamps, epi weeks, numbers), ICD-10 cleaning, holidays, SCD look-ups, batch and step logging |
| Transform | `02_sql/05_etl_transform.sql` | One procedure per source: applies the DQ rules, logs every issue, merges into `stg.*_clean` by natural key |
| Load | `02_sql/06_etl_load_dimensions.sql`, `07_etl_load_facts.sql` | Dimensions (Type 1, SCD2, inferred members) and facts (surrogate-key look-ups as-was, accumulating upsert); `sp_run_load` orchestrates |
| Reconcile | `02_sql/08_reconciliation.sql` | 22 checks: row counts, control totals, cross-source, integrity, completeness, plausibility |
| Publish | `02_sql/09_mart_views.sql`, `10_security_grants.sql` | Power BI views and least-privilege grants |
| Optimise | `02_sql/13_optimisation.sql` | B-tree and BRIN indexes, aggregate materialised view (§3.7) |
| Orchestrate | `02_sql/run_pipeline.py`, `run_all.py` | Extract and land, call the procedures, refresh the aggregate, run analytics, evidence and backup |

**Extract and landing.** Every source lands in a `stg.*_raw` table with **all columns as text**, plus
`source_file`, `row_num` and `batch_id`. Landing therefore never fails on a bad value, and every warehouse row can be
traced back to its file and line.

- Overlapping yearly PAS files are landed in full; the overlap is resolved by EN01.
- The spell export lands every change-data-capture (CDC) image; the latest image is kept by AD01.
- The NSA CSV lands with its title, total and footnote rows; these are rejected by EX02.
- The ten NASA POWER JSON documents land as one row each and are expanded with `jsonb_each_text` in SQL.

<!-- table: Files landed by the full load (batch 1) -->
<!-- include: evidence/ev_extract_files.md -->

## Data profiling

Before writing any rule, we profiled the landed raw tables with `03_analytics/data_profiling.py`. The output
drove the rule catalogue.

<!-- include: evidence/prof_sources.md -->

<!-- include: evidence/prof_outliers.md -->

Two counts differ slightly from the rule hits, by design:

- **Day-first timestamps.** Profiling counts *rows* with a day-first timestamp (16,477), which includes duplicate
  copies. Rule EN02 counts the attendances after duplicates are removed (16,388).
- **Nkurenkuru's `W05/2024` epi weeks.** Profiling counts 2,187 rows, one per condition. Rule SV01 counts the 234
  weekly reports they belong to.

<!-- figure: figures/prof_dq_issues.png | Data-quality issues logged in the full load, by rule and DQ dimension (log scale) | width=88% -->

## Data-quality rules and how each problem was handled

The catalogue `audit.dq_rule` holds **44 rules**. Each rule has:

- a DQ dimension (completeness, uniqueness, validity, accuracy, consistency, timeliness);
- an **action**: REJECT, CORRECT, MAP, IMPUTE, FLAG, KEEP LATEST or INFER;
- an **owner role** (data steward).

Every hit is written to `audit.dq_issue_log` with the source key, the raw value and the action taken. A problem is
therefore never fixed silently. The brief's four problem classes are handled as follows.

<!-- table: How the four problem classes required by the brief were handled -->

| Problem class | Examples found (full load) | Handling | Rules |
|---|---|---|---|
| **Missing values** | 2,875 attendances without a triage category; 180 without a patient ID; 1,084 spells not yet coded; 291 ward returns missing; 344 NASA fill values (−999) | **Flag** and load to the *Unknown* member (−1), so totals stay complete but are visible as "Not recorded". **Impute** census from PAS spells (the PAS midnight census is an independent count). Interpolate temperature and humidity linearly between neighbouring observed days; set missing dry-season rainfall (May–September) to 0 and leave rainy-season gaps NULL | EN04, EN11, AD05, WC01, WC04, WE01, WE02 |
| **Duplicates and versions** | 2,966 duplicate attendance rows (overlapping files); 16,223 superseded CDC spell images; 160 superseded patient-index rows; 194 duplicate roster rows; 109 resubmitted ward returns; 73 corrected IDSR reports | **Reject** exact duplicates. **Keep latest** by `last_updated` or report version; the latest image of a spell wins, including across batches (accumulating snapshot) | EN01, AD01, MD04, RS03, WC03, SV02 |
| **Outliers and implausible values** | Seen-by-doctor before arrival (807); ED stay over 72 h (280); discharge before admission (40); year typos such as 2035 (27); occupied beds keyed ×10 (18); IDSR counts keyed ×10 (8); negative counts or hours; deaths > cases | **Reject** the impossible timestamp but keep the attendance (the KPI is excluded, not the patient). **Correct** keying errors when a second source proves the true value: ×10 is detected only if the value is far from the PAS count *and* one tenth of it is close. **Flag** clinically possible but suspicious values for steward review | EN05, EN06, AD02, AD03, WC02, SV06, SV07, RS02, RS04, SV04, SV05, MD03 |
| **Inconsistent formats and codes** | 16,388 day-first timestamps; 15,904 badly formatted ICD-10 codes; 11,204 facility-code variants; 38,706 code variants (triage, disposition, arrival mode); 30 condition spellings; 84 ward-code spellings; 18 payer spellings; `W05/2024` epi weeks; numbers with space thousands separators | **Correct** formats with strict parsers: a regular-expression timestamp parser accepts only valid calendar dates in two layouts. **Map** spellings through `ref.*` alias tables to conformed codes. Unmapped values go to *Unknown* and are logged | EN02, EN03, EN07, EN09, SV01, SV03, AD04, AD07, MD01, MD02, MD05, RS01, EX01 |

<!-- table: The complete rule catalogue with the hits of the latest batch -->
<!-- include: evidence/ev_dq_rules.md -->

<!-- table: Examples from the issue log (one per rule type) -->
<!-- include: evidence/ev_dq_examples.md -->

The timestamp parser shows the strict style of the rules. It is a pure SQL expression, so PostgreSQL inlines it into
the set-based transform (§3.7). It accepts ISO and day-first layouts only when the date is a real calendar date,
including leap years. Anything else becomes NULL and is logged, never guessed:

<!-- code: 02_sql/04_etl_functions.sql | from=CREATE OR REPLACE FUNCTION etl.fn_parse_ts | to=^\$\$; | lang=sql -->

The ×10 keying rule for ward returns uses the PAS midnight census as an independent witness, so that a genuinely
full ward is not "corrected":

<!-- code: 02_sql/05_etl_transform.sql | from=-- WC02: a x10 keying error | to=src = CASE | lang=sql -->

## Validating the rules against ground truth

The generator damaged its own output on purpose and wrote down **which records it damaged**
(`01_data/raw/dq_ground_truth.json`). `03_analytics/validate_dq_rules.py` compares that list with the keys the rules
logged. This turns data quality from a claim into a measured result:

<!-- include: evidence/dq_rule_validation.md -->

All 28 "missed" records were in fact caught, by another rule:

- **27 EN07 records.** The generator first mis-formatted these ICD-10 codes and then overwrote them with an invalid
  code (`XYZ`, `000`, `R50.99`), which rule EN08 caught.
- **1 EN09 record.** It also had an arrival date in 2062, so EN12 rejected the whole row before the code mapping ran.

**Every damaged record was therefore flagged, and no clean record was flagged.** Two rules were rewritten after this
validation exposed weaknesses in the first version:

- **WC02.** A plain "more than 3 × the bed complement" test missed ×10 errors on small counts (2 → 20 in a 24-bed
  ward). We added the PAS cross-check.
- **SV04.** "Deaths > cases" fired on legitimate deaths reported in a later week than the case. We now allow a
  margin of 3, and the injected defects use +5.

## Conformed keys and integration

- **Conformed codes.** Each source's own spelling of the same thing is mapped through `ref.code_map`,
  `ref.region_alias`, `ref.condition_alias` and `ref.payer_alias` to the master-data code. Examples:
  `gbh-kat` → `GBH-KAT`; `LWOBS` → `LWBS`; `Measles (suspected)` → `MEA`; `MoHSS` → `MOHSS`; `Caprivi` → `NA-CA` (Zambezi).
  The NSA census names its regions differently from the master data; the same alias table maps them to ISO codes.
- **Surrogate-key look-ups as-was.** Facts take the surrogate key of the dimension version **valid on the event
  date** (`BETWEEN scd_effective_from AND scd_effective_to`). Keys that cannot be resolved go to the special members
  −1 and −2, never NULL.
- **Cross-source conformance.** Condition links ICD-10 diagnoses in PAS to IDSR returns, and Care Unit links
  attendances, spells, the census and the roster. Facility links IDSR, weather and catchment population, and Region
  links the NSA census.
- **Durable patient key.** It survives SCD2 versions and inferred members (§3.2).

## Reconciliation

`etl.sp_reconcile` runs **22 checks** after every batch and stores them in `audit.recon_result`. Each check gives
PASS, WARN (explained difference within tolerance) or FAIL (a difference that stops publication). The checks cover:

- **Row counts:** landed = accepted + rejected; staging = fact.
- **Control totals:** door-to-doctor minutes, length-of-stay days, nursing hours, the census population.
- **Cross-source checks:** ED admissions against spells; ward-return bed-days against PAS spells; IDSR malaria
  against PAS diagnoses B50–B54.
- **SCD2 and referential integrity**, **completeness** and **plausibility**.

<!-- table: Reconciliation of the latest batch (day-2 load, 1 October 2026): 20 PASS, 2 WARN, 0 FAIL -->
<!-- include: evidence/ev_recon.md -->

Both WARN results are real, explained business findings, not pipeline errors:

- **R07.** The PAS shows 3 % more bed-days than the ward returns. The 25 spells still "open" for more than 60 days account
  for 17,562 PAS bed-days, which is more than the whole 17,242-day gap. They are probable missing discharges (AD06, flagged to the Nursing Services
  Manager).
- **R22.** Three ward-days exceed 200 % occupancy. 6,002 ward-days above 100 % are plausible overflow, using
  trolleys and beds in corridors.

## Load evidence

<!-- table: Batches (audit.etl_batch) -->
<!-- include: evidence/ev_batches.md -->

<!-- table: Step log of the full load (audit.etl_step_log): rows in, rows out, rejected and time per step -->
<!-- include: evidence/ev_steps.md -->

<!-- table: Step log of the day-2 incremental load (1 October 2026): SCD2 versions, milestones, late reports -->
<!-- include: evidence/ev_steps_delta.md -->

The day-2 load exercised every incremental path with the **same procedures** as the full load:

- 320 new attendances;
- 165 spell images, of which 78 were new spells and 87 were milestone updates of open spells;
- 2 new care-unit versions: RUN-MED1 grew from 32 to 36 beds and KAT-PAE1 from 10 to 14;
- 25 new patient versions, and 40 inferred patient members completed in place;
- 1 Type 1 facility-name correction;
- 18 late IDSR returns, which moved two reports from "missing" to "received late".

Re-running a batch is idempotent: it uses `ON CONFLICT` keys, hash-compared SCD2 and "latest version wins" merges.

<!-- table: Warehouse tables after both loads (row counts and size) -->
<!-- include: evidence/ev_row_counts.md -->

<!-- table: Sample rows of fact_encounter (Rundu ED, 15 September 2026) with their dimension labels -->
<!-- include: evidence/ev_fact_sample.md -->
