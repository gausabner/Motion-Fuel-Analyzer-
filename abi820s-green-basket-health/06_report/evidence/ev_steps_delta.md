| step_name | rows_in | rows_out | note |
|---|---|---|---|
| transform master data | 3 | 119 |  |
| load static dimensions |  | 92 |  |
| load dim_region / dim_facility (Type 1) | 10 | 11 | 1 facility rows updated in place (Type 1) |
| load dim_condition / dim_diagnosis (snowflake) | 64 | 65 |  |
| load dim_care_unit (SCD2) | 31 | 41 | 0 initial rows, 2 new versions, 0 Type 1 updates |
| transform patient index (MD01-MD05) | 82 | 82 | 25 change-log rows |
| load dim_patient (SCD2) | 82 | 118,916 | 17 initial rows, 25 new versions, 40 inferred members completed |
| transform ED/clinic attendances (EN01-EN12) | 320 | 320 |  |
| transform inpatient spells (AD01-AD07) | 165 | 165 | 165 distinct spells in batch |
| transform ward census (WC01-WC04) | 21 | 21 | 0 ward-days imputed from PAS |
| transform e-roster (RS01-RS04) | 57 | 57 |  |
| transform IDSR weekly returns (SV01-SV07) | 18 | 18 |  |
| load fact_encounter | 320 | 320 |  |
| load fact_admission (accumulating snapshot) | 165 | 165 | 78 new spells, 87 existing spells updated (milestones) |
| load fact_ward_census_daily (periodic snapshot) | 21 | 21 |  |
| load fact_staff_roster | 57 | 57 |  |
| load fact_surveillance_weekly + fact_idsr_report (coverage) | 18 | 18 | 2470 expected reports in coverage fact |
| load fact_population (external, NSA) | 14 | 98 | national intercensal growth 3.027% per year |
