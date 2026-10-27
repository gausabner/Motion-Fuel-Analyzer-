# 3.1 Business case and requirements

## Organisation profile

**Green Basket Health Services (Pty) Ltd (GBHS)** is the health-services subsidiary of Green Basket cc. It is a
private, mission-driven provider that works alongside the public system under a referral agreement with the
Ministry of Health and Social Services (MoHSS):

- **Five hospitals.** One referral hospital in Windhoek and four district hospitals, each with a 24-hour emergency
  department (ED) and inpatient wards: 424 beds in 21 wards after the 1 October 2026 load.
- **Five primary-care clinics.** Katutura, Eenhana, Nkurenkuru, Otjiwarongo and Keetmanshoop.
- **Coverage.** The facilities span nine regions, from the malaria-endemic north-east (Kavango East, Kavango West,
  Zambezi) to the non-endemic south and coast.
- **Payers.** Patients pay through medical aid (PSEMAS and private schemes), statutory cover (SSC, MVA Fund),
  MoHSS referral or cash.
- **Surveillance duty.** As a health facility, every GBHS site must notify priority diseases weekly through
  Integrated Disease Surveillance and Response (IDSR). This duty comes from the Public and Environmental Health Act,
  2015, in force since September 2020 (Republic of Namibia, 2015, 2020; WHO Regional Office for Africa, 2019).

<!-- table: GBHS facility portfolio (current SCD Type 2 ward versions; attendances = ED for hospitals, outpatient for clinics, 2025) -->
<!-- include: evidence/ev_facility_profile.md -->

The setting is realistic:

- Namibian public referral hospitals report bed occupancy above 100 % and long waits (The Namibian, n.d.;
  AllAfrica, 2025).
- In 2026 the country had a major malaria upsurge. Nearly 28,000 cases were recorded in the first ten weeks after
  unusual rains; Katima Mulilo and Nkurenkuru were among the hardest-hit areas (WHO Regional Office for Africa,
  2026). By early September there were more than 122,000 confirmed cases and 122 deaths, 30.6 % of the cases in
  Kavango East (AllAfrica, 2026).
- The national response included extended clinic hours and redeploying staff to the worst-hit areas, the same
  lever that GBHS tested in 2026 (§3.5).

GBHS's synthetic data reproduce these pressures (assumption A1).

## Strategy and objectives

GBHS's 2025–2028 strategy, *"Right care, right time, every region"*, has three pillars:

- timely access to emergency care;
- efficient and safe use of beds and staff;
- early detection of disease threats in the communities it serves.

The BI programme supports the five measurable objectives below. Each has a baseline taken from the warehouse and a
target agreed with the executive committee (scenario assumption).

<!-- table: Strategic objectives, KPIs, 2025 baseline (warehouse) and target for 2027 -->

| # | Objective (pillar) | KPI (definition in Appendix A / §3.4) | Baseline 2025 | Target 2027 |
|---|---|---|---:|---:|
| O1 | Timely emergency care | Seen within SATS triage target (% of triaged ED patients) | 67.5 % | ≥ 80 % |
| | | Left without being seen (LWBS, % of ED attendances) | 6.2 % | ≤ 3 % |
| | | Median door-to-doctor time (min) | 63 | ≤ 45 |
| O2 | Efficient bed use | Bed occupancy (patient days / available bed days) | 81.8 % | ≤ 85 % per hospital |
| | | Discharged before noon (% of discharges) | 26.9 % | ≥ 40 % |
| | | Average length of stay (days, by discharge date) | 4.10 | ≤ 4.0 |
| O3 | Safe transitions of care | 30-day emergency readmission rate (% of eligible discharges) | 13.4 % | ≤ 12 % |
| O4 | Sustainable workforce | Nursing hours per patient day (NHPPD, inpatient wards) | 5.37 | ≥ 5.5 |
| | | Overtime hours (% of nursing hours) | 5.1 % | ≤ 4 % |
| | | ED arrivals per doctor-shift | 15.2 | ≤ 13 |
| O5 | Early detection and response | IDSR weekly report completeness / timeliness | 98.7 % / 92.9 % | ≥ 80 % / ≥ 80 % (WHO AFRO) |
| | | Malaria early warning raised before the seasonal peak (weeks) | 3–6 | ≥ 4 |
| | | Malaria incidence in the catchment (cases per 1,000 person-years) | 25.2 | Reported weekly; no internal target (MoHSS sets elimination goals) |

## Business problem

GBHS manages its hospitals from monthly Excel packs that each facility compiles by hand from the PAS, paper ward
returns and the e-roster. Consolidating them takes about a week, and the numbers disagree because each site counts
differently. The profiling of the raw extracts (§3.3) shows why:

- **Duplicates and versions.** There are 2,966 duplicated attendance rows from overlapping yearly PAS exports, and
  16,223 superseded inpatient-spell images from the change-data-capture export. Resubmitted ward returns (109) and
  IDSR reports (73) double-count unless versions are resolved.
- **Inconsistent formats and codes.**
  - 16,477 timestamps are in day-first format;
  - 15,904 ICD-10 codes are badly formatted (e.g. `A09-`, `j18.9`);
  - there are 30 spellings of the 9 IDSR conditions, 84 of the ward codes and 18 of the payer classes;
  - Nkurenkuru reports epi weeks as `W05/2024`.
- **Implausible values.**
  - 807 "seen by a doctor before arrival" timestamps;
  - 280 ED stays over 72 hours;
  - occupied-bed counts keyed ×10;
  - negative roster hours;
  - IDSR returns with more deaths than cases.
- **Missing data.** There are 291 missing ward returns, 2,875 attendances without a triage category, and 25 spells
  open for over 60 days that are probably missing their discharge.

The consequence is that management could not tell why ED performance fell in 2025, whether the cause was demand,
beds or staffing, nor answer the MoHSS with confidence about the malaria situation in the north-east. **Problem
statement:** *GBHS lacks a single, trusted and timely view that connects patient flow, bed and staff utilisation and
disease surveillance. Without it, it cannot target scarce doctors, nurses and beds where demand and disease are
rising, nor show regulators that its notifiable-disease reporting is complete and on time.*

## Business questions and KPIs

<!-- table: Business questions, KPIs and where they are answered -->

| # | Business question | KPIs (measures) | Answered in |
|---|---|---|---|
| BQ1 | **Patient flow.** Are ED patients seen within their triage target, and what drives the delays: demand, staffing, beds (access block) or time of day? | Seen Within Target %, Median / P90 Door-to-Doctor, LWBS Rate %, ED Arrivals per Doctor Shift | Page 1, Page 2; §3.5 technique 4 (wait drivers) |
| BQ2 | **Resource utilisation.** Are beds and nursing hours matched to demand by facility, ward and season? | Bed Occupancy %, Average Daily Census, ALOS, Discharged Before Noon %, NHPPD, Overtime %, Agency % | Page 2 (drill-down Region › Facility › Ward); §3.5 drill-across |
| BQ3 | **Disease surveillance.** Where and when are notifiable diseases rising, and is IDSR reporting complete and on time? | Notified Cases, Malaria Incidence per 1,000 PY / per 100k, Test Positivity %, IDSR Completeness % and Timeliness %, Outbreak Alerts | Page 3; §3.5 technique 3 (outbreak detection) |
| BQ4 | **Preparedness.** How many malaria cases should the north-east expect in the next 4–13 weeks, and how reliable is that forecast? | Forecast Cases with 80 % interval, Backtest WAPE % | Page 4; §3.5 technique 1 (forecasting) |
| BQ5 | **Safe transitions.** Which discharged patients are most likely to be readmitted within 30 days, so that follow-up can be targeted? | Readmission Rate 30d %, Top-20% Risk Capture %, calibration by decile | Page 4; §3.5 technique 2 (classification) |

**Key KPI definitions** (the full set is in Appendix A and in the DAX of §3.4):

- **Seen within target.** The time from arrival to the first doctor assessment is at most the SATS time for the
  triage category: RED 5 minutes (counting "immediate"), ORANGE 10, YELLOW 60, GREEN 240 (South African Triage
  Group, 2012). Patients who were not triaged or not seen are excluded from the denominator.
- **30-day readmission rate.** Emergency readmissions within 30 days of discharge, divided by eligible discharges.
  An eligible discharge is alive, home or against medical advice, not maternity, and has 30 days of follow-up. Both
  are counted by the discharge date of the index spell.
- **Bed occupancy.** Midnight occupied beds summed over days, divided by available (open) beds summed over days.
- **IDSR completeness / timeliness.** Weekly reports received / on time, divided by the reports expected from each
  active facility for each epi week due by the cut-off. Timeliness is judged on the first version received: a later
  correction does not make a report late.

## Stakeholder analysis

<!-- table: Stakeholders, their information needs and how the solution serves them (T = technical, N = non-technical) -->

| Stakeholder | Type | Information need | How the solution serves them |
|---|---|---|---|
| CEO and executive committee | N | Monthly view of access, utilisation and risk across all sites; trend versus targets | Page 1 (Executive Overview), Executive role, monthly app subscription |
| Facility managers (5 hospitals, 5 clinics) | N | Their own facility only: ED performance, beds, staffing; drill to ward | Pages 1–2 with dynamic RLS (Facility Manager role), drill-through *Facility Detail* |
| ED nursing managers and the clinical director | N | Waits by triage category and hour; LWBS; doctors per shift | Page 2 hour and triage visuals; §3.5 wait-driver model |
| Nursing services and ward managers | N | Occupancy, census, discharges before noon, NHPPD, overtime, agency | Page 2 matrix, semi-additive census measures |
| Surveillance officers and the MoHSS regional surveillance unit | N | Weekly notifiable cases, malaria trend and incidence, outbreak alerts, completeness and timeliness of IDSR | Page 3, outbreak alerts on page 4; Surveillance Partner role (OLS, aggregate only) |
| Health Information Manager and clinical coding lead | N/T | Data-quality issues (coding, duplicates, missing discharges) and their trend | DQ rule catalogue, `audit.dq_issue_log`, page 4 DQ table (§3.3, §3.8) |
| Finance and the revenue cycle (payers) | N | Activity by payer group for medical-aid negotiations | Patient payer attribute (SCD2, as-was) in all patient facts |
| BI team (data engineer, Power BI developer, analyst) | T | Reproducible pipeline, lineage, tests, performance | `run_all.py`, audit schema, reconciliation, PBIP in git (§3.3, §3.7) |
| Information security officer and IT | T | Least privilege, access reviews, encryption, incident response | DB roles, RLS/OLS, `sec.user_facility_access`, governance checklist (§3.8) |
| Patients and communities (indirect) | N | Timely, safe care and privacy of their health information | KPIs aimed at waits and readmissions; pseudonymisation, data minimisation, small-cell suppression (§3.8) |

## Process model

Figure 1 is a BPMN-style flowchart of the patient journey and the reporting processes. Each swimlane is an actor,
and the labels S1–S9 mark where each data source captures data. Three design insights come from it:

1. **Every KPI timestamp exists only in the PAS.** Arrival, triage, seen by doctor and departure are all recorded
   there, so ED waits are measured per attendance. That makes the attendance the natural transaction grain.
2. **An admission accumulates milestones over days.** Admission, coding, discharge and the end of the 30-day
   follow-up arrive at different times, which calls for an accumulating snapshot that is updated in place.
3. **Ward census and IDSR are periodic returns** (daily and weekly). They need periodic-snapshot facts, plus a
   coverage fact to measure *missing* reports.

```mermaid name=bpmn caption="Patient-flow and reporting process (BPMN-style flowchart) with the data capture points S1-S9" width=100%
flowchart TB
  subgraph ED["ED or clinic - nurses and doctors"]
    direction LR
    E0([Patient<br/>arrives]) --> E1[Registration<br/>S1 arrival time] --> E2[SATS triage<br/>S1 colour, time]
    E2 --> E3[Doctor sees<br/>S1 seen time, ICD-10] --> E4{Disposition}
    E2 -. waits too long .-> E5([Leaves without<br/>being seen])
    E4 -- home / refer --> E6([Departs<br/>S1 departure])
    E4 -- admit --> E7([To ward])
  end
  subgraph WARD["Wards - nursing services"]
    direction LR
    W1[Admission<br/>S2 spell opens] --> W2[Midnight census<br/>S4 ward return] --> W3[Nursing shifts<br/>S5 e-roster]
    W3 --> W4[Discharge<br/>S2 milestone] --> W5([30-day<br/>follow-up])
  end
  subgraph SURV["Surveillance officer - weekly"]
    direction LR
    I1[Tally notifiable<br/>cases Mon-Sun] --> I2[IDSR return<br/>S6 due Tue 12:00] --> I3([MoHSS regional<br/>surveillance])
  end
  subgraph BI["BI platform - nightly"]
    direction LR
    X[(S7 master data<br/>S8 census, S9 weather)] -.-> B1[Extract to<br/>landing] --> B2{44 DQ rules}
    B2 -- fail --> B3[Correct, map,<br/>flag, quarantine]
    B2 -- pass --> B4[Load star<br/>schema]
    B3 --> B4
    B4 --> B5[Reconcile<br/>R01-R22] --> B6([Refresh<br/>Power BI])
  end
  ED -- admitted patients --> WARD
  ED -. notifiable diagnoses .-> SURV
  ED -. S1 extract .-> BI
  WARD -. S2-S5 extracts .-> BI
  SURV -. S6 returns .-> BI
```

## Data sources, ethical and legal use of data

The solution integrates **nine sources** of all three required types. The brief needs at least one transactional,
one master/reference and one external source; we have six transactional, one master/reference and two external.

<!-- table: Data sources (type, format, volume in the full load, provenance and terms of use) -->

| # | Source | Type | Format and volume | Provenance and terms |
|---|---|---|---|---|
| S1 | PAS ED and clinic attendances | Transactional | 5 yearly gzip CSV extracts that overlap at year ends; 563,209 rows | Synthetic (A1) |
| S2 | PAS inpatient spells | Transactional | Change-data-capture export, gzip CSV; 151,774 spell images | Synthetic |
| S3 | PAS patient index and change log | Transactional / master | gzip CSV; 107,332 + 11,661 rows; pseudonymised IDs only | Synthetic |
| S4 | Ward midnight census returns | Transactional (periodic) | CSV; 36,232 ward-days | Synthetic |
| S5 | Nursing e-roster shift summary | Transactional (periodic) | gzip CSV; 97,502 unit-shift rows | Synthetic |
| S6 | IDSR weekly returns | Transactional (periodic) | CSV; 22,410 facility × condition × week rows | Synthetic; follows the WHO AFRO IDSR priority diseases |
| S7 | GBHS master data workbook | Master / reference | Excel, 10 sheets: regions, facilities, wards and their history, SATS, ICD-10, IDSR conditions, payers, code mappings | Synthetic; ICD-10 titles from WHO (2019); SATS from South African Triage Group (2012) |
| S8 | NSA 2023 Population and Housing Census, population by region | External (public) | CSV as published, with spaces as thousands separators and title and footnote rows; 14 regions | **Real values**, Namibia Statistics Agency (2024); public statistics, cited |
| S9 | NASA POWER daily weather (rainfall, Tmax, Tmin, humidity) at each facility | External (public) | JSON from the POWER API; 10 points × 1,856 days | NASA POWER format (NASA Langley Research Center, n.d.); values are stand-ins until `fetch_public_data.py` is run (A2). NASA data are free and open, with attribution requested |

**Ethical and legal-use confirmation (required by the brief).** The team confirms that:

1. **No personal information about any real person is collected, stored, processed or published.** All patient
   records are generated by a seeded program. Names, national ID numbers, addresses, telephone numbers and exact
   dates of birth do not exist anywhere in the data. Patients carry a random pseudonym (`P` followed by 12
   hexadecimal characters), and only the birth year is kept for age bands.
2. **The two external datasets are public aggregate statistics** (NSA census, NASA POWER). We use them within their
   terms of use and cite them (APA, §References). Neither contains personal data.
3. **No real health facility's performance is represented.** GBHS is fictitious, and its facilities only borrow
   town names (A1). Any resemblance to real hospital figures is coincidental.
4. **The design treats the data as if they were real special-category health data.** It applies data minimisation,
   pseudonymisation, least-privilege access, row-level and object-level security, small-cell suppression for
   external sharing, and an access-review process. This follows the principles of Article 13 (privacy) of the
   Namibian Constitution, Namibia's draft Data Protection Bill, POPIA, the GDPR and the HIPAA de-identification
   standard (§3.8).
5. **Notifiable-disease reporting is a legal duty.** In a real deployment, the IDSR data flows to the MoHSS would
   rest on the Public and Environmental Health Act, 2015. Clinical data would be used for analytics only under the
   provider's governance approvals, and any research use would need ethics committee approval.
