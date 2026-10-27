| step_name | rows_in | rows_out | rows_rejected | ms | note |
|---|---|---|---|---|---|
| transform master data | 238 | 235 | 3 | 12 | customers after merge of duplicates |
| load dim_date |  | 2923 | 0 | 119 |  |
| load dim_region | 14 | 16 | 0 | 1 |  |
| load dim_crop_category / dim_crop / dim_product | 21 | 22 | 0 | 5 |  |
| load dim_cost_category | 14 | 15 | 0 | 1 |  |
| load dim_farm (SCD2) | 14 | 21 | 0 | 8 | 14 initial rows, 6 new versions, 0 Type 1 updates |
| load dim_customer (SCD2) | 235 | 273 | 0 | 33 | 235 initial rows, 37 new versions, 0 inferred members completed |
| transform market prices & FX | 5769 | 891 | 0 | 47 |  |
| load dim_commodity | 6 | 6 | 0 | 2 |  |
| transform planting register | 1327 | 1327 | 0 | 37 |  |
| transform harvest logs | 7476 | 7368 | 108 | 1,005.00 |  |
| transform ERP sales | 305,490 | 302,903 | 2587 | 15,439.00 |  |
| transform cost ledger | 15,428 | 15,382 | 46 | 458 |  |
| transform stock movements | 6519 | 6521 | 0 | 754 | 2 rows imputed |
| transform weather | 14 | 30,674 | 0 | 383 | JSON documents expanded to farm-days |
| transform NSA crop estimates | 348 | 324 | 24 | 12 |  |
| load fact_sales | 302,903 | 302,903 | 0 | 9,506.00 | 5 inferred customer members created |
| load fact_harvest | 7368 | 7368 | 0 | 128 |  |
| load fact_crop_cycle (accumulating snapshot) | 1327 | 1327 | 0 | 87 |  |
| load fact_production_cost | 15,382 | 15,382 | 0 | 346 |  |
| load fact_inventory_monthly (periodic snapshot) | 6521 | 6521 | 0 | 85 |  |
| load fact_weather_daily | 30,674 | 30,674 | 0 | 404 |  |
| load fact_market_price_monthly | 486 | 486 | 0 | 15 |  |
| load fact_crop_estimate | 324 | 324 | 0 | 10 |  |
