| Source | Rows | Cols | Duplicates | Missing key values | Invalid dates | Other issues found |
|---|---|---|---|---|---|---|
| S1 Farm harvest logs (14 CSV, 3 layouts) | 7476 | 8 | 89 | 0 | 11 | 217 non-standard farm codes; 47 crop spellings for 10 crops; 2 non-positive quantities; 3 date formats; units kg/t/crates/bins |
| S1 Planting register (block level) | 1327 | 11 | 0 | 13 | 0 | 29 dates in DD/MM/YYYY among ISO dates; harvested_ha blank for 79 open/growing blocks (expected) |
| S3 ERP sales invoice lines (6 gz CSV) | 305490 | 17 | 2587 | 0 | 0 | 4591 product-code variants; 2488 blank farm codes; 39 blank currencies; 2095 lines on duplicate customer codes; 696 lines for customers missing from master data |
| S4 Stock system (monthly) | 6519 | 10 | 0 | 0 | 0 | 3 negative closing balances; gaps in monthly series detected by continuity check |
| S5 Cost ledger (gz CSV) | 15428 | 12 | 46 | 0 | 0 | 47 category spellings for 14 categories; 454 amounts with N$ / thousands separators; 50 crop-specific postings without crop |
| S2 Master data workbook (10 sheets) | 238 | 12 | 3 | 2 | 0 | 18 non-standard region spellings; 8 ALL-CAPS and 4 padded names; 3 probable duplicate customers (name match); 1 product without net weight |
| S6 NASA POWER weather (14 JSON) | 153370 | 5 | 0 | 697 | 0 | -999 fill values (incl. last 3 days = data latency) |
| S7 World Bank Pink Sheet (xlsx) | 486 | 6 | 0 | 2 | 0 | wide sheet with 3 title rows; '…' missing markers; header text with trailing blanks ('Urea ') |
| S8 FRED FX (3 CSV) | 5283 | 2 | 0 | 72 | 0 | blank values on US holidays; daily -> monthly |
| S9 NSA / MAFWLR crop estimates (CSV) | 348 | 9 | 0 | 0 | 0 | 104 rows with non-standard region names; 24 rows for a crop outside scope; numbers with thousands separators |
