"""common.py - shared helpers for the 03_analytics scripts (DB access, chart style, output paths)."""
from __future__ import annotations

import os
from pathlib import Path

import matplotlib
import pandas as pd
import psycopg

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "06_report" / "figures"
EVIDENCE = ROOT / "06_report" / "evidence"
OUT = ROOT / "03_analytics" / "outputs"
for _p in (FIG, EVIDENCE, OUT):
    _p.mkdir(parents=True, exist_ok=True)

DSN = os.environ.get("GB_DSN", "postgresql://postgres:postgres@localhost:5432/green_basket_dw")

# Validated colour-blind-safe categorical order (dataviz reference palette, light mode)
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
SURFACE, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281"]
GRAY = "#b9b8b1"


def query(sql: str, params=None) -> pd.DataFrame:
    with psycopg.connect(DSN) as conn:
        cur = conn.execute(sql, params)
        return pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])


def execute(sql: str, rows=None):
    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            if rows is None:
                cur.execute(sql)
            else:
                cur.executemany(sql, rows)
        conn.commit()


def setup_style():
    family = "Inter" if any("Inter" in f.name for f in font_manager.fontManager.ttflist) else "DejaVu Sans"
    plt.rcParams.update({
        "font.family": family, "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "semibold",
        "axes.titlelocation": "left", "axes.labelcolor": INK2, "axes.edgecolor": AXIS, "axes.linewidth": 1,
        "axes.facecolor": SURFACE, "figure.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.grid": True, "axes.grid.axis": "y", "grid.color": GRID, "grid.linewidth": 0.8, "grid.linestyle": "-",
        "axes.spines.top": False, "axes.spines.right": False, "axes.spines.left": False,
        "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelcolor": INK2, "ytick.labelcolor": INK2,
        "text.color": INK, "legend.frameon": False, "legend.fontsize": 9, "lines.linewidth": 2,
        "lines.solid_capstyle": "round", "lines.solid_joinstyle": "round", "figure.dpi": 110, "savefig.dpi": 200,
    })


def subtitle(ax, text: str):
    title = ax.get_title(loc="left")
    if title:  # lift the title so the subtitle fits between it and the plot area
        ax.set_title(title, loc="left", pad=20)
    ax.text(0, 1.015, text, transform=ax.transAxes, fontsize=9, color=INK2, va="bottom")


def save(fig, name: str):
    path = FIG / name
    fig.savefig(path, bbox_inches="tight", pad_inches=0.15)
    plt.close(fig)
    return path


def md_table(df: pd.DataFrame, floatfmt: str = "{:,.2f}") -> str:
    cols = list(df.columns)
    out = ["| " + " | ".join(str(c) for c in cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for r in df.astype(object).itertuples(index=False):  # astype(object): ints stay ints (iterrows would upcast rows)
        cells = []
        for v in r:
            if isinstance(v, float):
                cells.append("" if pd.isna(v) else floatfmt.format(v))
            else:
                cells.append(str(v))
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out) + "\n"
