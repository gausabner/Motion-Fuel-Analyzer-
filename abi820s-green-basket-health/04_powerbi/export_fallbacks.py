#!/usr/bin/env python3
"""
export_fallbacks.py - two safety nets for building the .pbix on a machine without PostgreSQL / PBIP support.

1. data_csv/*.csv.gz  - every mart view exported as gzip CSV (booleans as true/false, ISO dates).
   In Power BI Desktop set the parameter SourceMode = "CSV" and CsvFolder = "<this folder>\\" and refresh.
2. GBHS_model_script.tmdl - the whole semantic model as ONE TMDL script (createOrReplace) for
   Power BI Desktop's TMDL view: open a blank report, TMDL view > paste > Apply, then refresh.
"""
from __future__ import annotations

import gzip
import sys
from pathlib import Path

import pandas as pd
import psycopg

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import model_spec as S  # noqa: E402

DSN = __import__("os").environ.get("GBHS_DSN", "postgresql://postgres:postgres@localhost:5432/gbhs_health_dw")


def export_csv():
    out = HERE / "data_csv"
    out.mkdir(exist_ok=True)
    with psycopg.connect(DSN) as conn:
        for t in S.TABLES:
            cols = [src for (_n, src, _dt, _o) in t["columns"]]
            cur = conn.execute(f"SELECT {', '.join(cols)} FROM mart.{t['view']}")
            df = pd.DataFrame(cur.fetchall(), columns=cols)
            for c in df.columns:
                if df[c].dtype == bool or set(df[c].dropna().unique()) <= {True, False} and df[c].dropna().size and isinstance(df[c].dropna().iloc[0], bool):
                    df[c] = df[c].map({True: "true", False: "false"})
            with gzip.open(out / f"{t['view']}.csv.gz", "wt", newline="", encoding="utf-8") as fh:
                df.to_csv(fh, index=False)
            print(f"{t['view']:30s} {len(df):8d} rows")


def tmdl_script():
    d = HERE / "GBHS_Health.SemanticModel" / "definition"
    parts = [d / "expressions.tmdl"] + sorted((d / "tables").glob("*.tmdl")) + [d / "relationships.tmdl"] + sorted((d / "roles").glob("*.tmdl"))
    lines = ["// GBHS health semantic model - TMDL script for Power BI Desktop TMDL view (createOrReplace).",
             "// Usage: blank report > TMDL view > new tab > paste all > Apply > then Home > Refresh.", "", "createOrReplace", ""]
    for p in parts:
        for line in p.read_text(encoding="utf-8").splitlines():
            lines.append(("\t" + line) if line.strip() else "")
        lines.append("")
    (HERE / "GBHS_model_script.tmdl").write_text("\n".join(lines), encoding="utf-8")
    print("TMDL script lines:", len(lines))


if __name__ == "__main__":
    export_csv()
    tmdl_script()
