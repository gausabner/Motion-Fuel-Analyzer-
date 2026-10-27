# Appendix A – Data dictionary

<!-- include: data_dictionary.md | drop=1 | shift=1 -->

# Appendix B – All DAX measures

All 79 measures of the semantic model, grouped by display folder. They are generated from `04_powerbi/model_spec.py`,
the same source that builds the TMDL, and are also delivered as `04_powerbi/measures.dax`.

<!-- dax-all -->

# Appendix C – Warehouse DDL

`02_sql/03_ddl_warehouse.sql` is reproduced in full. The complete set of scripts (staging, transformations, loads,
reconciliation, marts, security and optimisation) is in `02_sql/`, and a schema-only dump of the loaded database is
in `05_backup/green_basket_dw_schema_ddl.sql`.

<!-- code: 02_sql/03_ddl_warehouse.sql | lang=sql -->

# Appendix D – Diagram sources and package inventory

## Mermaid sources of the diagrams

<!-- code: 06_report/diagrams/bpmn.mmd | lang=text -->

<!-- code: 06_report/diagrams/architecture.mmd | lang=text -->

<!-- code: 06_report/diagrams/lineage.mmd | lang=text -->

<!-- code: 06_report/diagrams/erd_sales.mmd | lang=text -->

<!-- code: 06_report/diagrams/erd_production.mmd | lang=text -->

## Package inventory

<!-- table: Folder structure of the submission package -->

| Folder | Contents |
|---|---|
| `01_data/` | `generate_synthetic_data.py` (seeded generator), `fetch_public_data.py` (real public data), `raw/` (landed source files: farm logs, master data and delta, ERP, stock, ledger, NASA POWER JSON, Pink Sheet, FRED, NSA) with `generator_manifest.json` |
| `02_sql/` | `00`–`13` SQL scripts (database, DDL, functions, transforms, loads, reconciliation, marts, grants, OLAP, evidence, optimisation) and `run_pipeline.py` |
| `03_analytics/` | `common.py`, `data_profiling.py`, `forecasting.py`, `clustering.py`, `yield_drivers.py`, `anomaly_detection.py`, `build_data_dictionary.py`, `capture_sql_evidence.py`, `validate_dq_rules.py`, `performance_benchmark.py` |
| `04_powerbi/` | `GreenBasket_Agri.pbip` + `.SemanticModel/` (TMDL) + `.Report/` (PBIR), `model_spec.py`, `build_pbip.py`, `export_fallbacks.py`, `measures.dax`, `GreenBasket_model_script.tmdl`, `data_csv/`, `theme/`, `tools/TomTool` (TOM validator), `BUILD_GUIDE.md` |
| `05_backup/` | `green_basket_dw_pg16_warehouse.backup` (pg_dump -Fc), `green_basket_dw_schema_ddl.sql` |
| `06_report/` | This PDF; `src/` (report text), `evidence/` (generated tables), `figures/`, `diagrams/`, `data_dictionary.md/.xlsx`, `build_mockups.py`, `build_report.py`, `tools/` (render.js, template, CSS, title page) |
| `07_presentation/` | `GreenBasket_ABI820S_Presentation.pptx`, `deck_data.py` (numbers from the warehouse), `deck_data.json`, `build_presentation.js` (pptxgenjs) |
| root | `README.md`, `run_all.py`, `requirements.txt` |
