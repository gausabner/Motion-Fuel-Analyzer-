# 3.7 Performance optimisation and evaluation

## Baseline: what we measure and how

Performance is measured at the three points where users or the nightly window feel it:

1. **Warehouse queries**, i.e. what Power BI sends at refresh time and what a DirectQuery or drill-through would
   send. `03_analytics/performance_benchmark.py` times six representative queries. Each query runs 7 times with
   `EXPLAIN ANALYZE`, and we report the median execution time. Every query is timed **without** and **with** the
   objects of `02_sql/13_optimisation.sql`, and the access path (sequential scan or index) is recorded.
2. **The import model**: the size and cardinality of what VertiPaq must compress, and the bytes and rows that each
   refresh streams. VertiPaq itself runs only inside Power BI, so the build uses DuckDB as a proxy. DuckDB's
   dictionary and bit-packing columnar compression is the closest analogue that runs on Linux.
3. **The report**, in Power BI Desktop:
   - **Performance Analyzer**: DAX query and visual render time per visual;
   - **DAX Studio** Server Timings: storage-engine and formula-engine time per measure;
   - **VertiPaq Analyzer**: model size and the largest columns.

   These are captured by the team on the Windows build machine (`BUILD_GUIDE.md` §7). The measurement protocol is
   fixed in advance: a cold cache, three runs per page, and the median of the slowest visual.

## Optimisations with before and after

<!-- table: Warehouse query latency before and after 13_optimisation.sql (median of 7 runs, ms) -->
<!-- include: evidence/perf_queries.md -->

<!-- figure: figures/perf_queries.png | Query latency before and after optimisation (log scale) | width=86% -->

<!-- table: Import model and refresh, naive design versus the optimised mart design -->
<!-- include: evidence/perf_model.md -->

<!-- table: The optimisations and their measured effect -->

| # | Optimisation | Before | After | Effect |
|---|---|---|---|---|
| O1 | **B-tree indexes** on fact foreign keys `(care_unit_key, date_key)`, `patient_key`, `discharge_date_key`, and on the SCD2 look-up keys of the dimensions | Q2 slicer query 21.0 ms (sequential scan); Q4 patient drill-through 25.0 ms | Q2 1.8 ms (index scan); Q4 0.06 ms | **12× and 454×** faster for selective queries (slicers, drill-through, DirectQuery) |
| O2 | **BRIN index** on the ever-increasing `arrival_date_key` | Q5 incremental-refresh partition 23.0 ms | 15.8 ms (bitmap heap scan); the BRIN index is 24 kB, against 4 MB for the composite B-tree (care unit, date) | **1.5×** on date-range extracts at negligible storage and maintenance cost |
| O3 | **Aggregate materialised view** `mart.agg_ed_daily` (facility × day × department × triage: 42 k rows instead of 560 k) | Q6 daily ED KPIs 217.8 ms on the detail fact | 34.1 ms | **6.4×**. It is the basis for Power BI user-defined aggregations if the model moves to composite mode |
| O4 | **Column pruning and integer keys in the mart views** (data minimisation): no surrogate `encounter_key`, no text `encounter_id`, no timestamps, no audit columns, no `age_years` | 203 columns; 23.0 MB columnar; 117 MB streamed per refresh; highest-cardinality column `encounter_id` (563,608 distinct values) | 152 columns; 12.5 MB; 57.4 MB; highest-cardinality column `patient_key` (108 k) | **−46 % model size, −51 % refresh bytes, −52 % extract time**. Cardinality, not row count, drives VertiPaq size |
| O5 | **Incremental refresh** on `Attendance` (5 years archived, last 10 days refreshed) | 560,557 rows per refresh | 3,214 rows per refresh | **−99.4 % rows** per daily refresh |
| O6 | **Set-based, inlinable ELT** | Full load about 9.4 min in development: a timestamp parser that could not be inlined, per-row JSON look-ups, no statistics on temporary tables | 128.4 s full load, 5.5 s delta (`audit.etl_batch`) | **4.4×** faster nightly window: the parser became a pure SQL expression, weather uses `jsonb_each_text` plus window interpolation, and temporary tables are `ANALYZE`d |
| O7 | **Stored durable key** instead of a window function in the patient views | The view computed `first_value()` over 118 k patient versions for every refresh | Precomputed `patient_durable_key` column, maintained by the SCD2 load | Removes a sort of the patient dimension from every refresh; distinct patients counted on an integer column |

Q1 and Q3 did not improve (0.8× and 0.7×, differences within timing noise), and that is expected. Q1 reads a whole year of the fact, so a sequential scan is
already optimal: an index cannot beat reading every row it needs. Q3 already used the primary-key index. We report
these results rather than hide them. Indexes help **selective** queries, while large scans are served by the
aggregate (O3) and by VertiPaq after import.

**DAX-level design choices that keep the report fast** (to be confirmed with DAX Studio):

- **Integer surrogate keys and star relationships**: single direction, no bidirectional filters, no many-to-many.
- **Measures instead of calculated columns**, and no row-by-row iterators over the 560 k-row fact except `MEDIAN`
  and `PERCENTILE.INC`, which the storage engine resolves.
- **Variables** so that sub-expressions are evaluated once, as in *YTD PY*, *Latest Day* and *Person-Years*.
- **`KEEPFILTERS` predicates on low-cardinality columns** instead of `FILTER` over whole fact tables.
- **Disconnected small tables** for the analytics outputs.

## Evaluation against the KPIs

§3.7 of the brief asks for an evaluation "against the KPIs in Section 4.1". The brief has no Section 4.1, so we
evaluate against the KPIs and objectives of §3.1 (assumption A9), in two parts: (a) whether the *solution* performs
well enough to be used, and (b) what the *business KPIs* now show.

<!-- table: (a) Technical service levels of the BI solution -->

| Service level (target) | Result | Status |
|---|---|---|
| Nightly ELT including reconciliation ≤ 15 min | 128 s full rebuild, 6 s daily increment | Met |
| Power BI refresh ≤ 10 min, inside the gateway window | Incremental partition 3,214 rows; full import about 0.9 M rows (≈ 57 MB streamed) | Met by design; confirm in the service |
| Visual response ≤ 2 s, slowest visual per page | Warehouse queries 0.03–40 ms after optimisation; model 12.5 MB in memory | Expected; confirm with Performance Analyzer (`BUILD_GUIDE.md` §7) |
| Model size within the Power BI Pro limit (1 GB) | 12.5 MB (proxy) | Met, with large headroom |
| Data quality: no FAIL in reconciliation before publication | 20 PASS, 2 WARN (explained), 0 FAIL | Met |
| Freshness: management data by 07:00; IDSR by Tuesday 14:00 | Nightly batch with cut-off; IDSR due Tuesday 12:00 | Met by design |

<!-- table: (b) Business KPIs from §3.1: baseline, latest and status (calendar years; surveillance in epi years) -->

| Objective / KPI | 2022 | 2025 (baseline) | 2026 YTD | Target | Status and what the BI solution adds |
|---|---:|---:|---:|---:|---|
| O1 Seen within triage target | 78.8 % | 67.5 % | 66.7 % | ≥ 80 % | **Below target.** The wait-driver model and the 2026 intervention point to doctor load (§3.5) |
| O1 LWBS | 3.3 % | 6.2 % | 5.9 % | ≤ 3 % | Below target; the dice shows over 40 % LWBS for GREEN patients at Katima in the season peak |
| O1 Median door-to-doctor (min) | 53 | 63 | 65 | ≤ 45 | Below target |
| O2 Bed occupancy | 76.8 % | 81.8 % | 84.8 % | ≤ 85 % | **At the limit**; KAT-MED1 was over 100 % in 2025. Ward-level drill-down now visible |
| O2 Discharged before noon | 26.9 % | 26.9 % | 27.5 % | ≥ 40 % | Below target; a new KPI that was not measured before |
| O2 ALOS (days) | 4.06 | 4.10 | 4.13 | ≤ 4.0 | Slightly above |
| O3 30-day readmission | 13.0 % | 13.4 % | 13.6 % | ≤ 12 % | Above the ceiling. Risk-targeted follow-up proposed (§3.5) |
| O4 NHPPD (inpatient wards) | 5.67 | 5.37 | 5.65 | ≥ 5.5 | Restored in 2026, but through agency staff (8.6 %, against about 1 % before) |
| O4 Overtime | 3.0 % | 5.1 % | 5.4 % | ≤ 4 % | Above target |
| O4 ED arrivals per doctor-shift | 13.0 | 15.2 | 15.4 | ≤ 13 | Above target: the main lever (§3.5) |
| O5 IDSR completeness / timeliness | 97.9 % / 85.6 % | 98.7 % / 92.9 % | 98.7 % / 92.1 % | ≥ 80 % / ≥ 80 % | **Met.** Now measured per facility and week (coverage fact) |
| O5 Malaria early warning before the peak (weeks) | – | 3–6 | 2–3 | ≥ 4 | Partly met: the historical-limits alert plus the forecast give 2–6 weeks; earlier signals need rainfall-triggered thresholds |
| O5 Malaria incidence, catchment (per 1,000 person-years) | – | 25.2 | 39.2 | Reported weekly | Upsurge quantified per facility for the MoHSS (page 3) |

**Conclusion.**

- **The solution itself meets its technical targets.** Power BI timings in Desktop are the only part still to be
  confirmed.
- **It changes what management can see.** GBHS now measures discharges before noon, IDSR timeliness, NHPPD and load
  per doctor, which it could not measure before, at ward and week level.
- **It explains the KPI gap.** Waits rise with load per doctor and with occupancy, and the 2026 extra-doctor
  intervention recovered 10–13 points at the two hospitals where it ran.
- **The main recommendation** is a malaria-season roster uplift (January–May), triggered by the early-warning page
  and sized with the forecast. Combined with a discharge-before-noon programme, it addresses the two KPIs furthest
  from target (O1 and O2).
