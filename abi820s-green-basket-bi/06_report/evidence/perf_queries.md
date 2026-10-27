| query | baseline_ms | optimised_ms | speedup_x | baseline_access | optimised_access |
|---|---|---|---|---|---|
| Q1 Monthly revenue by crop category, FY2026 | 31.82 | 27.34 | 1.16 | Parallel Seq Scan on fact_sales | Bitmap Heap Scan on fact_sales |
| Q2 Revenue by zone x channel, one month (slicer) | 18.45 | 4.75 | 3.88 | Parallel Seq Scan on fact_sales | Bitmap Heap Scan on fact_sales |
| Q3 Top-10 customers, last 90 days | 20.79 | 6.43 | 3.23 | Parallel Seq Scan on fact_sales | Index Only Scan on fact_sales |
| Q4 Customer drill-through (one customer, one quarter) | 15.74 | 0.04 | 414.11 | Parallel Seq Scan on fact_sales | Index Only Scan on fact_sales |
| Q5 Incremental-refresh partition (last 10 days) | 14.71 | 1.18 | 12.44 | Parallel Seq Scan on fact_sales | Bitmap Heap Scan on fact_sales |
| Q6 Monthly revenue by channel (aggregation table vs detail) | 99.29 | 5.95 | 16.68 | Parallel Seq Scan on fact_sales | Seq Scan on agg_sales_monthly |
