| check_code | check_name | check_type | source_value | target_value | status | explanation |
|---|---|---|---|---|---|---|
| R01 | Harvest log rows: raw = loaded + rejected + duplicates | ROW_COUNT | 7,476 | 7,476 | PASS | 7368 loaded, 19 rejected to quarantine, 89 duplicates removed |
| R02 | Harvest rows: cleansed staging = fact_harvest | ROW_COUNT | 7,368 | 7,368 | PASS | Every accepted harvest record loaded once |
| R03 | Harvest control total (kg): staging = warehouse | CONTROL_TOTAL | 214,476,707 | 214,476,707 | PASS | Sum of standardised kilograms |
| R04 | ERP sales rows: raw = loaded + rejected + duplicates | ROW_COUNT | 305,490 | 305,490 | PASS | 302903 lines in fact_sales, 0 rejected, 2587 duplicate lines from overlapping extracts removed |
| R05 | Net revenue control total (N$): staging = warehouse | CONTROL_TOTAL | 2,110,889,915 | 2,110,889,915 | PASS | Includes credit notes (negative) |
| R06 | Cross-source: ERP invoiced kg vs stock-system dispatched kg | CROSS_SOURCE | 196,854,183 | 196,994,249 | PASS | Difference = goods dispatched on 29-30 Sep 2026 and invoiced after the extract (unbilled at cut-off). 4589630 kg were invoiced in a later month than dispatched (timing only). |
| R07 | Stock-flow identity exceptions (opening + in - out - loss = closing) | INTEGRITY | 0 | 0 | PASS | After sign-error correction (ST01) and gap imputation (ST03) |
| R08 | Stock continuity breaks (closing of month m-1 <> opening of month m) | INTEGRITY | 0 | 0 | PASS | Gaps imputed by rule ST03 |
| R09 | Cost ledger control total (N$): raw (excl. duplicates) = warehouse | CONTROL_TOTAL | 1,267,300,948 | 1,267,300,948 | PASS | Reversal/correction pairs retained (they are legitimate postings) |
| R10 | Cost ledger rows: raw = loaded + duplicates/rejected | ROW_COUNT | 15,428 | 15,428 | PASS | 46 duplicate/rejected postings |
| R11 | Sales lines on Unknown farm (-1), % of lines | REFERENTIAL | 2.0 | 0.814 | PASS | 2466 of 302903 lines lack farm of origin (rule SA05); threshold 2 % |
| R12 | Sales lines with Unknown customer (-1) / open inferred members | REFERENTIAL | 0 | 0 | PASS | 5 inferred customer member(s) currently awaiting master data (rule SA04) |
| R13 | SCD2 integrity violations (current-row count, overlaps, gaps) | INTEGRITY | 0 | 0 | PASS | dim_farm 20 versions / 14 farms; dim_customer 277 versions / 240 customers |
| R14 | Date dimension: contiguous days 2020-01-01..2027-12-31 | COMPLETENESS | 2,922 | 2,922 | PASS | Required for Power BI time intelligence (mark as date table) |
| R15 | Weather completeness: farm-days with rainfall (%) | COMPLETENESS | 100 | 99.830 | PASS | 30674 farm-days; temperature complete for 30674 after interpolation (WE01) |
| R16 | Commodity prices: months x 6 series loaded | COMPLETENESS | 486 | 486 | PASS | Missing Pink Sheet markers interpolated (MP01) |
| R17 | Plausibility: Green Basket harvest exceeds the NSA regional estimate | PLAUSIBILITY | 0 | 0 | PASS | 240 region-crop-season combinations compared |
| R18 | Cross-source: harvest net of cull (kg) vs stock received (kg) | CROSS_SOURCE | 205,316,227 | 205,881,267 | PASS | Net residual -565040 kg (-0.27 %): harvest rows quarantined for invalid date/quantity (235129 kg as keyed; blank and negative entries carry no usable value until resubmitted) plus the gap between crop-level typical cull and actual grading losses; within the 0.5 % tolerance. |
| R19 | Invoice lines flagged as price anomalies (SA07), count | PLAUSIBILITY | 0 | 119 | WARN | N$ 4,899,760 of revenue on flagged lines awaiting Sales Data Steward review |
