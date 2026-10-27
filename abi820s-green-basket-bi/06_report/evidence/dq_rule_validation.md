27 injected defect types checked against the rules that should catch them: 23 match exactly. Record-level (7 rules with a truth list): 236 of 237 injected records found, 0 false positives.

| rule | defect | level | injected | flagged | precision | recall | match |
|---|---|---|---|---|---|---|---|
| HV05 | Exact duplicate harvest records | record | 89 | 89 | 1.000 | 1.000 | exact |
| HV01 | Unparseable harvest dates | record | 11 | 11 | 1.000 | 1.000 | exact |
| HV02 | Blank harvest quantities | record | 6 | 6 | 1.000 | 1.000 | exact |
| HV03 | Negative harvest quantities | record | 2 | 2 | 1.000 | 1.000 | exact |
| HV06 | x10 / x1000 quantity keying errors | record | 8 | 7 | 1.000 | 0.875 | TP 7 / FP 0 / FN 1 |
| SA07 | Unit price keyed x10 (invoice lines) | record | 119 | 119 | 1.000 | 1.000 | exact |
| ST03 | Missing monthly stock snapshots | record | 2 | 2 | 1.000 | 1.000 | exact |
| HV08 | Farm code case / whitespace / underscore variants | count | 215 | 217 |  |  | see note |
| PL01 | Planting dates keyed as DD/MM/YYYY | count | 29 | 29 |  |  | exact |
| PL02 | Planted area left blank | count | 13 | 13 |  |  | exact |
| MD03 | Product without net weight | count | 1 | 1 |  |  | exact |
| MD04 | Duplicate customer accounts | count | 3 | 3 |  |  | exact |
| MD05 | Customer names in capitals / padded | count | 9 | 9 |  |  | exact |
| MD02 | Domestic customer without region | count | 2 | 2 |  |  | exact |
| SA01 | Duplicate invoice lines (overlapping extracts) | count | 2587 | 2587 |  |  | exact |
| SA02 | Product-code spelling variants | count | 4556 | 4556 |  |  | exact |
| SA03 | Lines on a duplicate customer code | count | 2088 | 2088 |  |  | exact |
| SA04 | Lines for customers not yet in master data | count | 694 | 694 |  |  | exact |
| SA05 | Lines without farm of origin | count | 2466 | 2466 |  |  | exact |
| SA06 | Export lines without currency | count | 39 | 39 |  |  | exact |
| ST01 | Closing stock keyed with the wrong sign | count | 3 | 3 |  |  | exact |
| CL01 | Duplicate ledger postings | count | 46 | 46 |  |  | exact |
| CL04 | Amounts with N$ / thousands separators | count | 451 | 452 |  |  | see note |
| CL03 | Crop-specific cost without crop | count | 48 | 50 |  |  | see note |
| MP01 | Pink Sheet '...' missing markers | count | 2 | 2 |  |  | exact |
| FX01 | Blank FX observations | count | 72 | 72 |  |  | exact |
| CE01 | NSA rows for a crop outside scope | count | 24 | 24 |  |  | exact |
