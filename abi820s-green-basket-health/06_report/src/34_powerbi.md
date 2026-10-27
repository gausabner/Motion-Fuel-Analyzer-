# 3.4 Semantic model and DAX (Power BI)

The semantic model is delivered as a Power BI Project (`04_powerbi/GBHS_Health.pbip`), with TMDL for the model and
PBIR for the report (Microsoft, 2024d, 2024e). It is generated from a declarative specification (`model_spec.py`) by `build_pbip.py`, which
validates it before release:

- Microsoft's Tabular Object Model (TOM) deserialises the model in Power BI mode and writes it back to TMDL. This
  resolves every table, column, relationship, sort-by column, hierarchy level, role and the refresh policy.
- Every report file is validated against Microsoft's PBIR JSON schemas.
- Every visual field reference is checked against the model.
- A static check runs on all 113 DAX expressions.

`04_powerbi/BUILD_GUIDE.md` takes the team from the PBIP to the `.pbix` and `.pbit` in Power BI Desktop. It also
gives the values each card must show, computed independently in SQL (`expected_values.py`).

## Storage mode

<!-- table: Storage-mode decision -->

| Criterion | Import (chosen) | DirectQuery | Composite (Import + DirectQuery) |
|---|---|---|---|
| Data volume | About 0.9 M fact rows compress to roughly 12.5 MB (§3.7): far below Pro limits | No size limit | Same as Import for imported tables |
| Visual response | In-memory VertiPaq: milliseconds | Every visual sends SQL through the gateway to PostgreSQL: seconds, and load on the operational database | Mixed |
| DAX | Full: time intelligence, iterators, semi-additive patterns | Restricted functions and performance traps (iterators, time intelligence) | Full on Import tables |
| Freshness needed | Daily for management; IDSR weekly (Tuesday) | Real time (not needed) | Real time for the detail only |
| Security | RLS and OLS in the model | RLS in the model plus database permissions | Both |
| Cost and operations | Scheduled refresh; **incremental refresh** keeps it to the last 10 days | Gateway capacity, database tuning | Most complex |

**Decision: Import for all tables, with an incremental-refresh policy on `Attendance`** (Microsoft, 2024c). The
policy archives 5 years and refreshes the last 10 days. Its `RangeStart` and `RangeEnd` filter on the integer `arrival_date_key`, which
folds into the SQL `WHERE` clause. A composite model, with a DirectQuery detail table under Import aggregations, is
the scale-out path if volumes grow tenfold (§3.7).

## Model structure and relationships

The model has **32 tables**:

- 13 dimensions;
- 9 fact tables: the 8 warehouse facts, plus the derived `Catchment Population` (NSA population × catchment share);
- 5 analytics outputs: malaria forecast, outbreak alerts, readmission deciles and drivers, ED wait drivers;
- 2 governance tables: DQ summary and reconciliation;
- the hidden RLS mapping table;
- `_Measures`;
- the `Metric Selector` field parameter.

The relationship rules follow Kimball's star pattern in Power BI:

- **Many-to-one, single direction.** The dimension (one side) filters the fact (many side). There are no
  bidirectional or many-to-many relationships, so filter paths are unambiguous and fast.
- **One active path** between any dimension and any fact. The snowflakes Care Unit → Facility → Region and
  Diagnosis → Condition give a single path from a facility or condition to every fact.
- **Role-playing date.** `Admission` has an active relationship on the admission date and an **inactive** one on the
  discharge date. Discharge-based measures (ALOS, mortality, readmission) activate it with `USERELATIONSHIP`.
- **Disconnected tables** (model outputs, DQ, reconciliation, security mapping) have no relationships, so they
  cannot filter facts by accident.

<!-- table: The 38 relationships of the semantic model (all many-to-one, single cross-filter direction) -->
<!-- relationships -->

## Usability: hidden columns, folders, sort order, hierarchies and descriptions

- **Hidden technical columns.** 142 of the 258 columns are hidden. These are all surrogate and foreign keys, sort
  keys and the raw numeric fact columns. `discourageImplicitMeasures` is on, so users aggregate only through the 108
  curated measures and never through implicit sums of semi-additive columns.
- **Display folders.** Measures sit in eight folders: *0 Targets & Labels*, *1 Patient Flow*, *2 Inpatient Care*,
  *3 Resource Utilisation*, *4 Disease Surveillance*, *5 Time Intelligence*, *6 Advanced Analytics*,
  *7 Data Quality & Security*. Date attributes are foldered as *Calendar*, *Epidemiological week (IDSR)*,
  *Fiscal (Apr–Mar)* and *Seasons*. SCD history columns sit in *SCD history*.
- **Sort-by-column on 17 labels.** For example: Day Name → Day of Week; Year Month → Year Month Key; Epi Week Label →
  Epi Week Key; Fiscal Year → Fiscal Year Start; Triage Category → Priority (RED first, not alphabetical); Age Band →
  Age Band Key; ICD-10 Chapter → Chapter Number (I, II, … XXII, not alphabetical); Hour Band → Hour Band Sort;
  Metric → Metric Order.
- **Hierarchies.**
  - Date: *Calendar* (Year › Quarter › Month › Date), *Epidemiological* (Epi Year › Epi Week › Date) and *Fiscal*;
  - Region: *Geography* (Zone › Region);
  - Care Unit: *Unit* (Unit Type › Specialty › Ward);
  - Diagnosis: *ICD-10* (Chapter › Block › Diagnosis).
- **Metadata.** `Date` is marked as the date table (key column `Date`) and auto date/time is off.
  - Geographic columns carry data categories (City, StateOrProvince, Latitude, Longitude).
  - Every table, every visible column and every measure has a **description**. Column descriptions come from the
    warehouse data dictionary (§3.2), so a hover in the field list shows the business definition and source.
- **Field parameter.** `Metric Selector` lets a user switch one chart between nine KPIs: ED attendances, seen
  within target, median door-to-doctor, LWBS, bed occupancy, ALOS, readmissions, NHPPD and malaria cases.

## DAX measures

The model has **108 measures** (`04_powerbi/measures.dax`; all are listed in Appendix B). The brief asks for at least
10, including time intelligence and `CALCULATE` with filter modification. The following measures demonstrate the
required patterns; each is used on a report page.

<!-- table: Brief requirements and the measures that meet them -->

| Requirement / pattern | Measures (examples) | Page |
|---|---|---|
| ≥ 10 measures | 108 measures in 8 folders | All |
| `CALCULATE` with filter modification: `KEEPFILTERS`, `REMOVEFILTERS`, `USERELATIONSHIP`, explicit filter arguments | ED Attendances, LWBS Rate %, NHPPD, Discharges, ALOS (days), Readmission Rate 30d %, Occupied Beds (Latest Day), Catchment Person-Years, Census Population 2023, Malaria Cases | 1–4 |
| Time intelligence: `TOTALYTD`, `SAMEPERIODLASTYEAR`, `DATESINPERIOD`, `DATEADD`, `EDATE` | ED Attendances YTD, ED Attendances YTD PY (like-for-like), ED Attendances YTD YoY %, Seen Within Target % PY, Bed Occupancy % Rolling 12M, Malaria Cases Same Week Last Year, Malaria Cases 4-Week Average, Rainfall 4-8 Weeks Earlier (mm) | 1, 3 |
| Custom calendar (ISO epi year) | Malaria Cases Epi-YTD, Malaria Cases Epi-YTD PY, Malaria Cases Epi-YTD YoY % | 3 |
| Semi-additive (snapshot) | Average Daily Census, Occupied Beds (Latest Day), Bed Occupancy % (Latest Day), Catchment Population | 2, 3 |
| Drill-across two facts | NHPPD (roster ÷ census), ED Arrivals per Doctor Shift (attendances ÷ roster) | 2 |
| Statistical | Median Door-to-Doctor (min), P90 Door-to-Doctor (min) (`MEDIAN`, `PERCENTILE.INC`) | 1, 2 |
| Privacy | Notified Cases (Suppressed), Notified Cases Label (small-cell suppression < 5) | 3 |
| Security test | Current User, Visible Facilities | 4 |

**Flow KPIs: `CALCULATE` with `KEEPFILTERS`.** `KEEPFILTERS` intersects the department filter with whatever the
user has selected. A plain filter argument would override the selection, so that selecting *Clinic outpatient*
would still show ED values.

<!-- dax: Attendances; ED Attendances; Seen Within Target %; Median Door-to-Doctor (min); LWBS Rate % -->

**Role-playing date: discharge measures.** These are counted by **discharge** date by activating the inactive
relationship:

<!-- dax: Discharges; ALOS (days); Readmission Rate 30d % -->

**Semi-additive census.**
- *Average Daily Census* sums occupied beds across wards and **averages across days**.
- *Occupied Beds (Latest Day)* takes the last census date in the period. `REMOVEFILTERS` on the ward hierarchy makes
  every ward use the same "latest" date.
- *NHPPD* is a drill-across of two facts through the conformed Date and Care Unit dimensions.

<!-- dax: Average Daily Census; Occupied Beds (Latest Day); NHPPD -->

**Time intelligence.** *Year-to-date* stops at the last data date, and the prior-year window is cut at the same day
(`EDATE(…, −12)`, like-for-like). Otherwise 2026 year-to-date (data until 1 October) would be compared with the
whole of 2025. Both *rolling 12 months* and *same week last year* use the standard date functions on the marked
date table.

<!-- dax: Last Data Date; ED Attendances YTD; ED Attendances YTD PY; ED Attendances YTD YoY %; Bed Occupancy % Rolling 12M; Malaria Cases Same Week Last Year -->

**Custom time intelligence for the epidemiological year.** IDSR years run on ISO weeks: 2025-W01 started on 30
December 2024. `TOTALYTD` would therefore cut weeks in half, so the epi-year-to-date measure finds the epi year of
the context end and filters the `Epi Year` attribute instead:

<!-- dax: Malaria Cases Epi-YTD; Malaria Cases Epi-YTD PY -->

**Incidence with person-time.** An incidence rate needs a denominator in *person-years at risk*. The measure walks
the epi years in the context and multiplies each year's catchment population (NSA population × catchment share) by
the number of days of that year in the context. This uses `REMOVEFILTERS` plus an explicit filter, because the
population fact is keyed on 1 July. One measure is therefore correct for a week, a quarter, a year or five years.
For a single epi year it equals the annual population, so the matrix on page 3 reproduces the SQL pivot of §3.5
exactly.

<!-- dax: Catchment Person-Years; Catchment Population; Malaria Incidence per 1,000 PY -->

**Small-cell suppression.** Counts of 1–4 are blanked, or shown as "<5", before any external sharing of surveillance
data (§3.8):

<!-- dax: Notified Cases (Suppressed); Notified Cases Label -->

## Row-level and object-level security

The model defines four roles. A user is assigned to **one** role in the Power BI service (§3.8).

<!-- table: Security roles: RLS filters (DAX) and object-level security -->
<!-- roles -->

- **Dynamic RLS (Facility Manager; Microsoft, 2024a).**
  - The filter on `Facility` keeps the facilities that `sec.user_facility_access` maps to the signed-in user's UPN.
    This is compared in lower case, because Entra ID UPNs are case-insensitive.
  - Because the relationships run Facility → Care Unit → every ward-grain fact, and Facility → every
    facility-grain fact, one filter secures attendances, spells, census, roster, IDSR, weather and catchment data.
  - A user with no mapping sees nothing (fail closed).
  - A second filter lets managers read only their own rows of the mapping table.
  - The mapping is maintained in the warehouse by the information security officer and refreshed with the model, so
    access changes need no new version of the report.
- **Static RLS (North-East Zone).** One fixed filter, `Region[Zone] = "North-East"`, gives the malaria task team
  Zambezi and the two Kavango regions.
- **Object-level security (Surveillance Partner).** The MoHSS surveillance unit sees aggregated IDSR, population and
  weather data, but the patient-level tables are **invisible** (`metadataPermission = none`; Microsoft, 2024b): `Attendance`,
  `Admission`, `Patient` and the readmission model outputs. Their names do not appear in the field list or in
  *Analyze in Excel*, which is stronger than RLS returning empty rows.

**Test matrix.** The team runs each of the tests below with *Modeling › View as* in Desktop and with *Test as role* in
the service. The expected values were computed in SQL from the same mapping table. The facility managers' totals add
up exactly to the executive totals, because every attendance and IDSR return belongs to one facility.

<!-- table: RLS / OLS test matrix with expected values (from 04_powerbi/expected_values.py) -->
<!-- include: evidence/pbi_row-level_security_test_matrix.md -->

## Validation status and expected values

What was verified automatically at build time:

- the TOM round trip;
- schema validity of all 83 report files;
- every field reference;
- the static DAX check (113 expressions);
- the RLS test-matrix values (SQL).

DAX **execution** needs the Analysis Services engine in Power BI Desktop, so the build guide lists the expected card
values for the team to confirm after the first refresh. The model also holds the day-2 load of 1 October 2026 (163 ED
attendances), so its 2026 values differ slightly from the 30 September figures in §3.1 and §3.7. For example, 66.8 %
of patients were seen within target against 66.7 %.

<!-- table: Expected Executive Overview cards (Calendar Year slicer) - computed in SQL with the DAX logic -->
<!-- include: evidence/pbi_executive_overview_cards_by_calendar_year.md -->

<!-- table: Expected Disease Surveillance cards (Epi Year slicer) -->
<!-- include: evidence/pbi_disease_surveillance_cards_by_epi_year.md -->
