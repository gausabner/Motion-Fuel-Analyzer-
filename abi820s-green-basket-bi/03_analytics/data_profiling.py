#!/usr/bin/env python3
"""
data_profiling.py - profiles the RAW landing tables (stg.*_raw, all text) before any
cleansing: volume, completeness, uniqueness, format consistency and outliers.
Writes Markdown tables to 06_report/evidence/profile_*.md (used in report 3.3.3).
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

from common import EVIDENCE, md_table, query

DATE_PATTERNS = [
    (r"^\d{2}/\d{2}/\d{4}$", "DD/MM/YYYY"), (r"^\d{4}-\d{2}-\d{2}$", "YYYY-MM-DD"),
    (r"^\d{2}-[A-Za-z]{3}-\d{2}$", "DD-Mon-YY"), (r"^\d{4}M\d{2}$", "YYYYMmm"), (r"^\d{4}-\d{2}$", "YYYY-MM"),
]


def date_pattern(v):
    if v is None or str(v).strip() == "":
        return "(blank)"
    for rx, name in DATE_PATTERNS:
        if re.match(rx, str(v).strip()):
            return name
    return "(other)"


def completeness(table: str, cols: list[str]) -> pd.DataFrame:
    exprs = ", ".join(f"round(100.0 * count(*) FILTER (WHERE coalesce(btrim({c}), '') = '') / count(*), 2) AS \"{c}\"" for c in cols)
    df = query(f"SELECT {exprs} FROM {table}")
    return df.T.rename(columns={0: "pct_missing"})


def main():
    summary = []

    # ---------------- S1 harvest logs
    h = query("SELECT source_file, template_code, row_num, farm_txt, date_txt, crop_txt, block_txt, qty_txt, unit_txt, recorder_txt, remarks_txt FROM stg.harvest_log_raw")
    dup = h.duplicated(subset=["source_file", "farm_txt", "date_txt", "crop_txt", "block_txt", "qty_txt", "unit_txt", "recorder_txt", "remarks_txt"]).sum()
    h["date_fmt"] = h.date_txt.map(date_pattern)
    fmt = h.groupby(["template_code", "date_fmt"]).size().reset_index(name="rows")
    unit_counts = h[h.template_code == "C"].unit_txt.fillna("(blank)").value_counts().reset_index()
    unit_counts.columns = ["unit text (template C)", "rows"]
    crop_variants = h.groupby("crop_txt").size().reset_index(name="rows").sort_values("rows", ascending=False)
    farm_ok = h.farm_txt.str.match(r"^GB-[A-Z]{3}-\d{2}$").fillna(False)
    invalid_dates = 0
    for t, f in (("A", "%d/%m/%Y"), ("B", "%Y-%m-%d"), ("C", "%d-%b-%y")):
        sub = h[h.template_code == t].date_txt
        invalid_dates += pd.to_datetime(sub, format=f, errors="coerce").isna().sum()
    q = pd.to_numeric(h.qty_txt.str.replace(",", ".", regex=False), errors="coerce")
    summary.append(dict(source="S1 Farm harvest logs (14 CSV, 3 layouts)", rows=len(h), columns=8,
                        exact_duplicates=int(dup), missing_qty=int(h.qty_txt.isna().sum()), invalid_dates=int(invalid_dates),
                        other_issues=f"{int((~farm_ok).sum())} non-standard farm codes; {h.crop_txt.nunique()} crop spellings for 10 crops; "
                                     f"{int((q <= 0).sum())} non-positive quantities; 3 date formats; units kg/t/crates/bins"))
    (EVIDENCE / "profile_harvest_formats.md").write_text(md_table(fmt) + "\n" + md_table(unit_counts) + "\n" +
                                                         md_table(crop_variants.head(30)))

    # ---------------- S1 planting register
    p = query("SELECT * FROM stg.planting_register_raw")
    p["date_fmt"] = p.planting_date.map(date_pattern)
    summary.append(dict(source="S1 Planting register (block level)", rows=len(p), columns=11,
                        exact_duplicates=int(p.duplicated(subset=["cycle_id", "block_id"]).sum()),
                        missing_qty=int(p.planted_ha.isna().sum()), invalid_dates=0,
                        other_issues=f"{int((p.date_fmt == 'DD/MM/YYYY').sum())} dates in DD/MM/YYYY among ISO dates; "
                                     f"harvested_ha blank for {int(p.harvested_ha.isna().sum())} open/growing blocks (expected)"))

    # ---------------- S3 sales
    s = query("""SELECT invoice_no, line_no, doc_type, invoice_date, customer_code, product_code, farm_code, quantity, uom,
                        unit_price, currency_code, discount_pct FROM stg.sales_raw""")
    key_dups = s.duplicated(subset=["invoice_no", "line_no"]).sum()
    prod_ok = s.product_code.str.match(r"^[A-Z]{3}-[A-Z0-9]+-[A-Z0-9]+$").fillna(False)
    md_products = set(query("SELECT product_code FROM stg.md_products_raw").product_code)
    md_customers = set(query("SELECT customer_code FROM stg.md_customers_raw WHERE extract_name='main'").customer_code)
    merge_codes = set(query("SELECT duplicate_code FROM stg.md_customer_merge_raw").duplicate_code)
    s["price"] = pd.to_numeric(s.unit_price, errors="coerce")
    s["qty"] = pd.to_numeric(s.quantity, errors="coerce")
    unknown_cust = (~s.customer_code.isin(md_customers) & ~s.customer_code.isin(merge_codes)).sum()
    summary.append(dict(source="S3 ERP sales invoice lines (6 gz CSV)", rows=len(s), columns=17,
                        exact_duplicates=int(key_dups), missing_qty=int(s.qty.isna().sum()), invalid_dates=0,
                        other_issues=f"{int((~prod_ok).sum())} product-code variants; {int(s.farm_code.isna().sum())} blank farm codes; "
                                     f"{int(s.currency_code.isna().sum())} blank currencies; {int(s.customer_code.isin(merge_codes).sum())} lines on duplicate customer codes; "
                                     f"{int(unknown_cust)} lines for customers missing from master data"))
    # price outliers by product (IQR on log price-per-sales-uom within product)
    s["lp"] = np.log(s.price.where(s.price > 0))
    s["pnorm"] = s.product_code.str.upper().str.replace(r"[^A-Z0-9]", "", regex=True)
    g = s.groupby("pnorm").lp
    iqr = g.transform(lambda x: x.quantile(0.75) - x.quantile(0.25))
    upper = g.transform(lambda x: x.quantile(0.75)) + 3 * iqr
    price_outliers = int((s.lp > upper).sum())

    # ---------------- S4 stock
    st = query("SELECT * FROM stg.stock_raw")
    cl = pd.to_numeric(st.closing_kg, errors="coerce")
    summary.append(dict(source="S4 Stock system (monthly)", rows=len(st), columns=10,
                        exact_duplicates=int(st.duplicated(subset=["farm_code", "product_code", "period"]).sum()),
                        missing_qty=int(cl.isna().sum()), invalid_dates=0,
                        other_issues=f"{int((cl < 0).sum())} negative closing balances; gaps in monthly series detected by continuity check"))

    # ---------------- S5 cost ledger
    c = query("SELECT posting_id, posting_date, cost_category, crop_code, amount_nad, cost_centre FROM stg.cost_ledger_raw")
    fmt_amt = (~c.amount_nad.str.match(r"^-?\d+(\.\d+)?$")).sum()
    summary.append(dict(source="S5 Cost ledger (gz CSV)", rows=len(c), columns=12,
                        exact_duplicates=int(c.duplicated(subset=["posting_id"]).sum()), missing_qty=0, invalid_dates=0,
                        other_issues=f"{c.cost_category.nunique()} category spellings for 14 categories; {int(fmt_amt)} amounts with N$ / thousands separators; "
                                     f"{int(c.cost_centre.str.endswith('/UNALLOCATED').sum())} crop-specific postings without crop"))

    # ---------------- S2 master data
    cu = query("SELECT * FROM stg.md_customers_raw WHERE extract_name='main'")
    regions = set(query("SELECT region_name FROM stg.md_regions_raw").region_name)
    nonstd = (~cu.region.fillna("").isin(regions | {""})).sum()
    caps = (cu.customer_name == cu.customer_name.str.upper()).sum()
    ws = (cu.customer_name != cu.customer_name.str.strip()).sum()
    norm = cu.customer_name.str.upper().str.replace(r"[^A-Z0-9]", "", regex=True).str.replace("PTYLTD", "")
    fuzzy_dups = int(norm.duplicated(keep=False).sum() // 2)
    summary.append(dict(source="S2 Master data workbook (10 sheets)", rows=len(cu), columns=12, exact_duplicates=fuzzy_dups,
                        missing_qty=int((cu.region.isna() & (cu.country_code == "NA")).sum()), invalid_dates=0,
                        other_issues=f"{int(nonstd)} non-standard region spellings; {int(caps)} ALL-CAPS and {int(ws)} padded names; "
                                     f"{fuzzy_dups} probable duplicate customers (name match); 1 product without net weight"))

    # ---------------- external
    w = query("""SELECT farm_code, count(*) FILTER (WHERE e.value::numeric = -999) AS fill_values, count(*) AS values_total
                 FROM stg.weather_json_raw, jsonb_each(payload->'properties'->'parameter') prm, jsonb_each_text(prm.value) e GROUP BY 1""")
    summary.append(dict(source="S6 NASA POWER weather (14 JSON)", rows=int(w.values_total.sum()), columns=5,
                        exact_duplicates=0, missing_qty=int(w.fill_values.sum()), invalid_dates=0,
                        other_issues="-999 fill values (incl. last 3 days = data latency)"))
    ps = query("SELECT * FROM stg.pink_sheet_raw")
    summary.append(dict(source="S7 World Bank Pink Sheet (xlsx)", rows=len(ps), columns=6, exact_duplicates=0,
                        missing_qty=int((ps.value_txt == "…").sum()), invalid_dates=0,
                        other_issues="wide sheet with 3 title rows; '…' missing markers; header text with trailing blanks ('Urea ')"))
    fr = query("SELECT * FROM stg.fred_raw")
    summary.append(dict(source="S8 FRED FX (3 CSV)", rows=len(fr), columns=2, exact_duplicates=0,
                        missing_qty=int(fr.value_txt.isna().sum()), invalid_dates=0, other_issues="blank values on US holidays; daily -> monthly"))
    ne = query("SELECT * FROM stg.crop_estimate_raw")
    summary.append(dict(source="S9 NSA / MAFWLR crop estimates (CSV)", rows=len(ne), columns=9, exact_duplicates=0,
                        missing_qty=int((ne.yield_t_per_ha == "n/a").sum()), invalid_dates=0,
                        other_issues=f"{int(ne.region.isin(['Kavango-East', 'Kavango-West', 'Karas']).sum())} rows with non-standard region names; "
                                     f"{int((ne.crop == 'Sorghum').sum())} rows for a crop outside scope; numbers with thousands separators"))

    df = pd.DataFrame(summary)
    df.columns = ["Source", "Rows", "Cols", "Duplicates", "Missing key values", "Invalid dates", "Other issues found"]
    (EVIDENCE / "profile_summary.md").write_text(md_table(df))

    # numeric distribution of key measures (raw, before cleansing)
    harvest_kg = query("""SELECT template_code, CASE template_code WHEN 'B' THEN replace(replace(qty_txt, '.', ''), ',', '.')
                          ELSE qty_txt END AS q, unit_txt FROM stg.harvest_log_raw""")
    harvest_kg["v"] = pd.to_numeric(harvest_kg.q, errors="coerce")
    rows = []
    for name, ser in (("Harvest qty, template A (kg)", harvest_kg[harvest_kg.template_code == "A"].v),
                      ("Harvest qty, template B (t)", harvest_kg[harvest_kg.template_code == "B"].v),
                      ("Sales quantity (sales UoM)", s.qty), ("Sales unit price (txn ccy)", s.price),
                      ("Cost amount (N$, parsed)", pd.to_numeric(c.amount_nad.str.replace(r"[N$,\s]", "", regex=True), errors="coerce"))):
        x = ser.dropna()
        q1, q3 = x.quantile(0.25), x.quantile(0.75)
        rows.append(dict(measure=name, n=len(x), minimum=x.min(), p25=q1, median=x.median(), p75=q3, maximum=x.max(),
                         beyond_3iqr=int(((x > q3 + 3 * (q3 - q1)) | (x < q1 - 3 * (q3 - q1))).sum())))
    (EVIDENCE / "profile_numeric.md").write_text(md_table(pd.DataFrame(rows)) +
                                                 f"\nUnit-price outliers (> Q3 + 3 IQR of log price within product): {price_outliers}\n")
    print(df.to_string(index=False))
    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
