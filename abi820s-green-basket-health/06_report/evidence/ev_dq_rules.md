| rule_code | rule_name | dq_dimension | action | owner_role | hits |
|---|---|---|---|---|---|
| AD01 | Superseded spell image (CDC) | Uniqueness | KEEP LATEST | Health Information Manager | 16,223 |
| AD02 | Discharge before admission | Validity | CORRECT | Health Information Manager | 40 |
| AD03 | Implausible length of stay | Accuracy | CORRECT | Health Information Manager | 27 |
| AD04 | Ward code variant | Consistency | CORRECT | Health Information Manager | 2,711 |
| AD05 | Principal diagnosis not coded | Completeness | FLAG | Clinical Coding Lead | 1,084 |
| AD06 | Open spell older than 60 days | Completeness | FLAG | Nursing Services Manager | 25 |
| AD07 | Admission method variant | Consistency | MAP | Health Information Manager | 2,711 |
| EN01 | Duplicate attendance record | Uniqueness | REJECT | Health Information Manager | 2,966 |
| EN02 | Timestamp in day-first format | Consistency | CORRECT | Health Information Manager | 16,388 |
| EN03 | Facility code variant | Consistency | CORRECT | Health Information Manager | 11,204 |
| EN04 | Triage category missing | Completeness | FLAG | ED Nursing Manager | 2,875 |
| EN05 | Doctor-seen time before arrival | Validity | REJECT | ED Nursing Manager | 807 |
| EN06 | Implausible length of stay | Accuracy | REJECT | ED Nursing Manager | 280 |
| EN07 | ICD-10 code formatting | Consistency | CORRECT | Clinical Coding Lead | 15,877 |
| EN08 | ICD-10 code invalid or missing | Validity | FLAG | Clinical Coding Lead | 840 |
| EN09 | Code variant (triage, disposition, arrival mode) | Consistency | MAP | Health Information Manager | 38,705 |
| EN10 | Patient not in patient index (late-arriving) | Timeliness | INFER | Health Information Manager | 40 |
| EN11 | Patient identifier missing | Completeness | FLAG | Health Information Manager | 180 |
| EN12 | Arrival date outside the extract window | Validity | REJECT | Health Information Manager | 6 |
| EX01 | Census number formatting | Validity | CORRECT | External Data Steward | 15 |
| EX02 | Census aggregate or note row | Consistency | REJECT | External Data Steward | 4 |
| MD01 | Region name variant | Consistency | MAP | Master Data Steward | 2,146 |
| MD02 | Sex code variant | Consistency | MAP | Health Information Manager | 2,143 |
| MD03 | Birth year implausible | Validity | CORRECT | Health Information Manager | 53 |
| MD04 | Superseded patient-index record | Uniqueness | KEEP LATEST | Health Information Manager | 160 |
| MD05 | Payer code variant | Consistency | MAP | Revenue Cycle Steward | 2,143 |
| MD06 | Duplicate or untrimmed ICD-10 code | Uniqueness | CORRECT | Clinical Coding Lead | 2 |
| RS01 | Shift code variant | Consistency | MAP | Workforce Planning Officer | 13,872 |
| RS02 | Negative hours | Validity | CORRECT | Workforce Planning Officer | 29 |
| RS03 | Duplicate roster row | Uniqueness | REJECT | Workforce Planning Officer | 194 |
| RS04 | Overtime exceeds hours worked | Consistency | FLAG | Workforce Planning Officer | 29 |
| SV01 | Epi-week format variant | Consistency | CORRECT | Surveillance Officer | 234 |
| SV02 | Superseded IDSR report version | Uniqueness | KEEP LATEST | Surveillance Officer | 73 |
| SV03 | Condition name variant | Consistency | MAP | Surveillance Officer | 1,305 |
| SV04 | Deaths exceed cases | Consistency | FLAG | Surveillance Officer | 4 |
| SV05 | Positive tests exceed tests done | Consistency | FLAG | Surveillance Officer | 4 |
| SV06 | Case count keyed x10 | Accuracy | CORRECT | Surveillance Officer | 8 |
| SV07 | Negative case count | Validity | CORRECT | Surveillance Officer | 3 |
| WC01 | Ward return missing | Completeness | IMPUTE | Nursing Services Manager | 291 |
| WC02 | Occupied beds keyed x10 | Accuracy | CORRECT | Nursing Services Manager | 18 |
| WC03 | Resubmitted ward return | Uniqueness | KEEP LATEST | Nursing Services Manager | 109 |
| WC04 | Occupied beds negative or blank | Validity | IMPUTE | Nursing Services Manager | 14 |
| WE01 | Weather fill value (temperature, humidity) | Completeness | IMPUTE | External Data Steward | 265 |
| WE02 | Weather fill value (rainfall) | Completeness | IMPUTE | External Data Steward | 79 |
