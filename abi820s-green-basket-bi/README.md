# Green Basket cc – Agriculture Division: end-to-end BI solution

ABI820S Advanced Business Intelligence and Analytics (NUST) – group project, due 28 October 2026.

This package delivers the following, all built from code and reproducible with one command:

- a PostgreSQL 16 data warehouse;
- an ELT pipeline with data-quality controls;
- a Power BI semantic model and report (PBIP);
- four advanced analytics techniques;
- the final report (PDF) and the presentation (PPTX).

| Deliverable | File |
|---|---|
| Final report | `06_report/GreenBasket_ABI820S_Final_Report.pdf` |
| Presentation | `07_presentation/GreenBasket_ABI820S_Presentation.pptx` |
| Power BI project (source of the `.pbix` / `.pbit`) | `04_powerbi/GreenBasket_Agri.pbip`, plus `BUILD_GUIDE.md` |
| SQL scripts | `02_sql/00_create_database.sql` … `13_optimisation.sql` |
| Warehouse backup and DDL | `05_backup/` |
| Data dictionary | `06_report/data_dictionary.xlsx` (and Appendix A of the report) |
| Datasets | `01_data/raw/` (synthetic, seeded); `01_data/fetch_public_data.py` (real public sources) |

## Must-do before submission (Windows + Power BI Desktop)

The `.pbix` and `.pbit` can only be produced in Power BI Desktop, and screenshots and Desktop timings must be captured
there. Follow `04_powerbi/BUILD_GUIDE.md` (about 60–90 minutes):

1. Restore the backup.
2. Open the PBIP.
3. Refresh.
4. Verify the expected numbers.
5. Test RLS.
6. Add the drill-through and tooltip pages.
7. Save the `.pbix` and export the `.pbit`.
8. Capture the screenshots and re-run `python 06_report/build_report.py`.

## Rebuild everything from source

Prerequisites: Python 3.11+, PostgreSQL 14+ with `psql` and `pg_dump` on PATH, and `pip install -r requirements.txt`.

```bash
python run_all.py --dsn "postgresql://postgres:<password>@localhost:5432/green_basket_dw"
# options: --skip-generate (reuse 01_data/raw), --tomtool <TomTool.dll> --schemas <PBIR schema mirror> (extra PBIP validation)
```

The steps, in order (about 3 minutes in total):

1. **Generate the data.** `01_data/generate_synthetic_data.py` writes the source extracts (seed 20261028, byte-identical
   on re-run).
2. **Run the pipeline.** `02_sql/run_pipeline.py` creates the database and applies the DDL. It then extracts, transforms,
   loads, runs the 19 reconciliation checks, optimises, and applies the day-2 delta.
3. **Run the analytics.** `03_analytics/*.py` covers profiling, forecasting, clustering, yield drivers, anomaly
   detection, the data dictionary, the SQL evidence, DQ-rule validation and the performance benchmark.
4. **Build the mock-ups.** `06_report/build_mockups.py` renders the dashboard design mock-ups from the warehouse.
5. **Build the Power BI project.** `04_powerbi/build_pbip.py` generates the PBIP (TMDL + PBIR), which is validated
   against Microsoft's schemas. `export_fallbacks.py` writes the CSV-mode files and the TMDL script.
6. **Back up.** `pg_dump` writes `05_backup/`.

The report and the deck have extra tool requirements: pandoc 3, Node 18+, Playwright, mermaid 10 and pptxgenjs 3.12.

```bash
python 06_report/build_report.py --mermaid-js <path>/mermaid/dist/mermaid.min.js
python 07_presentation/deck_data.py && node 07_presentation/build_presentation.js
```

## Honest notes

- **Internal data is synthetic** (assumption A1). External sources (NASA POWER, World Bank Pink Sheet, FRED, NSA)
  are stand-ins in the **exact published layouts**, because the build environment had no internet access to those
  hosts. Run `python 01_data/fetch_public_data.py` to replace them with the real files; no code changes are needed.
- **The dashboard images in the report and the deck are design mock-ups** rendered from warehouse data. Replace them
  with Power BI screenshots after the Desktop build (same file names).
- **DAX was validated structurally** by Microsoft's Tabular Object Model and a static checker, but has not been
  executed by the VertiPaq engine. Verify the expected values listed in `BUILD_GUIDE.md` §3–4.
- **Generative AI was used** to draft parts of this package. Disclose it in line with the NUST policy (see the
  report's declaration). Each member must be able to explain the parts they own.
