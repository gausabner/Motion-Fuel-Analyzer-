#!/usr/bin/env python3
"""
run_all.py - rebuilds the whole Green Basket BI project from scratch, in dependency order.

  1. 01_data/generate_synthetic_data.py      raw source extracts (skip with --skip-generate)
  2. 02_sql/run_pipeline.py                  PostgreSQL: DDL, extract, transform, load, reconcile, optimise, day-2 delta
  3. 03_analytics/*.py                       profiling, forecasting, clustering, yield drivers, anomalies,
                                             data dictionary, SQL evidence, DQ-rule validation, performance benchmark
     06_report/build_mockups.py              dashboard design mock-ups from the warehouse
  4. 04_powerbi/build_pbip.py                Power BI Project (TMDL + PBIR) and fallbacks
  5. pg_dump                                 05_backup/green_basket_dw_pg16_warehouse.backup

Usage:  python run_all.py --dsn "postgresql://postgres:<pw>@localhost:5432/green_basket_dw" [--skip-generate]
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
    ap.add_argument("--dsn", default="postgresql://postgres:postgres@localhost:5432/green_basket_dw")
    ap.add_argument("--skip-generate", action="store_true", help="use the committed raw extracts")
    ap.add_argument("--tomtool", default=None)
    ap.add_argument("--schemas", default=None)
    args = ap.parse_args()
    env = dict(os.environ, GB_DSN=args.dsn, PYTHONHASHSEED="0")
    py = sys.executable
    t0 = time.time()
    if not args.skip_generate:
        run([py, "generate_synthetic_data.py", "--out", "raw"], ROOT / "01_data", env)
    run([py, "run_pipeline.py", "--dsn", args.dsn, "--create-db", "--with-delta"], ROOT / "02_sql", env)
    for script in ("data_profiling.py", "forecasting.py", "clustering.py", "yield_drivers.py", "anomaly_detection.py",
                   "build_data_dictionary.py"):
        run([py, script], ROOT / "03_analytics", env)
    run([py, "capture_sql_evidence.py", "--dsn", args.dsn], ROOT / "03_analytics", env)
    run([py, "validate_dq_rules.py"], ROOT / "03_analytics", env)
    run([py, "performance_benchmark.py"], ROOT / "03_analytics", env)
    run([py, "build_mockups.py"], ROOT / "06_report", env)
    cmd = [py, "build_pbip.py"]
    if args.tomtool:
        cmd += ["--tomtool", args.tomtool]
    if args.schemas:
        cmd += ["--schemas", args.schemas]
    run(cmd, ROOT / "04_powerbi", env)
    run([py, "export_fallbacks.py"], ROOT / "04_powerbi", env)
    if shutil.which("pg_dump"):
        m = re.match(r"postgres(?:ql)?://([^:@/]+)(?::([^@/]*))?@([^:/]+)(?::(\d+))?/(\w+)", args.dsn)
        user, pw, host, port, db = m.groups()
        denv = dict(env, PGPASSWORD=pw or "")
        run(["pg_dump", "-h", host, "-p", port or "5432", "-U", user, "-Fc", "-Z", "9", "-N", "stg",
             "-f", str(ROOT / "05_backup" / "green_basket_dw_pg16_warehouse.backup"), db], ROOT, denv)
        run(["pg_dump", "-h", host, "-p", port or "5432", "-U", user, "--schema-only", "--no-owner",
             "-f", str(ROOT / "05_backup" / "green_basket_dw_schema_ddl.sql"), db], ROOT, denv)
    print(f"\nALL STEPS COMPLETED in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
