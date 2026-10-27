| rule_code | rule_name | dq_dimension | action | rows_affected | owner_role |
|---|---|---|---|---|---|
| CE01 | Crop outside Green Basket scope | Integrity | REJECT | 24 | External Data Steward |
| CE02 | Yield not published | Completeness | IMPUTE | 0 | External Data Steward |
| CL01 | Duplicate ledger posting | Uniqueness | REJECT | 46 | Finance Data Steward |
| CL02 | Cost category alias | Consistency | MAP | 4656 | Finance Data Steward |
| CL03 | Crop missing on crop-specific cost | Completeness | FLAG | 50 | Finance Data Steward |
| CL04 | Amount text formatting | Validity | CORRECT | 452 | Finance Data Steward |
| FX01 | FX observation blank | Completeness | FLAG | 72 | External Data Steward |
| HV01 | Harvest date unparseable | Validity | REJECT | 11 | Farm Data Steward |
| HV02 | Harvest quantity missing | Completeness | REJECT | 6 | Farm Data Steward |
| HV03 | Harvest quantity not positive | Validity | REJECT | 2 | Farm Data Steward |
| HV04 | Unknown farm or crop code | Integrity | REJECT | 0 | Farm Data Steward |
| HV05 | Duplicate harvest record | Uniqueness | REJECT | 89 | Farm Data Steward |
| HV06 | Harvest quantity unit/decimal error | Accuracy | CORRECT | 7 | Farm Data Steward |
| HV07 | Harvest record without planting block | Integrity | FLAG | 0 | Farm Data Steward |
| HV08 | Farm code formatting | Consistency | CORRECT | 217 | Farm Data Steward |
| MD01 | Region name variant | Consistency | MAP | 127 | Master Data Steward |
| MD02 | Customer region missing | Completeness | FLAG | 2 | Master Data Steward |
| MD03 | Product net weight missing | Completeness | IMPUTE | 1 | Master Data Steward |
| MD04 | Duplicate customer account | Uniqueness | MERGE | 3 | Master Data Steward |
| MD05 | Customer name formatting | Consistency | CORRECT | 9 | Master Data Steward |
| MP01 | Commodity price missing | Completeness | IMPUTE | 2 | External Data Steward |
| PL01 | Planting date alternative format | Consistency | CORRECT | 29 | Agronomist |
| PL02 | Planted area missing | Completeness | IMPUTE | 13 | Agronomist |
| PL03 | Status inconsistent with harvest log | Consistency | FLAG | 1 | Agronomist |
| SA01 | Duplicate invoice line | Uniqueness | REJECT | 2587 | Sales Data Steward |
| SA02 | Product code variant | Consistency | CORRECT | 4556 | Sales Data Steward |
| SA03 | Customer code merged | Uniqueness | MERGE | 2088 | Sales Data Steward |
| SA04 | Unknown customer (late-arriving) | Timeliness | INFER | 694 | Sales Data Steward |
| SA05 | Farm of origin missing | Completeness | FLAG | 2466 | Sales Data Steward |
| SA06 | Currency missing | Completeness | CORRECT | 39 | Sales Data Steward |
| SA07 | Unit price anomaly | Accuracy | FLAG | 119 | Sales Data Steward |
| SA08 | Quantity sign inconsistent with document type | Validity | REJECT | 0 | Sales Data Steward |
| ST01 | Closing stock sign error | Accuracy | CORRECT | 3 | Inventory Controller |
| ST02 | Stock-flow identity broken | Consistency | FLAG | 0 | Inventory Controller |
| ST03 | Missing monthly stock snapshot | Completeness | IMPUTE | 2 | Inventory Controller |
| WE01 | Weather fill value (temperature) | Completeness | IMPUTE | 228 | External Data Steward |
| WE02 | Weather fill value (rainfall) | Completeness | IMPUTE | 136 | External Data Steward |
