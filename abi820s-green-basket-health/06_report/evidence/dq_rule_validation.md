40 rules with a record-level truth list: 134,964 of 134,992 injected records found (recall 0.9998), 0 false positives (precision 1.0000); 38 rules match their truth list exactly. Count-level checks for the external sources are listed at the end.

| rule | defect | injected | flagged | tp | fp | fn | precision | recall |
|---|---|---|---|---|---|---|---|---|
| AD01 | Superseded spell image (CDC) | 16223 | 16223 | 16,223 | 0 | 0 | 1.000 | 1.000 |
| AD02 | Discharge before admission | 40 | 40 | 40 | 0 | 0 | 1.000 | 1.000 |
| AD03 | Implausible length of stay | 27 | 27 | 27 | 0 | 0 | 1.000 | 1.000 |
| AD04 | Ward code variant | 2711 | 2711 | 2,711 | 0 | 0 | 1.000 | 1.000 |
| AD05 | Principal diagnosis not coded | 1084 | 1084 | 1,084 | 0 | 0 | 1.000 | 1.000 |
| AD06 | Open spell older than 60 days | 25 | 25 | 25 | 0 | 0 | 1.000 | 1.000 |
| AD07 | Admission method variant | 2711 | 2711 | 2,711 | 0 | 0 | 1.000 | 1.000 |
| EN01 | Duplicate attendance record | 2966 | 2966 | 2,966 | 0 | 0 | 1.000 | 1.000 |
| EN02 | Timestamp in day-first format | 16388 | 16388 | 16,388 | 0 | 0 | 1.000 | 1.000 |
| EN03 | Facility code variant | 11204 | 11204 | 11,204 | 0 | 0 | 1.000 | 1.000 |
| EN04 | Triage category missing | 2875 | 2875 | 2,875 | 0 | 0 | 1.000 | 1.000 |
| EN05 | Doctor-seen time before arrival | 807 | 807 | 807 | 0 | 0 | 1.000 | 1.000 |
| EN06 | Implausible length of stay | 280 | 280 | 280 | 0 | 0 | 1.000 | 1.000 |
| EN07 | ICD-10 code formatting | 15904 | 15877 | 15,877 | 0 | 27 | 1.000 | 0.998 |
| EN08 | ICD-10 code invalid or missing | 840 | 840 | 840 | 0 | 0 | 1.000 | 1.000 |
| EN09 | Code variant (triage, disposition, arrival mode) | 37848 | 37847 | 37,847 | 0 | 1 | 1.000 | 1.000 |
| EN10 | Patient not in patient index (late-arriving) | 40 | 40 | 40 | 0 | 0 | 1.000 | 1.000 |
| EN11 | Patient identifier missing | 180 | 180 | 180 | 0 | 0 | 1.000 | 1.000 |
| EN12 | Arrival date outside the extract window | 6 | 6 | 6 | 0 | 0 | 1.000 | 1.000 |
| EX01 | Census numbers with thousands separators | 15 | 15 |  |  |  |  |  |
| MD01 | Region name variant | 2145 | 2145 | 2,145 | 0 | 0 | 1.000 | 1.000 |
| MD02 | Sex code variant | 2143 | 2143 | 2,143 | 0 | 0 | 1.000 | 1.000 |
| MD03 | Birth year implausible | 53 | 53 | 53 | 0 | 0 | 1.000 | 1.000 |
| MD04 | Superseded patient-index record | 160 | 160 | 160 | 0 | 0 | 1.000 | 1.000 |
| MD05 | Payer code variant | 2143 | 2143 | 2,143 | 0 | 0 | 1.000 | 1.000 |
| MD06 | Duplicate or untrimmed ICD-10 code | 2 | 2 | 2 | 0 | 0 | 1.000 | 1.000 |
| RS01 | Shift code variant | 13872 | 13872 | 13,872 | 0 | 0 | 1.000 | 1.000 |
| RS02 | Negative hours | 29 | 29 | 29 | 0 | 0 | 1.000 | 1.000 |
| RS03 | Duplicate roster row | 194 | 194 | 194 | 0 | 0 | 1.000 | 1.000 |
| RS04 | Overtime exceeds hours worked | 29 | 29 | 29 | 0 | 0 | 1.000 | 1.000 |
| SV01 | Epi-week format variant | 234 | 234 | 234 | 0 | 0 | 1.000 | 1.000 |
| SV02 | Superseded IDSR report version | 73 | 73 | 73 | 0 | 0 | 1.000 | 1.000 |
| SV03 | Condition name variant | 1305 | 1305 | 1,305 | 0 | 0 | 1.000 | 1.000 |
| SV04 | Deaths exceed cases | 4 | 4 | 4 | 0 | 0 | 1.000 | 1.000 |
| SV05 | Positive tests exceed tests done | 4 | 4 | 4 | 0 | 0 | 1.000 | 1.000 |
| SV06 | Case count keyed x10 | 8 | 8 | 8 | 0 | 0 | 1.000 | 1.000 |
| SV07 | Negative case count | 3 | 3 | 3 | 0 | 0 | 1.000 | 1.000 |
| WC01 | Ward return missing | 291 | 291 | 291 | 0 | 0 | 1.000 | 1.000 |
| WC02 | Occupied beds keyed x10 | 18 | 18 | 18 | 0 | 0 | 1.000 | 1.000 |
| WC03 | Resubmitted ward return | 109 | 109 | 109 | 0 | 0 | 1.000 | 1.000 |
| WC04 | Occupied beds negative or blank | 14 | 14 | 14 | 0 | 0 | 1.000 | 1.000 |
| WE01+WE02 | NASA POWER -999 fill values (all parameters) | 344 | 344 |  |  |  |  |  |
