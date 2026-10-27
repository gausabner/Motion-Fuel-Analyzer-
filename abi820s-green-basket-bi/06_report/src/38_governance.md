# 3.8 Data governance and security

## Ownership and stewardship

Governance follows a federated model:

- **Business owners** are accountable for the meaning and the access rights of their domain's data.
- **Stewards** run the day-to-day data-quality work.
- **IT** is the custodian of the platform.

Every DQ rule in `audit.dq_rule` names its steward role, so an issue in the log has an owner from the moment it is
created.

<!-- table: Data governance roles -->

| Role | Held by | Accountable for | Key artefacts |
|---|---|---|---|
| **Data owner: commercial** | CFO | Sales, customer and cost data; approves who sees revenue and margin (RLS mapping, app audiences) | `sec.user_zone_access`, workspace and app permissions |
| **Data owner: production** | Agriculture operations manager | Farm, planting, harvest and stock data; KPI definitions for yield | KPI glossary (measure descriptions) |
| Farm data steward | Senior farm administrator | Rules HV01–HV08, PL01–PL03; harvest quarantine | `audit.dq_issue_log`, page 4 "Corrected records" |
| Sales data steward | Sales administration lead | SA01–SA08; price anomalies (R19); inferred customers | R19 queue, credit notes |
| Finance data steward | Financial accountant | CL01–CL04; ledger control totals (R09) | Reconciliation report |
| Master data steward | Commercial administrator | MD01–MD05; alias and xref tables; change log with effective dates (SCD2) | Master-data workbook, `ref.*` |
| External data steward | BI analyst | WE, MP, FX, CE rules; refresh of public sources | `fetch_public_data.py`, source licences |
| Inventory controller | Packhouse manager | ST01–ST03; month-end counts | Stock-flow checks R07, R08 |
| Data custodian | IT / DBA | Servers, backups, roles, TLS, gateway, patching | `pg_dump` backups, `10_security_grants.sql` |
| BI developer | BI team (2) | Pipeline, semantic model, report, performance | Git repository (PBIP, SQL, Python), release notes |

<!-- table: RACI for recurring governance activities (R = responsible, A = accountable, C = consulted, I = informed) -->

| Activity | Data owner | Steward | BI developer | Custodian | Consumers |
|---|---|---|---|---|---|
| Define or change a KPI | A | C | R | – | C |
| Grant or revoke data access (RLS map, app audience) | A | – | R | C | I |
| Maintain master data and mappings | A | R | C | – | I |
| Resolve DQ issues and quarantine | A | R | C | – | I |
| Run, monitor and recover the pipeline | I | I | R | A | – |
| Change the model or report (release) | A | C | R | C | I |
| Security review (quarterly) | A | C | R | R | – |

## Data-quality rules and monitoring

The 37 rules (§3.3) cover seven dimensions: validity, completeness, consistency, uniqueness, accuracy, integrity
and timeliness. They are **data**, not code comments. `audit.dq_rule` stores each rule's dimension, action, owner and
description, so the catalogue is queryable and appears in `mart.dq_summary`. Five operating thresholds turn the
rules into a managed process:

<!-- table: DQ service levels -->

| Indicator | Threshold | Source | Action when breached |
|---|---|---|---|
| Sales lines on Unknown farm | ≤ 2 % of lines (now 0.81 %) | R11 | Sales steward chases the farm of origin with dispatch |
| Open inferred customers | 0 older than 30 days | R12, SA04 | Master data steward completes the record |
| Price-anomaly lines awaiting review | 0 older than 5 working days | R19, SA07 | Credit note or confirmation |
| Harvest quarantine | 0 rows older than 7 days in season | HV01–HV03 | Farm resubmits the corrected log |
| Reconciliation | All PASS, or WARN with a documented explanation | R01–R19 | Batch is not published until explained |

The issue lifecycle: **detected** (a rule fires and the raw value is logged) → **routed** (to the owner role) →
**resolved** (the source is corrected and the next batch reloads it) → **verified** (the rule stops firing and the
reconciliation passes). Because the pipeline is idempotent, a correction at the source flows through on the next run
with no manual patching in the warehouse.

## Metadata and lineage

- **Technical metadata.** Every warehouse column carries a `COMMENT ON` holding a business definition and its source.
  The data dictionary (Appendix A, plus an `.xlsx`) is generated from the catalogue, so it cannot drift.
- **Business metadata.**
  - Each of the 79 measures has a description shown as a tooltip in the Power BI field list.
  - Display folders group measures by business area.
  - The KPI definitions in §3.1 are the glossary.
- **Operational metadata.** `audit.etl_batch` (batch, type, start, duration, status) and `audit.etl_step_log` (rows
  in, out and rejected per step) record every run. Every warehouse row carries `dw_batch_id`.
- **Lineage, to the row.**
  - Staging keeps `source_file` and `row_num`.
  - `fact_harvest` keeps the source row.
  - Facts carry degenerate keys (`invoice_no` + `line_no`, `posting_id`, `cycle_id`).
  - After publishing, the Power BI service's lineage view continues the chain to reports and dashboards. If the
    tenant has Microsoft Purview, the PostgreSQL source and the Power BI items can be scanned into its data map.

**Lineage example.** The executive card "Net revenue FYTD = N$ 458.8 m" traces back as follows:

1. Measure `[Net Revenue FYTD]`.
2. `[Net Revenue]`.
3. `'Sales'[Net Revenue]`.
4. `mart.fact_sales.net_revenue_nad`.
5. `dw.fact_sales`, batch 1.
6. `stg.sales_clean`, with FX and discount derivation and rules SA01–SA07.
7. `stg.sales_raw`.
8. The source row in `sales_invoice_lines_FY2026.csv.gz`.

Control total R05 proves that nothing was gained or lost along the chain.

## Security and privacy

**Database layer.**

- Two least-privilege login roles:
  - `gb_etl_loader` writes `stg`, `ref`, `dw` and `audit`;
  - `gb_pbi_reader` can only `SELECT` from `mart`.
- `PUBLIC` is revoked on every schema.
- In production the connection requires TLS (`sslmode=require`) through the on-premises data gateway, whose
  credentials are stored encrypted in the service.
- Backups (`pg_dump -Fc`) are encrypted at rest and tested by restore (`BUILD_GUIDE.md` §1).

**Power BI layer.**

<!-- table: Workspace roles and distribution -->

| Workspace role | Who | Rights | RLS applies? |
|---|---|---|---|
| Admin | BI lead (1 named person + 1 deputy) | Everything, including access management | No |
| Member | BI developers | Publish and update content, share | No |
| Contributor | None by default (temporary for testers) | Edit content | No |
| Viewer | Not used directly | – | Yes |
| **App audience** "Executive" / "Zone managers" / "Export desk" | Entra ID groups | View the app; no download of the semantic model; *Build* permission only for named analysts | **Yes**: roles §3.4 |

- **Sensitivity labels** (Microsoft Purview Information Protection):
  - The semantic model and report are labelled **Confidential – Commercial**, because they hold revenue, margin and
    customer data.
  - The label is inherited by exports to Excel, PowerPoint and PDF and is enforced on downloaded files.
  - A future public, aggregated "industry benchmark" report using only NSA, World Bank and weather data could be
    labelled **Public**.
- **Export controls.** Export of underlying data is disabled for the zone-manager audience. Export of summarised data
  is allowed.

**Anonymisation and data minimisation.**

- The warehouse holds **no personal identifiers**:
  - no ID numbers, phone numbers, e-mail addresses or bank details;
  - customers are businesses identified by codes;
  - informal traders are pseudonymous ("Informal Trader OD-001");
  - farm managers appear only as codes (MGR-1xx);
  - recorders in the harvest logs appear only as codes.
- The only user identities are the business UPNs in `sec.user_zone_access`, needed for RLS.
- All internal data in this project is synthetic (assumption A1).

## Legal and ethical considerations

<!-- table: Legal framework applied -->

| Instrument | Relevance | How the solution complies |
|---|---|---|
| **Constitution of the Republic of Namibia, Article 13** (right to privacy) | Personal information about individuals | Minimisation: no personal identifiers; access by role |
| **Namibian Data Protection Bill** (2023 draft; returned to Parliament in 2025; not yet enacted as at the sources consulted) | Expected principles: lawful and fair processing, purpose limitation, minimisation, security safeguards, data-subject rights, limits on cross-border transfer (Afriwise, 2023; Windhoek Express, 2025b; Chambers and Partners, 2026) | Designed to comply in advance: purpose-bound data (management reporting), minimisation, documented security controls, retention rules, and a data-processing record (this report). Re-assess when the Act is promulgated. |
| **Electronic Transactions Act 4 of 2019** (Namibia) | Legal recognition of electronic records | Lossless landing with source-file lineage keeps electronic records trustworthy and traceable |
| **Statistics Act 9 of 2011** (Namibia) | Use of official statistics (NSA) | NSA data is used as published, attributed, and not presented as Green Basket's own data |
| **EU GDPR / UK GDPR** | Personal data of contact persons at European export buyers, where processed | Contacts are not loaded into the warehouse; if a CRM is added later, GDPR principles apply, with a lawful basis of contract or legitimate interest |
| **POPIA** (South Africa) | Applies if processing takes place in South Africa (e.g. a hosted ERP) | Same controls; the hosting location is documented in the data-processing record |
| **EU Regulation (EC) 178/2002, Article 18** (food traceability) and GlobalG.A.P. | Export buyers must trace produce one step back | Farm of origin on invoice lines (SA05 monitored), block-level harvest lineage, and certification status as an SCD2 attribute |
| **Licences of public data** | World Bank (CC BY 4.0), NASA POWER (free with attribution), FRED (free with attribution) | Attributed in the report and dashboards' "About" text; terms recorded by the external data steward |

**Ethical use.**

- **No harm to individuals.**
  - Anomaly flags and "corrected records" counts help stewards improve data. They are not used to rate or
    discipline farm staff.
  - Segment labels such as "lapsed" describe purchasing behaviour, not creditworthiness, and are not used for
    automated credit decisions.
- **Honest uncertainty.**
  - Forecasts are shown with intervals and their hold-out error.
  - Regression effects are labelled associations, not causal effects (§3.5).
- **Transparency about data provenance.** Synthetic data and stand-in files are labelled as such (assumption A2).
  Design mock-ups are labelled as mock-ups (§3.6).

## Governance checklist for ongoing maintenance

<!-- table: Governance checklist -->

| Frequency | Check | Owner | Evidence |
|---|---|---|---|
| Every run (daily) | Batch status SUCCEEDED; all reconciliation checks PASS or WARN explained; no step with unexpected rejects | BI developer | `audit.etl_batch`, `mart.recon_latest` |
| Daily in season | Harvest quarantine cleared; HV06 corrections reviewed with the farm | Farm data steward | Page 4, `dq_issue_log` |
| Weekly | Price anomalies (R19) actioned; inferred customers completed; top-25 harvest anomalies reviewed | Sales and master-data stewards | R19, R12, `dw.harvest_anomaly` |
| Monthly | Stock-flow and ledger control totals agreed with finance; refresh history and gateway health checked | Finance steward, custodian | R07–R10, service refresh log |
| Monthly | Access review of RLS mapping vs HR leavers and movers | Data owner | `sec.user_zone_access` diff |
| Quarterly | Workspace roles, app audiences and Build permissions reviewed; sensitivity labels checked; test restore of the backup | Data owner, custodian | Access review sign-off |
| Quarterly | Model performance (Performance Analyzer, VertiPaq); unused measures and columns removed; forecast and segments retrained and accuracy logged | BI developer | Benchmark files, release notes |
| Annually / on change | DQ rule catalogue reviewed; legal register updated (e.g. when the Data Protection Act is promulgated); public data licences re-checked | Data owners, external steward | Updated §3.8 register |
| Every release | Changes made in Git (PBIP diff reviewed); pipeline re-run from raw; RLS test matrix re-run | BI developer | Pull request, test evidence |
