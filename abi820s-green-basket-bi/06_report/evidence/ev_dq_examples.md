| rule_code | source_object | source_key | column_name | raw_value | action_taken |
|---|---|---|---|---|---|
| CE01 | NSA crop estimates | 2020/2021/Ohangwena/Sorghum | crop | Sorghum | Excluded (out of scope) |
| CL01 | Cost ledger | JNL-2021-0000436 | posting_id | JNL-2021-0000436 | Removed duplicate |
| CL02 | Cost ledger | JNL-2021-0001791 | cost_category | FERTILISER | Mapped to CC02 |
| CL03 | Cost ledger | JNL-2021-0008100 | crop_code |  | Loaded to Unknown crop (-1) |
| CL04 | Cost ledger | JNL-2021-0010824 | amount_nad | N$25,149.46 | Parsed to 25149.46 |
| FX01 | FRED DEXSFUS | 2020-02-05 | value |  | Excluded from monthly average |
| HV01 | Harvest log | harvest_log_GB-ERO-01.csv:643 | date | 2025-13-02 | Rejected to quarantine |
| HV02 | Harvest log | harvest_log_GB-KHA-02.csv:150 | quantity |  | Rejected to quarantine |
| HV03 | Harvest log | harvest_log_GB-HAR-01.csv:34 | quantity | -20.819 | Rejected to quarantine |
| HV05 | Harvest log | harvest_log_GB-ERO-01.csv:238 | quantity | 7,029 | Removed duplicate |
| HV06 | Harvest log | harvest_log_GB-ERO-01.csv:193 | quantity | 502896.0 | Divided by 10 (block yield 3.8x) |
| HV08 | Harvest log | harvest_log_GB-ERO-01.csv:43 | farm_code |   gb-ero-01 | Standardised to GB-ERO-01 |
| MD01 | Master data: Farms | GB-ZAM-01 | region | Zambezi (Caprivi) | Mapped to NA-CA |
| MD02 | Master data: Customers | C00175 | region |  | Loaded with Unknown region (-1) |
| MD03 | Master data: Products | BUT-C2-BIN | net_weight_kg |  | Imputed 400 kg from pack type "400kg bin" |
| MD04 | Master data: Customers | C00241 | customer_code | C00241 | Merged into survivor C00063 |
| MD05 | Master data: Customers | C00018 | customer_name | MOPANE WHOLESALE INVESTMENTS CC | Cleaned to: Mopane Wholesale Investments CC |
| MP01 | World Bank Pink Sheet | SORGHUM 2021-02 | price | missing | Linearly interpolated |
| PL01 | Planting register | GB-KAE-01/MZW/2023S/P01 | planting_date | 22/11/2023 | Parsed as DD/MM/YYYY |
| PL02 | Planting register | GB-ZAM-01/WHT/2023W/P01 | planted_ha |  | Imputed with mean block area of the cycle |
| PL03 | Planting register | GB-OTJ-02/MZW/2023S/P01 | status | Completed | Kept (no harvest records yet) |
| SA01 | ERP sales | INV2022-000478/3 (sales_invoice_lines_FY2022.csv.gz:708) | invoice_no+line_no |  | Removed duplicate |
| SA02 | ERP sales | CRN2022-000010/1 (sales_invoice_lines_FY2022.csv.gz:2469) | product_code | CAB C1 HD | Mapped to CAB-C1-HD |
| SA03 | ERP sales | CRN2023-000071/1 (sales_invoice_lines_FY2023.csv.gz:11643) | customer_code | C00242 | Merged to survivor C00049 |
| SA04 | ERP sales | CRN2026-000137/1 (sales_invoice_lines_FY2026.csv.gz:34761) | customer_code | C00150 | Inferred member created |
| SA05 | ERP sales | CRN2022-000047/1 (sales_invoice_lines_FY2022.csv.gz:9233) | farm_code |  | Loaded to Unknown farm (-1) |
| SA06 | ERP sales | CRN2024-000226/1 (sales_invoice_lines_FY2024.csv.gz:52061) | currency_code |  | Defaulted to EUR |
| SA07 | ERP sales | INV2022-001385/2 (sales_invoice_lines_FY2022.csv.gz:2091) | unit_price | 64.3000 NAD | Flagged for review (price 25.72 N$/kg) |
| ST01 | Stock system | GB-OTJ-01/MZW-WM2-BLK/2021-05-31 | closing_kg | -56554.2 | Sign corrected |
| ST03 | Stock system | GB-OSK-01/MZW-WM1-BLK/2022-12-31 | row | missing | Imputed from adjacent snapshots and ERP dispatches |
| WE01 | NASA POWER | GB-ERO-01/2021-01-12 | T2M_MAX/T2M_MIN | -999 | Interpolated |
| WE02 | NASA POWER | GB-ERO-01/2021-01-07 | PRECTOTCORR | -999 | Left NULL, flagged |
