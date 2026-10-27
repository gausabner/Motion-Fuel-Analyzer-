# Executive summary

**The problem.** Green Basket Health Services (GBHS) is the health-services subsidiary of Green Basket cc. It runs
five hospitals (Windhoek, Oshakati, Rundu, Katima Mulilo and Walvis Bay) and five clinics in nine Namibian regions.
In 2025 its emergency departments (EDs) recorded 81,612 attendances, 14 % more than in 2024. Its data sit in nine
disconnected places:

- the patient administration system (PAS): attendances, inpatient spells and the patient index;
- paper-based midnight ward returns and the nursing e-roster;
- weekly IDSR disease returns;
- a master-data workbook;
- two external sources: the Namibia Statistics Agency (NSA) 2023 census and NASA POWER weather.

Management could not answer three questions with confidence: why ED waits rose, whether beds and staff are used
well, and whether a malaria surge is coming. Profiling the raw extracts found:

- 2,966 duplicate attendance rows;
- 16,477 timestamps in day-first format;
- 30 spellings of 9 notifiable conditions;
- 16,223 superseded spell images;
- occupied-bed counts keyed ten times too high.

**The solution.** We built the components below. One command (`python run_all.py`, about 5 minutes) reproduces
the whole build.

- **A Kimball warehouse in PostgreSQL 16.** It has 8 fact tables of four types: a transaction fact, an accumulating
  snapshot, periodic snapshots and a factless coverage fact. They share 13 conformed dimensions, including a complete
  date dimension with ISO epidemiological weeks and Namibian public holidays. Two dimensions are snowflaked (Care
  Unit › Facility › Region; Diagnosis › Condition). Wards and patients keep SCD Type 2 history.
- **An ELT pipeline with 44 data-quality rules and 22 reconciliation checks.** The generator recorded every defect
  it injected, so we could test the rules. They caught **134,964 of 134,992 injected defects** (recall 99.98 %) with
  **zero false positives**.
- **A Power BI semantic model.** It has 108 DAX measures, dynamic row-level security, static row-level security and
  object-level security, plus an incremental-refresh policy. The report has six pages, including a drill-through
  page and a tooltip page.
- **Four advanced analytics techniques**, each validated on held-out data or known ground truth: malaria
  forecasting, a 30-day readmission risk model, outbreak detection and an analysis of what drives ED waiting times.

<div class="kpis">
<div><b>78.8 % → 66.7 %</b><span>ED patients seen within their triage target, 2022 → 2026 YTD (target 80 %)</span></div>
<div><b>+6.3 %</b><span>longer door-to-doctor time for each extra arrival per doctor-shift (95 % CI 6.2–6.4 %)</span></div>
<div><b>14,571 → 17,514</b><span>confirmed malaria cases, epi year 2025 → 2026 to week 39 (2024: 3,071)</span></div>
<div><b>37 %</b><span>of 30-day readmissions found by calling the top 20 % of patients by predicted risk</span></div>
</div>

**What the data says.**

1. **ED performance collapsed in the malaria seasons, and staffing per arrival explains most of it.**
   - The share of patients seen within the South African Triage Scale (SATS) target held at 77–79 % in 2022–2024.
     It fell to 67.5 % in 2025 and 66.7 % in 2026 to date. Over the same period, patients who left without being
     seen (LWBS) almost doubled (3.3 % → 6.2 %).
   - Holding triage category, facility and time constant, waits rise **6.3 % per extra arrival per doctor-shift**
     and **3.6 % per 10 points of hospital bed occupancy** (access block).
   - In January–June 2026, one extra day-shift doctor at Rundu and Katima Mulilo coincided with a rise in patients
     seen on time: 43.9 % → 53.5 % at Rundu and 36.1 % → 48.8 % at Katima Mulilo. This happened despite 16–23 % more
     attendances (§3.5).
2. **Beds are running hot.**
   - Bed occupancy rose from 76.8 % (2022) to 84.8 % (2026), just under the 85 % ceiling.
   - Katima Mulilo's medical ward ran at 108.5 % in 2025.
   - Only about 27 % of patients are discharged before noon. This leaves too few morning beds for the afternoon ED
     peak.
3. **Malaria returned at scale.**
   - Confirmed cases rose almost five-fold from 2024 to 2025, and 2026 is already 20 % above 2025. The north-east
     carries 87 % of the load: Rundu, Katima Mulilo and Nkurenkuru.
   - Rainfall 4–8 weeks earlier is a significant lead indicator (SARIMAX coefficient 0.405, p < 0.001).
   - The historical-limits alert fired in the first four epi weeks of 2025 and 2026, 2–6 weeks before each
     seasonal peak (2025-W07, 2026-W05). At Rundu it fired as early as 2024-W49.
   - The best forecast (Holt-Winters) reaches 23.8 % WAPE over a 52-week rolling-origin test, and 19.4 % one week
     ahead.
4. **Readmissions sit above the 12 % ceiling** (13.0–13.6 %). Patients who left against medical advice have twice
   the odds of readmission, and chronic conditions 1.7 times the odds. The risk model is modest (AUC 0.66), but it is
   well calibrated and similar across sexes. It is useful for prioritising follow-up calls, not for decisions about
   individual patients.

**Recommendations.**

1. **Roster to the load.** From January to May, add one ED doctor per day shift at Rundu, Katima Mulilo and
   Nkurenkuru. Trigger the uplift from the malaria early warning: the historical-limits alert plus the forecast
   (§3.5, §3.7).
2. **Fight access block.**
   - Make *discharged before noon* a ward KPI, with a target of 40 %.
   - Keep the occupancy ceiling of 85 %.
   - Prioritise the Katima Mulilo medical ward, whose complement grew from 18 to 22 beds in March 2026.
3. **Call the top 20 % risk patients within 72 hours of discharge.** That is about 3,600 patients a year at 2025 volumes, and the
   calls would reach 37 % of all 30-day readmissions.
4. **Use the warehouse as the system of record.**
   - Run the 44 data-quality rules weekly under named stewards.
   - Publish the Power BI app with facility-level RLS.
   - Give the MoHSS surveillance unit aggregate-only access (object-level security and small-cell suppression)
     (§3.8).

**How to read this report.**

- Sections 3.1–3.9 follow the brief, item by item.
- Section 4 maps every required deliverable to its file, cross-checks each requirement of the brief in a
  compliance matrix, and self-assesses against the rubric.
- Every results table is generated from the warehouse by the build scripts, and every code listing is copied
  verbatim from the submitted files, so the PDF cannot drift from the code.
- Confidence labels: we state a figure plainly when it is computed from our data. We write *likely* or *uncertain*
  when a statement depends on assumptions or external facts that could not be verified.

## Assumptions and scope

<!-- table: Assumptions (each is tested or stated in the section shown) -->

| # | Assumption | Consequence / where handled |
|---|---|---|
| A1 | GBHS is a teaching scenario. All patient-level and operational data (PAS, ward returns, e-roster, IDSR returns, master data) are **synthetic**. They come from a seeded generator (`01_data/generate_synthetic_data.py`, seed 20261028), anchored on public facts: NSA 2023 regional populations, SATS targets, WHO ICD-10 codes, the IDSR priority-disease list, and the 2025–2026 Namibian malaria upsurge (AllAfrica, 2026; WHO Regional Office for Africa, 2026). Facility names are towns; GBHS and its hospitals are fictitious and **no real hospital's data are represented**. | No real person or health record is used (§3.1.7, §3.8). The generator logs the ground truth of every injected defect and planted effect, so DQ rules and analytics can be scored for precision, recall and recovery (§3.3, §3.5). |
| A2 | External data: the **NSA 2023 census** regional populations are the real published values (their total, 3,022,401, reconciles to the national figure in check R09). **NASA POWER** daily weather is the real file format. The build environment blocked the API, so the generator wrote stand-in values in the exact JSON layout, including the −999 fill values. | `01_data/fetch_public_data.py` downloads the real NASA POWER files into the same paths with no code change. We dropped World Bank indicators rather than fabricate a benchmark (§3.3). |
| A3 | Calendars: calendar year for management KPIs; ISO epidemiological weeks (Monday–Sunday) and epi years for IDSR; fiscal year April–March, as for the Namibian Government; rainy season July–June. | All are in `dim_date` (§3.2). Surveillance KPIs use epi weeks and epi years (§3.4). |
| A4 | Data cut-off: 30 September 2026 (epi week 2026-W39). A day-2 extract dated 1 October 2026 tests incremental loading. It contains SCD2 changes, discharge milestones of open spells, late IDSR reports, inferred patient members and a Type 1 correction. | The 2026 figures are year-to-date and labelled as such everywhere. |
| A5 | KPI definitions follow SATS: RED counts as "immediate" if the patient is seen within 5 minutes; ORANGE 10, YELLOW 60, GREEN 240 minutes (South African Triage Group, 2012). The readmission definition is in §3.1. An IDSR report is on time if received by Tuesday 12:00 after the epi week, which is a GBHS standard operating procedure we assumed. | Definitions are in §3.1 and the data dictionary (Appendix A). |
| A6 | Facility catchment shares (12–35 % of the regional population) are planning assumptions held in master data, not measurements. | Incidence rates are "per catchment population" and labelled as estimates (§3.5). |
| A7 | Users and user principal names (`fm.rundu@gbhs.example` etc.) are fictitious and use the reserved `.example` top-level domain (RFC 2606). | RLS and OLS tests use these accounts (§3.4). |
| A8 | Deployment target: PostgreSQL 16 on a GBHS server, an on-premises data gateway, a Power BI Pro workspace and a Power BI app. | Licensing and governance in §3.8. |
| A9 | The brief has two inconsistencies. The header says "Due: Week 16 (28 October 2026)" while section 4 refers to "the Week 14 deadline"; we follow the dated header and ask the lecturer to confirm. §3.7 asks for an evaluation "against the KPIs in Section 4.1", which does not exist; we read it as the KPIs of §3.1. | See §3.7 and the submission checklist (§4). |
