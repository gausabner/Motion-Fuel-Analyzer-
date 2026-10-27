# 3.2 Data warehouse design

## Architecture

We follow Kimball's bus architecture (Kimball & Ross, 2013): a set of process-oriented fact tables that share
conformed dimensions, held in PostgreSQL 16 and loaded by ELT. Python only lands the raw files; all cleansing,
conforming and loading runs as set-based SQL inside the database, where it is auditable and repeatable (Figure 2).
Power BI imports a thin `mart` layer of views, so that the model never depends on warehouse internals. Analytics
outputs written back by Python (forecasts, alerts, model results) live in the same `mart` schema, so Power BI and
the report read one source of truth.

```mermaid name=architecture caption="Solution architecture: sources, PostgreSQL layers, analytics and Power BI" width=100%
flowchart LR
  subgraph SRC["Sources S1-S9"]
    direction TB
    S1["S1 PAS attendances<br/>5 yearly gz CSV, overlapping"]
    S2["S2 PAS inpatient spells<br/>CDC export"]
    S3["S3 PAS patient index<br/>+ change log"]
    S4["S4 Ward midnight returns"]
    S5["S5 Nursing e-roster"]
    S6["S6 IDSR weekly returns"]
    S7["S7 Master data workbook<br/>10 sheets + day-2 delta"]
    S8["S8 NSA 2023 census CSV"]
    S9["S9 NASA POWER JSON"]
    S1 ~~~ S2 ~~~ S3 ~~~ S4 ~~~ S5 ~~~ S6 ~~~ S7 ~~~ S8 ~~~ S9
  end
  subgraph PG["PostgreSQL 16 - gbhs_health_dw"]
    direction TB
    L["stg.*_raw - landing<br/>all text, lossless,<br/>source_file + row_num + batch"]
    C["stg.*_clean - typed,<br/>conformed codes,<br/>latest version wins"]
    R["ref.* - code maps,<br/>region / condition /<br/>payer aliases"]
    W["dw.* - 8 facts,<br/>13 conformed dims,<br/>SCD2, special members"]
    M["mart.* - BI views,<br/>analytics outputs,<br/>aggregate MV"]
    A["audit.* - batches, steps,<br/>44 DQ rules + issue log,<br/>22 reconciliation checks"]
    SEC["sec.* - RLS mapping<br/>UPN to facility"]
    L --> C --> W --> M
    R --> C
    C -.-> A
    W -.-> A
    SEC --> M
  end
  subgraph AN["Python analytics"]
    direction TB
    PY["malaria forecast, readmission model,<br/>outbreak detection, ED wait drivers"]
  end
  subgraph PBI["Power BI"]
    direction TB
    SMD["Semantic model, Import<br/>108 measures, RLS + OLS,<br/>incremental refresh"] --> RP["Report: 4 pages +<br/>drill-through + tooltip; app"]
  end
  SRC --> PG
  PG <--> AN
  PG --> PBI
```

<!-- table: Schemas and their role (least privilege per schema; grants in 02_sql/10_security_grants.sql) -->

| Schema | Content | Who can read |
|---|---|---|
| `stg` | Landing tables (`*_raw`: every column as text, plus file name, row number and batch) and typed `*_clean` tables, merged by natural key across batches | ETL role only |
| `ref` | Mapping tables: code maps, region, condition and payer aliases | ETL role only |
| `dw` | The dimensional model: 13 dimensions and 8 facts (264 columns, all documented with a comment) | ETL role, BI developers |
| `mart` | Views and tables consumed by Power BI (no pseudonyms, no timestamps); analytics outputs; aggregate materialised view | Power BI reader role (`gbhs_pbi_reader`) |
| `audit` | Batch log, step log with row counts and timings, DQ rule catalogue and issue log, reconciliation results | ETL role, data stewards |
| `sec` | Row-level-security mapping of user principal names to facilities | ETL role; exposed to Power BI only through `mart.v_sec_user_facility` |
| `etl` | Functions and procedures of the pipeline | ETL role |

## Bus matrix

Eight business processes share thirteen conformed dimensions (bus matrix below). ● marks a direct foreign key. ○ marks a
dimension reached through a snowflaked parent: Care Unit › Facility › Region, and Diagnosis › Condition. Conformed
dimensions make **drill-across** possible. For example, nursing hours (e-roster) are divided by patient days (ward
census) through Date and Care Unit to give NHPPD, and ED attendances are divided by doctor-shifts to give load per
doctor (§3.5).

<!-- table: Enterprise bus matrix: business processes x conformed dimensions -->

| Business process (fact table) | Date | Hour | Care Unit | Facility | Region | Patient | Diagnosis | Condition | Triage | Encounter Profile | Admission Profile | Age Band | Shift |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ED and clinic attendances (`fact_encounter`) | ● | ● | ● | ○ | ○ | ● | ● | ○ | ● | ● | | ● | |
| Inpatient spells (`fact_admission`) | ● ×2 | | ● | ○ | ○ | ● | ● | ○ | | | ● | ● | |
| Ward midnight census (`fact_ward_census_daily`) | ● | | ● | ○ | ○ | | | | | | | | |
| Staffing (`fact_staff_roster`) | ● | | ● | ○ | ○ | | | | | | | | ● |
| Notifiable-disease surveillance (`fact_surveillance_weekly`) | ● | | | ● | ○ | | | ● | | | | | |
| IDSR reporting compliance (`fact_idsr_report`) | ● | | | ● | ○ | | | | | | | | |
| Population at risk, external NSA (`fact_population`) | ● | | | | ● | | | | | | | | |
| Weather, external NASA POWER (`fact_weather_daily`) | ● | | | ● | ○ | | | | | | | | |

## Grain of every fact table

<!-- table: Declared grain, fact type, measures and additivity (row counts after the 1 October 2026 load) -->

| Fact table | Type | Grain (one row per …) | Measures and additivity | Rows |
|---|---|---|---|---:|
| `fact_encounter` | Transaction | ED or clinic attendance (PAS attendance number, a degenerate dimension) | `encounter_count`, `is_lwbs`, `is_admitted`, `is_died`, `seen_within_target`: additive. `wait_to_triage_min`, `door_to_doctor_min`, `ed_los_min`: additive in sums, analysed as medians/percentiles. `age_years`: non-additive | 560,557 |
| `fact_admission` | Accumulating snapshot | Inpatient spell from admission to discharge. Milestones: admitted, discharged (role-playing discharge date), 30-day follow-up | `admission_count`, `los_days` (= patient days of the spell), `is_discharged`, `is_died`, readmission flags: additive. `prior_admissions_12m`: non-additive | 135,629 |
| `fact_ward_census_daily` | Periodic snapshot | Ward × day (midnight census) | `occupied_beds`, `beds_available`, `beds_complement`, `beds_closed`: **semi-additive** (sum across wards, never across days; summed over days they become patient days and bed days). `admissions`, `discharges`, `deaths`: additive flows | 36,435 |
| `fact_staff_roster` | Periodic snapshot | Care unit × day × shift | Hours (planned, nurse, RN, doctor, overtime, agency, sick leave): additive. `nurses_on_duty`, `doctors_on_duty`: semi-additive | 97,365 |
| `fact_surveillance_weekly` | Periodic snapshot | Facility × IDSR condition × epi week (key = Monday of the week) | Cases (<5, 5+, total), deaths, tests done and positive: additive | 21,771 |
| `fact_idsr_report` | Factless coverage | Facility × epi week **expected** to report (by the cut-off) | `report_expected`, `report_received`, `report_on_time`: additive counts, so completeness = received / expected. This fact records *what did not happen* (a missing report) | 2,470 |
| `fact_population` | Periodic snapshot (annual, external) | Region × year (key = 1 July, mid-year) | `population`: **semi-additive** (sum across regions, never across years) | 98 |
| `fact_weather_daily` | Periodic (external) | Facility location × day | `rainfall_mm`: additive over days, averaged across locations. `tmax_c`, `tmin_c`, `rh_pct`: non-additive | 18,560 |

The day-2 load proves the accumulating behaviour: 87 spells that were open at the 30 September cut-off received
their discharge milestone in place on 1 October. They were not inserted again (extract below).

<!-- table: Accumulating snapshot: spells open at the cut-off and completed by the 1 October load (extract) -->
<!-- include: evidence/ev_accumulating_snapshot.md -->

## Dimensional model (ERD)

The model is a **fact constellation** of three subject areas that share dimensions. Figures 3–7 show the ERDs at
column level for keys and the main attributes; Appendix A lists every column.

```mermaid name=erd_flow caption="ERD 1 - Patient flow (a): ED and clinic attendances, a transaction fact with eight dimensions" width=100%
%%{init: {"er": {"layoutDirection": "LR"}}}%%
erDiagram
  DIM_DATE ||--o{ FACT_ENCOUNTER : arrival_date_key
  DIM_HOUR ||--o{ FACT_ENCOUNTER : arrival_hour_key
  DIM_CARE_UNIT ||--o{ FACT_ENCOUNTER : care_unit_key
  DIM_PATIENT ||--o{ FACT_ENCOUNTER : patient_key
  DIM_DIAGNOSIS ||--o{ FACT_ENCOUNTER : diagnosis_key
  DIM_TRIAGE ||--o{ FACT_ENCOUNTER : triage_key
  DIM_ENCOUNTER_PROFILE ||--o{ FACT_ENCOUNTER : encounter_profile_key
  DIM_AGE_BAND ||--o{ FACT_ENCOUNTER : age_band_key
  DIM_FACILITY ||--o{ DIM_CARE_UNIT : facility_key
  DIM_REGION ||--o{ DIM_FACILITY : region_key
  DIM_CONDITION ||--o{ DIM_DIAGNOSIS : condition_key
  FACT_ENCOUNTER {
    bigint encounter_key PK
    varchar encounter_id "degenerate, unique"
    int arrival_date_key FK
    smallint arrival_hour_key FK
    int care_unit_key FK "SCD2 version as-was"
    int patient_key FK "SCD2 version as-was"
    int diagnosis_key FK
    smallint triage_key FK
    smallint encounter_profile_key FK "junk dimension"
    smallint age_band_key FK
    numeric door_to_doctor_min
    numeric ed_los_min
    smallint seen_within_target "0/1"
    smallint is_lwbs "additive"
  }
  DIM_PATIENT {
    int patient_key PK
    int patient_durable_key "first version key"
    varchar patient_pseudo_id "random token, not in mart"
    char sex
    varchar residence_region_name "SCD2"
    varchar payer_code "SCD2"
    date scd_effective_from
    date scd_effective_to
  }
  DIM_CARE_UNIT {
    int care_unit_key PK
    varchar unit_code "natural key"
    int facility_key FK "snowflake"
    varchar specialty "SCD2"
    smallint bed_complement "SCD2"
  }
  DIM_DIAGNOSIS {
    int diagnosis_key PK
    varchar icd10_code "natural key"
    varchar chapter_code
    int condition_key FK "snowflake"
  }
  DIM_TRIAGE {
    smallint triage_key PK
    varchar triage_code "SATS colour"
    int compliance_minutes
  }
```

```mermaid name=erd_spell caption="ERD 2 - Patient flow (b): inpatient spells, an accumulating snapshot with a role-playing date" width=80%
%%{init: {"er": {"layoutDirection": "LR"}}}%%
erDiagram
  DIM_DATE ||--o{ FACT_ADMISSION : "admission_date_key (active)"
  DIM_DATE ||--o{ FACT_ADMISSION : "discharge_date_key (role-playing)"
  DIM_CARE_UNIT ||--o{ FACT_ADMISSION : care_unit_key
  DIM_PATIENT ||--o{ FACT_ADMISSION : patient_key
  DIM_DIAGNOSIS ||--o{ FACT_ADMISSION : diagnosis_key
  DIM_ADMISSION_PROFILE ||--o{ FACT_ADMISSION : admission_profile_key
  DIM_AGE_BAND ||--o{ FACT_ADMISSION : age_band_key
  FACT_ADMISSION {
    bigint admission_key PK
    varchar admission_id "degenerate, unique"
    varchar ed_encounter_id "link to ED attendance"
    int admission_date_key FK "milestone 1"
    int discharge_date_key FK "milestone 2, -2 = in hospital"
    int care_unit_key FK "admitting ward"
    int patient_key FK
    int diagnosis_key FK "principal diagnosis"
    smallint admission_profile_key FK "junk dimension"
    smallint los_days "additive"
    smallint is_died
    smallint readmission_eligible
    smallint readmitted_within_30d "milestone 3"
  }
  DIM_ADMISSION_PROFILE {
    smallint admission_profile_key PK
    varchar admission_method_code
    boolean is_emergency
    varchar discharge_status_code
  }
```

```mermaid name=erd_resource caption="ERD 3 - Resource utilisation: ward census and e-roster (periodic snapshots) sharing Date and Care Unit" width=80%
erDiagram
  DIM_DATE ||--o{ FACT_WARD_CENSUS_DAILY : census_date_key
  DIM_CARE_UNIT ||--o{ FACT_WARD_CENSUS_DAILY : "care_unit_key (version valid that day)"
  DIM_DATE ||--o{ FACT_STAFF_ROSTER : roster_date_key
  DIM_CARE_UNIT ||--o{ FACT_STAFF_ROSTER : care_unit_key
  DIM_SHIFT ||--o{ FACT_STAFF_ROSTER : shift_key
  DIM_FACILITY ||--o{ DIM_CARE_UNIT : facility_key
  DIM_REGION ||--o{ DIM_FACILITY : region_key
  FACT_WARD_CENSUS_DAILY {
    int census_date_key PK, FK
    int care_unit_key PK, FK
    smallint beds_available "semi-additive"
    smallint occupied_beds "semi-additive"
    smallint admissions "additive flow"
    smallint pas_occupied_beds "reconciliation"
    varchar census_source "lineage"
  }
  FACT_STAFF_ROSTER {
    int roster_date_key PK, FK
    int care_unit_key PK, FK
    smallint shift_key PK, FK
    numeric nurse_hours "additive"
    numeric overtime_hours "additive"
    numeric agency_hours "additive"
    smallint doctors_on_duty "semi-additive"
  }
  DIM_DATE {
    int date_key PK "YYYYMMDD"
    date full_date
    smallint epi_year "ISO"
    char epi_week_label "e.g. 2026-W39"
    boolean is_public_holiday "Namibia"
    char fiscal_year_label "Apr-Mar"
    boolean is_malaria_season "Jan-May"
  }
  DIM_SHIFT {
    smallint shift_key PK
    char shift_code
    time start_time
  }
  DIM_FACILITY {
    int facility_key PK
    varchar facility_code "natural key"
    varchar facility_name "Type 1"
    int region_key FK
    numeric catchment_share
  }
  DIM_REGION {
    int region_key PK
    varchar region_code "ISO 3166-2:NA"
    varchar zone
    varchar malaria_stratum
  }
```

```mermaid name=erd_surveillance caption="ERD 4 - Disease surveillance (a): weekly IDSR cases and reporting coverage, with the Diagnosis → Condition snowflake" width=88%
%%{init: {"er": {"layoutDirection": "LR"}}}%%
erDiagram
  DIM_DATE ||--o{ FACT_SURVEILLANCE_WEEKLY : epi_week_date_key
  DIM_FACILITY ||--o{ FACT_SURVEILLANCE_WEEKLY : facility_key
  DIM_CONDITION ||--o{ FACT_SURVEILLANCE_WEEKLY : condition_key
  DIM_DATE ||--o{ FACT_IDSR_REPORT : epi_week_date_key
  DIM_FACILITY ||--o{ FACT_IDSR_REPORT : facility_key
  DIM_CONDITION ||--o{ DIM_DIAGNOSIS : condition_key
  FACT_SURVEILLANCE_WEEKLY {
    int epi_week_date_key PK, FK "Monday of the epi week"
    int facility_key PK, FK
    int condition_key PK, FK
    int cases_total "additive"
    int deaths_total "additive"
    int tests_done "malaria only"
    int tests_positive
    smallint report_version "latest wins"
  }
  FACT_IDSR_REPORT {
    int epi_week_date_key PK, FK "factless coverage"
    int facility_key PK, FK
    smallint report_expected "1"
    smallint report_received "0/1"
    smallint report_on_time "0/1, first receipt"
  }
  DIM_DATE {
    int date_key PK "YYYYMMDD"
    smallint epi_year "ISO"
    char epi_week_label "e.g. 2026-W39"
    date epi_week_start "Monday"
  }
  DIM_CONDITION {
    int condition_key PK
    varchar condition_code "IDSR code"
    varchar notification "immediate / weekly"
    varchar alert_threshold
  }
  DIM_DIAGNOSIS {
    int diagnosis_key PK
    varchar icd10_code "natural key"
    int condition_key FK "-2 = not notifiable"
  }
```

```mermaid name=erd_external caption="ERD 5 - Disease surveillance (b): external context, NSA population by region and NASA POWER weather by facility" width=80%
%%{init: {"er": {"layoutDirection": "LR"}}}%%
erDiagram
  DIM_DATE ||--o{ FACT_POPULATION : year_date_key
  DIM_REGION ||--o{ FACT_POPULATION : region_key
  DIM_DATE ||--o{ FACT_WEATHER_DAILY : weather_date_key
  DIM_FACILITY ||--o{ FACT_WEATHER_DAILY : facility_key
  DIM_REGION ||--o{ DIM_FACILITY : region_key
  FACT_POPULATION {
    int year_date_key PK, FK "1 July (mid-year)"
    int region_key PK, FK
    int population "semi-additive"
    boolean is_census_count "2023 = census"
  }
  FACT_WEATHER_DAILY {
    int weather_date_key PK, FK
    int facility_key PK, FK
    numeric rainfall_mm
    numeric tmax_c
    boolean is_imputed "WE01 / WE02"
  }
  DIM_FACILITY {
    int facility_key PK
    varchar facility_code "natural key"
    int region_key FK "snowflake"
    numeric catchment_share
  }
```

### Dimensions

<!-- table: The 13 conformed dimensions -->

| Dimension | Rows | Natural key | Main attributes | History |
|---|---:|---|---|---|
| `dim_date` | 2,558 | calendar date | Day, ISO weekday, Namibian public holiday and name, working day; ISO epi year/week/label/start; month, quarter, year; fiscal year (April–March) and quarter; rainy season (July–June); malaria-season flag; after-cut-off flag | Static, generated |
| `dim_hour` | 24 | hour 0–23 | Label, day-part band, nursing shift, after-hours flag | Static |
| `dim_region` | 15 | ISO 3166-2:NA code | Region, management zone, malaria-endemicity stratum | Type 1 |
| `dim_facility` | 11 | facility code | Name, short name, type, town, coordinates, ED flag, catchment share, opening date | Type 1 (name corrected on 1 October) |
| `dim_care_unit` | 41 | unit code | Ward name, unit type, facility, **specialty, bed complement** | **Type 2** |
| `dim_patient` | 118,916 | pseudonymised patient ID | Sex, birth year, **residence region, payer class**, payer group, registration date, inferred flag, durable key | **Type 2** + inferred members |
| `dim_diagnosis` | 65 | ICD-10 code | WHO title, category, block, chapter, severity class, default specialty, chronic flag, IDSR condition | Type 1 |
| `dim_condition` | 11 | IDSR condition code | Name, IDSR category, notification timeline, alert threshold, ICD-10 codes | Type 1 |
| `dim_triage` | 7 | SATS colour | Label, priority, target and compliance minutes, colour | Static |
| `dim_encounter_profile` | 56 | department × arrival mode × disposition | Junk dimension: low-cardinality flags in one small table instead of three foreign keys | Static |
| `dim_admission_profile` | 36 | admission method × discharge status | Junk dimension, including the emergency-admission flag | Static |
| `dim_age_band` | 7 | age band | IDSR age group (under 5 / 5 and over), life stage | Static |
| `dim_shift` | 2 | shift code | Day 07:00–19:00, Night 19:00–07:00 | Static |

**A complete date dimension.**

- `dim_date` holds every day from 1 January 2021 to 31 December 2027 (2,556 days, checked by reconciliation R15),
  plus the special members −1 and −2.
- The keys are integers in YYYYMMDD format. They read as dates and fold into SQL predicates for incremental refresh.
- **ISO epidemiological weeks** are first-class attributes, because IDSR reports Monday–Sunday weeks that cross
  month and year boundaries. For example, 30 December 2024 belongs to 2025-W01.
- **Namibian public holidays** are computed, not typed in: the moveable feasts are derived from the Easter date, and
  a holiday that falls on a Sunday is observed on the Monday.

<!-- code: 02_sql/04_etl_functions.sql | from=CREATE OR REPLACE FUNCTION etl.fn_namibian_holiday | to=^END \$\$; | lang=sql -->

### Snowflaked dimensions and their trade-offs

The core is a star. We kept two snowflakes on purpose, because facts attach at more than one level of these
hierarchies:

1. **Care Unit › Facility › Region.**
   - Attendances, spells, the census and the roster are recorded per ward (care unit).
   - IDSR returns, IDSR coverage, weather and catchment population are recorded per **facility**, and the NSA
     population per **region**.
   - Flattening facility into the care unit would leave the facility-grain facts without a dimension. It would also
     repeat facility attributes in every SCD2 ward version, and a facility rename (Type 1) would have to update
     every version.
2. **Diagnosis › Condition.** PAS codes diagnoses in ICD-10, but IDSR reports *conditions*. Condition is the
   **conformed** dimension that joins clinical activity to surveillance; check R08 reconciles IDSR malaria cases with
   PAS diagnoses B50–B54 through it.

<!-- table: Star (flattened) versus snowflake for the Care Unit > Facility > Region hierarchy -->

| Criterion | Flattened star (facility and region columns inside `dim_care_unit`) | Snowflake (chosen) |
|---|---|---|
| Storage | Facility and region attributes repeated in 41 ward versions (negligible) | Each attribute stored once (negligible either way) |
| Query performance | One join fewer for ward-grain facts | One extra join to tables of 11 and 15 rows; no measurable cost in PostgreSQL (§3.7) or VertiPaq (relationships on integer keys) |
| Facility-grain facts | Need a separate facility dimension that is not conformed with the ward one, with a risk of two "Facility" slicers | One Facility dimension filters ward-grain **and** facility-grain facts (single slicer, drill-across) |
| Maintainability | A facility rename (Type 1) rewrites every ward version; region changes ripple through SCD2 rows | Type 1 change in one row; SCD2 on wards stays independent of facility attributes |
| Power BI usability | Simpler field list | Single-direction relationships Care Unit → Facility → Region; RLS on Facility propagates down to wards and to every fact |

**The patient's residence region is deliberately *flattened* (no relationship to `dim_region`).** A second path
Patient → Region would make filter propagation ambiguous, because a facility's region and a patient's home region
are different roles. The attribute is therefore a text column in `dim_patient`.

### Surrogate keys, special members and natural keys

- **Surrogate keys.** Every dimension has an integer surrogate key generated by the warehouse. It is independent of
  source codes, which change and differ between systems: ward codes had 84 spellings. Facts carry only surrogate
  keys, plus degenerate identifiers (`encounter_id`, `admission_id`) for traceability.
- **Special members.**
  - −1 = *Unknown*: for example, 180 attendances without a patient ID (EN11) and 840 invalid ICD-10 codes (EN08).
  - −2 = *Not applicable*: for example, the discharge date of a spell that is still in hospital.
  - Facts therefore never contain NULL foreign keys, and totals reconcile (R12–R14).
- **Durable key.** `patient_durable_key` is the surrogate key of the patient's first version. It is constant across
  SCD2 versions, so *distinct patients* are counted correctly even when a patient changes payer or region.
- **Smart date key.** The YYYYMMDD integer is the only "smart" key, by Kimball convention.

### Slowly changing dimension strategy

<!-- table: SCD decision per dimension attribute -->

| Dimension | Attribute(s) | SCD type | Justification |
|---|---|---|---|
| Care Unit | specialty, bed complement | **Type 2** | Occupancy must use the beds *valid that day*. When Rundu's medical ward grew from 24 to 32 beds in April 2025, occupancy before and after must not be recomputed with today's 36 beds. Specialty changes, such as a ward converted to COVID-19 isolation, change the case mix. |
| Care Unit | ward name, unit type, facility | Type 1 | Corrections, not business events |
| Patient | residence region, payer class | **Type 2** | Payer mix and catchment analyses must show the payer and region *at the time of the visit* (as-was), e.g. for medical-aid negotiations |
| Patient | sex, birth year (corrections) | Type 1 | Data corrections (MD02, MD03) |
| Facility, Region, Diagnosis, Condition | all | Type 1 | Reference data; corrections overwrite. On 1 October the facility name "GBHS Katima-Mulilo Hospital" was corrected in place |
| Date, Hour, Triage, Shift, Age Band, junk dimensions | – | Type 0 (static) | Fixed by definition |

**How Type 2 is implemented.** The master data carry a **change history**: each change has an effective date. The
procedure creates the initial version and then *replays* the events in date order. It closes the current version
(`scd_effective_to` = effective date − 1), inserts a new version with `scd_version + 1`, and skips events that do not
change the MD5 hash of the tracked attributes. Re-running a batch therefore creates no duplicate versions.

- **Facts and as-was versions.** Facts look up the version valid on the event date (`event_date BETWEEN
  scd_effective_from AND scd_effective_to`). A spell admitted in February 2022 to ward WHK-MED2 is attributed to
  its *Isolation (COVID-19)* version.
- **Patients.** The patient dimension uses the same logic in a set-based form, because it has 107,229 patients and
  11,686 later versions.
- **Integrity.** Checks R10 and R11 found no gaps, no overlaps and exactly one current version per natural key.

<!-- code: 02_sql/06_etl_load_dimensions.sql | from=-- 2\) replay Type 2 change events | to=END LOOP; | lang=sql -->

<!-- table: SCD Type 2 history of three wards (the day-2 load created RUN-MED1 v3 and KAT-PAE1 v2) -->
<!-- include: evidence/ev_scd2_unit.md -->

<!-- table: Business effect of SCD2: spells of ward WHK-MED2 attributed to the version valid on the admission date -->
<!-- include: evidence/ev_scd2_unit_effect.md -->

<!-- table: SCD2 on the patient dimension: one patient (pseudonym masked) who changed payer; attendances follow the version -->
<!-- include: evidence/ev_scd2_patient.md -->

<!-- table: SCD2 summary after the day-2 load -->
<!-- include: evidence/ev_scd2_summary.md -->

**Inferred members (late-arriving dimensions).** Some attendances refer to a patient who is not yet in the patient
index (EN10): the PAS created the attendance before the registration was exported. The load does not reject these
attendances. It creates an **inferred** patient member that carries only the pseudonym and the flag `is_inferred`.
The 1 October extract delivered the missing records, and the load **completed the same members in place**, so the
facts did not need to be re-pointed (table below).

<!-- table: Inferred members: created in the full load, completed by the day-2 load -->
<!-- include: evidence/ev_inferred_members.md -->

## Alternative designs considered

<!-- table: Comparison with alternative designs -->

| Design | Strengths | Weaknesses for GBHS | Decision |
|---|---|---|---|
| **Kimball constellation with conformed dimensions** (chosen) | Fast, understandable star joins; Power BI-native; facts at their natural grain; drill-across through conformed Date, Care Unit, Facility and Condition | Needs disciplined conformance (reference maps, SCD) and more ETL logic | **Chosen.** The questions cross processes (flow × beds × staff × disease), which is exactly what conformed dimensions solve |
| **Inmon 3NF enterprise warehouse + data marts** | Single integrated, normalised model; good for many future subject areas | Two modelling layers to build and maintain; users still need marts; slower to deliver for a five-person team in one semester | Rejected: too heavy for the scope; we keep normalised reference data in `ref` |
| **Data Vault 2.0** (hubs, links, satellites) | Auditability, full history, parallel loading, resilient to source change | Many tables; still needs a star layer for Power BI; steep learning curve | Rejected: our `audit` schema, lossless landing and SCD2 give enough auditability |
| **One big flat table per report** | Simple for a single dashboard | Mixed grains (attendance, spell, ward-day, week) cannot share one table without double counting; no conformed slicers; semi-additive measures break | Rejected |
| **Single "patient episode" fact merging ED and inpatient** | One table for the patient journey | ED-only attendances (≈ 80 %) have no spell; spell milestones arrive days later; null-heavy and with ambiguous grain | Rejected: two facts with a degenerate link (`ed_encounter_id`) and cross-source check R06 |

## Data dictionary

The full data dictionary is **Appendix A**: all 22 tables of the `dw` and `sec` schemas (269 columns), with data type,
nullability, key, business definition and lineage. `03_analytics/build_data_dictionary.py` generates it from the
PostgreSQL catalogue comments, so it cannot drift from the DDL; it is also delivered as `data_dictionary.md` and
`.xlsx`. The same script maps the definitions onto the mart views, and `build_pbip.py` writes them into the semantic
model, so **every table, measure and visible column in Power BI has a description** (§3.4).
