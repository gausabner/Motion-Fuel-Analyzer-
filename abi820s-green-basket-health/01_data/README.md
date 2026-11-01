# Dataset: Green Basket Health Services (GBHS)

This folder is the project's dataset (brief §4: "datasets or reproducible links"). It holds the nine source extracts that the data warehouse is built from, the day-2 incremental extract, and the files that document the synthetic data.

## Quick start

- **Open `GBHS_Dataset_Overview.xlsx`** to see the data without any tools. The `Index` sheet lists every file; each source is a sheet (complete up to 20,000 rows, otherwise its first 1,000 rows), followed by the clean warehouse tables.
- **The complete source files are in `raw/`**, one folder per source system. A `.csv.gz` file is a compressed CSV: open it with 7-Zip or WinRAR, or read it directly with `pandas.read_csv`.
- **The cleaned, integrated dataset** (star schema, as Power BI imports it) is in `../04_powerbi/data_csv/` as CSV, and in `../05_backup/` as a PostgreSQL backup.
- **Rebuild the dataset** with `python generate_synthetic_data.py`. The seed 20261028 makes every re-run byte-identical.

## What is real and what is synthetic

- **S1–S7 (internal sources) are synthetic.** GBHS is a fictitious organisation, and no record describes a real person. Patients carry only a random pseudonym, birth year, sex, residence region and payer class: there are no names, ID numbers, dates of birth, addresses or clinical notes.
- **S8 holds the real NSA 2023 census totals** by region, in the published layout.
- **S9 has the real NASA POWER file layout**, with stand-in values because the API was not reachable from the build environment. `python fetch_public_data.py` downloads the real series; no code changes are needed.
- Data-quality defects were injected on purpose so that the ELT could be tested. `raw/generator_manifest.json` counts them and `raw/dq_ground_truth.json` lists the affected records (report §3.3 and Appendix E).

Period: 2022-01-01 to 2026-09-30, plus the incremental extract of 2026-10-01.

## The nine sources

| # | Source | Type | File(s) | Rows | Columns | Real or synthetic |
|---|---|---|---|---:|---:|---|
| S1 | PAS ED and clinic attendances | Transactional | `raw/internal/pas/pas_ed_opd_encounters_<year>.csv.gz` (5 files) | 563,209 | 12 | Synthetic |
| S2 | PAS inpatient spells | Transactional | `raw/internal/pas/pas_inpatient_spells.csv.gz` | 151,774 | 11 | Synthetic |
| S3 | PAS patient index and change log | Transactional / master | `raw/internal/pas/pas_patient_index.csv.gz` | 107,332 | 7 | Synthetic |
| S3 | PAS patient index and change log | Transactional / master | `raw/internal/pas/pas_patient_changes.csv.gz` | 11,661 | 7 | Synthetic |
| S4 | Ward midnight census returns | Transactional (periodic) | `raw/internal/wards/ward_midnight_census.csv` | 36,232 | 8 | Synthetic |
| S5 | Nursing e-roster shift summary | Transactional (periodic) | `raw/internal/roster/eroster_shift_summary.csv.gz` | 97,502 | 12 | Synthetic |
| S6 | IDSR weekly returns | Transactional (periodic) | `raw/internal/idsr/idsr_weekly_returns.csv` | 22,410 | 11 | Synthetic |
| S7 | GBHS master data workbook | Master / reference | `raw/internal/master_data/GBHS_Master_Data.xlsx` | 226 | 10 | Synthetic (ICD-10 titles from WHO, SATS from the South African Triage Group) |
| S8 | NSA 2023 census, population by region | External (public) | `raw/external/nsa/nsa_census2023_population_by_region.csv` | 14 | 2 | Real values (Namibia Statistics Agency, 2024) |
| S9 | NASA POWER daily weather | External (public) | `raw/external/nasa_power/POWER_Point_Daily_<facility>.json` (10 files) | 18,560 | 5 | Real format; values are stand-ins until fetch_public_data.py is run |

For the Excel workbook, rows are the data rows of all its sheets and the column count is its number of sheets. A NASA POWER row is one day at one facility.

## Day-2 incremental extract (1 October 2026)

| File | Rows | Columns |
|---|---:|---:|
| `raw/delta_2026-10-01/GBHS_Master_Data_delta_20261001.xlsx` | 5 | 3 |
| `raw/delta_2026-10-01/eroster_shift_summary_20261001.csv` | 57 | 12 |
| `raw/delta_2026-10-01/idsr_weekly_returns_late_20261001.csv` | 18 | 11 |
| `raw/delta_2026-10-01/pas_ed_opd_encounters_20261001.csv` | 320 | 12 |
| `raw/delta_2026-10-01/pas_inpatient_spells_20261001.csv` | 165 | 11 |
| `raw/delta_2026-10-01/pas_patient_changes_delta_20261001.csv` | 25 | 7 |
| `raw/delta_2026-10-01/pas_patient_index_delta_20261001.csv` | 82 | 7 |
| `raw/delta_2026-10-01/ward_midnight_census_20261001.csv` | 21 | 8 |

## Files that document the synthetic data

| File | Content |
|---|---|
| `raw/generator_manifest.json` | Seed and software versions, row counts, injected defects per rule, and the planted behaviour (outbreaks, readmission model, ED wait model, staffing intervention) |
| `raw/dq_ground_truth.json` | The record keys of every injected defect, used to validate the 44 DQ rules |
| `generate_synthetic_data.py` | The generator itself |
| `fetch_public_data.py` | Downloads the real NASA POWER series and checks the NSA totals |
| `build_dataset_guide.py` | Writes this README and the overview workbook |

## Clean warehouse tables (`../04_powerbi/data_csv/`)

These are the integrated, cleaned tables that the ELT produces and Power BI imports (definitions in the report's Appendix A).

| Table | Kind | Rows | Columns |
|---|---|---:|---:|
| `analytics_ed_drivers` | Analytics output | 7 | 6 |
| `analytics_malaria_forecast` | Analytics output | 273 | 7 |
| `analytics_outbreak_alerts` | Analytics output | 664 | 8 |
| `analytics_readmission_deciles` | Analytics output | 10 | 5 |
| `analytics_readmission_drivers` | Analytics output | 12 | 3 |
| `v_dim_admission_profile` | Dimension | 36 | 6 |
| `v_dim_age_band` | Dimension | 7 | 4 |
| `v_dim_care_unit` | Dimension | 41 | 11 |
| `v_dim_condition` | Dimension | 11 | 7 |
| `v_dim_date` | Dimension | 2,191 | 28 |
| `v_dim_diagnosis` | Dimension | 65 | 13 |
| `v_dim_encounter_profile` | Dimension | 56 | 7 |
| `v_dim_facility` | Dimension | 11 | 11 |
| `v_dim_hour` | Dimension | 24 | 6 |
| `v_dim_patient` | Dimension | 118,916 | 10 |
| `v_dim_region` | Dimension | 15 | 5 |
| `v_dim_shift` | Dimension | 2 | 3 |
| `v_dim_triage` | Dimension | 7 | 8 |
| `v_dq_summary` | Governance | 44 | 8 |
| `v_fact_admission` | Fact | 135,629 | 19 |
| `v_fact_catchment_population` | Fact | 70 | 4 |
| `v_fact_encounter` | Fact | 560,557 | 17 |
| `v_fact_idsr_report` | Fact | 2,470 | 6 |
| `v_fact_population` | Fact | 98 | 5 |
| `v_fact_staff_roster` | Fact | 97,365 | 12 |
| `v_fact_surveillance` | Fact | 21,771 | 9 |
| `v_fact_ward_census` | Fact | 36,435 | 10 |
| `v_fact_weather` | Fact | 18,560 | 6 |
| `v_recon_latest` | Governance | 22 | 8 |
| `v_sec_user_facility` | Governance | 11 | 2 |

## Terms of use

The synthetic data may be used freely for teaching and assessment. NSA figures are public statistics, cited as Namibia Statistics Agency (2024). NASA POWER data are free and open; NASA asks users to acknowledge the source.
