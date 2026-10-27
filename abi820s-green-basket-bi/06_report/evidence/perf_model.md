| metric | naive | optimised |
|---|---|---|
| Columns imported (14 tables) | 243 | 165 |
| fact_sales columns | 24 | 14 |
| Columnar store size, all tables (MB, DuckDB proxy) | 16.01 | 10.76 |
| Bytes streamed from PostgreSQL at refresh (MB) | 46.50 | 27.60 |
| Extract + load wall time (s) | 2.17 | 1.27 |
| Highest-cardinality fact_sales column | sales_line_key (290,971) | invoice_id (198,059) |
| Rows refreshed: full vs incremental (10-day partition) | 302903 | 2162 |
| Refresh query time: full vs incremental (s) | 0.01 | 0.00 |

fact_sales columns by cardinality - naive import:

| column | cardinality |
|---|---|
| sales_line_key | 290971 |
| invoice_no | 192559 |
| net_revenue_nad | 187566 |
| gross_revenue_nad | 182753 |
| gross_margin_nad | 160187 |
| freight_cost_nad | 57099 |
| unit_price_txn | 35378 |
| discount_nad | 34824 |
| cogs_nad | 21668 |
| quantity_kg | 7468 |
| quantity_sales_uom | 7067 |
| dispatch_date_key | 1669 |
| invoice_date_key | 1669 |
| ref_invoice_no | 1402 |
| customer_key | 275 |
| fx_rate_nad | 119 |
| line_no | 40 |
| product_key | 21 |
| farm_key | 21 |
| sales_rep_code | 12 |
| currency_code | 5 |
| doc_type | 2 |
| is_price_anomaly | 2 |
| dw_batch_id | 1 |

optimised import (mart.fact_sales):

| column | cardinality |
|---|---|
| invoice_id | 198059 |
| net_revenue_nad | 187566 |
| gross_revenue_nad | 182753 |
| freight_cost_nad | 57099 |
| discount_nad | 34824 |
| cogs_nad | 21668 |
| quantity_kg | 7468 |
| invoice_date_key | 1669 |
| dispatch_date_key | 1669 |
| customer_key | 275 |
| farm_key | 21 |
| product_key | 21 |
| doc_type | 2 |
| is_price_anomaly | 2 |
