#!/usr/bin/env python3
"""
performance_benchmark.py - baseline vs optimised measurements (ABI820S 3.7).

A. Warehouse query latency: 6 representative dashboard / refresh queries, median of 7 timed runs
   (EXPLAIN ANALYZE execution time) WITHOUT and WITH the objects in 02_sql/13_optimisation.sql.
B. Import-model size proxy: the naive model (import every dw column) vs the optimised model (mart views)
   loaded into DuckDB, whose dictionary + bit-packing columnar compression is the closest Linux-runnable
   analogue of VertiPaq; per-column compressed bytes from PRAGMA storage_info, plus column cardinalities.
C. Refresh-extract proxy: wall time and bytes to stream each import set out of PostgreSQL.
D. Incremental refresh: rows and time for a 10-day refresh partition vs a full fact_sales refresh.
Power BI-side timings (Performance Analyzer, VertiPaq Analyzer) must be captured in Power BI Desktop by
the team - this script measures only what can be measured outside Power BI.
"""
from __future__ import annotations

import io
import re
import statistics
import time

import duckdb
import pandas as pd
import psycopg

from common import DSN, EVIDENCE, INK2, ROOT, SERIES, md_table, save, setup_style, subtitle

QUERIES = {
    "Q1 Monthly revenue by crop category, FY2026": """
        SELECT d.year_month, cc.category_name, sum(f.net_revenue_nad)
        FROM dw.fact_sales f JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
        JOIN dw.dim_product p ON p.product_key = f.product_key JOIN dw.dim_crop c ON c.crop_key = p.crop_key
        JOIN dw.dim_crop_category cc ON cc.crop_category_key = c.crop_category_key
        WHERE f.invoice_date_key BETWEEN 20250401 AND 20260331 GROUP BY 1, 2""",
    "Q2 Revenue by zone x channel, one month (slicer)": """
        SELECT r.zone_name, cu.channel, sum(f.net_revenue_nad)
        FROM dw.fact_sales f JOIN dw.dim_farm fa ON fa.farm_key = f.farm_key JOIN dw.dim_region r ON r.region_key = fa.region_key
        JOIN dw.dim_customer cu ON cu.customer_key = f.customer_key
        WHERE f.invoice_date_key BETWEEN 20260601 AND 20260630 GROUP BY 1, 2""",
    "Q3 Top-10 customers, last 90 days": """
        SELECT cu.customer_name, sum(f.net_revenue_nad) AS rev
        FROM dw.fact_sales f JOIN dw.dim_customer cu ON cu.customer_key = f.customer_key
        WHERE f.invoice_date_key >= 20260702 GROUP BY 1 ORDER BY rev DESC LIMIT 10""",
    "Q4 Customer drill-through (one customer, one quarter)": """
        SELECT f.invoice_date_key, f.net_revenue_nad, f.quantity_kg
        FROM dw.fact_sales f WHERE f.customer_key = (SELECT customer_key FROM dw.dim_customer WHERE customer_code = 'C00042' AND scd_is_current)
          AND f.invoice_date_key BETWEEN 20260101 AND 20260331""",
    "Q5 Incremental-refresh partition (last 10 days)": """
        SELECT * FROM mart.fact_sales WHERE invoice_date_key BETWEEN 20260921 AND 20260930""",
    "Q6 Monthly revenue by channel (aggregation table vs detail)": """
        SELECT a.month_date_key, a.channel, sum(a.net_revenue_nad) FROM mart.agg_sales_monthly a GROUP BY 1, 2""",
}
Q6_BASELINE = """
        SELECT to_char(d.month_end_date, 'YYYYMMDD')::int, cu.channel, sum(f.net_revenue_nad)
        FROM dw.fact_sales f JOIN dw.dim_date d ON d.date_key = f.invoice_date_key
        JOIN dw.dim_customer cu ON cu.customer_key = f.customer_key GROUP BY 1, 2"""

OPT_OBJECTS = ["ix_fact_sales_customer", "ix_fact_sales_product", "ix_fact_sales_farm", "brin_fact_sales_invoice_date",
               "ix_fact_sales_customer_date", "ix_fact_harvest_date", "ix_fact_harvest_farm_crop", "ix_fact_cost_date",
               "ix_fact_cost_farm_crop", "ix_fact_cycle_farm_crop", "ix_dim_customer_code_range", "ix_dim_farm_code_range"]


def time_query(conn, sql: str, runs: int = 7) -> tuple[float, str]:
    conn.execute(sql)  # warm-up
    times, plan = [], ""
    for _ in range(runs):
        rows = conn.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) " + sql).fetchall()
        txt = "\n".join(r[0] for r in rows)
        times.append(float(re.search(r"Execution Time: ([\d.]+) ms", txt).group(1)))
        plan = txt
    found = re.findall(r"(Parallel Seq Scan|Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan)(?: using \w+)? on (\w+)", plan)
    scan = "; ".join(sorted({f"{a} on {b}" for a, b in found if b in ("fact_sales", "agg_sales_monthly")}))
    return statistics.median(times), scan


def drop_optimisation(conn):
    for ix in OPT_OBJECTS:
        conn.execute(f"DROP INDEX IF EXISTS dw.{ix}")
    conn.execute("DROP MATERIALIZED VIEW IF EXISTS mart.agg_sales_monthly")
    conn.execute("ANALYZE dw.fact_sales")


def part_a(conn) -> pd.DataFrame:
    drop_optimisation(conn)
    base = {}
    for name, sql in QUERIES.items():
        base[name] = time_query(conn, Q6_BASELINE if name.startswith("Q6") else sql)
    conn.execute((ROOT / "02_sql" / "13_optimisation.sql").read_text())
    rows = []
    for name, sql in QUERIES.items():
        opt = time_query(conn, sql)
        rows.append(dict(query=name, baseline_ms=base[name][0], optimised_ms=opt[0], speedup_x=base[name][0] / opt[0],
                         baseline_access=base[name][1], optimised_access=opt[1]))
    return pd.DataFrame(rows)


NAIVE = {  # importing the warehouse tables as-is (every column)
    "fact_sales": "SELECT * FROM dw.fact_sales", "fact_harvest": "SELECT * FROM dw.fact_harvest",
    "fact_crop_cycle": "SELECT * FROM dw.fact_crop_cycle", "fact_production_cost": "SELECT * FROM dw.fact_production_cost",
    "fact_inventory_monthly": "SELECT * FROM dw.fact_inventory_monthly", "fact_weather_daily": "SELECT * FROM dw.fact_weather_daily",
    "fact_market_price_monthly": "SELECT * FROM dw.fact_market_price_monthly", "fact_crop_estimate": "SELECT * FROM dw.fact_crop_estimate",
    "dim_date": "SELECT * FROM dw.dim_date", "dim_customer": "SELECT * FROM dw.dim_customer", "dim_farm": "SELECT * FROM dw.dim_farm",
    "dim_product": "SELECT * FROM dw.dim_product", "dim_crop": "SELECT * FROM dw.dim_crop", "dim_region": "SELECT * FROM dw.dim_region",
}
OPTIMISED = {k: v.replace("dw.", "mart.") for k, v in NAIVE.items()}


def load_set(conn, queries: dict, path) -> tuple[pd.DataFrame, float, int]:
    db = duckdb.connect(str(path))
    t0, nbytes = time.time(), 0
    for name, sql in queries.items():
        buf = io.BytesIO()
        with conn.cursor().copy(f"COPY ({sql}) TO STDOUT WITH (FORMAT csv, HEADER true)") as cp:
            for chunk in cp:
                buf.write(chunk)
        nbytes += buf.tell()
        buf.seek(0)
        df = pd.read_csv(buf, low_memory=False)
        for c in df.columns:  # restore native types so the columnar store compresses them as Power BI would
            if df[c].dtype == object and c.endswith(("_at", "_date", "date_from", "date_to", "_from", "_to")):
                df[c] = pd.to_datetime(df[c], errors="coerce", utc=True)
            elif df[c].dtype == object and set(df[c].dropna().unique()) <= {"t", "f"}:
                df[c] = df[c].map({"t": True, "f": False})
        db.register("tmp_df", df)
        db.execute(f"CREATE OR REPLACE TABLE {name} AS SELECT * FROM tmp_df")
        db.unregister("tmp_df")
    elapsed = time.time() - t0
    db.execute("CHECKPOINT")
    db.close()
    return None, elapsed, nbytes


def column_sizes(path) -> pd.DataFrame:
    db = duckdb.connect(str(path), read_only=True)
    out = []
    for t in db.execute("SELECT table_name FROM duckdb_tables()").fetchall():
        t = t[0]
        cols = db.execute(f"SELECT column_name FROM duckdb_columns() WHERE table_name = '{t}'").fetchall()
        n = db.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        for (c,) in cols:
            card = db.execute(f'SELECT approx_count_distinct("{c}") FROM {t}').fetchone()[0]
            out.append(dict(table=t, column=c, rows=n, cardinality=card))
    db.close()
    return pd.DataFrame(out)


def main():
    setup_style()
    conn = psycopg.connect(DSN, autocommit=True)
    a = part_a(conn)
    (EVIDENCE / "perf_queries.md").write_text(md_table(a.round(2)))
    print(a.round(2).to_string(index=False))

    tmp = ROOT / "03_analytics" / "outputs"
    naive_path, opt_path = tmp / "model_naive.duckdb", tmp / "model_optimised.duckdb"
    for pth in (naive_path, opt_path):
        if pth.exists():
            pth.unlink()
    _, t_naive, b_naive = load_set(conn, NAIVE, naive_path)
    _, t_opt, b_opt = load_set(conn, OPTIMISED, opt_path)
    size_naive, size_opt = naive_path.stat().st_size, opt_path.stat().st_size
    cs_naive, cs_opt = column_sizes(naive_path), column_sizes(opt_path)
    fs_n = cs_naive[cs_naive.table == "fact_sales"].sort_values("cardinality", ascending=False)
    fs_o = cs_opt[cs_opt.table == "fact_sales"].sort_values("cardinality", ascending=False)

    # D. incremental refresh
    t0 = time.time()
    full = conn.execute("SELECT count(*) FROM (SELECT * FROM mart.fact_sales) x").fetchone()[0]
    t_full = time.time() - t0
    t0 = time.time()
    inc = conn.execute("SELECT count(*) FROM (SELECT * FROM mart.fact_sales WHERE invoice_date_key BETWEEN 20260921 AND 20260930) x").fetchone()[0]
    t_inc = time.time() - t0
    summary = pd.DataFrame([
        dict(metric="Columns imported (14 tables)", naive=int(len(cs_naive)), optimised=int(len(cs_opt))),
        dict(metric="fact_sales columns", naive=int(len(fs_n)), optimised=int(len(fs_o))),
        dict(metric="Columnar store size, all tables (MB, DuckDB proxy)", naive=round(size_naive / 2**20, 2), optimised=round(size_opt / 2**20, 2)),
        dict(metric="Bytes streamed from PostgreSQL at refresh (MB)", naive=round(b_naive / 2**20, 1), optimised=round(b_opt / 2**20, 1)),
        dict(metric="Extract + load wall time (s)", naive=round(t_naive, 2), optimised=round(t_opt, 2)),
        dict(metric="Highest-cardinality fact_sales column", naive=f"{fs_n.iloc[0].column} ({fs_n.iloc[0].cardinality:,})",
             optimised=f"{fs_o.iloc[0].column} ({fs_o.iloc[0].cardinality:,})"),
        dict(metric="Rows refreshed: full vs incremental (10-day partition)", naive=int(full), optimised=int(inc)),
        dict(metric="Refresh query time: full vs incremental (s)", naive=round(t_full, 3), optimised=round(t_inc, 3)),
    ])
    (EVIDENCE / "perf_model.md").write_text(md_table(summary) + "\nfact_sales columns by cardinality - naive import:\n\n" +
                                            md_table(fs_n[["column", "cardinality"]]) + "\noptimised import (mart.fact_sales):\n\n" +
                                            md_table(fs_o[["column", "cardinality"]]))
    print(summary.to_string(index=False))

    import matplotlib.pyplot as plt
    import numpy as np
    fig, ax = plt.subplots(figsize=(8.6, 3.6))
    labels = [q.split(" ", 1)[0] for q in a["query"]]
    x = np.arange(len(labels))
    ax.bar(x - 0.14, a.baseline_ms, width=0.26, color=SERIES[1], label="Baseline (PK/unique only)")
    ax.bar(x + 0.14, a.optimised_ms, width=0.26, color=SERIES[0], label="Optimised (13_optimisation.sql)")
    for xi, b, o in zip(x, a.baseline_ms, a.optimised_ms):
        ax.text(xi + 0.14, o * 1.15, f"{b / o:.0f}x", ha="center", fontsize=8, color=INK2)
    ax.set_yscale("log")
    ax.set_xticks(x, labels)
    ax.set_ylabel("median execution time (ms, log scale)")
    ax.set_title("Warehouse query latency before and after optimisation")
    subtitle(ax, "PostgreSQL 16, 302,903-row fact_sales, median of 7 runs; label = speed-up")
    ax.legend(loc="upper left", bbox_to_anchor=(0, -0.1), ncol=2)
    save(fig, "fig_perf_queries.png")


if __name__ == "__main__":
    main()
