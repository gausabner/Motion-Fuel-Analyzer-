# Data dictionary - Green Basket Health Services data warehouse (`dw` schema)

Generated from the PostgreSQL catalog (`COMMENT ON ...`) by `03_analytics/build_data_dictionary.py`.

## dw.fact_admission

ACCUMULATING SNAPSHOT. Grain: one row per inpatient spell (admission to discharge), updated as milestones occur (admission, coding, discharge, 30-day follow-up). Additive: admission_count, los_days, flags.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `admission_key` | bigint | N | PK | Surrogate key. | generated |
| 2 | `admission_id` | character varying(12) | N |  | Degenerate dimension: PAS spell number. | PAS admission_id (AD01) |
| 3 | `admission_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date - admission date (active relationship). | PAS admission_datetime |
| 4 | `discharge_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date - discharge date (role-playing; -2 = still in hospital). | PAS discharge_datetime (AD02, AD03) |
| 5 | `care_unit_key` | integer | N | FK -> dim_care_unit.care_unit_key | FK to dim_care_unit version (admitting ward) valid on the admission date. | PAS ward_code (AD04) |
| 6 | `patient_key` | integer | N | FK -> dim_patient.patient_key | FK to dim_patient version valid on the admission date. | PAS patient_id |
| 7 | `diagnosis_key` | integer | N | FK -> dim_diagnosis.diagnosis_key | FK to dim_diagnosis - principal diagnosis (-1 until coded). | PAS principal_icd10 (AD05) |
| 8 | `admission_profile_key` | smallint | N | FK -> dim_admission_profile.admission_profile_key | FK to the admission method x discharge status junk dimension. | PAS admission_method, discharge_status (AD07) |
| 9 | `age_band_key` | smallint | N | FK -> dim_age_band.age_band_key | FK to dim_age_band (age at admission). | derived |
| 10 | `age_years` | smallint | Y |  | Age in years at admission (admission year - birth year). | derived |
| 11 | `ed_encounter_id` | character varying(12) | Y |  | Degenerate link to the ED attendance that led to the admission (emergency admissions). | PAS ed_encounter_id |
| 12 | `admission_ts` | timestamp without time zone | N |  | Admission timestamp (milestone 1). | PAS |
| 13 | `discharge_ts` | timestamp without time zone | Y |  | Discharge timestamp (milestone 2; NULL while in hospital). | PAS |
| 14 | `admission_count` | smallint | N |  | Always 1; additive count of spells. | ETL |
| 15 | `los_days` | smallint | Y |  | Length of stay in midnights (discharge date - admission date); NULL while in hospital. Additive (= patient days). | derived |
| 16 | `is_discharged` | smallint | N |  | 1 once the discharge milestone is recorded. | derived |
| 17 | `is_died` | smallint | N |  | 1 for an in-hospital death. | discharge_status = DIED |
| 18 | `discharged_before_noon` | smallint | Y |  | 1 if discharged before 12:00 (flow KPI); NULL while in hospital. | derived |
| 19 | `is_weekend_discharge` | smallint | Y |  | 1 if discharged on Saturday or Sunday; NULL while in hospital. | derived |
| 20 | `is_readmission_30d` | smallint | N |  | 1 if this spell is an emergency admission within 30 days of the same patient's previous live discharge. | derived (window over patient pseudonym) |
| 21 | `readmission_eligible` | smallint | N |  | 1 if this spell counts in the readmission-rate denominator: discharged alive (home or AMA), not maternity, and 30 days of follow-up available. | derived (GBHS KPI definition) |
| 22 | `readmitted_within_30d` | smallint | N |  | 1 if an eligible spell was followed by an emergency readmission within 30 days (milestone 3). | derived |
| 23 | `prior_admissions_12m` | smallint | N |  | Number of the patient's admissions in the 365 days before this admission (risk feature). | derived |
| 24 | `is_open_over_60d` | smallint | N |  | 1 if the spell is still open more than 60 days after admission at the snapshot date (AD06, probable missing discharge). | derived |
| 25 | `source_last_updated` | timestamp without time zone | N |  | last_updated of the PAS image applied (newer images overwrite older ones). | PAS last_updated |
| 26 | `dw_batch_id` | integer | N |  | Batch that inserted or last updated the row. | ETL |
| 27 | `dw_updated_at` | timestamp with time zone | N |  | Last update timestamp. | ETL |

## dw.fact_encounter

TRANSACTION FACT. Grain: one row per ED or clinic attendance (encounter). Additive: encounter_count and the 0/1 flags; durations are additive (sum) but reported as averages/medians.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `encounter_key` | bigint | N | PK | Surrogate key. | generated |
| 2 | `encounter_id` | character varying(12) | N |  | Degenerate dimension: PAS attendance number. | PAS encounter_id (EN01) |
| 3 | `arrival_date_key` | integer | N | FK -> dim_date.date_key | FK to dim_date (arrival date). | PAS arrival_datetime (EN02, EN12) |
| 4 | `arrival_hour_key` | smallint | N | FK -> dim_hour.hour_key | FK to dim_hour (arrival hour). | PAS arrival_datetime |
| 5 | `care_unit_key` | integer | N | FK -> dim_care_unit.care_unit_key | FK to dim_care_unit version valid on the arrival date (ED or clinic unit). | PAS facility_code + department (EN03) |
| 6 | `patient_key` | integer | N | FK -> dim_patient.patient_key | FK to dim_patient version valid on the arrival date (-1 unidentified). | PAS patient_id (EN10, EN11) |
| 7 | `diagnosis_key` | integer | N | FK -> dim_diagnosis.diagnosis_key | FK to dim_diagnosis (primary diagnosis, -1 not coded/invalid). | PAS primary_icd10 (EN07, EN08) |
| 8 | `triage_key` | smallint | N | FK -> dim_triage.triage_key | FK to dim_triage (-1 not recorded; 9 clinic attendance). | PAS triage_category (EN04, EN09) |
| 9 | `encounter_profile_key` | smallint | N | FK -> dim_encounter_profile.encounter_profile_key | FK to the department x arrival mode x disposition junk dimension. | PAS department, arrival_mode, disposition |
| 10 | `age_band_key` | smallint | N | FK -> dim_age_band.age_band_key | FK to dim_age_band (age at arrival). | derived from birth year |
| 11 | `age_years` | smallint | Y |  | Age in years at arrival, approximated as arrival year - birth year (non-additive). | derived |
| 12 | `encounter_count` | smallint | N |  | Always 1; additive count of attendances. | ETL |
| 13 | `wait_to_triage_min` | numeric(8,1) | Y |  | Minutes from arrival to triage (ED only; NULL if invalid). | triage_datetime - arrival_datetime |
| 14 | `door_to_doctor_min` | numeric(8,1) | Y |  | Minutes from arrival to first assessment by a doctor/clinician (NULL if not seen or invalid, EN05/EN06). | seen_datetime - arrival_datetime |
| 15 | `ed_los_min` | numeric(9,1) | Y |  | Minutes from arrival to departure (NULL if > 72 h or negative). | departure_datetime - arrival_datetime |
| 16 | `seen_within_target` | smallint | Y |  | 1 if seen within the triage compliance threshold, 0 if not, NULL if not triaged/seen. | derived with dim_triage.compliance_minutes |
| 17 | `is_lwbs` | smallint | N |  | 1 if the patient left without being seen. | disposition = LWBS |
| 18 | `is_admitted` | smallint | N |  | 1 if admitted to a ward from the ED. | disposition = ADM |
| 19 | `is_died` | smallint | N |  | 1 if the patient died in the department (incl. dead on arrival). | disposition = DIED |
| 20 | `dw_batch_id` | integer | N |  | Loading batch (lineage). | ETL |
| 21 | `dw_loaded_at` | timestamp with time zone | N |  | Load timestamp. | ETL |

## dw.fact_idsr_report

COVERAGE (FACTLESS-STYLE) FACT. Grain: one row per facility per epi week that a report was EXPECTED, whether or not it arrived (reporting completeness and timeliness).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `epi_week_date_key` | integer | N | PK | FK to dim_date = Monday of the epi week. | scaffold of expected weeks |
| 2 | `facility_key` | integer | N | PK | FK to dim_facility. | scaffold of active facilities |
| 3 | `report_expected` | smallint | N |  | Always 1 (denominator of completeness). | ETL |
| 4 | `report_received` | smallint | N |  | 1 if any version of the weekly report was received by the extract cut-off. | stg.idsr_submission |
| 5 | `report_on_time` | smallint | N |  | 1 if the first submission arrived by the due time (Tuesday 12:00 after the epi week). | derived (GBHS SOP) |
| 6 | `hours_after_due` | numeric(7,1) | Y |  | Hours between due time and first submission (negative = early; NULL if not received). | derived |
| 7 | `first_submitted_at` | timestamp without time zone | Y |  | Timestamp of the first submission. | IDSR submitted_at |
| 8 | `due_at` | timestamp without time zone | N |  | Due time of the report. | derived (Sunday + 2 days 12:00) |
| 9 | `dw_batch_id` | integer | N |  | Batch that rebuilt the row. | ETL |
| 10 | `dw_loaded_at` | timestamp with time zone | N |  | Load timestamp. | ETL |

## dw.fact_population

ANNUAL SNAPSHOT (external, NSA). Grain: one row per region per year (mid-year, keyed on 1 July). SEMI-ADDITIVE: additive across regions, never summed across years.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `year_date_key` | integer | N | PK | FK to dim_date = 1 July of the year (mid-year population). | derived |
| 2 | `region_key` | integer | N | PK | FK to dim_region. | NSA region name mapped through ref.region_alias |
| 3 | `population` | integer | N |  | Population (semi-additive). 2023 = census count; other years = 2023 count x (1 + national intercensal growth 2011-2023)^(year-2023). | NSA 2023 PHC preliminary results (EX01) |
| 4 | `is_census_count` | boolean | N |  | True for the census year itself, false for derived estimates. | ETL |
| 5 | `population_source` | character varying(80) | N |  | Provenance text shown in report tooltips. | ETL |
| 6 | `dw_batch_id` | integer | N |  | Loading batch. | ETL |

## dw.fact_staff_roster

PERIODIC SNAPSHOT PER SHIFT. Grain: one row per care unit per date per shift. Hours are additive; head counts on duty are semi-additive (sum across units, average across shifts/days).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `roster_date_key` | integer | N | PK | FK to dim_date (date the shift starts). | e-roster roster_date |
| 2 | `care_unit_key` | integer | N | PK | FK to dim_care_unit version valid on the roster date. | e-roster unit_code |
| 3 | `shift_key` | smallint | N | PK | FK to dim_shift. | e-roster shift (RS01) |
| 4 | `planned_nurse_hours` | numeric(7,1) | Y |  | Nursing hours on the approved roster (additive). | e-roster |
| 5 | `rn_hours` | numeric(7,1) | Y |  | Registered-nurse hours worked (additive). | e-roster (RS02) |
| 6 | `en_hours` | numeric(7,1) | Y |  | Enrolled-nurse hours worked (additive). | e-roster |
| 7 | `nurse_hours` | numeric(7,1) | Y |  | Total nursing hours worked = rn_hours + en_hours (additive; numerator of NHPPD). | derived |
| 8 | `doctor_hours` | numeric(7,1) | Y |  | Doctor hours worked in the unit (additive). | e-roster |
| 9 | `overtime_hours` | numeric(7,1) | Y |  | Overtime nursing hours (additive; NULL when inconsistent, RS04). | e-roster |
| 10 | `agency_hours` | numeric(7,1) | Y |  | Agency (temporary) nursing hours (additive). | e-roster |
| 11 | `sick_leave_hours` | numeric(7,1) | Y |  | Rostered hours lost to sick leave (additive). | e-roster |
| 12 | `nurses_on_duty` | smallint | Y |  | Nurses on duty during the shift (semi-additive). | e-roster |
| 13 | `doctors_on_duty` | smallint | Y |  | Doctors on duty during the shift (semi-additive). | e-roster |
| 14 | `dw_batch_id` | integer | N |  | Loading batch. | ETL |
| 15 | `dw_loaded_at` | timestamp with time zone | N |  | Load timestamp. | ETL |

## dw.fact_surveillance_weekly

PERIODIC SNAPSHOT. Grain: one row per facility per epi week per IDSR priority condition (zero reporting). Counts are fully additive.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `epi_week_date_key` | integer | N | PK | FK to dim_date = Monday of the ISO epi week. | IDSR epi_week (SV01) |
| 2 | `facility_key` | integer | N | PK | FK to dim_facility (reporting facility). | IDSR facility_code |
| 3 | `condition_key` | integer | N | PK | FK to dim_condition. | IDSR condition (SV03) |
| 4 | `cases_under5` | integer | Y |  | Cases in children under 5 (additive). | IDSR return (SV06, SV07) |
| 5 | `cases_5plus` | integer | Y |  | Cases aged 5 and over (additive). | IDSR return (SV06, SV07) |
| 6 | `cases_total` | integer | Y |  | All cases = under 5 + 5 and over (additive). | derived |
| 7 | `deaths_under5` | integer | Y |  | Deaths in children under 5 (additive). | IDSR return (SV04) |
| 8 | `deaths_5plus` | integer | Y |  | Deaths aged 5 and over (additive). | IDSR return (SV04) |
| 9 | `deaths_total` | integer | Y |  | All deaths (additive). | derived |
| 10 | `tests_done` | integer | Y |  | Malaria tests performed (RDT/microscopy); NULL for other conditions (additive). | IDSR return (SV05) |
| 11 | `tests_positive` | integer | Y |  | Positive malaria tests (additive). | IDSR return (SV05) |
| 12 | `report_version` | smallint | Y |  | Version of the report applied (2 = corrected resubmission). | IDSR report_version (SV02) |
| 13 | `dw_batch_id` | integer | N |  | Loading batch. | ETL |
| 14 | `dw_loaded_at` | timestamp with time zone | N |  | Load timestamp. | ETL |

## dw.fact_ward_census_daily

PERIODIC SNAPSHOT. Grain: one row per inpatient ward per day (midnight bed state). Stock measures (beds, occupied) are SEMI-ADDITIVE: sum across wards, average or last value across days; summed over days they equal bed-days.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `census_date_key` | integer | N | PK | FK to dim_date (census date, midnight). | ward return census_date |
| 2 | `care_unit_key` | integer | N | PK | FK to dim_care_unit version valid on the census date. | ward_code |
| 3 | `beds_complement` | smallint | N |  | Official beds of the ward version (semi-additive). | dim_care_unit.bed_complement |
| 4 | `beds_closed` | smallint | N |  | Beds closed (maintenance, staffing) (semi-additive). | ward return |
| 5 | `beds_available` | smallint | N |  | Beds available = complement - closed (semi-additive; sum over days = available bed-days). | derived |
| 6 | `occupied_beds` | smallint | N |  | Patients in the ward at midnight (semi-additive; sum over days = patient days). | ward return (WC02, WC04) or PAS imputation (WC01) |
| 7 | `admissions` | smallint | Y |  | Admissions to the ward during the day (additive flow). | ward return |
| 8 | `discharges` | smallint | Y |  | Discharges (incl. deaths and transfers out) during the day (additive flow). | ward return |
| 9 | `deaths` | smallint | Y |  | In-ward deaths during the day (additive flow). | ward return |
| 10 | `pas_occupied_beds` | smallint | Y |  | Midnight census derived from PAS spells, kept for reconciliation (semi-additive). | stg.pas_ward_census |
| 11 | `census_source` | character varying(20) | N |  | Ward return, Corrected return or Imputed from PAS. | ETL |
| 12 | `dw_batch_id` | integer | N |  | Loading batch. | ETL |
| 13 | `dw_loaded_at` | timestamp with time zone | N |  | Load timestamp. | ETL |

## dw.fact_weather_daily

PERIODIC SNAPSHOT (external, NASA POWER). Grain: one row per facility location per day. Rainfall is additive over days (not across locations); temperature and humidity are non-additive.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `weather_date_key` | integer | N | PK | FK to dim_date. | NASA POWER date (YYYYMMDD) |
| 2 | `facility_key` | integer | N | PK | FK to dim_facility (weather point = facility coordinates). | file name |
| 3 | `rainfall_mm` | numeric(7,2) | Y |  | Corrected precipitation, mm/day (PRECTOTCORR). | NASA POWER (WE02) |
| 4 | `tmax_c` | numeric(5,2) | Y |  | Maximum temperature at 2 m, deg C (T2M_MAX). | NASA POWER (WE01) |
| 5 | `tmin_c` | numeric(5,2) | Y |  | Minimum temperature at 2 m, deg C (T2M_MIN). | NASA POWER (WE01) |
| 6 | `rh_pct` | numeric(5,2) | Y |  | Relative humidity at 2 m, % (RH2M). | NASA POWER (WE01) |
| 7 | `is_imputed` | boolean | N |  | True if any value of the day was imputed. | ETL |
| 8 | `dw_batch_id` | integer | N |  | Loading batch. | ETL |

## dw.dim_admission_profile

Junk dimension: admission method x discharge status (IN = not yet discharged; updated as the accumulating snapshot progresses).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `admission_profile_key` | smallint | N | PK | Surrogate key. | generated (Cartesian product) |
| 2 | `admission_method_code` | character varying(11) | N |  | EMER-ED, EMER-DIRECT, ELECTIVE, MATERNITY, TRANSFER-IN or UNK. | PAS admission_method via ref.code_map (AD07) |
| 3 | `admission_method_name` | character varying(50) | Y |  | Admission method description. | ref.code_map |
| 4 | `is_emergency` | boolean | Y |  | True for unplanned admissions (EMER-ED, EMER-DIRECT, TRANSFER-IN). | derived |
| 5 | `discharge_status_code` | character varying(8) | N |  | HOME, TRANSFER, DIED, AMA, IN (still in hospital) or UNK. | PAS discharge_status |
| 6 | `discharge_status_name` | character varying(45) | Y |  | Discharge status description. | ref.code_map |

## dw.dim_age_band

Age bands (age at the time of care), conformed between attendances and admissions; small-cell friendly groupings.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `age_band_key` | smallint | N | PK | Surrogate key = sort order (-1 = Unknown). | generated |
| 2 | `age_band` | character varying(8) | N |  | Age band label (0-4, 5-14, 15-24, 25-44, 45-64, 65+). | generated |
| 3 | `age_from` | smallint | Y |  | Lower bound in completed years. | generated |
| 4 | `age_to` | smallint | Y |  | Upper bound in completed years (NULL = open-ended). | generated |
| 5 | `idsr_age_group` | character varying(12) | Y |  | IDSR reporting group: Under 5 or 5 and over. | generated |
| 6 | `life_stage` | character varying(12) | Y |  | Child, Adult or Older adult. | generated |

## dw.dim_care_unit

Care units (wards, emergency departments, clinic outpatient units). SCD Type 2 on specialty and bed complement; snowflaked to dim_facility.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `care_unit_key` | integer | N | PK | Surrogate key of the unit version (-1 = Unknown). | generated |
| 2 | `unit_code` | character varying(10) | N |  | Unit natural key, <facility>-<unit> (e.g. RUN-MED1). | master data, Care_Units sheet |
| 3 | `unit_name` | character varying(40) | Y |  | Unit name (Type 1). | master data |
| 4 | `unit_type` | character varying(25) | Y |  | Inpatient ward, Emergency department or Outpatient clinic (Type 1). | master data |
| 5 | `facility_key` | integer | N | FK -> dim_facility.facility_key | FK to dim_facility (snowflake). | master data facility_code |
| 6 | `specialty` | character varying(25) | Y |  | Clinical specialty valid for this version (Type 2), e.g. Medical, Paediatric, Isolation (COVID-19). | master data + Unit_History replay |
| 7 | `bed_complement` | smallint | Y |  | Official (funded) beds valid for this version (Type 2); 0 for ED and clinics. | master data + Unit_History replay |
| 8 | `scd_effective_from` | date | N |  | First day the version is valid. | Unit_History effective_date |
| 9 | `scd_effective_to` | date | N |  | Last day the version is valid (9999-12-31 for the current version). | ETL |
| 10 | `scd_is_current` | boolean | N |  | True for the current version of the unit. | ETL |
| 11 | `scd_version` | smallint | N |  | Version number per unit (1 = first). | ETL |
| 12 | `scd_row_hash` | character(32) | N |  | MD5 of the Type 2 attributes, used to detect changes. | ETL |
| 13 | `dw_batch_id` | integer | Y |  | Batch that created or last expired the version. | ETL |
| 14 | `dw_updated_at` | timestamp with time zone | N |  | Last update timestamp. | ETL |

## dw.dim_condition

IDSR priority conditions (grain of the surveillance fact); snowflake parent of dim_diagnosis.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `condition_key` | integer | N | PK | Surrogate key (-1 = Unknown, -2 = Not a notifiable condition). | generated |
| 2 | `condition_code` | character varying(5) | N |  | GBHS IDSR condition code (MAL, COV, MEA ...). | master data, IDSR_Conditions sheet |
| 3 | `condition_name` | character varying(40) | N |  | Condition name. | master data |
| 4 | `idsr_category` | character varying(50) | Y |  | IDSR category (epidemic-prone, targeted for elimination, other priority). | master data (IDSR technical guidelines) |
| 5 | `notification` | character varying(30) | Y |  | Notification timeline (immediate within 24 h or weekly). | master data |
| 6 | `alert_threshold` | character varying(120) | Y |  | Alert threshold used by GBHS surveillance officers. | master data (GBHS SOP) |
| 7 | `icd10_codes` | character varying(20) | Y |  | ICD-10 codes mapped to the condition. | master data |
| 8 | `is_notifiable` | boolean | N |  | False only for the -2 member. | ETL |

## dw.dim_date

Conformed calendar dimension, one row per day 2021-01-01..2027-12-31 plus -1 Unknown and -2 Not applicable; calendar, ISO epidemiological week, fiscal (Apr-Mar) and rainy-season hierarchies.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `date_key` | integer | N | PK | Smart surrogate key YYYYMMDD (-1 = unknown, -2 = not applicable / not yet happened). | generated by etl.sp_load_dim_date |
| 2 | `full_date` | date | Y |  | Calendar date. | generated |
| 3 | `day_of_month` | smallint | Y |  | Day number within the month (1-31). | derived |
| 4 | `day_of_year` | smallint | Y |  | Day number within the calendar year (1-366). | derived |
| 5 | `day_of_week_iso` | smallint | Y |  | ISO weekday number, Monday = 1 ... Sunday = 7 (sort key for day_name). | derived |
| 6 | `day_name` | character varying(9) | Y |  | Weekday name (Monday..Sunday). | derived |
| 7 | `day_short` | character(3) | Y |  | Three-letter weekday abbreviation (sort by day_of_week_iso). | derived |
| 8 | `is_weekend` | boolean | Y |  | True for Saturday and Sunday. | derived |
| 9 | `is_public_holiday` | boolean | Y |  | True on Namibian public holidays (Public Holidays Act 26 of 1990, Sunday holidays observed on Monday). | etl.fn_namibian_holiday |
| 10 | `holiday_name` | character varying(40) | Y |  | Name of the Namibian public holiday, NULL otherwise. | etl.fn_namibian_holiday |
| 11 | `is_working_day` | boolean | Y |  | Clinic working day: Monday-Saturday and not a public holiday. | derived |
| 12 | `epi_year` | smallint | Y |  | Epidemiological (ISO-8601) year of the epi week; can differ from the calendar year around 1 January. | derived (IYYY) |
| 13 | `epi_week` | smallint | Y |  | Epidemiological week number 1-53 (ISO-8601, Monday-Sunday), as used for IDSR weekly reporting. | derived (IW) |
| 14 | `epi_week_label` | character(8) | Y |  | Epi week label YYYY-Www (e.g. 2026-W39). | derived |
| 15 | `epi_week_key` | integer | Y |  | Integer YYYYWW (sort key for epi_week_label). | derived |
| 16 | `epi_week_start` | date | Y |  | Monday of the epi week (key used by the weekly surveillance facts). | derived |
| 17 | `month_num` | smallint | Y |  | Calendar month number 1-12 (sort key for month_name). | derived |
| 18 | `month_name` | character varying(9) | Y |  | Calendar month name. | derived |
| 19 | `month_short` | character(3) | Y |  | Three-letter month abbreviation (sort by month_num). | derived |
| 20 | `year_month` | character(7) | Y |  | Year-month label YYYY-MM. | derived |
| 21 | `year_month_key` | integer | Y |  | Integer YYYYMM (sort key for year_month). | derived |
| 22 | `month_start_date` | date | Y |  | First day of the month. | derived |
| 23 | `month_end_date` | date | Y |  | Last day of the month. | derived |
| 24 | `quarter_num` | smallint | Y |  | Calendar quarter 1-4. | derived |
| 25 | `year_quarter` | character(7) | Y |  | Quarter label YYYY-Qn. | derived |
| 26 | `calendar_year` | smallint | Y |  | Calendar year (time-intelligence year for YTD and year-on-year measures). | derived |
| 27 | `fiscal_year_label` | character(9) | Y |  | Fiscal year label FYyyyy/yy; the GBHS financial year runs 1 April - 31 March (aligned with the Namibian public sector). | derived |
| 28 | `fiscal_year_start` | smallint | Y |  | Calendar year in which the fiscal year starts (sort key for fiscal_year_label). | derived |
| 29 | `fiscal_quarter_label` | character(13) | Y |  | Fiscal quarter label FYyyyy/yy-Qn. | derived |
| 30 | `rainy_season_label` | character(7) | Y |  | Rainy season (July-June) label yyyy/yy used for malaria seasonality analysis. | derived |
| 31 | `is_malaria_season` | boolean | Y |  | True January-May, the usual malaria transmission peak in northern Namibia. | derived (GBHS planning assumption) |
| 32 | `is_after_cutoff` | boolean | Y |  | True for dates after the latest extract cut-off (future dates used by forecasts). | derived per batch |
| 33 | `dw_created_at` | timestamp with time zone | N |  | Load timestamp of the row. | ETL |

## dw.dim_diagnosis

WHO ICD-10 codes used by GBHS with the chapter > block > category hierarchy flattened; snowflaked to dim_condition (IDSR).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `diagnosis_key` | integer | N | PK | Surrogate key (-1 = Unknown / not coded). | generated |
| 2 | `icd10_code` | character varying(7) | N |  | ICD-10 code (e.g. B50.9). | master data, ICD10_Codes sheet (MD06) |
| 3 | `icd10_category` | character varying(3) | Y |  | Three-character ICD-10 category (e.g. B50). | derived |
| 4 | `icd10_title` | character varying(110) | Y |  | WHO ICD-10 title. | master data |
| 5 | `block_range` | character varying(7) | Y |  | ICD-10 block code range (e.g. B50-B64). | master data |
| 6 | `block_title` | character varying(110) | Y |  | ICD-10 block title. | master data |
| 7 | `chapter_code` | character varying(5) | Y |  | ICD-10 chapter in Roman numerals (I-XXII). | master data |
| 8 | `chapter_number` | smallint | Y |  | Chapter number 1-22 (sort key for chapter labels). | derived |
| 9 | `chapter_range` | character varying(7) | Y |  | Chapter code range (e.g. A00-B99). | master data |
| 10 | `chapter_title` | character varying(120) | Y |  | ICD-10 chapter title. | master data |
| 11 | `severity_class` | character varying(10) | Y |  | GBHS severity class (minor, moderate, serious, critical) used for case-mix adjustment. | master data |
| 12 | `default_specialty` | character varying(20) | Y |  | Default admitting specialty. | master data |
| 13 | `is_chronic` | boolean | Y |  | True for chronic conditions (readmission risk factor). | master data |
| 14 | `condition_key` | integer | N | FK -> dim_condition.condition_key | FK to dim_condition (snowflake); -2 when the code is not notifiable. | master data idsr_condition_code |

## dw.dim_encounter_profile

Junk dimension: all combinations of department x arrival mode x disposition (low-cardinality attendance flags).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `encounter_profile_key` | smallint | N | PK | Surrogate key. | generated (Cartesian product) |
| 2 | `department_code` | character varying(3) | N |  | ED (emergency department) or OPD (clinic outpatient). | PAS department |
| 3 | `department_name` | character varying(30) | Y |  | Department name. | generated |
| 4 | `arrival_mode_code` | character varying(4) | N |  | WALK, AMB, REF or UNK. | PAS arrival_mode via ref.code_map (EN09) |
| 5 | `arrival_mode_name` | character varying(35) | Y |  | Arrival mode description. | ref.code_map |
| 6 | `disposition_code` | character varying(4) | N |  | DIS, ADM, TRF, LWBS, DIED, REF or UNK. | PAS disposition via ref.code_map (EN09) |
| 7 | `disposition_name` | character varying(35) | Y |  | Disposition description. | ref.code_map |
| 8 | `disposition_group` | character varying(30) | Y |  | Discharged, Admitted or transferred, Referred, Left / died, Unknown. | derived |

## dw.dim_facility

GBHS hospitals and clinics (10). Conformed across all facts; snowflaked to dim_region; Type 1 (corrections overwrite).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `facility_key` | integer | N | PK | Surrogate key (-1 = Unknown). | generated |
| 2 | `facility_code` | character varying(10) | N |  | Facility natural key (GBH- hospital, GBC- clinic). | master data, Facilities sheet |
| 3 | `facility_name` | character varying(60) | N |  | Facility name (Type 1). | master data, Facilities sheet |
| 4 | `facility_short_name` | character varying(30) | Y |  | Town-based short name for compact visuals. | derived |
| 5 | `facility_type` | character varying(30) | Y |  | Referral hospital, District hospital or Clinic. | master data |
| 6 | `region_key` | integer | N | FK -> dim_region.region_key | FK to dim_region (snowflake). | master data region name mapped through ref.region_alias |
| 7 | `town` | character varying(40) | Y |  | Town where the facility is located. | master data |
| 8 | `latitude` | numeric(9,5) | Y |  | Latitude (decimal degrees), used for the NASA POWER weather point. | master data |
| 9 | `longitude` | numeric(9,5) | Y |  | Longitude (decimal degrees). | master data |
| 10 | `elevation_m` | integer | Y |  | Elevation in metres. | master data |
| 11 | `has_emergency_department` | boolean | Y |  | True for hospitals with a 24-hour emergency department. | master data |
| 12 | `catchment_share` | numeric(6,4) | Y |  | Share of the region's population in the facility catchment (0-1), used to derive catchment population. | master data (GBHS planning assumption) |
| 13 | `opened_date` | date | Y |  | Date the facility opened. | master data |
| 14 | `ownership` | character varying(60) | Y |  | Operating company. | master data |
| 15 | `dw_updated_at` | timestamp with time zone | N |  | Last update timestamp. | ETL |

## dw.dim_hour

Time-of-day dimension at hour grain (24 rows) used for ED arrival patterns and shift alignment.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `hour_key` | smallint | N | PK | Hour of day 0-23 (natural and surrogate key). | generated |
| 2 | `hour_label` | character(5) | Y |  | Hour label HH:00. | generated |
| 3 | `hour_band` | character varying(20) | Y |  | Part of day: Night 00-06, Morning 07-11, Afternoon 12-16, Evening 17-23. | generated |
| 4 | `hour_band_sort` | smallint | Y |  | Sort key for hour_band. | generated |
| 5 | `shift_code` | character(1) | Y |  | Nursing shift covering the hour: D = 07:00-19:00, N = 19:00-07:00. | generated (GBHS rostering policy) |
| 6 | `shift_name` | character varying(12) | Y |  | Shift name (Day / Night). | generated |
| 7 | `is_after_hours` | boolean | Y |  | True outside 08:00-16:59 (reduced specialist cover). | generated |

## dw.dim_patient

Pseudonymised patients (no direct identifiers). SCD Type 2 on residence region and payer class so that facts carry the values valid at the time of care.

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `patient_key` | integer | N | PK | Surrogate key of the patient version (-1 = Unknown / unidentified patient). | generated |
| 2 | `patient_pseudo_id` | character varying(13) | N |  | Pseudonym assigned by the PAS (keyed hash of the medical record number); never shown in reports. | PAS patient index |
| 3 | `patient_durable_key` | integer | Y |  | Durable (supernatural) key: the surrogate key of the patient's first version, identical on every version - used to count distinct patients across SCD2 versions. | ETL |
| 4 | `sex` | character(1) | Y |  | F, M or U (unknown) (Type 1). | PAS patient index, mapped via ref.code_map (MD02) |
| 5 | `birth_year` | smallint | Y |  | Year of birth only (data minimisation; no date of birth) (Type 1). | PAS patient index (MD03) |
| 6 | `residence_region_code` | character varying(5) | Y |  | ISO code of the region of residence valid for the version (Type 2; flattened, no relationship, to avoid a second filter path to dim_region). | PAS patient index + change log (MD01) |
| 7 | `residence_region_name` | character varying(30) | Y |  | Region of residence name (Type 2). | dim_region lookup |
| 8 | `payer_code` | character varying(8) | Y |  | Payer class valid for the version (Type 2): PSEMAS, PMA, SSC-MVA, MOHSS, CASH. | PAS patient index + change log (MD05) |
| 9 | `payer_name` | character varying(60) | Y |  | Payer class name. | master data, Payer_Classes sheet |
| 10 | `payer_group` | character varying(15) | Y |  | Medical aid, Statutory, Government or Self-pay. | master data |
| 11 | `registration_date` | date | Y |  | Date the patient was first registered (Type 1). | PAS patient index |
| 12 | `is_inferred` | boolean | N |  | True for an inferred member created from a fact before the patient-index record arrived (EN10). | ETL |
| 13 | `scd_effective_from` | date | N |  | First day the version is valid. | patient change log |
| 14 | `scd_effective_to` | date | N |  | Last day the version is valid (9999-12-31 = current). | ETL |
| 15 | `scd_is_current` | boolean | N |  | True for the current version. | ETL |
| 16 | `scd_version` | smallint | N |  | Version number per patient. | ETL |
| 17 | `scd_row_hash` | character(32) | N |  | MD5 of the Type 2 attributes. | ETL |
| 18 | `dw_batch_id` | integer | Y |  | Batch that created or last changed the row. | ETL |
| 19 | `dw_updated_at` | timestamp with time zone | N |  | Last update timestamp. | ETL |

## dw.dim_region

Namibian administrative regions (14) - top of the geography snowflake and grain of the population fact (Type 1).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `region_key` | integer | N | PK | Surrogate key (-1 = Unknown). | generated |
| 2 | `region_code` | character varying(5) | N |  | ISO 3166-2:NA region code (e.g. NA-KE). | master data, Regions sheet |
| 3 | `region_name` | character varying(30) | N |  | Official region name. | master data, Regions sheet |
| 4 | `zone` | character varying(20) | Y |  | GBHS management zone (North-East, North-Central, Central, West, South, East, North-West). | master data |
| 5 | `malaria_stratum` | character varying(20) | Y |  | Malaria planning stratum: Endemic - high, Endemic - low, Non-endemic (imported cases only). | master data (GBHS planning assumption based on MoHSS stratification) |
| 6 | `dw_updated_at` | timestamp with time zone | N |  | Last update timestamp. | ETL |

## dw.dim_shift

Nursing shifts (Day 07:00-19:00, Night 19:00-07:00).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `shift_key` | smallint | N | PK | Surrogate key. | generated |
| 2 | `shift_code` | character(1) | N |  | D or N. | e-roster shift via ref.code_map (RS01) |
| 3 | `shift_name` | character varying(12) | Y |  | Shift name. | ref.code_map |
| 4 | `start_time` | time without time zone | Y |  | Shift start time. | GBHS rostering policy |
| 5 | `end_time` | time without time zone | Y |  | Shift end time. | GBHS rostering policy |
| 6 | `shift_hours` | numeric(4,1) | Y |  | Paid hours per shift. | GBHS rostering policy |

## dw.dim_triage

SATS-style five-colour emergency triage scale plus "Not triaged" (clinic) and "Not recorded" (-1).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `triage_key` | smallint | N | PK | Surrogate key = priority (-1 = not recorded). | generated |
| 2 | `triage_code` | character varying(6) | N |  | Triage colour code. | master data, Triage_Scale sheet |
| 3 | `triage_label` | character varying(40) | Y |  | Triage label (colour and urgency). | master data |
| 4 | `priority` | smallint | Y |  | Clinical priority 1 (highest) - 9 (sort key). | master data |
| 5 | `target_minutes` | integer | Y |  | Target time from arrival to doctor in minutes (0 = immediate). | master data (SATS-style targets) |
| 6 | `compliance_minutes` | integer | Y |  | Threshold used for the within-target KPI: target, with "immediate" operationalised as 5 minutes. | derived (GBHS KPI definition) |
| 7 | `target_text` | character varying(30) | Y |  | Target in words. | master data |
| 8 | `colour_hex` | character(7) | Y |  | Display colour (used with text labels, never colour alone). | master data |

## sec.user_facility_access

Dynamic row-level security mapping: which facilities each Power BI user may see (read by the "Facility manager" role).

| # | Column | Data type | Null | Key | Business definition | Source / lineage |
|---|---|---|---|---|---|---|
| 1 | `user_principal_name` | character varying(80) | N | PK | Microsoft Entra ID user principal name (matched with USERPRINCIPALNAME() in DAX). | Information Security Officer |
| 2 | `facility_code` | character varying(10) | N | PK | Facility the user may see. | Information Security Officer |
| 3 | `access_role` | character varying(30) | N |  | Business role of the user (documentation only). | Information Security Officer |
| 4 | `granted_by` | character varying(40) | N |  | Approver of the access (data owner). | access request |
| 5 | `granted_on` | date | N |  | Approval date (reviewed quarterly). | access request |
