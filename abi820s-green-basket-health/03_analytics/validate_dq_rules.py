#!/usr/bin/env python3
"""
validate_dq_rules.py - scores the ETL data-quality rules against the generator's ground truth.

The synthetic generator records the key of every record it damaged (01_data/raw/dq_ground_truth.json). This
script compares those keys with what the rules logged in audit.dq_issue_log for the full load (batch 1) and
reports, per rule, injected vs flagged records, precision and recall. External-source rules are checked at
count level against generator_manifest.json.
Output: 06_report/evidence/dq_rule_validation.md
"""
from __future__ import annotations

import json

import pandas as pd

from common import EVIDENCE, ROOT, md_table, query

TRUTH = json.loads((ROOT / "01_data/raw/dq_ground_truth.json").read_text())
MANIFEST = json.loads((ROOT / "01_data/raw/generator_manifest.json").read_text())
DESC = {r.rule_code: r.rule_name for r in query("SELECT rule_code, rule_name FROM audit.dq_rule").itertuples()}


def logged(rule: str) -> set:
    df = query("SELECT DISTINCT source_key FROM audit.dq_issue_log WHERE batch_id = 1 AND rule_code = %(r)s", {"r": rule})
    return set(df.source_key.dropna())


def main():
    rows = []
    for rule, keys in TRUTH.items():
        truth, found = set(keys), logged(rule)
        tp, fp, fn = len(truth & found), len(found - truth), len(truth - found)
        rows.append(dict(rule=rule, defect=DESC.get(rule, ""), injected=len(truth), flagged=len(found), tp=tp, fp=fp, fn=fn,
                         precision=tp / len(found) if found else float("nan"), recall=tp / len(truth) if truth else float("nan")))
    inj = MANIFEST["injected_defects"]
    counts = [("WE01+WE02", "weather_fill_values_-999", "NASA POWER -999 fill values (all parameters)"),
              ("EX01", "nsa_thousands_separator_spaces", "Census numbers with thousands separators")]
    for rules, key, desc in counts:
        n_log = int(query("SELECT count(*) AS n FROM audit.dq_issue_log WHERE batch_id = 1 AND rule_code = ANY(%(r)s)",
                          {"r": rules.split("+")}).n.iloc[0])
        rows.append(dict(rule=rules, defect=desc, injected=inj[key], flagged=n_log, tp=None, fp=None, fn=None,
                         precision=None, recall=None))
    df = pd.DataFrame(rows).sort_values("rule")
    rec = df[df.tp.notna()]
    exact = rec[(rec.fp == 0) & (rec.fn == 0)]
    head = (f"{len(rec)} rules with a record-level truth list: {int(rec.tp.sum()):,} of {int(rec.injected.sum()):,} injected records found "
            f"(recall {rec.tp.sum() / rec.injected.sum():.4f}), {int(rec.fp.sum()):,} false positives "
            f"(precision {rec.tp.sum() / (rec.tp.sum() + rec.fp.sum()):.4f}); {len(exact)} rules match their truth list exactly. "
            f"Count-level checks for the external sources are listed at the end.\n\n")
    out = df[["rule", "defect", "injected", "flagged", "tp", "fp", "fn", "precision", "recall"]].copy()
    for c in ("precision", "recall"):
        out[c] = out[c].map(lambda v: "" if pd.isna(v) else f"{v:.3f}")
    for c in ("tp", "fp", "fn"):
        out[c] = out[c].map(lambda v: "" if pd.isna(v) else f"{int(v):,}")
    (EVIDENCE / "dq_rule_validation.md").write_text(head + md_table(out, "{:,.0f}"), encoding="utf-8")
    print(head)
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
