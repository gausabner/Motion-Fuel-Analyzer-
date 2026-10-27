| check_code | check_name | check_type | source_value | target_value | status | explanation |
|---|---|---|---|---|---|---|
| R01 | Attendance rows landed = accepted + rejected (this batch) | ROW_COUNT | 320 | 320 | PASS | 320 accepted, 0 rejected (EN01 duplicates, EN12 out-of-window, unknown facility) |
| R02 | Attendances: clean staging = fact_encounter | ROW_COUNT | 560,557 | 560,557 | PASS |  |
| R03 | Control total: door-to-doctor minutes, staging vs fact | CONTROL_TOTAL | 51,932,017 | 51,932,017 | PASS |  |
| R04 | Inpatient spells: distinct spells in staging = fact_admission | ROW_COUNT | 135,629 | 135,629 | PASS | 16223 superseded CDC images rejected over all batches (AD01) |
| R05 | Control total: length-of-stay days of discharged spells, staging vs fact | CONTROL_TOTAL | 551,247 | 551,247 | PASS |  |
| R06 | Cross-source: ED attendances admitted = spells linked to them | CROSS_SOURCE | 72,144 | 72,144 | PASS | Differences = admissions recorded in the ED but missing (or not yet exported) in the inpatient spell extract |
| R07 | Cross-source: occupied bed-days, ward returns vs PAS spells | CROSS_SOURCE | 552,033 | 569,275 | WARN | PAS exceeds the ward returns by 17242 bed-days; 25 spells are still open > 60 days in PAS (AD06, probable missing discharges) |
| R08 | Cross-source: malaria cases, IDSR returns vs PAS attendances (B50-B54) | CROSS_SOURCE | 43,695 | 43,643 | PASS | IDSR / PAS = 99.9%: transcription differences on the weekly forms (rows corrected under SV06 are already fixed) |
| R09 | Control total: 14 regions = NSA national total (2023 census) | CONTROL_TOTAL | 3,022,401 | 3,022,401 | PASS |  |
| R10 | SCD2 integrity dim_patient: gaps/overlaps + keys without exactly one current version | INTEGRITY | 0 | 0 | PASS | 118915 versions for 107229 patients |
| R11 | SCD2 integrity dim_care_unit: gaps/overlaps + keys without exactly one current version | INTEGRITY | 0 | 0 | PASS | 40 versions for 31 units |
| R12 | Referential: attendances on patient -1 = unidentified patients logged (EN11) | REFERENTIAL | 180 | 180 | PASS |  |
| R13 | Referential: attendances on diagnosis -1 = invalid/missing codes logged (EN08) | REFERENTIAL | 840 | 840 | PASS |  |
| R14 | Referential: facts without a care unit or (spells) without a patient | REFERENTIAL | 0 | 0 | PASS |  |
| R15 | Completeness: dim_date has every day 2021-01-01..2027-12-31 | COMPLETENESS | 2,556 | 2,556 | PASS |  |
| R16 | Completeness: one census row per ward per day | COMPLETENESS | 36,435 | 36,435 | PASS | 305 ward-days imputed from PAS (WC01, WC02, WC04) |
| R17 | Completeness: weather one row per facility per day, no temperature gaps | COMPLETENESS | 18,560 | 18,560 | PASS | 253 facility-days imputed (WE01/WE02) |
| R18 | Completeness: IDSR coverage fact = facilities x due epi weeks | COMPLETENESS | 2,470 | 2,470 | PASS | completeness 97.9%, timeliness 87.2% |
| R19 | Integrity: spells discharged after admission, milestone keys consistent | INTEGRITY | 0 | 0 | PASS | 344 spells still in hospital at the cut-off |
| R20 | Control total: nursing hours worked, staging vs fact | CONTROL_TOTAL | 4,026,374 | 4,026,374 | PASS |  |
| R21 | Mart view v_fact_encounter = dw.fact_encounter | ROW_COUNT | 560,557 | 560,557 | PASS |  |
| R22 | Plausibility: ward-days above 200% occupancy (WARN up to 0.5% of ward-days) | PLAUSIBILITY | 0 | 3 | WARN | 6002 ward-days above 100% (overflow beds) are plausible and kept |
