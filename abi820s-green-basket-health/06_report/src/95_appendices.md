# Appendix A – Data dictionary

`03_analytics/build_data_dictionary.py` generates this appendix from the PostgreSQL catalogue, so it always matches the
deployed warehouse. Every column has a `COMMENT ON` definition and a source or lineage note, and the same text becomes
the field description in Power BI. The dictionary covers the 21 tables of the `dw` schema and the RLS mapping table
in `sec`: 22 tables and 269 columns. It is also submitted as `06_report/data_dictionary.md` and `.xlsx`.

**How to read it.** *Key* marks the primary key (PK) and the foreign keys (FK -> table.column). In the *Null* column,
N means NOT NULL. *Source / lineage* names the source field and the data-quality rules
(§3.3) that act on it.

<!-- include: data_dictionary.md | drop=3 | shift=1 -->

# Appendix B – DAX measure catalogue

All 108 measures of the semantic model are listed below, grouped by display folder. `04_powerbi/build_pbip.py` writes
them from `04_powerbi/model_spec.py` into the TMDL model and into `04_powerbi/measures.dax`. The comment line above
each measure is also its description in the Power BI field list. §3.4 explains the design choices. It maps the
brief's DAX requirements (time intelligence, `CALCULATE` with filter modification) to these measures and lists the
security roles.

<!-- dax-all -->

# Appendix C – Script inventory

The table is generated at build time from the files in the package, so the line counts are current. One command,
`python run_all.py`, runs every script in dependency order (README and `04_powerbi/BUILD_GUIDE.md`).

<!-- table: Submitted scripts, their size and purpose -->

<!-- inventory -->

# Appendix D – Diagram sources

Every diagram in this report is written as Mermaid code inside the report source. `build_report.py` extracts each one
into `06_report/diagrams/<name>.mmd` and renders it with headless Chromium, so a diagram can be edited as text and
rebuilt. It is never a hand-drawn picture that drifts from the model.

<!-- table: Mermaid diagram sources -->

| Source file | Section | What it shows |
|---|---|---|
| `bpmn.mmd` | §3.1 | Patient-flow and reporting process in four lanes (ED, ward, surveillance, BI), with the data capture points S1–S9 |
| `architecture.mmd` | §3.2 | Solution architecture: sources, the PostgreSQL schemas (landing, staging, `dw`, `mart`, `audit`, `sec`), analytics and Power BI |
| `erd_flow.mmd` | §3.2 | ERD 1: `fact_encounter` with its eight dimensions |
| `erd_spell.mmd` | §3.2 | ERD 2: `fact_admission` (accumulating snapshot) with the role-playing date |
| `erd_resource.mmd` | §3.2 | ERD 3: `fact_ward_census_daily` and `fact_staff_roster`, and the Care Unit → Facility → Region snowflake |
| `erd_surveillance.mmd` | §3.2 | ERD 4: `fact_surveillance_weekly` and the factless `fact_idsr_report`, with the Diagnosis → Condition snowflake |
| `erd_external.mmd` | §3.2 | ERD 5: the external facts `fact_population` (NSA) and `fact_weather_daily` (NASA POWER) |
| `pipeline.mmd` | §3.3 | Steps of one ELT batch, from extract to reconciliation |
| `lineage.mmd` | §3.8 | Lineage of the KPI *Seen within triage target*, from the PAS fields to the executive card |

The ERDs show keys and the main attributes only. Appendix A is the complete column-level specification.

# Appendix E – Synthetic data design

GBHS is a fictitious organisation, and no patient-level health data may be used for a student project without ethics
approval (§3.1, §3.8). The internal sources are therefore synthetic. The generator does more than fill tables: it
**plants known behaviour and known defects**. This lets us test the warehouse, the data-quality rules and the models
against a truth that real data never provides. This appendix documents that truth. All values come from
`01_data/generate_synthetic_data.py` and from the manifest it writes (`01_data/raw/generator_manifest.json`).

## E.1 Scope and reproducibility {.unlisted}

<!-- table: Generator settings -->

| Setting | Value |
|---|---|
| Random seed | 20261028 (re-runs are byte-identical: gzip is written with a fixed timestamp) |
| Software recorded in the manifest | Python 3.13.17, NumPy 2.5.3, pandas 3.0.5 |
| Period of the main extract | 1 January 2022 – 30 September 2026. December 2021 is simulated as a warm-up month, so that wards are already occupied on 1 January 2022 |
| Day-2 incremental extract | 1 October 2026: 320 attendances, 165 spell rows (78 new admissions and 87 discharges of open spells), 57 new patients, 25 payer changes, 2 ward bed changes and 2 late IDSR reports |
| Network | 10 facilities: 5 hospitals with an ED and 21 wards, and 5 clinics (§3.1). There are 31 care units |
| Simulated population | 149,999 people. 107,172 of them attended by the cut-off, so they appear in the patient index |
| What is real | The NSA 2023 census totals for the 14 regions. The NASA POWER files have the real layout but stand-in values until `fetch_public_data.py` is run (assumption A2) |
| Privacy by design | A patient record holds only a random pseudonym, birth year, sex, residence region and payer class. There are no names, ID numbers, dates of birth, addresses or clinical notes |

## E.2 Behavioural models planted in the data {.unlisted}

<!-- table: How the generator produces each process (the planted truth) -->

| Process | Model in the generator |
|---|---|
| ED and clinic arrivals | Poisson counts per facility and day. The base rate is the mean daily arrivals: ED 20 (Katima Mulilo) to 55 (Windhoek); clinics 18–40. It is multiplied by a day-of-week factor (ED: Monday 1.12 to Sunday 0.90; clinics closed on Sundays and public holidays), a yearly trend and noise. Diseases have their own seasonal streams (rainy, winter, summer). Arrivals are spread over the day by hourly profiles: the ED is busy from 09:00 to 19:00, clinics from 07:00 to 15:00 |
| Triage | Category drawn from the diagnosis severity. For example, a minor condition is 0.2 % RED, 3 % ORANGE, 22 % YELLOW and 74.8 % GREEN, while a critical one is 40 % RED and 45 % ORANGE |
| Admission and death | Admission probability by severity (3 %, 14 %, 48 %, 80 %), multiplied by a triage factor (RED 1.25 to GREEN 0.35). Death probability by severity: 0.1 % to 15 % |
| ED door-to-doctor wait | Triage median (RED 2, ORANGE 8, YELLOW 42, GREEN 125 minutes) × exp(1.4 × (arrivals per hour ÷ (doctors on duty × 1.6) − 0.8)) × (1 + 1.6 × max(0, hospital occupancy − 0.90)) × 1.10 at night × lognormal(0, 0.55). RED waits do not depend on crowding |
| Left without being seen | Only patients who would have gone home can leave. The probability rises with the wait: 1 − exp(−(wait ÷ scale)^2.2), with a scale of 560 minutes for GREEN, 900 for YELLOW and 760 in clinics |
| 30-day readmission | Logit = −3.55 + 0.95 (age 65+) + 0.40 (age 45–64) + 0.85 (chronic condition) + 0.04 × length of stay (days, up to 30) + 0.45 (weekend or Friday discharge) + 1.10 (left against advice) + 0.35 (self-pay) + 0.60 (frailty) − 1.50 (maternity). Frailty is latent and never written to any file |
| Malaria | Daily cases = facility base × season amplitude × (rainfall 21–56 days earlier ÷ January–May mean)^1.3. Imported cases at the non-endemic facilities follow the north-east curve with a 7-day lag. The rainy-season factors make 2023/24 dry (0.62) and 2024/25 (1.22) and 2025/26 (1.32) wet. The amplitudes follow the national pattern: low in 2022–2024, an upsurge in 2025 and a larger one in 2026 |
| COVID-19 | Four waves (December 2021, June 2022, December 2022, July 2023), shared between facilities. Windhoek takes 30 % |
| Outbreaks | 12 outbreaks of hepatitis E, measles, acute watery diarrhoea, malaria, typhoid and meningitis, each with a facility, start week, duration and size (listed in §3.5) |
| IDSR reporting | Each facility has its own probability of a missing report (1–7 %) and of a late one (7–25 %). Both fall by 40 % from 2025, an improvement planted on purpose. A report is due on Tuesday at 12:00 after the epi week |
| Staffing | Planned nurses per shift follow the beds (1 per 5 beds by day, 1 per 7 at night) or the ED volume. ED doctors per shift = max(1, round(base daily arrivals ÷ 20 by day, ÷ 30 at night)), less random absences. Vacancies (5–15 % by facility) and sickness reduce the hours worked, and overtime rises with demand pressure. Windhoek uses 3 % agency hours. **Intervention:** from 5 January 2026, Rundu, Katima Mulilo and Nkurenkuru receive 25 % agency nurse hours, and the Rundu and Katima EDs get one extra day-shift doctor until 30 June 2026 |
| Slowly changing attributes | 7 care-unit changes up to the cut-off, plus 2 in the delta. Two of them make WHK-MED2 a COVID-19 isolation ward from 3 January to 14 March 2022; the other five change bed complements. The simulated population has 16,228 residence-region and payer-class changes; 11,661 of them fall before the cut-off and concern patients in the extract |

## E.3 Reconciliation of the generator truth with the warehouse {.unlisted}

<!-- table: Generator truth against the loaded warehouse (after the day-2 load) -->

| Item | Generator truth | Warehouse | Explanation |
|---|---:|---:|---|
| ED and clinic attendances | 560,243 + 320 (delta) | 560,557 | The 6 rows outside the extract window are rejected by EN12. The 563,209 file rows also contained 2,966 duplicates (EN01) |
| Inpatient spells | 135,551 + 78 (delta) | 135,629 | ✔ |
| Patients (natural keys) | 107,172 + 57 (delta) | 107,229 | ✔ |
| Patient SCD2 changes | 11,661 + 25 (delta) | 11,686 later versions | ✔ |
| Care-unit SCD2 changes | 7 + 2 (delta) | 9 later versions (31 units, 40 versions) | ✔ |
| Late-arriving patients | 40 | 40 inferred members, all completed by the delta | ✔ |
| Spells never discharged in the PAS | 25 | 25 flagged by AD06 | ✔ (the source of the R07 WARN, §3.3) |
| IDSR reports expected / never received | 2,470 / 51 | 2,470 / 51 | ✔ |
| IDSR reports late | 269 | 264 | The generator times a corrected report by its final version. The warehouse judges timeliness on the first version received, as IDSR does. 5 corrected reports had an on-time original |
| Records with injected defects (record-level truth) | 134,992 | 134,964 flagged by their own rule, 0 false positives | The other 28 were caught by another rule (§3.3) |

## E.4 Planted effects and what the analysis recovered {.unlisted}

The analysis was run without access to these parameters. The table compares the planted effects with the estimates
in §3.5.

<!-- table: Planted effects against the estimates of §3.5 -->

| Effect | Planted | Recovered | Comment |
|---|---|---|---|
| ED load on waiting time | +7.6 % per extra arrival per doctor in a 12-hour shift (1.4 ÷ 19.2 on the log scale), within the unclipped range | +6.3 % (95 % CI 6.2–6.4 %), OLS | Slightly attenuated: the crowding factor is capped at 0.45–4.5, and the roster's doctor counts carry their own noise |
| Night shift | +10 % | +7.2 % | Same direction, slightly smaller |
| Access block | 0 below 90 % occupancy, then +16 % per 10 points | +3.6 % per 10 points (linear) | A straight line averages an effect that only starts above 90 % occupancy |
| Malaria rainfall lead | Rainfall 21–56 days earlier, power 1.3 | Rainfall 4–8 weeks earlier: SARIMAX coefficient 0.405, p < 0.001 | The lead is recovered and used as the early-season signal |
| Readmission drivers | Odds ratios: left against advice 3.0, chronic condition 2.3, weekend or Friday discharge 1.6 | 2.09, 1.69 and 1.28 (logistic regression) | Same direction and order, but smaller. The observed flag also contains chance readmissions (new, unrelated emergencies), frailty is unobserved, and the feature flags weekends only |
| Extra ED doctor (Jan–Jun 2026) | Rundu and Katima Mulilo | Seen within target +9.6 and +12.7 points, against +1.6 at Oshakati | A difference-in-differences pattern (§3.5) |
| Outbreaks | 12 | CUSUM 11 of 12, EARS C2 9 of 12, median delay 1 week | OB08 is too small to separate from the noise of a busy clinic |
| IDSR improvement from 2025 | Missing and late probabilities × 0.6 | Timeliness 82.9–85.6 % in 2022–2024, against 92.9 % in 2025 and 92.1 % in 2026 | ✔ |

**Limits of the synthetic data.** The data reproduce the behaviours we chose to plant, and nothing else. Real data
will contain effects nobody planted, such as referral patterns, coding habits and seasonal staff leave. They will also
lack a ground truth. The magnitudes in this report are therefore illustrative. The **methods**, the warehouse and the
data-quality rules are what transfer to a pilot on de-identified PAS extracts (§4, next steps).
