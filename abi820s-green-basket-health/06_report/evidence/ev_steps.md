| step_name | rows_in | rows_out | rows_rejected | ms | note |
|---|---|---|---|---|---|
| transform master data | 120 | 119 | 0 | 9 |  |
| load dim_date |  | 2,558 | 0 | 107 |  |
| load static dimensions |  | 92 | 0 | 5 |  |
| load dim_region / dim_facility (Type 1) | 10 | 11 | 0 | 2 | 0 facility rows updated in place (Type 1) |
| load dim_condition / dim_diagnosis (snowflake) | 64 | 65 | 0 | 3 |  |
| load dim_care_unit (SCD2) | 31 | 39 | 0 | 6 | 31 initial rows, 7 new versions, 0 Type 1 updates |
| transform patient index (MD01-MD05) | 107,332 | 107,172 | 160 | 2,160 | 11661 change-log rows |
| load dim_patient (SCD2) | 107,172 | 118,834 | 0 | 8,246 | 118833 initial rows, 0 new versions, 0 inferred members completed |
| transform ED/clinic attendances (EN01-EN12) | 563,209 | 560,237 | 2,972 | 29,103 |  |
| transform inpatient spells (AD01-AD07) | 151,774 | 135,551 | 16,223 | 5,859 | 135551 distinct spells in batch |
| inferred patient members (EN10) | 40 | 40 | 0 | 207 |  |
| transform ward census (WC01-WC04) | 36,232 | 36,414 | 109 | 2,273 | 291 ward-days imputed from PAS |
| transform e-roster (RS01-RS04) | 97,502 | 97,308 | 194 | 2,682 |  |
| transform IDSR weekly returns (SV01-SV07) | 22,410 | 21,753 | 657 | 2,026 |  |
| transform external sources (EX01-EX02, WE01-WE02) | 19 | 18,574 | 0 | 289 |  |
| load fact_encounter | 560,237 | 560,237 | 0 | 30,499 |  |
| load fact_admission (accumulating snapshot) | 135,551 | 135,551 | 0 | 13,891 | 135551 new spells, 0 existing spells updated (milestones) |
| load fact_ward_census_daily (periodic snapshot) | 36,414 | 36,414 | 0 | 648 |  |
| load fact_staff_roster | 97,308 | 97,308 | 0 | 1,780 |  |
| load fact_surveillance_weekly + fact_idsr_report (coverage) | 21,753 | 21,753 | 0 | 314 | 2470 expected reports in coverage fact |
| load fact_population (external, NSA) | 14 | 98 | 0 | 2 | national intercensal growth 3.027% per year |
| load fact_weather_daily (external, NASA POWER) | 18,560 | 18,560 | 0 | 211 |  |
