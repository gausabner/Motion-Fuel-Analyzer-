#!/usr/bin/env python3
"""
capture_sql_evidence.py - runs every named query in 02_sql/11_olap_queries.sql and
02_sql/12_evidence_queries.sql ("-- name: <id>" markers) and writes the result of
each as a Markdown table to 06_report/evidence/<id>.md for inclusion in the report.

Usage: python capture_sql_evidence.py [--dsn postgresql://postgres:postgres@localhost:5432/gbhs_health_dw]
"""
from __future__ import annotations

import argparse
import re
from decimal import Decimal
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "06_report" / "evidence"


def split_named(sql_text: str) -> list[tuple[str, str]]:
    parts = re.split(r"^-- name: (\w+)\s*$", sql_text, flags=re.M)
    return [(parts[i], parts[i + 1].strip()) for i in range(1, len(parts), 2)]


PLAIN_INT = re.compile(r"(year|_key|week|decile|batch|version|rank|_id|code)$|^(year|week|epi)", re.I)


def fmt(v, col: str = "") -> str:
    """Format one value for a Markdown table: thousands separators on counts and amounts, but never on years,
    keys or codes; decimals keep the scale chosen by round() in the SQL."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    plain = bool(PLAIN_INT.search(col))
    if isinstance(v, Decimal):
        if v == v.to_integral_value():
            v = int(v)
        else:
            scale = max(0, -v.as_tuple().exponent)
            return f"{v:,.{scale}f}" if abs(v) >= 1000 else f"{v:.{scale}f}"
    if isinstance(v, float):
        return f"{v:,.2f}" if abs(v) >= 1000 else f"{v:g}"
    if isinstance(v, int):
        return str(v) if plain else f"{v:,}"
    return str(v).replace("|", "/")


def to_markdown(cols, rows) -> str:
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for r in rows:
        lines.append("| " + " | ".join(fmt(v, c) for v, c in zip(r, cols)) + " |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", default="postgresql://postgres:postgres@localhost:5432/gbhs_health_dw")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(args.dsn) as conn:
        for f in ("11_olap_queries.sql", "12_evidence_queries.sql"):
            for name, sql in split_named((ROOT / "02_sql" / f).read_text()):
                cur = conn.execute(sql)
                cols = [d.name for d in cur.description]
                rows = cur.fetchall()
                (OUT / f"{name}.md").write_text(to_markdown(cols, rows))
                print(f"{name:28s} {len(rows):5d} rows")


if __name__ == "__main__":
    main()
