# 3.9 Presentation, Q&A and individual reflection

## 10-minute presentation outline

The deck is `07_presentation/GreenBasket_ABI820S_Presentation.pptx`: 13 slides plus 3 backup slides, with speaker
notes on every slide. It is built by `build_presentation.js` from `deck_data.json`, which `deck_data.py` extracts
from the warehouse, so every chart on the slides is native, editable and matches this report. Every member
presents the part they built, so each can answer questions about it (rubric criterion 9).

<!-- table: Presentation plan (10 minutes + 5 minutes Q&A) -->

| Time | Slide | Content and key message | Presenter |
|---|---|---|---|
| 0:00–0:30 | 1 Title | Green Basket cc: one trusted view of production, yield, cost and revenue | Member 1 |
| 0:30–1:30 | 2 The problem | Nine sources, no single truth: 2,587 duplicate invoice lines, 47 crop spellings, ×10 keying errors | Member 1 |
| 1:30–2:00 | 3 Questions and KPIs | Five business questions mapped to 5 objectives and their KPIs | Member 1 |
| 2:00–2:45 | 4 Architecture | ELT in PostgreSQL 16: landing → staging → star schema → mart → Power BI | Member 3 |
| 2:45–3:45 | 5 Dimensional model | Bus matrix, grain, snowflake trade-off, SCD2: *Nkurenkuru before and after the pivot* | Member 2 |
| 3:45–4:45 | 6 Data quality | 37 rules; **236 of 237 injected defects caught, 0 false positives**; the two bugs our validation found | Member 3 |
| 4:45–5:15 | 7 Reconciliation and governance | 19 checks (18 PASS, 1 WARN = N$ 4.9 m to credit); owners, RLS, labels | Member 3 |
| 5:15–6:00 | 8 Semantic model | Import + incremental refresh; 79 measures; like-for-like FYTD; dynamic RLS | Member 4 |
| 6:00–7:30 | 9 **Live demo** | Page 1 (FY2026 → drill to quarter) → page 2 (matrix drill Region › Farm, drill-through) → View as zm.northcentral | Member 4 |
| 7:30–8:15 | 10 Forecast and segments | Seasonal naive wins (WAPE 12.7 %); FY2027 ≈ N$ 465.6 m (+1.5 %); 5 segments, 20 key accounts = 59 % | Member 5 |
| 8:15–8:45 | 11 Yield drivers and anomalies | Elasticity 0.77 recovers the truth; a pivot is worth about N$ 16,000/ha per season; rules beat Isolation Forest | Member 5 |
| 8:45–9:15 | 12 Performance | Indexes up to ≈ 400×, aggregate ≈ 17×, −32 % columns, −99 % refresh rows | Member 5 |
| 9:15–10:00 | 13 Recommendations | Irrigate maize, diversify buyers, run the DQ process, publish the app | Member 1 |

**Demo safety net.** If Power BI or the network fails, slide 9 and backup slides 14–16 hold the four page images,
so the demo can continue from them. Rehearse the demo path twice, with a stopwatch.

## Q&A bank (5 minutes)

<!-- table: Anticipated questions and model answers (owner = member who answers) -->

| # | Question | Model answer | Owner |
|---|---|---|---|
| 1 | Why a snowflake at all? Isn't a star always better for Power BI? | Crop is a **conformed grain**: six facts are recorded per crop, not per product. Flattening crop into product would force fake product rows or a second crop dimension. We snowflaked only there and at region; customer geography is flattened. The cost is two tiny relationships (12 and 5 rows). | M2 |
| 2 | How do you know your SCD Type 2 works? | Check R13 (no overlaps, gaps or duplicate current rows), the version table for GB-KAW-01, and the business effect: dryland seasons stay at 0.56–2.23 t/ha and pivot seasons at 7.4–8.6. The day-2 delta created exactly one new version (GB-ERO-01). Re-running creates none, because of the hash compare. | M2 |
| 3 | Your data is synthetic. Why should we believe the results? | Because we know the truth. The generator logs every defect and the true response model. Our DQ rules found 236 of 237 injected errors; the regression recovered the true rainfall elasticity (0.77). With real data you cannot measure precision and recall. The pipeline reads the real public files unchanged (`fetch_public_data.py`). | M3 / M5 |
| 4 | What was the hardest bug? | HV06 masked itself: in a two-block cycle the median included the outlier, so a 47 t/ha maize block passed. We switched to a leave-one-out median, and recall went from 6/8 to 7/8 with zero false positives. | M3 |
| 5 | Why PostgreSQL rather than SQL Server Express? | Express caps a database at 10 GB and has no Agent. PostgreSQL parses the NASA JSON natively, has BRIN indexes, and has no edition limits. Power BI connects through the built-in connector and the gateway. | M3 |
| 6 | Why Import and not DirectQuery? | 303 k rows compress to about 11 MB. Import gives millisecond visuals and full DAX. Freshness needs are daily. DirectQuery would add gateway latency to every visual. Incremental refresh keeps refresh to about 2,200 rows. | M4 |
| 7 | How does your FYTD avoid comparing a half year with a full year? | `Net Revenue FYTD PY` stops at `EDATE([Last Sales Date], −12)` with `KEEPFILTERS`, i.e. the same day last year. Without it, FY2027 would show −73 %. | M4 |
| 8 | Show us that RLS works. | View as zm.northcentral: 4 farms, N$ 62.7 m FY2026. ops.north: 8 farms, N$ 139.6 m. An unmapped user sees blank. Expected values come from SQL. Note that RLS applies to Viewers and app users, not workspace members. | M4 |
| 9 | Why is the simplest forecast the best? | With 4.5 seasons of a very regular seasonal pattern, extra parameters add variance. Seasonal naive has WAPE 12.7 %, with 80 % interval coverage of 83 %. By category, SARIMA wins for cereals (9.2 %), so we keep model choice per series. A rolling-origin test is the next step. | M5 |
| 10 | Silhouette is best at k = 3; why choose k = 5? | k = 3 puts 84 % of customers in one cluster, which is not actionable. Our pre-set rule picks the best Calinski–Harabasz among stable solutions (ARI ≥ 0.95, k ≥ 3), giving k = 5 with silhouette 0.41. | M5 |
| 11 | Is irrigation *causing* the yield doubling? | It is an adjusted association: crop and farm effects are controlled, but farms chose where to irrigate. Nkurenkuru's before/after with an SCD2 farm version is the closest thing to a natural experiment. | M5 |
| 12 | What is the business value? | Three decisions: (1) pivot investment, worth about N$ 16,000/ha per season in margin; (2) concentration risk, with 57 % of revenue from 10 buyers; (3) N$ 4.9 m of mispriced invoices found. Plus a same-day month-end pack instead of days of Excel work. | M1 |
| 13 | What about privacy law in Namibia? | The Data Protection Bill is not yet in force. We designed to its principles anyway: minimisation (no personal identifiers), purpose limitation, security controls, RLS and sensitivity labels. GDPR applies only if EU contact data is processed, and we do not load it. | M3 |
| 14 | How would this scale to 10× the data? | Incremental refresh on `fact_sales`, BRIN on the date key, and the monthly aggregate as an Import aggregation over a DirectQuery detail table (composite model). PostgreSQL has no 10 GB ceiling. | M5 |
| 15 | What would you do next? | Real NASA, World Bank and FRED data; SARIMAX with FX and EU prices; rolling-origin back-tests; block-level soil data; publish the app with Purview labels; automate the pipeline with `pg_cron` and alerting. | M1 |
| 16 | Which part did *you* build? | Each member answers from the reflection: their files, a decision they made, a problem they solved. | All |

## Individual reflection templates

Each member writes their own reflection **in their own words**, about 300–400 words. The prompts below structure it.
The team must not edit another member's reflection. The contribution factors are agreed at a team meeting and signed
by all five members.

<!-- table: Individual contribution factor statement (agreed by the team; 1.0 = full, equal contribution) -->

| Member | Role | Sections and files owned | Agreed contribution factor | Signature |
|---|---|---|---|---|
| Member 1 | Project lead and business analyst | 3.1, 3.9; slides 1–3, 13 | ______ | ______ |
| Member 2 | Data warehouse architect | 3.2; `03_ddl_warehouse.sql`, `06_etl_load_dimensions.sql`, data dictionary | ______ | ______ |
| Member 3 | ETL, data quality and governance | 3.3, 3.8; `02_ddl_staging_ref.sql`, `05_etl_transform.sql`, `08_reconciliation.sql`, generator | ______ | ______ |
| Member 4 | Power BI developer | 3.4, 3.6; `model_spec.py`, `build_pbip.py`, `.pbix` / `.pbit`, RLS tests | ______ | ______ |
| Member 5 | Analytics and performance lead | 3.5, 3.7; `03_analytics/*.py`, `13_optimisation.sql` | ______ | ______ |

**Reflection prompts (one page per member):**

1. **My contribution.** Which files, sections and decisions are mine? Cite commits, file names and dates.
2. **One technical decision I can defend.** For example: the grain of `fact_crop_cycle`, the HV06 redesign, the FYTD
   cut-off, the k = 5 rule. State the alternative I rejected and why.
3. **A problem I hit and how I solved it.** Describe the symptom, the diagnosis and the fix.
4. **What I learned** about BI and analytics practice: not only tools, but trade-offs, data quality and governance.
5. **What I would do differently** with more time or real data.
6. **Use of AI tools.** What I used an AI assistant for, and how I verified its output, in line with the NUST policy.
7. **Teamwork.** How work was divided and integrated, and how disagreements were resolved.
