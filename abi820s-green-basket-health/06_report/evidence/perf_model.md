| metric | naive | optimised |
|---|---|---|
| Columns imported (12 tables) | 203 | 152 |
| fact_encounter columns | 21 | 17 |
| Columnar store size, all tables (MB, DuckDB proxy for VertiPaq) | 23.0 | 12.5 |
| Bytes streamed from PostgreSQL at refresh (MB) | 116.9 | 57.4 |
| Extract + load wall time (s) | 6.3 | 3.0 |
| Highest-cardinality fact_encounter column | encounter_id (563,608) | patient_key (108,135) |
| Rows per refresh: full vs incremental (10-day partition) | 560,557 | 3,214 |
| Refresh query time: full vs incremental (s) | 0.049 | 0.015 |

fact_encounter columns by cardinality - naive import:

| column | cardinality |
|---|---|
| encounter_id | 563608 |
| encounter_key | 559455 |
| patient_key | 108135 |
| arrival_date_key | 1670 |
| ed_los_min | 1350 |
| door_to_doctor_min | 944 |
| age_years | 101 |
| wait_to_triage_min | 89 |
| diagnosis_key | 58 |
| encounter_profile_key | 24 |
| arrival_hour_key | 24 |
| care_unit_key | 10 |
| triage_key | 7 |
| age_band_key | 7 |
| is_admitted | 2 |
| seen_within_target | 2 |
| is_lwbs | 2 |
| dw_batch_id | 2 |
| is_died | 2 |
| dw_loaded_at | 2 |
| encounter_count | 1 |

optimised import (mart.v_fact_encounter):

| column | cardinality |
|---|---|
| patient_key | 108135 |
| patient_durable_key | 104611 |
| arrival_date_key | 1670 |
| ed_los_min | 1350 |
| door_to_doctor_min | 944 |
| wait_to_triage_min | 89 |
| diagnosis_key | 58 |
| encounter_profile_key | 24 |
| arrival_hour_key | 24 |
| care_unit_key | 10 |
| triage_key | 7 |
| age_band_key | 7 |
| seen_within_target | 2 |
| is_admitted | 2 |
| is_lwbs | 2 |
| is_died | 2 |
| encounter_count | 1 |
