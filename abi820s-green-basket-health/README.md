# Green Basket Health Services (GBHS): end-to-end BI solution

ABI820S Advanced Business Intelligence and Analytics (NUST): group project, due 28 October 2026.
**Scenario/domain: Health services.** The solution covers patient flow, resource utilisation and disease surveillance,
using anonymised (synthetic) and public data only.

GBHS is a fictitious health-services subsidiary of Green Basket cc: five hospitals and five clinics in nine Namibian
regions. This package delivers the following, all built from code and reproducible with one command:

- a PostgreSQL 16 data warehouse: 8 facts of four types and 13 conformed dimensions, with SCD Type 2;
- an ELT pipeline with 44 data-quality rules (validated against ground truth) and 22 reconciliation checks;
- a Power BI semantic model and report (PBIP): 108 DAX measures, dynamic and static RLS, OLS and incremental refresh;
- four analytics techniques: malaria forecasting, 30-day readmission risk, outbreak detection and ED wait drivers;
- the final report (PDF) and the presentation (PPTX).

## Where is the dataset?

| What | Where |
|---|---|
| **Overview workbook**: every source and every clean table as a sheet; opens in Excel, no tools needed | `01_data/GBHS_Dataset_Overview.xlsx` |
| Guide to every dataset file: source, rows, columns, real or synthetic | `01_data/README.md` |
| The nine raw source extracts S1–S9, complete (CSV, gzip CSV, Excel, JSON) | `01_data/raw/` |
| The clean, integrated tables, as Power BI imports them (CSV) | `04_powerbi/data_csv/` |
| The whole warehouse (PostgreSQL backup) | `05_backup/gbhs_health_dw_pg16_warehouse.backup` |

## Deliverables

| Deliverable (brief §4) | File |
|---|---|
| Final report | `06_report/GBHS_ABI820S_Final_Report.pdf` |
| Power BI file and template | **Built in Power BI Desktop** from `04_powerbi/GBHS_Health.pbip`, following `04_powerbi/BUILD_GUIDE.md` |
| SQL and ETL scripts | `02_sql/00_create_database.sql` … `13_optimisation.sql`, `02_sql/run_pipeline.py` |
| Python scripts | `01_data/`, `03_analytics/`, `04_powerbi/`, `06_report/`, `07_presentation/`, `run_all.py` |
| Warehouse backup and DDL | `05_backup/gbhs_health_dw_pg16_warehouse.backup`, `05_backup/gbhs_health_dw_schema_ddl.sql` |
| Data dictionary and ERDs | Report §3.2 and Appendix A; `06_report/data_dictionary.md` and `.xlsx`; `06_report/diagrams/*.mmd` |
| Datasets | `01_data/` (see *Where is the dataset?* above): raw extracts, the overview workbook and the dataset guide; `01_data/fetch_public_data.py` (NASA POWER) |
| Presentation | `07_presentation/GBHS_ABI820S_Presentation.pptx` (14 slides + 4 backup, with speaker notes) |

## Must-do before submission (Windows + Power BI Desktop)

The `.pbix` and `.pbit` can only be produced in Power BI Desktop. Screenshots, the RLS test and the Desktop timings
must also be captured there. Follow `04_powerbi/BUILD_GUIDE.md` (about 60–90 minutes):

1. Restore the backup (§1).
2. Open the PBIP and point it at the data (§2–3).
3. Refresh, then check the row counts and the expected KPI values (§3).
4. Test RLS and OLS with *View as* (§4).
5. Check the generated interactivity and add the manual parts (§5).
6. Record Performance Analyzer, DAX Studio and VertiPaq values (§7).
7. Save the `.pbix` and export the `.pbit` (§8).
8. Capture the screenshots under the mock-up file names (§9), then rebuild the report and the deck.

## Rebuild everything from source

Prerequisites: Python 3.11+, PostgreSQL 14+ with `psql` and `pg_dump` on PATH, and `pip install -r requirements.txt`.

```bash
python run_all.py --dsn "postgresql://postgres:<password>@localhost:5432/gbhs_health_dw"
# options: --skip-generate (reuse 01_data/raw); --tomtool <TomTool.dll> --schemas <PBIR schema mirror> (extra PBIP validation)
```

The steps, in order (about 5 minutes in total):

1. **Generate the data.** `01_data/generate_synthetic_data.py` writes the source extracts, the day-2 delta, the
   manifest and the DQ ground truth. The seed is 20261028, so a re-run is byte-identical.
2. **Run the pipeline.** `02_sql/run_pipeline.py` creates the database and applies the DDL. It then extracts,
   transforms and loads, runs the 22 reconciliation checks, optimises, and applies the incremental load of
   1 October 2026.
3. **Run the analytics.** `03_analytics/*.py` covers profiling, forecasting, the readmission model, outbreak
   detection, ED wait drivers, the data dictionary, the SQL evidence, DQ-rule validation and the performance
   benchmark.
4. **Build the mock-ups and the expected values.** `06_report/build_mockups.py` renders the dashboard design
   mock-ups. `04_powerbi/expected_values.py` writes the numbers each Power BI card must show, and
   `07_presentation/deck_data.py` collects the numbers on the slides.
5. **Build the Power BI project.** `04_powerbi/build_pbip.py` generates the PBIP (TMDL and PBIR) and validates it.
   `export_fallbacks.py` writes the CSV-mode files and the single-file TMDL script.
6. **Describe the dataset.** `01_data/build_dataset_guide.py` writes `01_data/README.md` and
   `01_data/GBHS_Dataset_Overview.xlsx` from the data files.
7. **Back up.** `pg_dump` writes `05_backup/`.

The report and the deck need extra tools: pandoc 3, Node 18+ with Playwright, mermaid 10 and pptxgenjs 3.12.

```bash
python 06_report/build_report.py --mermaid-js <path>/mermaid/dist/mermaid.min.js
NODE_PATH=<dir with pptxgenjs> node 07_presentation/build_presentation.js
```

## Honest notes

- **The internal data are synthetic** (assumption A1). No real patient is described, and patients carry only a random
  pseudonym, birth year, sex, region and payer class. The generator records every defect and effect it plants, so
  the DQ rules and the models are validated against known truth (report Appendix E).
- **The NSA 2023 census totals are the real published values.** The NASA POWER weather files are stand-ins in the
  exact API layout, because the API host was not reachable from the build environment. Run
  `python 01_data/fetch_public_data.py` to replace them with the real series; no code changes are needed (A2).
- **The dashboard images in the report and the deck are design mock-ups** rendered from warehouse data. Replace them
  with Power BI screenshots after the Desktop build, using the same file names.
- **The DAX was validated structurally** by Microsoft's Tabular Object Model and a static checker, but it has not
  been executed by the VertiPaq engine. Check the expected values in `BUILD_GUIDE.md` §3–4 after the first refresh.
- **Namibia's Data Protection Bill** had not been enacted at the time of writing. Re-check its status before
  submission, and update report §3.8 if it has changed.
- **Generative AI was used** to draft parts of this package. Disclose it in line with the NUST policy (see the
  report's declaration). Each member must be able to explain the parts they own.
