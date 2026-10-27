# 3.7 Performance evaluation and optimisation

## Baseline and measurement method

Performance was measured at the two layers where the solution spends time.

**1. Warehouse queries** that feed refreshes and drill-throughs (`03_analytics/performance_benchmark.py`):

- Six representative queries ran on PostgreSQL 16 against the 302,903-row `fact_sales`.
- Each was run **7 times**, and we report the **median**. `EXPLAIN (ANALYZE, BUFFERS)` recorded the access path.
- The **baseline** is the warehouse straight after loading, with only primary keys and unique constraints.
- The **optimised** state is after `02_sql/13_optimisation.sql`, which the pipeline now runs after every full load.

**2. Model size and refresh volume.**

- The VertiPaq engine is not available outside Power BI. The import was therefore reproduced in **DuckDB**, a
  columnar engine with dictionary and run-length compression comparable in kind to VertiPaq.
- Two variants were compared:
  - a **naive import**: every column of every `dw` table;
  - the **optimised import**: the `mart` views the model actually uses.
- We report column counts, cardinality, compressed size, bytes streamed from PostgreSQL, and rows per refresh.

**3. Power BI Desktop (to be captured by the team).** Performance Analyzer visual timings, DAX Studio server timings
and VertiPaq Analyzer model size can only be produced in Desktop. The protocol is fixed in
`04_powerbi/BUILD_GUIDE.md` §7:

- three refreshes per page, using the median;
- cold-cache server timings for the three heaviest measures;
- a `.vpax` export.

The results go into the table at the end of this section. **The measured numbers below come from the warehouse and
the columnar proxy only. No Power BI timing has been estimated or invented.**

## Optimisation techniques with before-and-after evidence

<!-- table: Warehouse query latency before and after optimisation (median of 7 runs, ms) -->

<!-- include: evidence/perf_queries.md -->

<!-- figure: figures/fig_perf_queries.png | Query latency before and after optimisation (log scale; label = speed-up) | width=88% -->

**Technique 1: warehouse indexing** (B-tree, BRIN and covering indexes).

- B-tree indexes on the fact foreign keys turn slicer-driven queries into bitmap scans:
  - Q2, one month × zone × channel: **≈ 3.9× faster**;
  - Q3, top-10 customers over 90 days: **≈ 3.2×**.
- A **BRIN** index on `invoice_date_key` with 16 pages per range costs **24 kB**, against 2.1 MB for a B-tree on a
  key column, because invoices arrive in date order. Q5, the incremental-refresh partition, fell from 14.7 to 1.2 ms:
  **≈ 12×**.
- The **covering index** `(customer_key, invoice_date_key) INCLUDE (net_revenue_nad, quantity_kg)` lets the
  drill-through query for one customer and one quarter run as an **index-only scan**: 15.7 → 0.04 ms (≈ 400×).

<!-- code: 02_sql/13_optimisation.sql | from=CREATE INDEX IF NOT EXISTS ix_fact_sales_customer | to=ix_dim_farm_code_range | lang=sql -->

**Technique 2: aggregation table.** The materialized view `mart.agg_sales_monthly` pre-aggregates revenue by month,
product, customer channel and farm. Q6, monthly revenue by channel, drops from 99.3 ms to 6.0 ms, **≈ 17× faster**.
The same table is the ready-made Import aggregation for a composite model once detail volumes grow (§3.4). It is
refreshed by `REFRESH MATERIALIZED VIEW` after each load.

<!-- code: 02_sql/13_optimisation.sql | from=CREATE MATERIALIZED VIEW mart.agg_sales_monthly | to=ix_agg_sales_monthly_date | lang=sql -->

**Technique 3: removing unused columns, reducing cardinality and using the right data types.**

<!-- table: Model size and refresh volume, naive vs optimised import -->

<!-- include: evidence/perf_model.md | head=10 -->

- The `mart` views expose only what the model uses: **165 columns instead of 243 (−32 %)**. `fact_sales` goes from
  24 columns to 14.
- Removed:
  - the fact surrogate key `sales_line_key` (290,971 distinct values, the most expensive column for VertiPaq and
    never used in a visual);
  - audit columns;
  - the stored `gross_margin_nad`, now a measure;
  - FX and sales-rep columns.
- The text `invoice_no` is replaced by an integer `invoice_id`, so the highest-cardinality column is now an integer.
  It is still needed for the *Invoices* distinct count.
- Integer smart date keys replace dates on the facts.
- Result: compressed size **16.0 → 10.8 MB (−33 %)**, bytes streamed at refresh **46.5 → 27.6 MB (−41 %)**, and
  extract-plus-load time **2.17 → 1.27 s (−41 %)**.

**Technique 4: incremental refresh with query folding.**

- The `Sales` partition filter uses integer keys that **fold** into a `WHERE invoice_date_key >= … AND < …` predicate.
  The predicate is answered by the BRIN index (Q5).
- A daily refresh re-reads **2,162 rows instead of 302,903 (−99.3 %)**. The other facts are small enough to refresh
  in full.

**Technique 5: DAX refactoring and model design.** Measured in Desktop by the team.

- `VAR` caches repeated sub-expressions. `Net Revenue YoY %` evaluates `[Net Revenue PY]` once, not three times.
- `KEEPFILTERS` with a column predicate replaces `FILTER(ALL(...))` table iterators.
- `Closing Stock` finds the last snapshot with one `MAX` over an integer key and then a single `SUM`. It avoids a
  `SUMX` over dates with `LASTNONBLANK`.
- `REMOVEFILTERS` on the five product and farm dimensions replaced an `ALLEXCEPT` pattern whose behaviour across
  snowflaked tables was harder to reason about.
- All relationships are single-direction and many-to-one, with no bidirectional filter propagation.
- Auto date/time is off, which removes one hidden date table per date column.

<!-- table: Power BI Desktop measurements (protocol in BUILD_GUIDE.md section 7; the team records the values here) -->

| Measurement | Tool | Target | Result |
|---|---|---|---|
| Slowest visual per page, median of 3 refreshes (ms) | Performance Analyzer | < 1,000 ms | recorded in Desktop by the team |
| `Net Revenue FYTD PY` by month: total, SE, FE (ms), cold cache | DAX Studio Server Timings | < 300 ms | recorded in Desktop by the team |
| Model size, naive vs optimised import | VertiPaq Analyzer (`.vpax`) | ≤ 15 MB | recorded in Desktop by the team (proxy: 10.8 MB) |
| Full refresh time (PostgreSQL mode) | Desktop refresh | < 60 s | recorded in Desktop by the team |

## Evaluation against the KPIs and objectives of §3.1

<!-- table: The BI solution evaluated against the business objectives and KPIs -->

| Objective / KPI | Value delivered by the solution | Status | Comment |
|---|---|---|---|
| O1 Revenue growth ≥ 8 %, GM ≥ 50 % | FY2026 N$ 458.8 m, **+9.4 %**; GM **53.8 %** | Met in FY2026; **at risk** in FY2027 | The forecast shows +1.5 % for FY2027. The dashboard makes the gap visible six months ahead |
| O2 Yield at or above plan and benchmark; failed area < 3 % | Irrigated maize 8.68 vs plan 8.63 t/ha (2024/25); maize gap vs NSA −0.06 t/ha; failed area 2.0 % | Met (irrigated); weather-dependent (dryland) | Dryland −27 % in the drought year; the regression quantifies why |
| O3 Top-10 share < 50 %; export share 40–50 % | Top-10 share **57.3 %**; export **46.2 %** | **Not met** (concentration) | Segmentation names the 20 key accounts and 19 lapsed accounts to win back |
| O4 Cost per tonne −5 % real | Measurable per farm, crop and season for the first time (e.g. dryland maize N$ 3,270/t in 2024/25 vs N$ 5,120/t in 2023/24) | Baseline established | Cost per tonne is dominated by weather through yield; compare like-for-like seasons |
| O5 One trusted source, fast close, DQ ≥ 98 % | 100 % of KPIs come from the semantic model; the full rebuild runs in about 3 minutes, so the month-end pack is available the same day; 236 of 237 injected defects caught with 0 false positives; reconciliation 18 PASS / 1 WARN | **Met** | The WARN is a business action (N$ 4.9 m of mispriced lines to credit) |
| Solution: freshness | Daily refresh; incremental 2,162 rows | Met | |
| Solution: query speed | Warehouse queries 0.04–27 ms after optimisation | Met | Power BI visual timings to be confirmed in Desktop |

**Overall.** The solution answers all five business questions from one governed model. It already exposes two
uncomfortable facts that the Excel process hid:

- customer concentration (57 %) above the risk appetite;
- a flat FY2027 outlook.

Those insights justify the investment more than any technical metric.
