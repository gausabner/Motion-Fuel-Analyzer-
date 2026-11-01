#!/usr/bin/env python3
"""
build_report.py - assembles the final report PDF from 06_report/src/*.md.

Every number, table and code listing in the report is pulled from the project files at build time, so the
PDF cannot drift from the code and the warehouse evidence:
  <!-- include: evidence/ev_recon.md -->                      paste a generated evidence table
  <!-- code: 02_sql/05_etl_transform.sql | from=REGEX | to=REGEX | lang=sql -->   verbatim excerpt of a script
  <!-- dax: Net Revenue; Net Revenue FYTD -->                  DAX of named measures (from 04_powerbi/model_spec.py)
  <!-- dax-all -->  <!-- relationships -->  <!-- roles -->     model listings
  <!-- figure: figures/x.png | caption | width=90% -->         numbered figure
  <!-- table: caption -->                                      numbered table caption
  ```mermaid name=arch caption="..."                          diagram rendered to PNG by headless Chromium

Pipeline: markdown -> pandoc (HTML5 + TOC) -> Chromium PDF (pass 1) -> page numbers read from the PDF outline
-> TOC page numbers injected -> Chromium PDF (pass 2) -> title page merged in front (no footer).
Requirements: pandoc 3, Node 18+ with playwright, mermaid 10 (npm i mermaid@10.9.1), pypdf.
Usage: python build_report.py [--mermaid-js node_modules/mermaid/dist/mermaid.min.js]
"""
from __future__ import annotations

import argparse
import html as html_lib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BUILD = HERE / "build"
FIG = HERE / "figures"
DIAG = HERE / "diagrams"
sys.path.insert(0, str(ROOT / "04_powerbi"))
import model_spec as S  # noqa: E402

OUT_PDF = HERE / "GBHS_ABI820S_Final_Report.pdf"


class Counter:
    def __init__(self):
        self.fig = 0
        self.tab = 0


def expand_code(spec: str) -> str:
    parts = [p.strip() for p in spec.split("|")]
    rel, opts = parts[0], dict(p.split("=", 1) for p in parts[1:])
    lines = (ROOT / rel).read_text(encoding="utf-8").splitlines()
    start = 0
    if "from" in opts:
        start = next(i for i, l in enumerate(lines) if re.search(opts["from"], l))
    end = len(lines) - 1
    if "to" in opts:
        end = next(i for i in range(start + 1, len(lines)) if re.search(opts["to"], lines[i]))
    if "lines" in opts:
        a, b = (int(x) for x in opts["lines"].split("-"))
        start, end = a - 1, b - 1
    body = "\n".join(lines[start:end + 1]).rstrip()
    lang = opts.get("lang", "")
    return f"<p class=\"codecap\">File: <code>{rel}</code> (lines {start + 1}&ndash;{end + 1})</p>\n\n```{lang}\n{body}\n```\n"


def measure_lookup() -> dict:
    return {m[0]: m for m in S.MEASURES}


def dax_block(names: list[str]) -> str:
    lut = measure_lookup()
    chunks = []
    for n in names:
        m = lut[n]
        chunks.append(f"-- Display folder: {m[1]} | Format: {m[2] or 'text'}\n-- {m[3]}\n{m[0]} =\n{indent(m[4])}")
    return "<p class=\"codecap\">File: <code>04_powerbi/measures.dax</code> (generated from <code>model_spec.py</code>)</p>\n\n```dax\n" + "\n\n".join(chunks) + "\n```\n"


def indent(expr: str) -> str:
    return "\n".join("    " + l for l in expr.splitlines())


def dax_all() -> str:
    out, folder = [], None
    for m in sorted(S.MEASURES, key=lambda x: x[1]):
        if m[1] != folder:
            if folder is not None:
                out.append("```\n")
            folder = m[1]
            out.append(f"\n#### Folder {folder}\n\n```dax")
        out.append(f"-- {m[3]}\n{m[0]} =\n{indent(m[4])}\n")
    out.append("```\n")
    return "\n".join(out)


def relationships() -> str:
    rows = ["| # | From (many side) | To (one side) | Cardinality | Cross-filter | Active |", "|---|---|---|---|---|---|"]
    for i, (ft, fc, tt, tc, act) in enumerate(S.RELATIONSHIPS, 1):
        rows.append(f"| {i} | {ft}[{fc}] | {tt}[{tc}] | many-to-one | single | {'yes' if act else 'no (USERELATIONSHIP)'} |")
    return "\n".join(rows) + "\n"


def roles() -> str:
    out = ["| Role | Row-level filters (RLS, DAX) | Object-level security (OLS) | Purpose |", "|---|---|---|---|"]
    for name, desc, filters, ols in S.ROLES:
        f = "<br/>".join(f"<b>{t}</b>: <code>" + re.sub(" +", " ", e.replace("\n", " ")).replace("|", "&#124;") + "</code>"
                         for t, e in filters.items()) or "(none - unrestricted rows)"
        o = ", ".join(ols) + " hidden (metadataPermission = none)" if ols else "-"
        out.append(f"| {name} | {f} | {o} | {desc} |")
    return "\n".join(out) + "\n"


PURPOSE = {
    "run_all.py": "Rebuilds everything in dependency order: generate, ELT, analytics, evidence, mock-ups, PBIP, backup",
    "01_data/generate_synthetic_data.py": "Seeded generator of all synthetic sources, the day-2 delta, the manifest and the DQ ground truth",
    "01_data/fetch_public_data.py": "Downloads the real NASA POWER files; checks the NSA regional totals",
    "01_data/build_dataset_guide.py": "Writes the dataset guide (01_data/README.md) and the Excel overview of every source and clean table",
    "02_sql/00_create_database.sql": "Database and least-privilege login roles",
    "02_sql/01_ddl_schemas_audit.sql": "Schemas, audit tables (batches, steps, DQ issues, reconciliation), 44-rule DQ catalogue",
    "02_sql/02_ddl_staging_ref.sql": "Landing (text) and clean (typed) staging tables; reference and alias tables",
    "02_sql/03_ddl_warehouse.sql": "13 dimensions and 8 facts with constraints and a documented comment on every column; RLS mapping",
    "02_sql/04_etl_functions.sql": "Parsing and standardisation functions, holidays, SCD look-ups, batch and step logging",
    "02_sql/05_etl_transform.sql": "Transform procedures per source: DQ rules, issue logging, merge into clean staging",
    "02_sql/06_etl_load_dimensions.sql": "Dimension loads: date, static, Type 1, SCD2 (care unit, patient), inferred members",
    "02_sql/07_etl_load_facts.sql": "Fact loads (as-was key look-ups, accumulating snapshot upsert) and the sp_run_load orchestrator",
    "02_sql/08_reconciliation.sql": "22 reconciliation checks (row counts, control totals, cross-source, integrity, completeness)",
    "02_sql/09_mart_views.sql": "Power BI presentation views (minimised columns), DQ and reconciliation views, RLS mapping view",
    "02_sql/10_security_grants.sql": "Least-privilege grants per schema",
    "02_sql/11_olap_queries.sql": "OLAP operations: roll-up, drill-down, slice, dice, pivot, drill-across, semi-additive",
    "02_sql/12_evidence_queries.sql": "Named evidence queries captured into the report (load evidence, SCD2, KPIs)",
    "02_sql/13_optimisation.sql": "B-tree and BRIN indexes, aggregate materialised view",
    "02_sql/run_pipeline.py": "Extract and land files, call the load and reconciliation per batch (full + day-2 delta)",
    "03_analytics/build_data_dictionary.py": "Data dictionary from the catalogue; column descriptions for the semantic model",
    "03_analytics/capture_sql_evidence.py": "Runs the named SQL queries and writes the Markdown evidence tables",
    "03_analytics/common.py": "Shared helpers: database access, chart style, output paths",
    "03_analytics/data_profiling.py": "Profiling of the raw landed sources before cleansing",
    "03_analytics/ed_wait_drivers.py": "Technique 4: drivers of ED waiting time (OLS with HC3, gradient boosting, permutation importance)",
    "03_analytics/forecasting.py": "Technique 1: weekly malaria forecasting with rolling-origin back-test",
    "03_analytics/outbreak_detection.py": "Technique 3: outbreak detection (EARS C2, CUSUM, historical limits) against injected outbreaks",
    "03_analytics/performance_benchmark.py": "Baseline vs optimised query latency, model-size proxy, incremental refresh",
    "03_analytics/readmission_model.py": "Technique 2: 30-day readmission risk (logistic regression, gradient boosting), calibration, fairness",
    "03_analytics/validate_dq_rules.py": "Scores the DQ rules against the generator's ground truth (precision, recall)",
    "04_powerbi/build_pbip.py": "Generates and validates the PBIP (TMDL via TOM, PBIR via JSON schemas), measures.dax, theme",
    "04_powerbi/expected_values.py": "SQL mirror of the DAX: expected card values and the RLS test matrix",
    "04_powerbi/export_fallbacks.py": "CSV export of the mart views and the single-file TMDL script (fallbacks)",
    "04_powerbi/model_spec.py": "Declarative semantic model: tables, relationships, 108 measures, roles, parameters",
    "06_report/build_mockups.py": "Design mock-ups of the report pages rendered from the warehouse",
    "06_report/build_report.py": "Builds this PDF from Markdown sources, evidence tables, code excerpts and Mermaid diagrams",
    "06_report/tools/render.js": "Headless Chromium: Mermaid to PNG/SVG and HTML to PDF",
    "07_presentation/build_presentation.js": "Builds the PowerPoint deck with native charts and speaker notes",
    "07_presentation/deck_data.py": "Extracts the deck's chart data from the warehouse",
}


def inventory() -> str:
    """Appendix C: every submitted script with its size and purpose (PURPOSE, else the header comment / docstring)."""
    rows = ["| File | Lines | Purpose |", "|---|---:|---|"]
    pats = ["*.py", "01_data/*.py", "02_sql/*.sql", "02_sql/*.py", "03_analytics/*.py", "04_powerbi/*.py", "06_report/*.py",
            "06_report/tools/*.js", "07_presentation/*.js", "07_presentation/*.py"]
    for pat in pats:
        for f in sorted(ROOT.glob(pat)):
            text = f.read_text(encoding="utf-8", errors="replace").splitlines()
            purpose = ""
            for line in text[:25]:
                t = line.strip().strip('"').strip("#").strip("-").strip("/").strip()
                if t and not t.startswith(("!", "=", "usr/bin", "coding")) and " - " in t:
                    purpose = t.split(" - ", 1)[1]
                    break
                if t and f.suffix == ".sql" and not t.startswith(("=", "Target", "Green Basket")) and not t.endswith(".sql"):
                    purpose = t
                    break
            purpose = PURPOSE.get(str(f.relative_to(ROOT)), purpose)
            rows.append(f"| `{f.relative_to(ROOT)}` | {len(text):,} | {purpose.replace('|', '/')} |")
    return "\n".join(rows) + "\n"


def include(spec: str) -> str:
    parts = [p.strip() for p in spec.split("|")]
    text = (HERE / parts[0]).read_text(encoding="utf-8").strip()
    for p in parts[1:]:
        if p.startswith("head="):  # keep the header row, the separator and n data rows of the first table
            n = int(p[5:])
            ls = text.splitlines()
            start = next(i for i, l in enumerate(ls) if l.startswith("|"))
            text = "\n".join(ls[: start + n + 2])
        elif p.startswith("drop="):  # drop the first n lines (e.g. the file's own title)
            text = "\n".join(text.splitlines()[int(p[5:]):]).strip()
        elif p.startswith("shift="):  # demote headings by n levels
            k = int(p[6:])
            text = re.sub(r"^(#+) ", lambda m: "#" * (len(m.group(1)) + k) + " ", text, flags=re.M)
    return text + "\n"


def figure(spec: str, c: Counter) -> str:
    parts = [p.strip() for p in spec.split("|")]
    path, cap = parts[0], parts[1]
    width = next((p[6:] for p in parts[2:] if p.startswith("width=")), "100%")
    c.fig += 1
    alt = html_lib.escape(re.sub(r"<[^>]+>", "", cap), quote=True)
    if width == "rotate":  # wide diagram: own page, turned 90 degrees to use the page height
        return (f'<figure class="rot"><div class="rotwrap"><img src="../{path}" alt="{alt}"/></div>'
                f'<figcaption><b>Figure {c.fig}.</b> {cap}</figcaption></figure>\n')
    return (f'<figure style="width:{width}"><img src="../{path}" alt="{alt}"/>'
            f'<figcaption><b>Figure {c.fig}.</b> {cap}</figcaption></figure>\n')


MERMAID_RE = re.compile(r"^```mermaid\s+name=(\S+)\s+caption=\"([^\"]+)\"(?:\s+width=(\S+))?\s*\n(.*?)^```\s*$", re.S | re.M)


def extract_mermaid(md: str) -> tuple[str, list[tuple[str, str, str]]]:
    found = []

    def repl(m):
        name, cap, width, code = m.group(1), m.group(2), m.group(3) or "", m.group(4)
        (DIAG / f"{name}.mmd").write_text(code, encoding="utf-8")
        found.append((name, cap, width))
        return f"<!-- mermaidfig: {name} | {cap} | {width} -->"
    return MERMAID_RE.sub(repl, md), found


def assemble(c: Counter) -> str:
    md = "\n\n".join(p.read_text(encoding="utf-8") for p in sorted((HERE / "src").glob("*.md")))
    md, diagrams = extract_mermaid(md)
    return md, diagrams


def expand(md: str, c: Counter, sizes: dict) -> str:
    def repl(m):
        kind, arg = m.group(1).strip(), (m.group(2) or "").strip()
        if kind == "include":
            return include(arg)
        if kind == "code":
            return expand_code(arg)
        if kind == "dax":
            return dax_block([a.strip() for a in arg.split(";") if a.strip()])
        if kind == "dax-all":
            return dax_all()
        if kind == "relationships":
            return relationships()
        if kind == "roles":
            return roles()
        if kind == "inventory":
            return inventory()
        if kind == "figure":
            return figure(arg, c)
        if kind == "table":
            c.tab += 1
            return f'<p class="tcap"><b>Table {c.tab}.</b> {arg}</p>\n'
        if kind == "mermaidfig":
            name, cap, width = [p.strip() for p in arg.split("|")]
            natural = sizes.get(name, {}).get("w", 680)
            w = width if width else f"{min(100, round(100 * natural / 680))}%"
            return figure(f"diagrams/{name}.png | {cap} (Mermaid source: <code>06_report/diagrams/{name}.mmd</code>) | width={w}", c)
        return m.group(0)
    return re.sub(r"<!--\s*(include|code|dax-all|dax|relationships|roles|inventory|figure|table|mermaidfig)\s*:?\s*(.*?)\s*-->", repl, md)


def run(cmd, **kw):
    print(">>", " ".join(str(x) for x in cmd[:4]), "...")
    subprocess.run([str(x) for x in cmd], check=True, **kw)


def toc_pages(pdf: Path) -> dict[str, int]:
    r = PdfReader(str(pdf))
    out = {}

    def walk(items):
        for it in items:
            if isinstance(it, list):
                walk(it)
            else:
                t = norm(it.title)
                h = len(t) // 2
                if len(t) % 2 == 0 and t[:h] == t[h:]:  # Chromium repeats the text of some h1 outline entries
                    t = t[:h]
                out.setdefault(t, r.get_destination_page_number(it) + 1)
    walk(r.outline)
    return out


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", "", s))).strip().lower()


def inject_toc(html: str, pages: dict[str, int]) -> str:
    nav_start = html.index('<nav id="TOC"')
    nav_end = html.index("</nav>", nav_start)
    nav = html[nav_start:nav_end]

    def repl(m):
        title = norm(m.group(2))
        pg = pages.get(title, "")
        return f'<a href="{m.group(1)}"><span class="t">{m.group(2)}</span><span class="pg">{pg}</span></a>'
    nav = re.sub(r'<a\s+href="([^"]+)"[^>]*>(.*?)</a>', repl, nav, flags=re.S)
    return html[:nav_start] + nav + html[nav_end:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mermaid-js", default=os.environ.get("MERMAID_JS", "node_modules/mermaid/dist/mermaid.min.js"))
    args = ap.parse_args()
    BUILD.mkdir(exist_ok=True)
    DIAG.mkdir(exist_ok=True)
    c = Counter()
    md, diagrams = assemble(c)
    if diagrams:
        run(["node", HERE / "tools/render.js", "mermaid", args.mermaid_js, DIAG] + [DIAG / f"{d[0]}.mmd" for d in diagrams])
    sizes = json.loads((DIAG / "mermaid_sizes.json").read_text()) if (DIAG / "mermaid_sizes.json").exists() else {}
    md = expand(md, c, sizes)
    (BUILD / "report.md").write_text(md, encoding="utf-8")
    run(["pandoc", BUILD / "report.md", "-f", "markdown+pipe_tables+raw_html+fenced_divs+header_attributes-implicit_figures-tex_math_dollars-subscript-superscript",
         "-t", "html5", "--standalone", "--wrap=none", "--toc", "--toc-depth=2", "--template", HERE / "tools/template.html",
         "--highlight-style", "tango", "--metadata", "pagetitle=GBHS - ABI820S Final Report",
         "-o", BUILD / "report.html"])
    html = (BUILD / "report.html").read_text(encoding="utf-8")
    # pandoc gives every column of a long pipe table the same width; let the browser size columns by content instead
    html = re.sub(r"<colgroup>.*?</colgroup>", "", html, flags=re.S)
    # keep short tables (up to 14 rows) on one page
    html = re.sub(r"<table.*?</table>", lambda m: m.group(0).replace("<table", '<table style="break-inside: avoid"', 1)
                  if m.group(0).count("<tr") <= 14 else m.group(0), html, flags=re.S)
    title_html = (HERE / "tools/title.html").read_text(encoding="utf-8")
    (BUILD / "title.html").write_text(title_html, encoding="utf-8")
    run(["node", HERE / "tools/render.js", "pdf", BUILD / "report.html", BUILD / "body_pass1.pdf"])
    pages = toc_pages(BUILD / "body_pass1.pdf")
    (BUILD / "report.html").write_text(inject_toc(html, pages), encoding="utf-8")
    run(["node", HERE / "tools/render.js", "pdf", BUILD / "report.html", BUILD / "body.pdf"])
    run(["node", HERE / "tools/render.js", "pdf", BUILD / "title.html", BUILD / "title.pdf", "--no-footer"])
    w = PdfWriter()
    w.append(str(BUILD / "title.pdf"))
    w.append(str(BUILD / "body.pdf"), import_outline=True)
    w.add_metadata({"/Title": "Green Basket Health Services: End-to-End BI and Analytics for Patient Flow, Resource Utilisation and Disease Surveillance",
                    "/Subject": "ABI820S Advanced Business Intelligence and Analytics - group project (Health services domain)",
                    "/Author": "ABI820S Group (GBHS BI consulting team)"})
    with open(OUT_PDF, "wb") as fh:
        w.write(fh)
    n = len(PdfReader(str(OUT_PDF)).pages)
    print(f"report: {OUT_PDF.name} ({n} pages, {OUT_PDF.stat().st_size / 1e6:.1f} MB); figures {c.fig}, tables {c.tab}")
    missing = re.findall(r'<span class="t">(.*?)</span><span class="pg"></span>', (BUILD / "report.html").read_text(), re.S)
    if missing:
        print(f"warning: {len(missing)} TOC entries without page numbers: {missing}")


if __name__ == "__main__":
    main()
