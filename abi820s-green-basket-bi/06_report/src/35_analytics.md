# 3.5 Advanced analytics

## OLAP operations

Each operation was run as SQL against the warehouse (`02_sql/11_olap_queries.sql`; the outputs below were captured
by `capture_sql_evidence.py`). Each is mirrored by an interaction in the Power BI report, which is what the
screenshots should show.

### Roll-up: month → fiscal quarter → fiscal year → total

`GROUP BY ROLLUP` produces the subtotal levels in one pass. `GROUPING()` labels them.

<!-- code: 02_sql/11_olap_queries.sql | from=-- name: olap_rollup | to=^ORDER BY | lang=sql -->

<!-- include: evidence/olap_rollup.md -->

**What it reveals.**

- FQ3 (October–December) carries **60 %** of each year's revenue: N$ 276.4 m of N$ 458.8 m in FY2026. That is the
  grape export window.
- The other three quarters are nearly flat at N$ 53–66 m.

**Power BI:** the Fiscal Calendar hierarchy on the page-1 trend. *Drill up* goes from months to quarters to years.

### Drill-down along the snowflaked product hierarchy

<!-- include: evidence/olap_drilldown.md -->

**What it reveals.**

- Drilling from category to crop to product shows that **export cartons** (N$ 209.8 m) outweigh local grape boxes
  (N$ 26.2 m) eight to one.
- Within maize, bulk WM1 (N$ 42.9 m) dominates bagged product.

**Power BI:** the crop bar chart on page 1, with Category › Crop › Product on the axis. *Expand to next level* is
enabled.

### Slice: FY2026 revenue by management zone

<!-- include: evidence/olap_slice.md -->

**What it reveals.** Fixing one member (FY2026) shows the **South** zone (Aussenkehr, Noordoewer, Hardap) earning
56 % of revenue on 3 farms. Concentration risk is geographic as well as by customer.

**Power BI:** the Fiscal Year slicer set to FY2026, with the Zone slicer.

### Dice: Vegetables × North-Central × FY2025–26 × Retail and Informal

<!-- include: evidence/olap_dice.md -->

**What it reveals.**

- The sub-cube isolates the northern fresh-vegetable trade.
- Informal-market prices run 11–21 % below retail for the same crop: tomatoes at N$ 11.35 vs 13.42 per kg in FY2026.
- Tomato revenue fell in both channels in FY2026. That is an early warning, not visible at division level.

**Power BI:** four slicers on page 2 or 4. The question is answered without writing SQL.

### Pivot: crops as columns, fiscal years as rows

<!-- include: evidence/olap_pivot.md -->

**What it reveals.**

- Rotating crops into columns makes the growth path legible: table grapes grew from N$ 156 m to N$ 236 m
  (+51 % in four years).
- Maize dipped in FY2024, the sales year of the 2022/23 crop (rain factor 0.86). It then grew through the 2023/24
  drought. That is consistent with new irrigated area coming online: the Nkurenkuru pivot in 2023 and the Liselo
  expansion in 2024. Irrigation appears to have insulated revenue; prices also moved, so this is not a clean
  attribution.
- FY2027 is a 6-month partial year.

**Power BI:** a matrix with Crop on columns. Switching rows and columns is a pivot.

### Cube and drill-across (beyond the required five)

`GROUP BY CUBE(channel, category)` gives every subtotal combination. It shows that **export fruit** earns a 63.7 %
gross margin, against 32.1 % for millers:

<!-- include: evidence/olap_cube.md | head=12 -->

**Drill-across** joins two fact tables through the conformed Region, Crop and Date dimensions. Green Basket maize
yield (`fact_crop_cycle`) is set against the NSA commercial benchmark (`fact_crop_estimate`):

<!-- include: evidence/olap_drill_across.md | head=14 -->

Kavango West moved from below the national benchmark (1.30 vs 1.36 t/ha, dryland 2022/23) to **+0.83 t/ha above**
it once Nkurenkuru's pivot came online. The conformed dimensions answer that question without a manual join.

**Semi-additive measures.** Summing month-end stock over a quarter overstates it 2.4–4.6 times. The roll-up must take
the last month:

<!-- include: evidence/olap_semi_additive.md -->

## Technique 1: revenue forecasting (time series)

**Question (BQ4):** what revenue should the division plan for in the next 12 months, and how reliable is that number?

**Method** (`03_analytics/forecasting.py`):

- **Series:** monthly net revenue for each crop category and for the division total, April 2021 – September 2026
  (66 months).
- **Back-test:** train on 54 months; hold out the last 12 (October 2025 – September 2026), a full season.
- **Models:**
  1. **seasonal naive**, the benchmark: same month last year;
  2. **ETS(A,Ad,A)**: additive error, damped trend, additive seasonality;
  3. **SARIMA(1,0,0)(0,1,1)₁₂** with drift.
- **Transformation:** `log1p` is used when a series has no near-zero months. Fruit revenue is zero outside the grape
  season, so fruit stays on the raw scale.
- **Metrics:**
  - MAE and RMSE;
  - MAPE, computed only where actuals are not near zero;
  - **WAPE**, the primary metric, because it is robust to small months;
  - **MASE** against the in-sample seasonal naive (Hyndman & Koehler, 2006);
  - empirical coverage of the 80 % and 95 % prediction intervals.

<!-- table: Hold-out accuracy (Oct 2025 - Sep 2026) by category and model; best = lowest WAPE -->

<!-- include: evidence/forecast_metrics.md -->

<!-- figure: figures/fig_forecast_total.png | Division total: actual monthly net revenue, 12-month back-test of the selected model, and the forward forecast with 80 % and 95 % intervals | width=92% -->

**Findings.**

1. At division level, the **seasonal naive model wins** (WAPE 12.7 %), and its 80 % interval covers 83 % of the
   hold-out months, close to nominal. The business is strongly seasonal and stable, and with 4.5 seasons of
   training data the extra parameters of ETS and SARIMA cost more variance than they remove. This is the classic
   benchmark result (Hyndman & Athanasopoulos, 2021).
2. **By category** the picture differs:
   - SARIMA is clearly best for cereals: WAPE 9.2 %, MASE 0.53.
   - SARIMA is marginally best for vegetables, but at 24 % WAPE, vegetables remain the least predictable.
   - The naive model is best for fruit (11.5 %).

   Picking the best model per category reduces the pooled category-level WAPE from 16.2 % to 15.0 %.
3. **Forward forecast:**
   - October 2026 – September 2027: N$ 465.6 m.
   - FY2027 will close at about **N$ 465.6 m**: N$ 123.5 m actual for April–September plus N$ 342.1 m forecast for
     October–March. That is **+1.5 %**, well below the 8 % growth objective (O1), so mix and margin must deliver
     the gap.

<!-- include: evidence/forecast_next12.md -->

**Assumptions:**

- The seasonal pattern persists.
- No structural break: grape area is stable, and no new export market opens.
- Errors are approximately normal for the intervals.

**Limitations:**

- There is a single 12-month hold-out, i.e. one season. Rolling-origin evaluation over several seasons would give
  more stable error estimates.
- No exogenous drivers yet: the FX rate, EU grape prices and rainfall are known leading indicators. A SARIMAX with
  them is the next step.
- The dashboard card reports the category-grain WAPE (16.2 % for the naive model), while the division-total WAPE is
  12.7 %. Both are labelled.

**In Power BI:** page 3 shows actual and forecast with the 80 % band. A model slicer, read through `SELECTEDVALUE`,
switches between the three models stored in `fact_forecast_monthly`.

<!-- code: 03_analytics/forecasting.py | from=^def seasonal_naive | to=^MODELS = | lang=python -->

## Technique 2: customer segmentation (K-means clustering)

**Question (BQ4):** which groups of customers behave alike, and where should sales effort and credit control go?

**Method** (`03_analytics/clustering.py`):

- **Features** for each durable customer code at the 30 September 2026 cut-off:
  - recency (days since the last invoice);
  - frequency (invoices in the last 12 months);
  - monetary value (12-month net revenue);
  - basket size (average kg per line);
  - product breadth.
- Skewed features are `log1p`-transformed, then all features are standardised.
- **K-means** with k = 2…8 (25 initialisations each) is evaluated on:
  - silhouette (Rousseeuw, 1987);
  - Davies–Bouldin;
  - Calinski–Harabasz;
  - the within-cluster SSE elbow;
  - **stability**: the adjusted Rand index over 20 re-seeded runs.
- **Selection rule:** among stable solutions (ARI ≥ 0.95) with k ≥ 3, take the highest Calinski–Harabasz.

<!-- table: Cluster-count evaluation -->

<!-- include: evidence/cluster_k_selection.md -->

**Why not the silhouette maximum?** k = 3 has the best silhouette (0.65) but merges **84 %** of customers into one
segment, which is not actionable. k = 5 keeps a reasonable silhouette (0.41), the best Calinski–Harabasz (286) and
perfect stability (ARI 1.00). This is a documented trade-off, not metric-shopping: the rule was fixed before the
profiles were inspected.

<!-- include: evidence/cluster_profiles.md -->

<!-- figure: figures/fig_cluster_segments.png | Customer segments: distribution of the standardised features per segment (K-means, k = 5) | width=92% -->

**Findings and actions.**

- **Bulk and export key accounts** (20 customers, 58.6 % of 12-month revenue): 12 export buyers and 8 millers.
  Manage them as key accounts and watch concentration (O3).
- **High-frequency small-basket buyers** (73, 24.5 %) and **regular small-basket buyers** (94, 3.0 %) are the
  informal and retail long tail. Serve them at low cost-to-serve through route sales.
- **Wholesale regulars** (34, 13.9 %): candidates for volume agreements.
- **Lapsed / at-risk accounts** (19): last purchase about 989 days ago. A win-back list for the sales team, published on page 3.

The segments were **not given channel as an input**, yet they align with channels (table above). That is evidence
that the behavioural features capture real commercial roles.

**Assumptions:**

- Euclidean distance on standardised log-features reflects business similarity.
- Clusters are roughly convex.

**Limitations:**

- K-means is sensitive to scaling and outliers, which the log transform mitigates.
- Segment names are interpretive.
- This is a static snapshot. It should be refreshed quarterly and tracked as an SCD attribute.

<!-- code: 03_analytics/clustering.py | from=^def main | to=km = KMeans\(n_clusters=k_best | lang=python -->

## Technique 3: what drives yield (regression and key influencers)

**Question (BQ2):** how much of the yield gap is weather, how much is irrigation, and how much is management? What
would irrigating a dryland block be worth?

**Method** (`03_analytics/yield_drivers.py`):

- **Unit:** 1,163 completed field-block crop cycles.
- **Response:** ln(yield t/ha).
- **Explanatory variables**, assembled by **drill-across** on conformed keys:
  - irrigation method of the block in this cycle (planting register; §3.3);
  - dryland × ln(season rain ratio), with November–March rainfall at the farm divided by the farm's average (NASA POWER);
  - heat days with Tmax ≥ 35 °C in the flowering window;
  - ln(fertiliser index) from the cost ledger's input quantities;
  - crop and farm fixed effects.
- **Models:**
  1. **OLS** with HC3 robust standard errors, for interpretable elasticities;
  2. **random forest** with permutation importance, a non-linear "key influencer" ranking (Breiman, 2001).
- **Validation:** 5-fold random cross-validation, plus **leave-one-season-out** cross-validation, which tests
  generalisation to an unseen weather year.

<!-- include: evidence/yield_ols.md -->

<!-- table: Out-of-sample validation -->

<!-- include: evidence/yield_cv.md -->

<!-- figure: figures/fig_yield_rain.png | Within-farm rainfall response of dryland maize (one colour per farm, common fixed-effects slope) | width=82% -->

**Findings.**

1. **Rainfall elasticity of dryland yield.**
   - The full model across all dryland crops gives **0.73** (p < 0.001).
   - Within farms, dryland maize gives **0.77**.
   - The generator's true elasticity is about 0.77, so **the method recovers the known truth**. This validates the
     whole pipeline: ETL, conformed keys and drill-across.
   - Business meaning: a season with 30 % less rain than normal costs about 23 % of dryland yield. The 2023/24
     drought (rain ratio 0.71) brought dryland maize down to 2.97 t/ha.
2. **Irrigation more than doubles yield** relative to dryland, holding crop and farm constant:
   - centre pivot: +180 %;
   - drip: +162 %;
   - flood: +127 %.

   For maize the raw contrast is 8.60 vs 3.67 t/ha (×2.35). An indicative business case for the next pivot:
   - At the NAB white-maize floor price of N$ 6,680 per tonne (The Namibian, n.d.), the 4.9 t/ha gap is worth about
     **N$ 33,000 per hectare per season**.
   - Irrigated production costs about N$ 17,000/ha more in direct cost: N$ 3,880/t × 8.60 t vs N$ 4,430/t × 3.67 t,
     averaged over 2022/23–2024/25.
   - The **margin gain is therefore about N$ 16,000 per hectare per season**, before the pivot's capital cost.
3. **Heat** costs 0.33 % of yield per day ≥ 35 °C during flowering, inside the true range (−0.2 % to −0.7 %).
4. **Fertiliser** has a positive effect (0.12), but it is **attenuated** against the true 0.2–0.3, for two reasons:
   - The ledger allocates fertiliser to blocks by area share, so the rate varies only between cycles.
   - It measures the true rate with error (classical attenuation bias).

   We report the attenuation rather than hide it.
5. **The random forest** ranks irrigation and crop first, then rainfall (permutation importance: drop in R²).
   Leave-one-season-out cross-validation shows **OLS generalises better to an unseen season** (RMSE 0.125 vs 0.166
   on the log scale), so OLS is the model for decisions. The forest is used only as a cross-check of the ranking.

<!-- figure: figures/fig_yield_importance.png | Random-forest permutation importance of yield drivers (one-hot groups permuted together) | width=82% -->

**Assumptions:**

- Log-linear effects.
- Additive farm and crop effects.
- Rainfall at the farm's NASA POWER grid point represents the field.

**Limitations:**

- The data is observational: farms chose where to irrigate, so the irrigation effect is an association adjusted for
  crop and farm, not a randomised estimate.
- NASA POWER's grid resolution is about 0.5°.
- The data is synthetic. Recovering the truth validates the method, not real-world magnitudes. The real NASA POWER
  data (assumption A2) would test the latter.

<!-- code: 03_analytics/yield_drivers.py | from=    df\["dryland"\] | to=ols = smf.ols | lang=python -->

## Technique 4: anomaly detection in farm logs (Isolation Forest vs rules)

**Question:** can an unsupervised model find keying errors in harvest logs that nobody wrote a rule for?

**Method** (`03_analytics/anomaly_detection.py`):

- **Isolation Forest** (Liu et al., 2008): 500 trees, contamination 0.15 %.
- **Data:** every accepted harvest record with its **original keyed** quantity, i.e. before the HV06 corrections.
- **Five features:**
  - ln(kg);
  - ln(kg per planted ha);
  - ratio to the median of the four neighbouring records of the block;
  - ratio to the cycle median;
  - block yield vs the leave-one-out median of the sister blocks.
- **Evaluation** against the generator's ground truth: 8 errors among 7,368 records, a base rate of 0.11 %.

<!-- include: evidence/anomaly_eval.md -->

<!-- figure: figures/fig_anomaly_scores.png | Isolation-Forest anomaly scores of harvest records; injected keying errors highlighted | width=82% -->

**Findings.**

- The **domain rule wins**: HV06 has precision 1.00 and recall 0.875. The Isolation Forest, used blind, flags 12
  records with precision 0.33.
- Restricting the Forest to *upward* deviations, which is the direction a ×10 error moves, gives precision 1.00 at
  recall 0.50.
- The Forest's real value is **triage**. 5 of the 8 errors sit in its top 25 records, i.e. 0.34 % of the log. The
  top 25 are written to `dw.harvest_anomaly` for the Farm Data Steward. A weekly review of 25 records would surface
  new error types that no rule anticipated.

**Limitations:**

- Only 8 positives: each one moves recall by 12.5 points.
- Results depend on the contamination setting.
- Legitimate extremes, such as large grape picks, look anomalous without domain features.
