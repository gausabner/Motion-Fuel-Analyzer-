#!/usr/bin/env python3
"""
run_all.py - rebuilds the whole Green Basket Health Services BI project from scratch, in dependency order.

  1. 01_data/generate_synthetic_data.py      raw source extracts (skip with --skip-generate)
  2. 02_sql/run_pipeline.py                  PostgreSQL: DDL, extract, transform, load, reconcile, optimise, day-2 delta
  3. 03_analytics/*.py                       profiling, forecasting, readmission model, outbreak detection, ED-wait drivers,
                                             data dictionary, SQL evidence, DQ-rule validation, performance benchmark
     06_report/build_mockups.py              dashboard design mock-ups from the warehouse
  4. 04_powerbi/expected_values.py           expected Power BI card values and RLS test matrix (SQL mirror of the DAX)
     07_presentation/deck_data.py            the numbers shown on the slides
     04_powerbi/build_pbip.py                Power BI Project (TMDL + PBIR) and fallbacks
     01_data/build_dataset_guide.py          01_data/README.md and GBHS_Dataset_Overview.xlsx (where the dataset is)
  5. pg_dump                                 05_backup/gbhs_health_dw_pg16_warehouse.backup + schema-only DDL

Usage:  python run_all.py --dsn "postgresql://postgres:<pw>@localhost:5432/gbhs_health_dw" [--skip-generate]
        [--tomtool <TomTool.dll>] [--schemas <json-schema mirror>]
Prerequisites: Python 3.11+, PostgreSQL 14+ (psql/pg_dump on PATH), pip install -r requirements.txt
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(cmd: list[str], cwd: Path, env: dict):
    t0 = time.time()
    print(f"\n>>> {' '.join(cmd)}   (in {cwd.relative_to(ROOT) if cwd != ROOT else '.'})", flush=True)
    subprocess.run(cmd, cwd=cwd, env=env, check=True)
    print(f"    done in {time.time() - t0:.1f} s", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dsn", default="postgresql://postgres:postgres@localhost:5432/gbhs_health_dw")
    ap.add_argument("--skip-generate", action="store_true", help="use the committed raw extracts")
    ap.add_argument("--skip-powerbi", action="store_true", help="skip the PBIP build (e.g. no .NET for the TOM validator)")
    ap.add_argument("--tomtool", default=None)
    ap.add_argument("--schemas", default=None)
    args = ap.parse_args()
    env = dict(os.environ, GBHS_DSN=args.dsn, PYTHONHASHSEED="0")
    py = sys.executable
    t0 = time.time()
    if not args.skip_generate:
        run([py, "generate_synthetic_data.py", "--out", "raw"], ROOT / "01_data", env)
    run([py, "run_pipeline.py", "--dsn", args.dsn, "--create-db", "--with-delta"], ROOT / "02_sql", env)
    for script in ("data_profiling.py", "forecasting.py", "readmission_model.py", "outbreak_detection.py",
                   "ed_wait_drivers.py", "build_data_dictionary.py"):
        run([py, script], ROOT / "03_analytics", env)
    run([py, "capture_sql_evidence.py", "--dsn", args.dsn], ROOT / "03_analytics", env)
    run([py, "validate_dq_rules.py"], ROOT / "03_analytics", env)
    run([py, "performance_benchmark.py"], ROOT / "03_analytics", env)
    if (ROOT / "06_report" / "build_mockups.py").exists():
        run([py, "build_mockups.py"], ROOT / "06_report", env)
    run([py, "expected_values.py"], ROOT / "04_powerbi", env)   # numbers the Power BI cards must show (BUILD_GUIDE)
    run([py, "deck_data.py"], ROOT / "07_presentation", env)    # every number on the slides (build_presentation.js)
    if not args.skip_powerbi and (ROOT / "04_powerbi" / "build_pbip.py").exists():
        cmd = [py, "build_pbip.py"]
        if args.tomtool:
            cmd += ["--tomtool", args.tomtool]
        if args.schemas:
            cmd += ["--schemas", args.schemas]
        run(cmd, ROOT / "04_powerbi", env)
        run([py, "export_fallbacks.py"], ROOT / "04_powerbi", env)
    run([py, "build_dataset_guide.py"], ROOT / "01_data", env)   # dataset guide and Excel overview for the marker
    if shutil.which("pg_dump"):
        m = re.match(r"postgres(?:ql)?://([^:@/]+)(?::([^@/]*))?@([^:/]+)(?::(\d+))?/(\w+)", args.dsn)
        user, pw, host, port, db = m.groups()
        denv = dict(env, PGPASSWORD=pw or "")
        (ROOT / "05_backup").mkdir(exist_ok=True)
        # the backup excludes the raw landing schema (re-creatable from 01_data/raw) to keep it small
        run(["pg_dump", "-h", host, "-p", port or "5432", "-U", user, "-Fc", "-Z", "9", "-N", "stg",
             "-f", str(ROOT / "05_backup" / "gbhs_health_dw_pg16_warehouse.backup"), db], ROOT, denv)
        run(["pg_dump", "-h", host, "-p", port or "5432", "-U", user, "--schema-only", "--no-owner",
             "-f", str(ROOT / "05_backup" / "gbhs_health_dw_schema_ddl.sql"), db], ROOT, denv)
    print(f"\nALL STEPS COMPLETED in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
