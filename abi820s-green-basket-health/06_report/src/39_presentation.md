# 3.9 Presentation, Q&A and individual reflection

## 10-minute presentation outline

The deck is `07_presentation/GBHS_ABI820S_Presentation.pptx`: 14 slides plus 4 backup slides, with speaker notes
on every slide. It is built by `build_presentation.js` from `deck_data.json`, which `deck_data.py` extracts from the
warehouse, so every chart on the slides is native, editable and matches this report. Every member presents the part
they built, so each can answer questions on it (rubric criterion 9).

<!-- table: Presentation plan (10 minutes + 5 minutes Q&A) -->

| Time | Slide | Content and key message | Presenter |
|---|---|---|---|
| 0:00–0:30 | 1 Title | GBHS: one trusted view of patient flow, resource use and disease surveillance | Member 1 |
| 0:30–1:15 | 2 The problem | ED patients seen on time fell from 79 % to 67 %; nine sources, no single truth | Member 1 |
| 1:15–1:45 | 3 Questions and KPIs | Five business questions, five objectives with baselines and targets | Member 1 |
| 1:45–2:30 | 4 Architecture | ELT in PostgreSQL 16: landing → staging → constellation → mart → Power BI | Member 3 |
| 2:30–3:15 | 5 Dimensional model | 8 facts of four types, 13 conformed dimensions; snowflake trade-off; SCD2: *Rundu's medical ward ran at 152 % of the beds it had in January 2025, not 102 % of today's 36* | Member 2 |
| 3:15–4:00 | 6 Data quality | 44 rules; **134,964 of 134,992 injected defects caught, 0 false positives**; the two rules that validation fixed | Member 3 |
| 4:00–4:30 | 7 Reconciliation and governance | 22 checks (20 PASS, 2 explained WARN); stewards, RLS/OLS, labels, Namibian law | Member 3 |
| 4:30–5:15 | 8 Semantic model | Import + incremental refresh; 108 measures; epi-year-to-date and person-time incidence; dynamic RLS + OLS | Member 4 |
| 5:15–6:45 | 9 **Live demo** | Page 1 (2026) → drill through to Katima Mulilo → page 2 matrix drill Region › Facility › Ward → page 3 → *View as* fm.katima and Surveillance Partner | Member 4 |
| 6:45–7:30 | 10 What drives waits | +6.3 % per extra arrival per doctor-shift; the 2026 extra-doctor test recovered 10–13 points | Member 5 |
| 7:30–8:15 | 11 Malaria early warning | Rainfall lead (4–8 weeks); historical-limits alert 2–6 weeks before the peak; Holt-Winters WAPE 19 % one week ahead | Member 5 |
| 8:15–8:45 | 12 Readmissions and outbreaks | Top 20 % risk = 37 % of readmissions; CUSUM detects 11 of 12 outbreaks within a median of 1 week | Member 5 |
| 8:45–9:15 | 13 Performance | Indexes 12–454×, aggregate 6×, model −46 %, refresh rows −99.4 % | Member 5 |
| 9:15–10:00 | 14 Recommendations | Season-triggered roster uplift, discharge before noon, readmission calls, DQ process and app | Member 1 |

**Demo safety net.** If Power BI or the network fails, slide 9 and backup slides 15–18 hold the page images, so the
demo can continue from them. Rehearse the demo path twice, with a stopwatch.

## Q&A bank (5 minutes)

<!-- table: Anticipated questions and model answers (owner = member who answers) -->

| # | Question | Model answer | Owner |
|---|---|---|---|
| 1 | Why snowflake Care Unit → Facility → Region instead of a pure star? | Some facts are recorded per ward (attendances, census, roster) and others per facility (IDSR, weather, catchment population). One conformed Facility dimension must filter both. Flattening would also repeat facility attributes in every SCD2 ward version. The cost is one join to an 11-row table. The patient's region is deliberately flattened to avoid an ambiguous path. | M2 |
| 2 | How do you know your SCD Type 2 works? | Checks R10 and R11 show no gaps, no overlaps and one current version per ward and patient. The business effect is visible: 177 spells of WHK-MED2 in January–March 2022 sit on its *Isolation (COVID-19)* version. The day-2 load created exactly two new ward versions (RUN-MED1 36 beds, KAT-PAE1 14), and a re-run creates none, thanks to the hash compare. | M2 |
| 3 | Your data are synthetic. Why should we believe the results? | Because we know the truth. The generator recorded every defect it injected and every effect it planted. Our rules found 134,964 of 134,992 defects with no false positives. The models recovered the planted outbreaks (11 of 12) and the staffing intervention. The census values are the real NSA figures, and the NASA files are in the real format; `fetch_public_data.py` loads the real weather. | M3 / M5 |
| 4 | An AUC of 0.66 is low. Is the readmission model useful? | Published readmission models typically score 0.6–0.7 (Kansagara et al., 2011). Ours is well calibrated, so its probabilities are honest. It is used to **prioritise** a call list: the top 20 % holds 37 % of readmissions, 1.9 times better than random. It is not used to deny or decide care. | M5 |
| 5 | Rainfall is significant, so why publish Holt-Winters rather than SARIMAX? | Holt-Winters has the lowest error (WAPE 23.8 % against 27.1 %). SARIMAX has better-calibrated intervals (75 % against 65 % coverage), so we use its interval for stock planning and rainfall as the early-season signal. Model choice follows the use. | M5 |
| 6 | Why not use `TOTALYTD` for malaria? | IDSR years are ISO epi years: 2025-W01 started on 30 December 2024. `TOTALYTD` would cut weeks in half. The epi-year-to-date measure filters the `Epi Year` attribute, and the prior-year window ends 364 days earlier, so the same number of weeks is compared. | M4 |
| 7 | How is incidence correct for a partial year? | It uses person-time: each epi year's catchment population is multiplied by the days of that year in the context, divided by 365. One measure therefore works for a week or for five years. For a full epi year it equals the census-based population, and Power BI reproduces the SQL pivot exactly. | M4 |
| 8 | Show us that RLS works. | View as fm.katima: 1 facility, 13,072 ED attendances in 2025. fm.rundu: 2 facilities. An unmapped user sees nothing. The five managers sum exactly to the executive total of 81,612. As the Surveillance Partner, the patient tables disappear from the field list (OLS). RLS applies to Viewers only, not to workspace members. | M4 |
| 9 | Why Import and not DirectQuery? | About 0.9 M rows compress to roughly 12.5 MB. Import gives millisecond visuals and full DAX, and daily freshness is enough. DirectQuery would load the PAS-fed database on every click. Incremental refresh keeps the daily refresh to about 3,200 rows. | M4 |
| 10 | What does Namibian law require? | Article 13 of the Constitution protects privacy. The Public and Environmental Health Act 2015 requires notification of priority diseases, our IDSR flow. The Data Protection Bill was still being finalised in mid-2026, so we design to its principles and benchmark against the GDPR, POPIA and HIPAA. | M3 |
| 11 | Is the staffing effect causal? | The regression is observational, so the effect is an association. The 2026 intervention is a natural experiment: Rundu and Katima improved by 10–13 points while Oshakati, without an extra doctor, moved by only 1.6. That is a difference-in-differences pattern. The generator planted the effect, and the method recovered it. | M5 |
| 12 | What was the hardest bug? | After a generator change, DQ recall suddenly fell to 37 %. `dup.shift` resolved to the pandas method instead of the *shift* column, so the generator crashed half-way and the pipeline loaded partly regenerated files. Validating against ground truth caught it within one run. | M3 |
| 13 | Two reconciliation checks are WARN. Is the data wrong? | No. They are findings. R07: the PAS shows 17,242 more bed-days than the ward returns, because 25 spells were never discharged in the PAS (AD06, now a steward task). R22: three ward-days above 200 % occupancy, while 6,002 days above 100 % are plausible overflow. | M3 |
| 14 | How would this scale to every MoHSS hospital? | Partition the large facts by month, keep BRIN on date keys, and use incremental refresh. Move to a composite model with the aggregate as Import aggregations over a DirectQuery detail table. The rules and the reconciliation are already set-based. | M5 |
| 15 | What is the business value? | Three decisions: a malaria-season roster uplift (each extra arrival per doctor costs 6 % in waiting time); a discharge-before-noon programme (27 % today); and a readmission call list. Plus regulatory confidence: IDSR completeness and timeliness measured weekly per facility. | M1 |
| 16 | Which part did *you* build? | Each member answers from their reflection: their files, one decision they made, one problem they solved. | All |

## Individual reflection templates

Each member writes their own reflection **in their own words**, about 300–400 words; the prompts below structure it.
The team must not edit another member's reflection. The contribution factors are agreed at a team meeting and signed
by all five members.

<!-- table: Individual contribution factor statement (agreed by the team; 1.0 = full, equal contribution) -->

| Member | Role | Sections and files owned | Agreed contribution factor | Signature |
|---|---|---|---|---|
| Member 1 | Project lead and business analyst | 3.1, 3.9; slides 1–3, 14 | ______ | ______ |
| Member 2 | Data warehouse architect | 3.2; `03_ddl_warehouse.sql`, `06_etl_load_dimensions.sql`, data dictionary | ______ | ______ |
| Member 3 | ETL, data quality and governance | 3.3, 3.8; `02_ddl_staging_ref.sql`, `05_etl_transform.sql`, `08_reconciliation.sql`, generator | ______ | ______ |
| Member 4 | Power BI developer | 3.4, 3.6; `model_spec.py`, `build_pbip.py`, `.pbix` / `.pbit`, RLS and OLS tests | ______ | ______ |
| Member 5 | Analytics and performance lead | 3.5, 3.7; `03_analytics/*.py`, `13_optimisation.sql` | ______ | ______ |

**Reflection prompts (one page per member):**

1. **My contribution.** Which files, sections and decisions are mine? Cite commits, file names and dates.
2. **One technical decision I can defend.** For example: the accumulating snapshot for spells, the snowflake, the
   epi-week time intelligence, person-time incidence, the temporal split, the choice of CUSUM. State the
   alternative I rejected and why.
3. **A problem I hit and how I solved it.** Describe the symptom, the diagnosis and the fix.
4. **What I learned** about BI and analytics practice in health: not only tools, but data quality, privacy, and the
   difference between association and causation.
5. **What I would do differently** with more time or with real data.
6. **Use of AI tools.** What I used an AI assistant for, and how I verified its output, in line with the NUST policy.
7. **Teamwork.** How the work was divided and integrated, and how disagreements were resolved.
