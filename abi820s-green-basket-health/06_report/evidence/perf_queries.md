| query | baseline_ms | optimised_ms | speedup_x | baseline_access | optimised_access |
|---|---|---|---|---|---|
| Q1 Monthly ED attendances and % within target per facility, 2025 | 39.1 | 49.6 | 0.8 | Parallel Seq Scan on fact_encounter | Parallel Seq Scan on fact_encounter |
| Q2 One facility, one month, by triage (slicer) | 21.0 | 1.8 | 11.6 | Parallel Seq Scan on fact_encounter | Index Scan on fact_encounter |
| Q3 Ward occupancy for one hospital, one month (drill-down) | 0.2 | 0.3 | 0.7 | Index Scan on fact_ward_census_daily | Index Scan on fact_ward_census_daily |
| Q4 Patient drill-through: all spells of one patient | 25.0 | 0.1 | 453.8 | Seq Scan on fact_admission | Index Scan on fact_admission |
| Q5 Incremental-refresh partition (last 10 days) | 23.0 | 15.8 | 1.5 | Parallel Seq Scan on fact_encounter | Bitmap Heap Scan on fact_encounter |
| Q6 Daily ED KPIs by facility x triage (aggregate vs detail) | 217.8 | 34.1 | 6.4 | Seq Scan on fact_encounter | Seq Scan on agg_ed_daily |
