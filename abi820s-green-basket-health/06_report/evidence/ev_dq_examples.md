| rule_code | source_object | column_name | raw_value | action_taken |
|---|---|---|---|---|
| AD02 | PAS inpatient spells | discharge_datetime | 2021-06-07 15:07 | Corrected to 2022-06-07 15:07 |
| AD03 | PAS inpatient spells | discharge_datetime | 2035-02-11 18:32 | Corrected to 2025-02-11 18:32 |
| EN02 | pas_ed_opd_encounters_2023.csv.gz | arrival_datetime | 10/02/2023 20:55 | Parsed as DD/MM/YYYY HH:MI |
| EN03 | pas_ed_opd_encounters_2026.csv.gz | facility_code | gbh-kat | Corrected to GBH-KAT |
| EN05 | pas_ed_opd_encounters_2022.csv.gz | seen_datetime | 2022-03-08 14:34 | Seen time before arrival: timestamp rejected |
| EN07 | pas_ed_opd_encounters_2025.csv.gz | primary_icd10 | A09- | Corrected to A09 |
| EN09 | pas_ed_opd_encounters_2023.csv.gz | disposition | LWOBS | Mapped to LWBS |
| MD02 | PAS patient index | sex | Female | Mapped to F |
| MD05 | PAS patient index | payer_class | MoHSS | Mapped to MOHSS |
| SV01 | IDSR weekly returns | epi_week | W03/2022 | Parsed as 2022-W03 |
| SV03 | IDSR weekly returns | condition | Measles (suspected) | Mapped to MEA |
| SV06 | IDSR weekly returns | cases_5plus | 110 | Divided by 10 (clinical count 11) |
| WC02 | Ward midnight census | occupied_midnight | 150 | Corrected return (value 15) |
