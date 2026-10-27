# Data dictionary - Green Basket cc agricultural data warehouse (`dw` schema)

Generated from the PostgreSQL catalog (`COMMENT ON ...`) by `03_analytics/build_data_dictionary.py`.

## dw.fact_crop_cycle

Accumulating snapshot. GRAIN: one row per planted field block per crop cycle; milestone dates and measures are updated as the cycle moves from Growing to Harvesting to Completed.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `crop_cycle_key` | bigint | N | PK | Fact surrogate key. | ETL identity |
| 2 | `cycle_id` | character varying(24) | N |  | Degenerate: crop-cycle id farm/crop/year+slot, e.g. GB-KAW-01/MZW/2023S. | planting register |
| 3 | `block_id` | character varying(6) | N |  | Degenerate: field block code. | planting register |
| 4 | `farm_key` | integer | N | FK -> dim_farm.farm_key | FK to the dim_farm version valid on the planting date (as-was irrigation regime). | planting register farm_code |
| 5 | `crop_key` | smallint | N | FK -> dim_crop.crop_key | FK to dim_crop. | planting register crop_code |
| 6 | `planting_date_key` | integer | N | FK -> dim_date.date_key | Milestone 1 (role-playing date, active in BI): planting / bud-break date. | planting register (rule PL01) |
| 7 | `first_harvest_date_key` | integer | N | FK -> dim_date.date_key | Milestone 2 (role-playing date): first harvest record (-1 = not yet). | derived from fact_harvest |
| 8 | `last_harvest_date_key` | integer | N | FK -> dim_date.date_key | Milestone 3 (role-playing date): latest harvest record to date (-1 = not yet). | derived from fact_harvest |
| 9 | `harvest_season_end_date_key` | integer | N | FK -> dim_date.date_key | Role-playing date: 30 September closing the agricultural season of the (expected) first harvest; conforms with fact_crop_estimate. | derived |
| 10 | `cycle_status` | character varying(10) | N |  | Growing, Harvesting, Completed or Failed as at the extract date. | planting register validated against harvest log (rule PL03) |
| 11 | `variety` | character varying(30) | Y |  | Cultivar planted. | planting register |
| 12 | `irrigation_method` | character varying(20) | N |  | Degenerate: irrigation method of THIS block in this cycle (Dryland, Centre pivot, Drip, ...); can differ from the farm's main system, e.g. a borehole pivot block on a dryland farm. | planting register (fallback: dim_farm as-was) |
| 13 | `is_irrigated` | boolean | N |  | Degenerate: true when the block was irrigated in this cycle. | derived from irrigation_method |
| 14 | `planted_ha` | numeric(10,2) | N |  | Planted area of the block in hectares (additive). | planting register (rule PL02 imputes) |
| 15 | `harvested_ha` | numeric(10,2) | Y |  | Harvested area in hectares once Completed (0 if Failed, NULL while open) (additive). | planting register |
| 16 | `planned_yield_t_ha` | numeric(8,2) | Y |  | Budgeted yield t/ha at planting (non-additive). | planting register |
| 17 | `planned_production_kg` | numeric(14,1) | Y |  | Budgeted production = planned yield x planted ha x 1000 (additive). | derived |
| 18 | `harvested_kg` | numeric(14,1) | N |  | Cumulative harvested kg to date (additive). | aggregated from fact_harvest |
| 19 | `harvest_event_count` | integer | N |  | Number of harvest records to date (additive). | aggregated from fact_harvest |
| 20 | `days_to_first_harvest` | integer | Y |  | Days from planting to first harvest (non-additive; average in BI). | derived |
| 21 | `harvest_duration_days` | integer | Y |  | Days between first and last harvest record (non-additive). | derived |
| 22 | `direct_cost_nad` | numeric(16,2) | N |  | Crop-cycle direct cost allocated to the block by planted-area share, N$ (additive). | cost ledger cost_centre = cycle_id |
| 23 | `fertiliser_kg` | numeric(14,1) | N |  | Fertiliser applied, allocated by area share (additive). | cost ledger input_qty (CC02) |
| 24 | `planted_ha_imputed` | boolean | N |  | True when planted_ha was imputed by rule PL02. | ETL |
| 25 | `dw_batch_id` | integer | N |  | Audit: ETL batch that last updated the row. | ETL |
| 26 | `dw_updated_at` | timestamp with time zone | N |  | Audit: last update timestamp (accumulating snapshot rows are updated in place). | ETL |

## dw.fact_crop_estimate

Benchmark fact (external). GRAIN: one row per agricultural season x region x crop x farming sector. Area/production additive; yield non-additive (recompute as production/area).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `crop_estimate_key` | bigint | N | PK | Fact surrogate key. | ETL identity |
| 2 | `season_end_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date: 30 September closing the agricultural season. | NSA season text e.g. 2023/2024 |
| 3 | `region_key` | smallint | N | FK -> dim_region.region_key | FK to dim_region (conformed geography). | NSA region text via ref.region_alias |
| 4 | `crop_key` | smallint | N | FK -> dim_crop.crop_key | FK to dim_crop (rule CE01 excludes out-of-scope crops). | NSA crop text via ref.crop_alias |
| 5 | `farming_sector` | character varying(10) | N |  | Communal or Commercial farming sector. | NSA / MAFWLR table |
| 6 | `area_planted_ha` | numeric(12,1) | Y |  | Area planted, ha (additive). | NSA / MAFWLR crop estimates |
| 7 | `production_t` | numeric(14,1) | Y |  | Production, tonnes (additive). | NSA / MAFWLR crop estimates |
| 8 | `yield_t_ha` | numeric(8,3) | Y |  | Published (or derived) yield, t/ha (non-additive). | NSA (rule CE02) |
| 9 | `is_yield_derived` | boolean | N |  | True when yield was derived as production/area. | ETL |
| 10 | `release_date` | date | Y |  | Publication date of the estimate. | NSA |
| 11 | `source_table` | character varying(80) | Y |  | Lineage: report/table of origin. | NSA |
| 12 | `dw_batch_id` | integer | N |  | Audit: ETL batch. | ETL |

## dw.fact_forecast_monthly

Model output. GRAIN: one row per month x crop category x model x scenario (12-month back-test on hold-out data, then 12-month forward forecast).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `forecast_key` | bigint | N | PK | Surrogate key. | ETL identity |
| 2 | `month_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date: month-end of the forecast month. | 03_analytics/forecasting.py |
| 3 | `crop_category_key` | smallint | N | FK -> dim_crop_category.crop_category_key | FK to dim_crop_category. | forecasting.py |
| 4 | `model_name` | character varying(30) | N |  | Model: Seasonal naive, Holt-Winters ETS, SARIMA. | forecasting.py |
| 5 | `scenario` | character varying(12) | N |  | Backtest (hold-out evaluation) or Forecast (forward). | forecasting.py |
| 6 | `actual_net_revenue_nad` | numeric(16,2) | Y |  | Actual net revenue for back-test months, N$. | fact_sales |
| 7 | `forecast_net_revenue_nad` | numeric(16,2) | N |  | Point forecast of net revenue, N$. | forecasting.py |
| 8 | `lower_80_nad` | numeric(16,2) | Y |  | Lower bound of the 80% prediction interval. | forecasting.py |
| 9 | `upper_80_nad` | numeric(16,2) | Y |  | Upper bound of the 80% prediction interval. | forecasting.py |
| 10 | `lower_95_nad` | numeric(16,2) | Y |  | Lower bound of the 95% prediction interval. | forecasting.py |
| 11 | `upper_95_nad` | numeric(16,2) | Y |  | Upper bound of the 95% prediction interval. | forecasting.py |
| 12 | `model_run_at` | timestamp with time zone | N |  | Audit: model run timestamp. | forecasting.py |

## dw.fact_harvest

Transaction fact. GRAIN: one row per harvest record = farm x crop x field block x harvest day (weighbridge/packhouse slip).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `harvest_event_key` | bigint | N | PK | Fact surrogate key. | ETL identity |
| 2 | `harvest_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date: harvest day. | harvest log date (template-specific format) |
| 3 | `farm_key` | integer | N | FK -> dim_farm.farm_key | FK to the dim_farm version valid on the harvest date. | harvest log farm code (rule HV08) |
| 4 | `crop_key` | smallint | N | FK -> dim_crop.crop_key | FK to dim_crop (crop grain - conformed rollup of dim_product). | harvest log crop text via ref.crop_alias |
| 5 | `cycle_id` | character varying(24) | Y |  | Degenerate: crop-cycle identifier from the planting register (links to fact_crop_cycle). | ETL block matching |
| 6 | `block_id` | character varying(6) | N |  | Degenerate: field block / pivot / vineyard block code. | harvest log |
| 7 | `recorder_code` | character varying(10) | Y |  | Pseudonymised clerk code that captured the record. | harvest log |
| 8 | `harvested_kg` | numeric(14,1) | N |  | Field mass harvested in kg after unit standardisation (additive). | harvest log quantity x ref.uom_conversion |
| 9 | `is_corrected` | boolean | N |  | True when rule HV06 corrected a unit/decimal error. | ETL |
| 10 | `source_file` | character varying(40) | N |  | Lineage: source file name. | ETL |
| 11 | `source_row_num` | integer | N |  | Lineage: row number in the source file. | ETL |
| 12 | `dw_batch_id` | integer | N |  | Audit: ETL batch. | ETL |

## dw.fact_inventory_monthly

Periodic snapshot. GRAIN: one row per farm store x product x month-end. Stock levels are SEMI-ADDITIVE (sum across farms/products, never across months); flows are additive.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `inventory_snapshot_key` | bigint | N | PK | Fact surrogate key. | ETL identity |
| 2 | `snapshot_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date: month-end count date. | stock system period |
| 3 | `farm_key` | integer | N | FK -> dim_farm.farm_key | FK to the dim_farm version valid at month-end. | stock system farm_code |
| 4 | `product_key` | integer | N | FK -> dim_product.product_key | FK to dim_product. | stock system product_code |
| 5 | `opening_stock_kg` | numeric(14,1) | N |  | Stock on hand at the start of the month, kg (semi-additive). | stock system |
| 6 | `received_kg` | numeric(14,1) | N |  | Graded produce received from the field in the month, kg (additive). | stock system |
| 7 | `dispatched_kg` | numeric(14,1) | N |  | Produce dispatched to customers in the month, kg (additive; reconciles to ERP dispatches). | stock system |
| 8 | `shrinkage_kg` | numeric(14,1) | N |  | Losses (spoilage, moisture, theft) in the month, kg (additive). | stock system |
| 9 | `closing_stock_kg` | numeric(14,1) | N |  | Stock on hand at month-end, kg (semi-additive: use closing-balance logic over time). | stock system (rule ST01) |
| 10 | `closing_stock_value_nad` | numeric(16,2) | N |  | Closing stock at standard cost, N$ (semi-additive). | stock system |
| 11 | `is_imputed` | boolean | N |  | True when the snapshot row was imputed for a missing month (rule ST03). | ETL |
| 12 | `is_sign_corrected` | boolean | N |  | True when rule ST01 corrected a sign error. | ETL |
| 13 | `dw_batch_id` | integer | N |  | Audit: ETL batch. | ETL |

## dw.fact_market_price_monthly

Periodic fact (external). GRAIN: one row per commodity series per month (keyed on the month-end date). Prices are NON-ADDITIVE (average only).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `market_price_key` | bigint | N | PK | Fact surrogate key. | ETL identity |
| 2 | `month_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date: last day of the price month. | Pink Sheet period YYYYMmm |
| 3 | `commodity_key` | smallint | N | FK -> dim_commodity.commodity_key | FK to dim_commodity. | Pink Sheet column header |
| 4 | `crop_key` | smallint | N | FK -> dim_crop.crop_key | FK to dim_crop of the benchmarked crop (-2 for input series). | dim_commodity mapping |
| 5 | `price_usd` | numeric(12,2) | N |  | Monthly average price in USD per published unit (non-additive). | World Bank Pink Sheet (rule MP01) |
| 6 | `fx_nad_per_usd` | numeric(12,6) | N |  | Monthly average N$ per USD (non-additive). | FRED DEXSFUS (NAD = ZAR) |
| 7 | `price_nad` | numeric(14,2) | N |  | Price converted to N$ per published unit (non-additive). | derived |
| 8 | `is_imputed` | boolean | N |  | True when the price was interpolated (rule MP01). | ETL |
| 9 | `dw_batch_id` | integer | N |  | Audit: ETL batch. | ETL |

## dw.fact_production_cost

Transaction fact. GRAIN: one row per cost-ledger posting (farm x crop cycle or overhead x cost category x posting date).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `cost_posting_key` | bigint | N | PK | Fact surrogate key. | ETL identity |
| 2 | `posting_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date: posting date. | cost ledger |
| 3 | `farm_key` | integer | N | FK -> dim_farm.farm_key | FK to the dim_farm version valid on the posting date. | cost ledger farm_code |
| 4 | `crop_key` | smallint | N | FK -> dim_crop.crop_key | FK to dim_crop (-2 farm overhead, -1 crop missing - rule CL03). | cost ledger crop_code |
| 5 | `cost_category_key` | smallint | N | FK -> dim_cost_category.cost_category_key | FK to dim_cost_category. | cost ledger free text via ref.cost_category_alias (rule CL02) |
| 6 | `posting_id` | character varying(24) | N |  | Degenerate: journal posting id (suffix -R reversal, -C correction). | cost ledger |
| 7 | `cost_centre` | character varying(30) | N |  | Degenerate: cost centre = crop cycle id, FARM/OVERHEAD or FARM/UNALLOCATED. | cost ledger |
| 8 | `supplier_code` | character varying(8) | Y |  | Pseudonymised supplier code. | cost ledger |
| 9 | `amount_nad` | numeric(16,2) | N |  | Posted cost amount in N$ (additive; reversals negative). | cost ledger (rule CL04) |
| 10 | `input_qty` | numeric(14,2) | Y |  | Physical input quantity where captured (additive within one category). | cost ledger |
| 11 | `input_uom` | character varying(6) | Y |  | Unit of input_qty. | cost ledger |
| 12 | `is_reversal` | boolean | N |  | True for reversal postings. | derived from posting_id |
| 13 | `dw_batch_id` | integer | N |  | Audit: ETL batch. | ETL |

## dw.fact_sales

Transaction fact. GRAIN: one row per ERP invoice or credit-note line. All monetary measures are additive (N$).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `sales_line_key` | bigint | N | PK | Fact surrogate key (technical; hidden in BI). | ETL identity |
| 2 | `invoice_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date: invoice (revenue recognition) date. | ERP invoice_date |
| 3 | `dispatch_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date (role-playing): physical dispatch date used for stock reconciliation. | ERP dispatch_date |
| 4 | `product_key` | integer | N | FK -> dim_product.product_key | FK to dim_product. | ERP product_code (rule SA02) |
| 5 | `customer_key` | integer | N | FK -> dim_customer.customer_key | FK to the dim_customer version valid on the invoice date. | ERP customer_code (rules SA03/SA04) |
| 6 | `farm_key` | integer | N | FK -> dim_farm.farm_key | FK to the dim_farm version of the farm of origin on the invoice date (-1 when missing, rule SA05). | ERP farm_code |
| 7 | `invoice_no` | character varying(16) | N |  | Degenerate dimension: ERP document number. | ERP |
| 8 | `line_no` | smallint | N |  | Degenerate dimension: line number within the document. | ERP |
| 9 | `doc_type` | character(3) | N |  | INV = invoice, CRN = credit note (quality claim). | ERP |
| 10 | `ref_invoice_no` | character varying(16) | Y |  | For credit notes: the invoice being credited. | ERP |
| 11 | `sales_rep_code` | character varying(6) | Y |  | Pseudonymised sales representative code. | ERP |
| 12 | `currency_code` | character(3) | N |  | Invoicing currency (rule SA06 defaults missing values). | ERP / customer master |
| 13 | `quantity_sales_uom` | numeric(14,3) | N |  | Quantity in the invoice unit of measure (negative on credit notes). Additive only within one product. | ERP quantity |
| 14 | `quantity_kg` | numeric(14,3) | N |  | Quantity converted to kilograms (additive). | derived quantity x dim_product.kg_per_sales_uom |
| 15 | `unit_price_txn` | numeric(14,4) | N |  | Unit price in transaction currency per sales UoM (non-additive). | ERP |
| 16 | `fx_rate_nad` | numeric(12,6) | N |  | N$ per unit of transaction currency, monthly average of the invoice month (non-additive). | ref.fx_rate_monthly (FRED) |
| 17 | `gross_revenue_nad` | numeric(16,2) | N |  | quantity x unit price x FX before discount, N$ (additive). | derived |
| 18 | `discount_nad` | numeric(16,2) | N |  | Discount granted, N$ (additive). | derived from ERP discount_pct |
| 19 | `net_revenue_nad` | numeric(16,2) | N |  | Gross revenue less discount, N$ (additive) - the headline revenue measure. | derived |
| 20 | `cogs_nad` | numeric(16,2) | N |  | Standard cost of goods sold, N$ (0 on credit notes: returned produce is written off). | ERP unit_std_cost_nad x quantity |
| 21 | `freight_cost_nad` | numeric(16,2) | N |  | Outbound freight cost borne by Green Basket, N$ (additive). | ERP freight_nad |
| 22 | `gross_margin_nad` | numeric(16,2) | Y |  | Net revenue less COGS, N$ (additive, computed column). | derived |
| 23 | `is_price_anomaly` | boolean | N |  | True when the N$/kg price deviates > 4x from the product-month median (rule SA07). | ETL |
| 24 | `dw_batch_id` | integer | N |  | Audit: ETL batch that loaded the row. | ETL |

## dw.fact_weather_daily

Periodic fact (external). GRAIN: one row per farm location per day. Rainfall additive over time but averaged across locations; temperatures non-additive.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `weather_key` | bigint | N | PK | Fact surrogate key. | ETL identity |
| 2 | `date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date. | NASA POWER date key YYYYMMDD |
| 3 | `farm_key` | integer | N | FK -> dim_farm.farm_key | FK to the dim_farm version valid on the day (weather point = farm coordinates). | NASA POWER request per farm |
| 4 | `rainfall_mm` | numeric(7,2) | Y |  | Corrected precipitation, mm/day (PRECTOTCORR). | NASA POWER (rule WE02) |
| 5 | `t_max_c` | numeric(5,2) | Y |  | Maximum 2 m air temperature, deg C (T2M_MAX). | NASA POWER (rule WE01) |
| 6 | `t_min_c` | numeric(5,2) | Y |  | Minimum 2 m air temperature, deg C (T2M_MIN). | NASA POWER (rule WE01) |
| 7 | `rh_pct` | numeric(5,2) | Y |  | Relative humidity at 2 m, % (RH2M). | NASA POWER |
| 8 | `solar_mj_m2` | numeric(6,2) | Y |  | All-sky surface shortwave irradiance, MJ/m2/day. | NASA POWER |
| 9 | `is_heat_day` | boolean | Y |  | True when t_max_c >= 35 deg C (crop heat-stress day). | derived |
| 10 | `is_rain_day` | boolean | Y |  | True when rainfall_mm >= 1. | derived |
| 11 | `rainfall_imputed` | boolean | N |  | True when rainfall was imputed by rule WE02. | ETL |
| 12 | `temp_imputed` | boolean | N |  | True when temperature was imputed by rule WE01. | ETL |
| 13 | `dw_batch_id` | integer | N |  | Audit: ETL batch. | ETL |

## dw.customer_segment

Model output: K-means customer segment per durable customer code (RFM + basket features, trailing 12 months).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `customer_code` | character varying(10) | N | PK | Durable customer code. | clustering.py |
| 2 | `segment_id` | smallint | N |  | Cluster number. | clustering.py |
| 3 | `segment_name` | character varying(40) | N |  | Business label of the cluster. | clustering.py |
| 4 | `recency_days` | integer | N |  | Days since last invoice at 30 Sep 2026. | clustering.py |
| 5 | `frequency_invoices` | integer | N |  | Distinct invoices in the trailing 12 months. | clustering.py |
| 6 | `monetary_nad` | numeric(16,2) | N |  | Net revenue in the trailing 12 months, N$. | clustering.py |
| 7 | `avg_order_kg` | numeric(14,1) | N |  | Average kg per invoice line. | clustering.py |
| 8 | `product_breadth` | smallint | N |  | Distinct products bought. | clustering.py |
| 9 | `silhouette_sample` | numeric(6,4) | Y |  | Silhouette value of the customer within its cluster. | clustering.py |
| 10 | `model_run_at` | timestamp with time zone | N |  | Audit: model run timestamp. | clustering.py |

## dw.dim_commodity

International commodity price series (output prices for crops, input prices for fertiliser and fuel). SCD Type 1.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `commodity_key` | smallint | N | PK | Surrogate key. | ETL |
| 2 | `commodity_code` | character varying(16) | N |  | Series code (natural key), e.g. MAIZE, UREA. | ref.commodity_series |
| 3 | `commodity_name` | character varying(40) | N |  | Descriptive series name. | World Bank Pink Sheet header |
| 4 | `source_series_name` | character varying(30) | N |  | Column header in the Pink Sheet workbook. | World Bank Pink Sheet |
| 5 | `price_unit` | character varying(10) | N |  | Unit of the published price (USD/mt, USD/bbl). | World Bank Pink Sheet |
| 6 | `commodity_role` | character varying(14) | N |  | Output price (crop sold) or Input price (cost driver). | derived |
| 7 | `crop_key` | smallint | N | FK -> dim_crop.crop_key | Crop benchmarked by the series (sorghum proxies mahangu; -2 for input series). | ETL mapping |
| 8 | `source_name` | character varying(40) | N |  | Publisher of the series. | derived |
| 9 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |

## dw.dim_cost_category

Production cost category with cost group and behaviour (variable/fixed). SCD Type 1.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `cost_category_key` | smallint | N | PK | Surrogate key (-1 Unknown). | ETL |
| 2 | `cost_category_code` | character(4) | N |  | Cost category code CC01..CC14 (natural key). | Master data workbook, sheet Cost_Categories |
| 3 | `cost_category_name` | character varying(40) | N |  | Cost category name. | Master data workbook |
| 4 | `cost_group` | character varying(30) | N |  | Cost group: Direct inputs, Labour, Energy & water, Mechanisation, Packaging & logistics, Overheads. | Master data workbook |
| 5 | `cost_behaviour` | character varying(15) | N |  | Variable, Semi-variable or Fixed. | Master data workbook |
| 6 | `gl_account` | character(4) | Y |  | General-ledger account number. | Master data workbook |
| 7 | `quantity_uom` | character varying(6) | Y |  | Unit of the physical input quantity (kg, l, hours, kWh, m3) where captured. | Master data workbook |
| 8 | `is_crop_specific` | boolean | N |  | False for farm overheads that are not allocated to a crop cycle. | derived (Fixed behaviour) |
| 9 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |

## dw.dim_crop

Crop (middle level of the product snowflake). Also a conformed shrunken dimension: harvest, cost, cycle, market-price and NSA facts are recorded at crop grain. SCD Type 1.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `crop_key` | smallint | N | PK | Surrogate key (-1 Unknown, -2 Not crop-specific / farm overhead). | ETL |
| 2 | `crop_code` | character(3) | N |  | Three-letter crop code (natural key), e.g. MZW = white maize. | Master data workbook, sheet Crops |
| 3 | `crop_name` | character varying(40) | N |  | Crop name. | Master data workbook, sheet Crops |
| 4 | `crop_category_key` | smallint | N | FK -> dim_crop_category.crop_category_key | FK to dim_crop_category (snowflake). | ETL lookup on category_code |
| 5 | `scientific_name` | character varying(60) | Y |  | Botanical name. | Master data workbook |
| 6 | `is_nab_controlled` | boolean | Y |  | True if the crop is a Namibian Agronomic Board controlled product (border closures / Market Share Promotion apply). | Master data workbook |
| 7 | `storage_type` | character varying(30) | Y |  | Post-harvest storage type (Silo, Cold room, ...). | Master data workbook |
| 8 | `shelf_life_days` | smallint | Y |  | Typical shelf life in days. | Master data workbook |
| 9 | `typical_cull_pct` | numeric(5,2) | Y |  | Typical % of harvested mass culled at grading. | Master data workbook |
| 10 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |
| 11 | `dw_updated_at` | timestamp with time zone | N |  | Audit: last Type 1 update timestamp. | ETL |

## dw.dim_crop_category

Top level of the snowflaked product hierarchy (Cereals & grains, Vegetables, Fruit). SCD Type 1.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `crop_category_key` | smallint | N | PK | Surrogate key (-1 Unknown, -2 Not applicable). | ETL |
| 2 | `category_code` | character(3) | N |  | Category code (natural key): CER, VEG, FRU. | Master data workbook, sheet Crop_Categories |
| 3 | `category_name` | character varying(30) | N |  | Category name. | Master data workbook, sheet Crop_Categories |
| 4 | `sector` | character varying(20) | N |  | Agricultural sector: Field crops or Horticulture. | Master data workbook |
| 5 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |

## dw.dim_customer

Customer (business, institution, pseudonymised informal trader or export buyer). SCD Type 2 on channel, credit terms and key-account flag; Type 1 elsewhere. Supports inferred (late-arriving) members.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `customer_key` | integer | N | PK | Surrogate key per customer VERSION (-1 Unknown). | ETL identity |
| 2 | `customer_code` | character varying(10) | N |  | Durable natural key from ERP/MDM, e.g. C00042 (duplicates merged to survivor). | Master data workbook, sheet Customers |
| 3 | `customer_name` | character varying(80) | N |  | Trading name (Type 1). Informal traders carry a pseudonymous label only. | Master data workbook (rule MD05 formatting) |
| 4 | `customer_type` | character varying(24) | Y |  | Business, Government institution, Informal trader or Export (Type 1). | Master data workbook |
| 5 | `town` | character varying(40) | Y |  | Delivery town (Type 1). | Master data workbook |
| 6 | `region_key` | smallint | N | FK -> dim_region.region_key | FK to dim_region for domestic customers; -2 for foreign customers, -1 when missing (rule MD02). | ETL via ref.region_alias |
| 7 | `country_code` | character(2) | Y |  | ISO 3166-1 alpha-2 country. | Master data workbook |
| 8 | `country_name` | character varying(30) | Y |  | Country name. | ref.country |
| 9 | `market_group` | character varying(20) | Y |  | Market grouping: Domestic, SACU, SADC (non-SACU), Europe, Middle East. | ref.country |
| 10 | `currency_code` | character(3) | Y |  | Invoicing currency (NAD, ZAR, USD, EUR, GBP). | Master data workbook |
| 11 | `onboarding_date` | date | Y |  | Date the account was opened. | Master data workbook |
| 12 | `customer_status` | character varying(10) | Y |  | Active or Inactive at extract date (Type 1). | Master data workbook |
| 13 | `channel` | character varying(20) | Y |  | Sales channel in this version: Miller/Processor, Wholesale, Retail, Informal market, Institutional, Export (Type 2). | Master data + Customer_History |
| 14 | `credit_terms_days` | smallint | Y |  | Payment terms in days in this version (0 = cash on delivery) (Type 2). | Master data + Customer_History |
| 15 | `is_key_account` | boolean | Y |  | Key-account flag in this version (Type 2). | Master data + Customer_History |
| 16 | `is_inferred` | boolean | N |  | True for an inferred member created from a fact before the master record arrived (rule SA04). | ETL |
| 17 | `merged_codes` | text | Y |  | Duplicate customer codes merged into this survivor (rule MD04). | ref.customer_xref |
| 18 | `scd_effective_from` | date | N |  | First date this version is valid. | ETL (SCD2) |
| 19 | `scd_effective_to` | date | N |  | Last date this version is valid (9999-12-31 = open). | ETL (SCD2) |
| 20 | `scd_is_current` | boolean | N |  | True for the current version. | ETL (SCD2) |
| 21 | `scd_version` | smallint | N |  | Version sequence number per customer_code. | ETL (SCD2) |
| 22 | `scd_row_hash` | character(32) | N |  | MD5 of the Type 2 attributes. | ETL (SCD2) |
| 23 | `dw_batch_id` | integer | Y |  | Audit: ETL batch that created/last updated the row. | ETL |
| 24 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |
| 25 | `dw_updated_at` | timestamp with time zone | N |  | Audit: last update timestamp. | ETL |

## dw.dim_date

Conformed calendar dimension, one row per day 2020-01-01..2027-12-31 plus -1 Unknown; carries calendar, fiscal (Apr-Mar) and agricultural season (Oct-Sep) hierarchies.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `date_key` | integer | N | PK | Smart surrogate key YYYYMMDD (-1 = unknown / not yet occurred). | generated by etl.sp_load_dim_date |
| 2 | `full_date` | date | Y |  | Calendar date. | generated |
| 3 | `day_of_month` | smallint | Y |  | Day number within the month (1-31). | derived |
| 4 | `day_of_year` | smallint | Y |  | Day number within the calendar year (1-366). | derived |
| 5 | `day_of_week_iso` | smallint | Y |  | ISO weekday number, Monday = 1 ... Sunday = 7 (sort key for day_name). | derived |
| 6 | `day_name` | character varying(9) | Y |  | Weekday name (Monday..Sunday). | derived |
| 7 | `day_short` | character(3) | Y |  | Three-letter weekday abbreviation. | derived |
| 8 | `is_weekend` | boolean | Y |  | True for Saturday and Sunday. | derived |
| 9 | `is_public_holiday` | boolean | Y |  | True on Namibian public holidays (Public Holidays Act 26 of 1990 incl. Sunday->Monday rule). | etl.fn_namibian_holiday |
| 10 | `holiday_name` | character varying(40) | Y |  | Name of the Namibian public holiday, NULL otherwise. | etl.fn_namibian_holiday |
| 11 | `is_working_day` | boolean | Y |  | Farm working day: Monday-Saturday and not a public holiday. | derived |
| 12 | `iso_week` | smallint | Y |  | ISO-8601 week number. | derived |
| 13 | `week_start_date` | date | Y |  | Monday of the ISO week. | derived |
| 14 | `month_num` | smallint | Y |  | Calendar month number 1-12 (sort key for month_name). | derived |
| 15 | `month_name` | character varying(9) | Y |  | Calendar month name. | derived |
| 16 | `month_short` | character(3) | Y |  | Three-letter month abbreviation. | derived |
| 17 | `year_month` | character(7) | Y |  | Year-month label YYYY-MM. | derived |
| 18 | `year_month_key` | integer | Y |  | Integer YYYYMM (sort key for year_month). | derived |
| 19 | `month_start_date` | date | Y |  | First day of the month. | derived |
| 20 | `month_end_date` | date | Y |  | Last day of the month (key used by month-grain facts). | derived |
| 21 | `is_month_end` | boolean | Y |  | True on the last day of the month. | derived |
| 22 | `days_in_month` | smallint | Y |  | Number of days in the month. | derived |
| 23 | `quarter_num` | smallint | Y |  | Calendar quarter 1-4. | derived |
| 24 | `year_quarter` | character(7) | Y |  | Calendar year-quarter label YYYY-Qn. | derived |
| 25 | `calendar_year` | smallint | Y |  | Calendar year. | derived |
| 26 | `fiscal_year` | smallint | Y |  | Green Basket fiscal year (1 April - 31 March) named by its end year, e.g. FY2026 = Apr 2025-Mar 2026. | derived |
| 27 | `fiscal_year_label` | character(6) | Y |  | Fiscal year label FYyyyy. | derived |
| 28 | `fiscal_quarter_num` | smallint | Y |  | Fiscal quarter 1-4 (FQ1 = Apr-Jun). | derived |
| 29 | `fiscal_quarter_label` | character(10) | Y |  | Fiscal quarter label, e.g. FY2026-FQ1. | derived |
| 30 | `fiscal_month_num` | smallint | Y |  | Month number within the fiscal year (April = 1). | derived |
| 31 | `fiscal_year_start` | date | Y |  | First day of the fiscal year. | derived |
| 32 | `fiscal_year_end` | date | Y |  | Last day of the fiscal year. | derived |
| 33 | `crop_season_start_year` | smallint | Y |  | Start year of the agricultural season (1 October - 30 September). | derived |
| 34 | `crop_season_label` | character(7) | Y |  | Agricultural season label, e.g. 2023/24 (NSA/MAFWLR convention). | derived |
| 35 | `season_month_num` | smallint | Y |  | Month number within the agricultural season (October = 1). | derived |
| 36 | `is_current_month` | boolean | Y |  | True for days in the month of the data cut-off (30 Sep 2026). | derived |
| 37 | `dw_created_at` | timestamp with time zone | N |  | Audit: timestamp the row was created. | ETL |

## dw.dim_farm

Farm unit. SCD Type 2 on cultivated_ha, irrigation_type, water_source, farm_manager_code and GlobalG.A.P. status; Type 1 on name/location. Snowflaked to dim_region.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `farm_key` | integer | N | PK | Surrogate key: one value per farm VERSION (-1 Unknown). Facts store the version valid on the event date. | ETL identity |
| 2 | `farm_code` | character varying(10) | N |  | Durable natural key, e.g. GB-KAW-01. | Master data workbook, sheet Farms |
| 3 | `farm_name` | character varying(60) | N |  | Farm unit name (Type 1 - corrections overwrite all versions). | Master data workbook, sheet Farms |
| 4 | `region_key` | smallint | N | FK -> dim_region.region_key | FK to dim_region (snowflake outrigger). | ETL via ref.region_alias (rule MD01) |
| 5 | `town` | character varying(40) | Y |  | Nearest town (Type 1). | Master data workbook |
| 6 | `latitude` | numeric(9,5) | Y |  | Latitude in decimal degrees (WGS84), used to request NASA POWER weather. | Master data workbook |
| 7 | `longitude` | numeric(9,5) | Y |  | Longitude in decimal degrees (WGS84). | Master data workbook |
| 8 | `elevation_m` | integer | Y |  | Elevation in metres. | Master data workbook |
| 9 | `total_ha` | numeric(10,1) | Y |  | Total farm area in hectares (Type 1). | Master data workbook |
| 10 | `established_year` | smallint | Y |  | Year the farm unit joined Green Basket (Type 1). | Master data workbook |
| 11 | `harvest_log_template` | character(1) | Y |  | Layout of the farm's harvest log export (A, B, C). | Master data workbook |
| 12 | `cultivated_ha` | numeric(10,1) | Y |  | Cultivated (arable) hectares in this version (Type 2). | Master data workbook + Farm_History |
| 13 | `irrigation_type` | character varying(24) | Y |  | Primary irrigation system in this version: Dryland, Centre pivot, Drip, Drip + shade-net, Flood (canal) (Type 2). | Master data workbook + Farm_History |
| 14 | `is_irrigated` | boolean | Y |  | True when irrigation_type <> Dryland (Type 2, derived). | derived |
| 15 | `water_source` | character varying(40) | Y |  | Main water source in this version (Type 2). | Master data workbook + Farm_History |
| 16 | `farm_manager_code` | character varying(10) | Y |  | Pseudonymised employee code of the farm manager in this version (Type 2; no names stored). | Master data workbook + Farm_History |
| 17 | `is_globalgap_certified` | boolean | Y |  | GlobalG.A.P. certification status in this version; gates export-grade sales (Type 2). | Master data workbook + Farm_History |
| 18 | `scd_effective_from` | date | N |  | First date this version is valid (1900-01-01 for the first version). | ETL (SCD2) |
| 19 | `scd_effective_to` | date | N |  | Last date this version is valid (9999-12-31 for the current version). | ETL (SCD2) |
| 20 | `scd_is_current` | boolean | N |  | True for the current version (exactly one per farm_code). | ETL (SCD2) |
| 21 | `scd_version` | smallint | N |  | Version sequence number per farm_code. | ETL (SCD2) |
| 22 | `scd_row_hash` | character(32) | N |  | MD5 of the Type 2 attributes, used for change detection and idempotent re-runs. | ETL (SCD2) |
| 23 | `dw_batch_id` | integer | Y |  | Audit: ETL batch that created/last updated the row. | ETL |
| 24 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |
| 25 | `dw_updated_at` | timestamp with time zone | N |  | Audit: last update timestamp. | ETL |

## dw.dim_product

Saleable SKU (crop x grade x pack). Lowest level of the snowflake product -> crop -> category. SCD Type 1 (attributes are corrections, not business changes).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `product_key` | integer | N | PK | Surrogate key (identity; -1 Unknown). | ETL |
| 2 | `product_code` | character varying(16) | N |  | ERP product code (natural key), e.g. TOM-C1-C10. | Master data workbook, sheet Products |
| 3 | `product_name` | character varying(60) | N |  | Product description. | Master data workbook, sheet Products |
| 4 | `crop_key` | smallint | N | FK -> dim_crop.crop_key | FK to dim_crop (snowflake). | ETL lookup on crop_code |
| 5 | `grade` | character varying(12) | Y |  | Quality grade (WM1/WM2 maize grades, B1/B3 wheat grades, Class 1/2, Export/Local). | Master data workbook |
| 6 | `pack_type` | character varying(24) | Y |  | Packaging format (Bulk, 10kg crate, 4.5kg carton ...). | Master data workbook |
| 7 | `sales_uom` | character varying(8) | Y |  | Unit of measure used on invoices (t, crate, bag, head ...). | Master data workbook |
| 8 | `net_weight_kg` | numeric(10,3) | Y |  | Net kg per pack unit as recorded in master data (NULL for bulk). | Master data workbook |
| 9 | `kg_per_sales_uom` | numeric(10,3) | N |  | Conversion factor from invoice quantity to kg (1000 for tonnes). | derived (rule MD03 imputes missing weights) |
| 10 | `is_export_grade` | boolean | Y |  | True for export-grade SKUs (requires GlobalG.A.P.-certified farm). | Master data workbook |
| 11 | `is_active` | boolean | Y |  | Product currently sold. | Master data workbook |
| 12 | `net_weight_imputed` | boolean | N |  | True when kg_per_sales_uom was imputed by rule MD03. | ETL |
| 13 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |
| 14 | `dw_updated_at` | timestamp with time zone | N |  | Audit: last Type 1 update timestamp. | ETL |

## dw.dim_region

Conformed geography (Namibia's 14 regions) with management zone. Outrigger of dim_farm/dim_customer and the region grain of fact_crop_estimate. SCD Type 1.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `region_key` | smallint | N | PK | Surrogate key (-1 = Unknown). | ETL |
| 2 | `region_code` | character(5) | N |  | ISO 3166-2:NA region code (natural key), e.g. NA-KE. | Master data workbook, sheet Regions |
| 3 | `region_name` | character varying(30) | N |  | Official region name. | Master data workbook, sheet Regions |
| 4 | `zone_code` | character(2) | N |  | Green Basket management zone code (NC, NE, NW, CE, SO); drives row-level security. | Master data workbook, sheet Regions |
| 5 | `zone_name` | character varying(20) | N |  | Management zone name (North-Central, North-East, North-West, Central, South). | Master data workbook |
| 6 | `capital_town` | character varying(30) | Y |  | Regional capital. | Master data workbook |
| 7 | `is_northern_crop_region` | boolean | N |  | True for the northern communal crop-growing regions (NC, NE, NW zones) used in NSA crop reports. | derived from zone_code |
| 8 | `dw_created_at` | timestamp with time zone | N |  | Audit: row creation timestamp. | ETL |
| 9 | `dw_updated_at` | timestamp with time zone | N |  | Audit: last Type 1 update timestamp. | ETL |

## dw.harvest_anomaly

Model output: harvest records scored as anomalous by Isolation Forest / robust z-score (for steward review).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `source_file` | character varying(40) | N | PK | Lineage: harvest log file. | anomaly_detection.py |
| 2 | `source_row_num` | integer | N | PK | Lineage: row in the file. | anomaly_detection.py |
| 3 | `farm_code` | character varying(10) | Y |  | Farm code. | anomaly_detection.py |
| 4 | `crop_code` | character(3) | Y |  | Crop code. | anomaly_detection.py |
| 5 | `harvest_date` | date | Y |  | Harvest date. | anomaly_detection.py |
| 6 | `harvested_kg` | numeric(14,1) | Y |  | Harvested kg as loaded. | anomaly_detection.py |
| 7 | `anomaly_score` | numeric(10,4) | Y |  | Anomaly score (higher = more anomalous). | anomaly_detection.py |
| 8 | `method` | character varying(30) | N | PK | Detection method. | anomaly_detection.py |

## dw.yield_driver_importance

Model output: yield-driver coefficients (OLS) and permutation importances (random forest).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `model_name` | character varying(40) | N | PK | Model identifier. | yield_drivers.py |
| 2 | `feature` | character varying(40) | N | PK | Explanatory feature. | yield_drivers.py |
| 3 | `importance` | numeric(10,4) | Y |  | Permutation importance (drop in R2). | yield_drivers.py |
| 4 | `coefficient` | numeric(12,4) | Y |  | OLS coefficient on log-yield (approx. % effect). | yield_drivers.py |
| 5 | `p_value` | numeric(10,6) | Y |  | OLS p-value. | yield_drivers.py |
| 6 | `rank_order` | smallint | Y |  | Rank by importance. | yield_drivers.py |
| 7 | `model_run_at` | timestamp with time zone | N |  | Audit: model run timestamp. | yield_drivers.py |

## sec.user_zone_access

Maps Power BI user principal names to the management zones they may see (dynamic RLS).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `user_upn` | character varying(80) | N | PK | User principal name (Entra ID sign-in) matched by USERPRINCIPALNAME() in the RLS rule. | Head of Agriculture access request |
| 2 | `zone_code` | character(2) | N | PK | Management zone the user may see (NC, NE, NW, CE, SO); one row per zone granted. | access request |
| 3 | `granted_by` | character varying(40) | N |  | Role that approved the access (accountability). | access request |
| 4 | `valid_from` | date | N |  | Date the access became effective (recertified quarterly). | access request |
