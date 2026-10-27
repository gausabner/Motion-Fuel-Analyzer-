#!/usr/bin/env python3
"""
build_data_dictionary.py - generates the warehouse data dictionary from the PostgreSQL catalog
(COMMENT ON TABLE/COLUMN "definition | Source: ..." written in 02_sql/03_ddl_warehouse.sql), so the
dictionary can never drift from the deployed schema.
Outputs: 06_report/data_dictionary.md and 06_report/data_dictionary.xlsx (one sheet per layer), and
04_powerbi/column_descriptions.json: the same definitions mapped onto the mart view columns that Power BI imports
(through information_schema.view_column_usage), so the semantic model shows the dictionary as field tooltips.
"""
from __future__ import annotations

import json

import pandas as pd

from common import ROOT, query

SQL = """
SELECT c.table_schema, c.table_name, obj_description(format('%I.%I', c.table_schema, c.table_name)::regclass, 'pg_class') AS table_comment,
       c.ordinal_position, c.column_name,
       CASE WHEN c.data_type IN ('character varying', 'character') THEN c.data_type || '(' || c.character_maximum_length || ')'
            WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL THEN 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')'
            ELSE c.data_type END AS data_type,
       c.is_nullable,
       col_description(format('%I.%I', c.table_schema, c.table_name)::regclass, c.ordinal_position) AS column_comment,
       EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k
                 ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
               WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND k.column_name = c.column_name
                 AND tc.constraint_type = 'PRIMARY KEY') AS is_pk,
       (SELECT ccu.table_name || '.' || ccu.column_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
         WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND k.column_name = c.column_name
           AND tc.constraint_type = 'FOREIGN KEY' LIMIT 1) AS fk_ref
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
WHERE c.table_schema IN ('dw', 'sec')
ORDER BY c.table_schema, c.table_name LIKE 'fact%%' DESC, c.table_name, c.ordinal_position
"""


LINEAGE = """
SELECT u.view_name, u.table_name, u.column_name,
       col_description(format('%I.%I', u.table_schema, u.table_name)::regclass, c.ordinal_position) AS column_comment
FROM information_schema.view_column_usage u
JOIN information_schema.columns c ON c.table_schema = u.table_schema AND c.table_name = u.table_name AND c.column_name = u.column_name
WHERE u.view_schema = 'mart' AND u.table_schema = 'dw'
"""


def write_model_descriptions():
    """Definition and lineage of every pass-through mart column, keyed 'view.column' (the base table whose name matches
    the view wins when a view joins several tables)."""
    df = query(LINEAGE).dropna(subset=["column_comment"])
    df["rank"] = [0 if v.replace("v_", "", 1) in t or t.endswith(v.replace("v_fact_", "").replace("v_dim_", "")) else 1
                  for v, t in zip(df.view_name, df.table_name)]
    df = df.sort_values("rank").drop_duplicates(["view_name", "column_name"])
    out = {}
    for r in df.itertuples():
        definition, _, source = r.column_comment.partition("| Source:")
        out[f"{r.view_name}.{r.column_name}"] = definition.strip() + (f" Source: {source.strip()}" if source.strip() else "")
    path = ROOT / "04_powerbi" / "column_descriptions.json"
    path.write_text(json.dumps(dict(sorted(out.items())), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(out)} mart column descriptions -> {path.relative_to(ROOT)}")


def main():
    write_model_descriptions()
    df = query(SQL)
    split = df.column_comment.fillna("").str.split(r"\s*\|\s*Source:\s*", n=1, expand=True)
    df["definition"] = split[0]
    df["source"] = split[1].fillna("") if split.shape[1] > 1 else ""
    df["key"] = ["PK" if pk else ("FK -> " + fk if isinstance(fk, str) else "") for pk, fk in zip(df.is_pk, df.fk_ref)]
    lines = ["# Data dictionary - Green Basket Health Services data warehouse (`dw` schema)", "",
             "Generated from the PostgreSQL catalog (`COMMENT ON ...`) by `03_analytics/build_data_dictionary.py`.", ""]
    for (schema, table), g in df.groupby(["table_schema", "table_name"], sort=False):
        lines += [f"## {schema}.{table}", "", g.table_comment.iloc[0] or "", "",
                  "| # | Column | Data type | Null | Key | Business definition | Source / lineage |", "|---|---|---|---|---|---|---|"]
        for r in g.itertuples():
            lines.append(f"| {r.ordinal_position} | `{r.column_name}` | {r.data_type} | {'Y' if r.is_nullable == 'YES' else 'N'} | {r.key} | "
                         f"{r.definition.replace('|', '/')} | {r.source.replace('|', '/')} |")
        lines.append("")
    (ROOT / "06_report" / "data_dictionary.md").write_text("\n".join(lines))
    out = df[["table_schema", "table_name", "table_comment", "ordinal_position", "column_name", "data_type", "is_nullable", "key",
              "definition", "source"]]
    with pd.ExcelWriter(ROOT / "06_report" / "data_dictionary.xlsx", engine="openpyxl") as xw:
        out.to_excel(xw, sheet_name="dw columns", index=False)
        tables = out.groupby(["table_schema", "table_name"], sort=False).agg(columns=("column_name", "size"),
                                                                            description=("table_comment", "first")).reset_index()
        tables.to_excel(xw, sheet_name="tables", index=False)
    missing = df[df.definition.str.strip() == ""]
    print(f"{df.table_name.nunique()} tables, {len(df)} columns; columns without a definition: {len(missing)}")
    if len(missing):
        print(missing[["table_name", "column_name"]].to_string(index=False))


if __name__ == "__main__":
    main()
