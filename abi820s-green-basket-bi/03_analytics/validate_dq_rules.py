#!/usr/bin/env python3
"""
validate_dq_rules.py - scores the ETL data-quality rules against the generator's ground truth.

The synthetic generator records every defect it injects (01_data/raw/generator_manifest.json). This script compares
those injections with what the rules logged in audit.dq_issue_log for the full load (batch 1):
  * record level (precision / recall) where the manifest lists the affected records;
  * count level for the other defect types.
Output: 06_report/evidence/dq_rule_validation.md
"""
from __future__ import annotations

import json
import re

import pandas as pd

from common import EVIDENCE, ROOT, md_table, query

MANIFEST = json.loads((ROOT / "01_data/raw/generator_manifest.json").read_text())

# (injected defect key in the manifest, rule, description)
COUNT_LEVEL = [
    ("harvest_farm_code_case_whitespace+harvest_farm_code_underscore", "HV08", "Farm code case / whitespace / underscore variants"),
    ("planting_register_ddmmyyyy_dates", "PL01", "Planting dates keyed as DD/MM/YYYY"),
    ("planting_register_missing_planted_ha", "PL02", "Planted area left blank"),
    ("master_product_missing_weight", "MD03", "Product without net weight"),
    ("master_duplicate_customers", "MD04", "Duplicate customer accounts"),
    ("master_customer_name_format_issues", "MD05", "Customer names in capitals / padded"),
    ("master_customer_missing_region", "MD02", "Domestic customer without region"),
    ("sales_duplicate_lines_total", "SA01", "Duplicate invoice lines (overlapping extracts)"),
    ("sales_product_code_variants", "SA02", "Product-code spelling variants"),
    ("sales_lines_using_duplicate_customer_code", "SA03", "Lines on a duplicate customer code"),
    ("sales_lines_late_arriving_customers", "SA04", "Lines for customers not yet in master data"),
    ("sales_missing_farm_code", "SA05", "Lines without farm of origin"),
    ("sales_export_missing_currency", "SA06", "Export lines without currency"),
    ("stock_closing_sign_errors", "ST01", "Closing stock keyed with the wrong sign"),
    ("cost_duplicate_postings", "CL01", "Duplicate ledger postings"),
    ("cost_amount_text_formatted", "CL04", "Amounts with N$ / thousands separators"),
    ("cost_missing_crop_on_crop_specific", "CL03", "Crop-specific cost without crop"),
    ("pink_sheet_missing_markers", "MP01", "Pink Sheet '...' missing markers"),
    ("fred_blank_observations", "FX01", "Blank FX observations"),
    ("nsa_unmapped_crop_rows_sorghum", "CE01", "NSA rows for a crop outside scope"),
]

RECORD_LEVEL = [  # (truth list, rule, description, key normaliser)
    ("dup", "HV05", "Exact duplicate harvest records"),
    ("bad_date", "HV01", "Unparseable harvest dates"),
    ("blank", "HV02", "Blank harvest quantities"),
    ("neg", "HV03", "Negative harvest quantities"),
    ("x10", "HV06", "x10 / x1000 quantity keying errors"),
]


def logged(rule: str) -> pd.Series:
    df = query("SELECT source_key FROM audit.dq_issue_log WHERE batch_id = 1 AND rule_code = %(r)s", {"r": rule})
    return df.source_key


def prf(truth: set, found: set) -> dict:
    tp = len(truth & found)
    fp = len(found - truth)
    fn = len(truth - found)
    return dict(injected=len(truth), flagged=len(found), tp=tp, fp=fp, fn=fn,
                precision=tp / len(found) if found else float("nan"), recall=tp / len(truth) if truth else float("nan"))


def main():
    inj = MANIFEST["injected_defects"]
    truth = MANIFEST["truth"]
    rows = []
    for key, rule, desc in RECORD_LEVEL:
        rows.append(dict(rule=rule, defect=desc, level="record", **prf(set(truth["harvest_injected_rows"][key]), set(logged(rule)))))
    sa07 = {re.sub(r"\s*\(.*\)$", "", k) for k in logged("SA07")}
    rows.append(dict(rule="SA07", defect="Unit price keyed x10 (invoice lines)", level="record",
                     **prf(set(truth["price_error_invoice_lines"]), sa07)))
    st03 = {k.rsplit("/", 1)[0] + "/" + k.rsplit("/", 1)[1][:7] for k in logged("ST03")}
    rows.append(dict(rule="ST03", defect="Missing monthly stock snapshots", level="record",
                     **prf({"/".join(t) for t in truth["stock_missing_rows"]}, st03)))
    for key, rule, desc in COUNT_LEVEL:
        n_inj = sum(inj[k] for k in key.split("+"))
        n_log = len(logged(rule))
        rows.append(dict(rule=rule, defect=desc, level="count", injected=n_inj, flagged=n_log,
                         tp=None, fp=None, fn=None, precision=None, recall=None))
    df = pd.DataFrame(rows)
    df["match"] = df.apply(lambda r: "exact" if r.injected == r.flagged and (r.level == "count" or r.fp == 0 and r.fn == 0)
                           else ("see note" if r.level == "count" else f"TP {int(r.tp)} / FP {int(r.fp)} / FN {int(r.fn)}"), axis=1)
    rec = df[df.level == "record"]
    n_exact = int((df.match == "exact").sum())
    head = (f"{len(df)} injected defect types checked against the rules that should catch them: {n_exact} match exactly. "
            f"Record-level ({len(rec)} rules with a truth list): {int(rec.tp.sum())} of {int(rec.injected.sum())} injected records "
            f"found, {int(rec.fp.sum())} false positives.\n\n")
    out = df[["rule", "defect", "level", "injected", "flagged", "precision", "recall", "match"]].copy()
    out["precision"] = out.precision.map(lambda v: "" if pd.isna(v) else f"{v:.3f}")
    out["recall"] = out.recall.map(lambda v: "" if pd.isna(v) else f"{v:.3f}")
    (EVIDENCE / "dq_rule_validation.md").write_text(head + md_table(out, "{:,.0f}"), encoding="utf-8")
    print(head)
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
