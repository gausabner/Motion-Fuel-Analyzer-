# 3.8 Data governance, security and ethics

Health data are special-category personal data in every framework we considered. GBHS's data in this project are
synthetic (A1). Even so, the solution is designed and documented **as if they were real**, so that it can be deployed
on real PAS data without being redesigned.

## Ownership and stewardship

<!-- table: Governance roles -->

| Role | Who (GBHS) | Responsibilities |
|---|---|---|
| Data owner, operational data | Chief Operating Officer | Approves KPI definitions, access policy and the release of new data to the warehouse |
| Data owner, clinical and surveillance data | Clinical Director; Head of Surveillance | Approves the clinical use of patient-level data and the external sharing of IDSR aggregates |
| Data stewards (rule owners in `audit.dq_rule`) | Health Information Manager, Clinical Coding Lead, ED Nursing Manager, Nursing Services Manager, Workforce Planning Officer, Surveillance Officer, Revenue Cycle Steward, Master Data Steward, External Data Steward | Own the rules in their area; work their issue queue weekly; fix data at source; propose new rules |
| Data custodian | BI team (data engineer, DBA) | Run and monitor the pipeline, backups, performance, change control (git) |
| Information security officer | IT | Access approvals and quarterly reviews (`sec.user_facility_access`), incident response, security labels |
| Data consumers | Executives, managers, analysts, MoHSS partner | Use the certified app and measures; report suspected data errors |

<!-- table: RACI for the main governance activities (R = responsible, A = accountable, C = consulted, I = informed) -->

| Activity | Data owner | Steward | BI team | Security officer | Consumers |
|---|---|---|---|---|---|
| Define or change a KPI or measure | A | C | R | – | C |
| Add or change a DQ rule | I | A | R | – | – |
| Correct data at source after an issue | I | A/R | C | – | – |
| Run the nightly pipeline and reconciliation | I | I | A/R | – | – |
| Publish when reconciliation has a WARN | A | C | R | – | I |
| Grant or revoke access (RLS mapping, workspace role) | A | – | R | R | – |
| Quarterly access review | A | – | C | R | – |
| Share surveillance aggregates externally | A | R | C | C | – |

## Data-quality rules and service levels

- **Catalogue and log.** The 44 rules in `audit.dq_rule` (§3.3) are the formal data-quality agreement. Each rule has
  a dimension, an action and an owner. Every hit is logged with its source key and raw value in
  `audit.dq_issue_log`, and the issue counts appear on page 4 of the report.
- **Service levels.**
  - A reconciliation **FAIL** blocks publication of the refresh.
  - A **WARN** must be explained by the steward within two working days; R07 and R22 were.
  - Completeness targets: triage recorded on 99.5 % of ED attendances (achieved: 99.5 %); ward returns on 99 % of
    ward-days (99.2 %); IDSR completeness and timeliness of at least 80 % (WHO AFRO; 98.7 % and 92.1 % in 2026).
- **Feedback loop.** Every rule is tested against injected defects (§3.3), and a rule change must keep precision
  and recall on the regression test (`validate_dq_rules.py`). That is how the WC02 and SV04 weaknesses were found
  and fixed.

## Metadata and lineage

- **Technical metadata.**
  - Every warehouse table and column has a `COMMENT` with its definition and source; the data dictionary
    (Appendix A) and the Power BI field descriptions are generated from these comments.
  - The DDL, ETL, model (TMDL) and report (PBIR) are text files under version control (git).
- **Operational metadata.**
  - `audit.etl_batch` records each batch's type, cut-off and status; `audit.etl_step_log` records rows in, out and
    rejected, plus timings, for every step.
  - Every fact row carries `dw_batch_id`, and the census rows also carry `census_source` (ward return, corrected or
    imputed).
- **Business metadata.** KPI definitions (§3.1), measure descriptions and display folders (§3.4), and the stewards
  of each rule.
- **Lineage.** The lineage of a KPI can be traced from the card back to the source field. The example below is
  *Seen within triage target*:

```mermaid name=lineage caption="Lineage of the KPI 'Seen within triage target' from the PAS fields to the executive card" width=100%
flowchart LR
  A["PAS extract S1<br/>arrival_datetime,<br/>seen_datetime,<br/>triage_category"] --> B["stg.encounter_raw<br/>text, source_file,<br/>row_num, batch_id"]
  B --> C["sp_transform_encounters<br/>EN01 duplicates, EN02 dates,<br/>EN04 triage, EN05 seen before<br/>arrival, EN09 code maps"]
  C --> D["stg.encounter_clean<br/>door_to_doctor_min"]
  M["S7 master data<br/>SATS sheet"] --> T["dw.dim_triage<br/>compliance_minutes"]
  D --> F["dw.fact_encounter<br/>seen_within_target =<br/>door_to_doctor <= compliance"]
  T --> F
  F --> V["mart.v_fact_encounter"] --> P["Power BI measure<br/>Seen Within Target %"] --> R["Page 1 card<br/>+ trend + scorecard"]
  C -. issues .-> L[("audit.dq_issue_log")]
  F -. control totals .-> Q[("audit.recon_result<br/>R02, R03")]
```

## Security

**In the database.**

- **Least privilege by schema.**
  - The Power BI account `gbhs_pbi_reader` can read only `mart`.
  - The ETL account `gbhs_etl_loader` cannot be used for reporting.
  - `PUBLIC` has no rights on any schema (`10_security_grants.sql`).
- **Data minimisation in the mart.** The `mart` views expose no pseudonym, no timestamps, no birth year (only age
  bands) and no free text. The patient-level link stays inside `dw`.
- **Operations.** In production: TLS connections, the gateway on a hardened server, encrypted backups, and
  passwords in a vault. The lab placeholders `change-me-*` must never be deployed.

**In Power BI.**

- **Row-level security.**
  - The *Facility Manager* role is dynamic: users are mapped to facilities in `sec.user_facility_access`, and a user
    with no mapping sees nothing.
  - The *North-East Zone* role is static.
  - The *Executive* role is unrestricted.
- **Object-level security.** The *Surveillance Partner* role (MoHSS) cannot see the patient-level tables.
- **Workspace and app.**
  - RLS and OLS apply only to users with the **Viewer** role. Workspace Admins, Members and Contributors bypass them
    (Microsoft, 2024a).
  - Therefore only the BI team holds editing roles. Everyone else consumes the report through the **Power BI app**
    with audiences: executives, facility managers, surveillance partner.
  - One person is never placed in both an RLS role and an OLS role.
- **Sensitivity labels** (Microsoft Purview). Labels follow the data when it is exported to Excel, PDF or PowerPoint.
  - Semantic model: *Highly Confidential – Health* (patient-level facts).
  - Report and app: *Confidential – Internal*.
  - The suppressed surveillance export: *Internal – Shareable with MoHSS*.
- **Further controls.**
  - Export of underlying data is disabled for Viewers.
  - Sign-in through Entra ID with multi-factor authentication.
  - The Power BI activity log is retained for audit.
  - Access is reviewed quarterly by the security officer and the data owner.

**Anonymisation and pseudonymisation.**

1. **Direct identifiers are never loaded.** Names, national ID and passport numbers, addresses, telephone numbers,
   free-text notes and exact birth dates are not extracted. The PAS extract contains only a **pseudonym**. In this
   project it is a random token. In production it would be a keyed hash (HMAC-SHA-256 with a secret held by the
   Health Information Manager), so that the BI team cannot re-identify patients.
2. **Generalisation.** Age is kept as an age band, residence at region level only, and IDSR counts by week.
3. **Small-cell suppression.** Counts of 1–4 are suppressed ("<5") in any external output (`Notified Cases
   (Suppressed)`, §3.4), because rare diseases in small towns could identify a patient.
4. **A limited data set, not de-identified data.** The facts keep **dates of service at day level**, which the HIPAA
   Safe Harbor standard would not allow in de-identified data (U.S. Department of Health and Human Services, 2012).
   Internally the warehouse is therefore treated as *pseudonymised personal data*. Only weekly aggregates are shared
   externally.

## Namibian and international legal and ethical framework

<!-- table: Legal and ethical instruments and how the solution complies (status of Namibian law as at October 2026) -->

| Instrument | Principle relevant to this solution | How the solution applies it |
|---|---|---|
| **Namibian Constitution, Article 13** (Republic of Namibia, 1990) | Right to privacy of the person, home and correspondence | Pseudonymisation, minimisation, access control and audit; no direct identifiers anywhere |
| **Public and Environmental Health Act, 2015 (Act 1 of 2015)**, in force since GN 230 of 2020 (Republic of Namibia, 2015, 2020) | Part 3: notification, prevention and control of notifiable diseases; COVID-19 declared a formidable epidemic disease (GN 232 of 2020) | IDSR conditions, notification timelines and alert thresholds in `dim_condition`; completeness and timeliness of weekly reporting measured per facility (coverage fact); MoHSS role with aggregate access |
| **Namibia Data Protection Bill** (draft; not enacted at the time of writing, ITWeb, 2026) | Expected: lawful processing, purpose limitation, minimisation, security safeguards, data-subject rights, breach notification, a supervisory authority | Designed to these principles now: documented purpose (§3.1), minimisation (mart), security (RLS, OLS, labels), retention and breach procedure in the checklist. *Uncertain:* the final text and its commencement must be re-checked before go-live |
| **GDPR**, EU 2016/679 (European Parliament & Council of the European Union, 2016), benchmark | Article 5 principles; Article 9 health data as a special category; Article 25 data protection by design; pseudonymisation (Art. 4(5)) | Used as the design benchmark for data protection by design. GBHS processes no EU residents' data; the GDPR would apply only if it did |
| **POPIA**, South Africa (Act 4 of 2013; Republic of South Africa, 2013), regional benchmark | Health information is *special personal information*; conditions for lawful processing and security safeguards | Same controls; relevant for cross-border referrals and South African payers |
| **HIPAA Privacy Rule**, de-identification standard, 45 CFR 164.514 (U.S. Department of Health and Human Services, 2012), benchmark | Safe Harbor (removal of 18 identifiers including dates) or expert determination | Used to classify our mart as a *limited data set*, not de-identified (see above) |
| **OECD Recommendation on Health Data Governance** (OECD, 2016) | Governance framework, transparency, public benefit, safeguards | Governance roles, RACI, documented purposes, public-health benefit (surveillance) |
| **WHO, Ethics and governance of artificial intelligence for health** (World Health Organization, 2021) | Protect autonomy, ensure transparency, fairness, accountability | The readmission model is used to prioritise calls, not to deny care; calibration and fairness are reported (§3.5); human review of every call list |

## Governance checklist

<!-- table: Governance checklist (✔ = implemented in this solution; ☐ = action for go-live) -->

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Data owners, stewards and custodian named; RACI agreed | ✔ | This section; `audit.dq_rule.owner_role` |
| 2 | Purpose of processing documented (KPIs, BQs) | ✔ | §3.1 |
| 3 | Data minimisation: no direct identifiers; mart without pseudonyms or timestamps | ✔ | `09_mart_views.sql`; Appendix A |
| 4 | Pseudonymisation with a keyed hash; key held outside the BI team | ☐ | Random tokens in this project; HMAC at go-live |
| 5 | DQ rules with owners, issue log, service levels; regression-tested rules | ✔ | §3.3; `dq_rule_validation.md` |
| 6 | Reconciliation gate before publication | ✔ | `08_reconciliation.sql`; R01–R22 |
| 7 | Metadata: dictionary, model descriptions, lineage | ✔ | Appendix A; §3.4; lineage figure |
| 8 | Least-privilege database roles; no rights for PUBLIC | ✔ | `00_create_database.sql`, `10_security_grants.sql` |
| 9 | RLS (dynamic, static) and OLS designed, with an SQL-derived test matrix | ✔ | §3.4; `BUILD_GUIDE.md` §4 |
| 10 | RLS and OLS tested in Desktop and in the service with screenshots | ☐ | Team action (`BUILD_GUIDE.md` §4) |
| 11 | Workspace roles: editors only in the BI team; consumers via the app; Viewers subject to RLS | ☐ | At publication |
| 12 | Sensitivity labels applied; export of underlying data disabled | ☐ | At publication |
| 13 | Small-cell suppression for external outputs | ✔ | `Notified Cases (Suppressed)`, `Notified Cases Label` |
| 14 | Quarterly access review of `sec.user_facility_access` | ☐ | Process, from go-live |
| 15 | Retention: warehouse detail 5 years plus archive; logs 2 years; backups encrypted | ☐ | Policy to be approved by the data owner |
| 16 | Breach-response procedure (notify the security officer within 24 h; assess; inform the data owner and the regulator when required) | ☐ | Policy, aligned with the Data Protection Bill once enacted |
| 17 | Model governance: calibration, fairness and drift monitoring; human in the loop | ✔ / ☐ | §3.5 (done); yearly re-validation |
| 18 | Ethics: synthetic data confirmed; real-data deployment approved by GBHS governance; research use only with ethics committee approval | ✔ | §3.1 ethical-use confirmation |
