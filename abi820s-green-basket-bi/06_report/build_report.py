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

OUT_PDF = HERE / "GreenBasket_ABI820S_Final_Report.pdf"


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
    out = ["| Role | Table filtered | DAX filter expression | Purpose |", "|---|---|---|---|"]
    for name, table, expr, desc in S.ROLES:
        e = "(none - unrestricted)" if not expr else "<code>" + expr.replace("\n", " ").replace("|", "&#124;") + "</code>"
        out.append(f"| {name} | {table or '-'} | {re.sub(' +', ' ', e)} | {desc} |")
    return "\n".join(out) + "\n"


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
    return re.sub(r"<!--\s*(include|code|dax-all|dax|relationships|roles|figure|table|mermaidfig)\s*:?\s*(.*?)\s*-->", repl, md)


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
         "--highlight-style", "tango", "--metadata", "pagetitle=Green Basket cc - ABI820S Final Report",
         "-o", BUILD / "report.html"])
    html = (BUILD / "report.html").read_text(encoding="utf-8")
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
    w.add_metadata({"/Title": "Green Basket cc - Agriculture Division: End-to-End BI and Analytics Solution",
                    "/Subject": "ABI820S Advanced Business Intelligence and Analytics - group project",
                    "/Author": "ABI820S Group (Green Basket BI consulting team)"})
    with open(OUT_PDF, "wb") as fh:
        w.write(fh)
    n = len(PdfReader(str(OUT_PDF)).pages)
    print(f"report: {OUT_PDF.name} ({n} pages, {OUT_PDF.stat().st_size / 1e6:.1f} MB); figures {c.fig}, tables {c.tab}")
    missing = re.findall(r'<span class="t">(.*?)</span><span class="pg"></span>', (BUILD / "report.html").read_text(), re.S)
    if missing:
        print(f"warning: {len(missing)} TOC entries without page numbers: {missing}")


if __name__ == "__main__":
    main()
