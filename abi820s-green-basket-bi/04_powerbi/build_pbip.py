#!/usr/bin/env python3
"""
build_pbip.py - generates the Power BI Project (PBIP) for the Green Basket semantic model and report.

Outputs (04_powerbi/):
  GreenBasket_Agri.pbip                      open this in Power BI Desktop
  GreenBasket_Agri.SemanticModel/            definition.pbism + definition/ (TMDL, written by Microsoft's TOM serializer)
  GreenBasket_Agri.Report/                   definition.pbir + definition/ (PBIR JSON, validated against Microsoft's schemas)
  model.bim                                  the same model as TMSL JSON (for Tabular Editor / deployment)
  measures.dax                               every measure as a DAX script (documentation, copy-paste)
  theme/GreenBasket_Accessible.json          report theme (colour-blind-safe palette)

Validation performed by this script:
  1. TMSL -> Tabular Object Model (Microsoft.AnalysisServices 19.118) deserialisation: every table, column,
     relationship, sort-by column, hierarchy level and role reference is resolved; TMDL is then written by
     TmdlSerializer and parsed back (round trip).
  2. Every PBIR JSON file is validated against the official JSON schemas (github.com/microsoft/json-schemas).
  3. Every field referenced by a visual is checked to exist in the model.
DAX semantics cannot be validated outside the Analysis Services engine: open the PBIP and check the
measure list for errors (none expected).

Usage: python build_pbip.py [--tomtool <path to TomTool.dll>] [--schemas <schema root>]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import model_spec as S

HERE = Path(__file__).resolve().parent
NAME = "GreenBasket_Agri"
SM = HERE / f"{NAME}.SemanticModel"
RP = HERE / f"{NAME}.Report"
SCHEMA_BASE = "https://developer.microsoft.com/json-schemas/fabric"


# =============================================================================================== model
def m_expression(t: dict) -> str:
    typed = ", ".join(f'{{"{src}", {S.M_TYPE[dt]}}}' for (_n, src, dt, _o) in t["columns"])
    lines = [
        "let",
        "    // CSV fallback reader: gzip CSV exported by export_fallbacks.py; empty cells become null before typing",
        "    ReadCsv = (file as text) as table =>",
        "        let",
        '            Raw = Table.PromoteHeaders(Csv.Document(Binary.Decompress(File.Contents(CsvFolder & file), Compression.GZip), [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]), [PromoteAllScalars = true])',
        "        in",
        '            Table.ReplaceValue(Raw, "", null, Replacer.ReplaceValue, Table.ColumnNames(Raw)),',
        '    Source = if SourceMode = "CSV"',
        f'        then ReadCsv("{t["view"]}.csv.gz")',
        f'        else PostgreSQL.Database(PgServer, PgDatabase){{[Schema = "mart", Item = "{t["view"]}"]}}[Data],',
        f'    Typed = Table.TransformColumnTypes(Source, {{{typed}}}, "en-US")' + ("," if t.get("incremental") else ""),
    ]
    if t.get("incremental"):
        lines.append('    // incremental refresh window (RangeStart/RangeEnd folded to SQL as integer date keys)')
        lines.append('    Filtered = Table.SelectRows(Typed, each [invoice_date_key] >= Int64.From(DateTime.ToText(RangeStart, "yyyyMMdd"))'
                     ' and [invoice_date_key] < Int64.From(DateTime.ToText(RangeEnd, "yyyyMMdd")))')
        lines += ["in", "    Filtered"]
    else:
        lines += ["in", "    Typed"]
    return "\n".join(lines)


def column_json(name, src, dt, o) -> dict:
    c = {"name": name, "dataType": dt, "sourceColumn": src}
    if o.get("hidden"):
        c["isHidden"] = True
    if o.get("key"):
        c["isKey"] = True
    if o.get("fmt"):
        c["formatString"] = o["fmt"]
    elif dt == "dateTime":
        c["formatString"] = "dd mmm yyyy"
    if o.get("sortBy"):
        c["sortByColumn"] = o["sortBy"]
    if o.get("folder"):
        c["displayFolder"] = o["folder"]
    if o.get("cat"):
        c["dataCategory"] = o["cat"]
    if o.get("desc"):
        c["description"] = o["desc"]
    c["summarizeBy"] = o.get("summarize", "none")
    return c


def build_model() -> dict:
    tables = []
    for t in S.TABLES:
        tj = {"name": t["name"], "description": t.get("desc", ""),
              "columns": [column_json(*c) for c in t["columns"]],
              "partitions": [{"name": t["name"], "mode": "import", "source": {"type": "m", "expression": m_expression(t)}}]}
        if t.get("dataCategory"):
            tj["dataCategory"] = t["dataCategory"]
        if t.get("hidden"):
            tj["isHidden"] = True
        if t.get("hierarchies"):
            tj["hierarchies"] = [{"name": hn, "levels": [{"name": lv, "ordinal": i, "column": lv} for i, lv in enumerate(levels)]}
                                 for hn, levels in t["hierarchies"]]
        tables.append(tj)
    # measure table
    measures = []
    for name, folder, fmt, desc, dax in S.MEASURES:
        m = {"name": name, "expression": dax, "displayFolder": folder, "description": desc}
        if fmt:
            m["formatString"] = fmt
        measures.append(m)
    tables.insert(0, {"name": "_Measures", "description": "All business measures, organised in display folders.",
                      "columns": [{"type": "calculatedTableColumn", "name": "Measure Group", "dataType": "string", "isHidden": True,
                                   "isNameInferred": True, "isDataTypeInferred": True, "sourceColumn": "[Measure Group]"}],
                      "partitions": [{"name": "_Measures", "mode": "import",
                                      "source": {"type": "calculated", "expression": 'ROW ( "Measure Group", "Measures" )'}}],
                      "measures": measures})
    # field parameter (metric selector)
    fp = S.FIELD_PARAMETER
    rows = ",\n".join(f'    ( "{m}", NAMEOF ( \'_Measures\'[{m}] ), {i} )' for i, m in enumerate(fp["measures"]))
    tables.append({"name": fp["name"], "description": "Field parameter: lets users switch the metric shown in a visual.",
                   "columns": [
                       {"type": "calculatedTableColumn", "name": "Metric", "dataType": "string", "isNameInferred": False,
                        "isDataTypeInferred": True, "sourceColumn": "[Value1]", "sortByColumn": "Metric Order",
                        "relatedColumnDetails": {"groupByColumns": [{"groupingColumn": "Metric Fields"}]}, "summarizeBy": "none"},
                       {"type": "calculatedTableColumn", "name": "Metric Fields", "dataType": "string", "isHidden": True,
                        "isNameInferred": False, "isDataTypeInferred": True, "sourceColumn": "[Value2]", "sortByColumn": "Metric Order",
                        "extendedProperties": [{"type": "json", "name": "ParameterMetadata", "value": {"version": 3, "kind": 2}}],
                        "summarizeBy": "none"},
                       {"type": "calculatedTableColumn", "name": "Metric Order", "dataType": "int64", "isHidden": True,
                        "isNameInferred": False, "isDataTypeInferred": True, "sourceColumn": "[Value3]", "summarizeBy": "sum"}],
                   "partitions": [{"name": fp["name"], "mode": "import", "source": {"type": "calculated", "expression": "{\n" + rows + "\n}"}}]})
    rels = []
    for ft, fc, tt, tc, active in S.RELATIONSHIPS:
        r = {"name": f"{ft}[{fc}] -> {tt}", "fromTable": ft, "fromColumn": fc, "toTable": tt, "toColumn": tc}
        if not active:
            r["isActive"] = False
        rels.append(r)
    roles = []
    for name, table, expr, desc in S.ROLES:
        r = {"name": name, "modelPermission": "read", "description": desc}
        if table:
            r["tablePermissions"] = [{"name": table, "filterExpression": expr}]
        roles.append(r)
    exprs = [{"name": n, "kind": "m", "expression": e,
              "annotations": [{"name": "PBI_ResultType", "value": "DateTime" if n.startswith("Range") else "Text"}]}
             for n, e in S.PARAMETERS]
    return {"name": "Green Basket Agriculture", "compatibilityLevel": 1567,
            "model": {"culture": "en-GB", "sourceQueryCulture": "en-GB", "defaultPowerBIDataSourceVersion": "powerBI_V3",
                      "discourageImplicitMeasures": True,
                      "dataAccessOptions": {"legacyRedirects": True, "returnErrorValuesAsNull": True},
                      "tables": tables, "relationships": rels, "roles": roles, "expressions": exprs,
                      "annotations": [{"name": "__PBI_TimeIntelligenceEnabled", "value": "0"},
                                      {"name": "PBI_ProTooling", "value": "[\"DevMode\"]"}]}}


# =============================================================================================== report
def rid(*parts) -> str:
    return hashlib.sha1("/".join(parts).encode()).hexdigest()[:20]


def lit(v) -> dict:
    if isinstance(v, bool):
        val = "true" if v else "false"
    elif isinstance(v, (int, float)):
        val = f"{v}D"
    else:
        val = "'" + str(v).replace("'", "''") + "'"
    return {"expr": {"Literal": {"Value": val}}}


def col(table, column) -> dict:
    return {"Column": {"Expression": {"SourceRef": {"Entity": table}}, "Property": column}}


def meas(name, table="_Measures") -> dict:
    return {"Measure": {"Expression": {"SourceRef": {"Entity": table}}, "Property": name}}


def proj(field: dict, display=None, active=None) -> dict:
    kind = "Column" if "Column" in field else "Measure"
    p = {"field": field, "queryRef": f'{field[kind]["Expression"]["SourceRef"]["Entity"]}.{field[kind]["Property"]}'}
    if display:
        p["displayName"] = display
    if active is not None:
        p["active"] = active
    return p


VISUAL_SCHEMA = f"{SCHEMA_BASE}/item/report/definition/visualContainer/1.0.0/schema.json"


def visual(page, key, vtype, x, y, w, h, roles: dict | None = None, title=None, alt=None, objects=None, sort=None, z=0):
    v = {"visualType": vtype}
    if roles is not None:
        v["query"] = {"queryState": {r: {"projections": ps} for r, ps in roles.items()}}
        if sort:
            v["query"]["sortDefinition"] = {"sort": [{"field": sort[0], "direction": sort[1]}], "isDefaultSort": False}
    if objects:
        v["objects"] = objects
    vco = {}
    if title:
        vco["title"] = [{"properties": {"show": lit(True), "text": lit(title)}}]
    if alt:
        vco["general"] = [{"properties": {"altText": lit(alt)}}]
    if vco:
        v["visualContainerObjects"] = vco
    name = rid(page, key)
    return name, {"$schema": VISUAL_SCHEMA, "name": name,
                  "position": {"x": x, "y": y, "z": z, "width": w, "height": h, "tabOrder": z},
                  "visual": v}


def card(page, key, measure, x, y, w=190, h=92, title=None, alt=None):
    return visual(page, key, "card", x, y, w, h, {"Values": [proj(meas(measure))]}, title=title or measure,
                  alt=alt or f"Card showing {measure}",
                  objects={"labels": [{"properties": {"fontSize": lit(22)}}],
                           "categoryLabels": [{"properties": {"show": lit(False)}}]})


def slicer(page, key, table, column, x, y, w=200, h=58, mode="Dropdown", title=None):
    return visual(page, key, "slicer", x, y, w, h, {"Values": [proj(col(table, column), active=True)]},
                  title=title or column, alt=f"Slicer for {column}",
                  objects={"data": [{"properties": {"mode": lit(mode)}}]})


def textbox(page, key, text, x, y, w, h, size="18pt", bold=True, color="#0B0B0B"):
    style = {"fontSize": size, "color": color}
    if bold:
        style["fontWeight"] = "bold"
    name = rid(page, key)
    return name, {"$schema": VISUAL_SCHEMA, "name": name, "position": {"x": x, "y": y, "z": 0, "width": w, "height": h, "tabOrder": 0},
                  "visual": {"visualType": "textbox",
                             "objects": {"general": [{"properties": {"paragraphs": [{"textRuns": [{"value": text, "textStyle": style}]}]}}]}}}


def pages() -> list[dict]:
    P = []
    # ------------------------------------------------------------------ Page 1: Executive summary
    p = "exec"
    v = [textbox(p, "t", "Green Basket Agriculture - Executive Summary", 24, 10, 760, 40),
         visual(p, "asof", "card", 1040, 12, 216, 40, {"Values": [proj(meas("Data As Of"))]}, alt="Data freshness",
                objects={"labels": [{"properties": {"fontSize": lit(10)}}], "categoryLabels": [{"properties": {"show": lit(False)}}]}),
         slicer(p, "s1", "Date", "Fiscal Year", 24, 56, title="Fiscal year"),
         slicer(p, "s2", "Region", "Zone", 236, 56, title="Management zone"),
         slicer(p, "s3", "Crop Category", "Crop Category", 448, 56, title="Crop category"),
         slicer(p, "s4", "Customer", "Channel", 660, 56, title="Sales channel"),
         card(p, "k1", "Net Revenue FYTD", 24, 126, title="Net revenue FYTD"),
         card(p, "k2", "Net Revenue FYTD YoY %", 230, 126, title="FYTD growth vs PY"),
         card(p, "k3", "Gross Margin %", 436, 126, title="Gross margin %"),
         card(p, "k4", "Export Share %", 642, 126, title="Export share"),
         card(p, "k5", "Yield vs Plan %", 848, 126, title="Yield vs plan"),
         card(p, "k6", "Closing Stock Value", 1054, 126, w=202, title="Stock value (latest)"),
         visual(p, "trend", "lineChart", 24, 232, 820, 250,
                {"Category": [proj(col("Date", "Year Month"))], "Y": [proj(meas("Net Revenue"), "Net revenue"), proj(meas("Net Revenue PY"), "Same month last year")]},
                title="Net revenue by month vs same month last year",
                alt="Line chart of monthly net revenue compared with the same month of the previous year; grape exports create a November-January peak."),
         visual(p, "crop", "clusteredBarChart", 860, 232, 396, 250,
                {"Category": [proj(col("Crop", "Crop"))], "Y": [proj(meas("Net Revenue"), "Net revenue")]},
                title="Net revenue by crop", alt="Bar chart ranking crops by net revenue.", sort=(meas("Net Revenue"), "Descending")),
         visual(p, "chan", "clusteredColumnChart", 24, 494, 400, 210,
                {"Category": [proj(col("Customer", "Channel"))], "Y": [proj(meas("Net Revenue"), "Net revenue")]},
                title="Net revenue by sales channel", alt="Column chart of net revenue by sales channel.", sort=(meas("Net Revenue"), "Descending")),
         visual(p, "farms", "tableEx", 440, 494, 816, 210,
                {"Values": [proj(col("Farm", "Farm")), proj(meas("Net Revenue"), "Net revenue"), proj(meas("Net Revenue YoY %"), "YoY %"),
                            proj(meas("Gross Margin %"), "Gross margin %"), proj(meas("Yield (t/ha)"), "Yield t/ha")]},
                title="Farm scorecard", alt="Table of farms with net revenue, growth, gross margin and yield.",
                sort=(meas("Net Revenue"), "Descending"))]
    P.append(dict(name=rid("page", p), display="Executive Summary", visuals=v))

    # ------------------------------------------------------------------ Page 2: Production & yield diagnostics
    p = "yield"
    v = [textbox(p, "t", "Production & Yield Diagnostics", 24, 10, 760, 40),
         slicer(p, "s1", "Date", "Crop Season", 24, 56, title="Agricultural season"),
         slicer(p, "s2", "Crop", "Crop", 236, 56, title="Crop"),
         slicer(p, "s3", "Farm", "Irrigation Type", 448, 56, title="Farm irrigation (as-was)"),
         slicer(p, "s4", "Region", "Zone", 660, 56, title="Management zone"),
         card(p, "k1", "Yield (t/ha)", 872, 56, w=124, h=58, title="Yield t/ha"),
         card(p, "k2", "Yield Gap vs Benchmark (t/ha)", 1004, 56, w=124, h=58, title="Gap vs NSA"),
         card(p, "k3", "Failed Area %", 1136, 56, w=120, h=58, title="Failed area"),
         visual(p, "matrix", "pivotTable", 24, 128, 700, 300,
                {"Rows": [proj(col("Region", "Region")), proj(col("Farm", "Farm"))],
                 "Values": [proj(meas("Yield (t/ha)"), "Yield"), proj(meas("Planned Yield (t/ha)"), "Plan"),
                            proj(meas("Yield vs Plan %"), "vs plan"), proj(meas("Benchmark Yield (t/ha)"), "NSA benchmark"),
                            proj(meas("Direct Cost per Tonne"), "Cost N$/t")]},
                title="Yield by region and farm (drill down region > farm)",
                alt="Matrix of yield, plan, NSA benchmark and direct cost per tonne by region and farm."),
         visual(p, "irr", "clusteredColumnChart", 740, 128, 516, 300,
                {"Category": [proj(col("Date", "Crop Season"))], "Series": [proj(col("Crop Cycle", "Irrigation Method"))],
                 "Y": [proj(meas("Yield (t/ha)"), "Yield t/ha")]},
                title="Yield by season and block irrigation method",
                alt="Column chart of yield by agricultural season split by the irrigation method of each field block."),
         visual(p, "scatter", "scatterChart", 24, 440, 610, 264,
                {"Category": [proj(col("Farm", "Farm"))], "Series": [proj(col("Farm", "Irrigation Type"))],
                 "X": [proj(meas("Rainfall per Season (mm)"), "Rainfall per season mm")], "Y": [proj(meas("Yield (t/ha)"), "Yield t/ha")]},
                title="Rainfall vs yield by farm and irrigation system",
                alt="Scatter plot of average seasonal rainfall against yield for each farm, coloured by irrigation system."),
         visual(p, "harvest", "lineChart", 650, 440, 606, 264,
                {"Category": [proj(col("Date", "Year Month"))], "Y": [proj(meas("Harvest (t)"), "Harvest t")]},
                title="Harvest tonnes by month", alt="Line chart of tonnes harvested per month.")]
    P.append(dict(name=rid("page", p), display="Production & Yield", visuals=v))

    # ------------------------------------------------------------------ Page 3: Advanced analytics
    p = "advanced"
    v = [textbox(p, "t", "Advanced Analytics - Forecast, Segments, Drivers", 24, 10, 900, 40),
         slicer(p, "s1", "Forecast", "Model", 24, 56, w=300, mode="Basic", title="Forecast model"),
         card(p, "k1", "Backtest WAPE %", 340, 56, w=180, h=58, title="Hold-out WAPE (category)"),
         card(p, "k2", "Top 10 Customer Share %", 528, 56, w=200, h=58, title="Top-10 customer share"),
         visual(p, "fc", "lineChart", 24, 126, 800, 290,
                {"Category": [proj(col("Date", "Year Month"))],
                 "Y": [proj(meas("Net Revenue"), "Actual"), proj(meas("Forecast Revenue"), "Forecast"),
                       proj(meas("Forecast Lower 80"), "80% lower"), proj(meas("Forecast Upper 80"), "80% upper")]},
                title="Net revenue: actual and 12-month forecast with 80% interval",
                alt="Line chart of actual monthly revenue followed by the forecast and its 80 percent prediction interval."),
         visual(p, "drivers", "clusteredBarChart", 840, 126, 416, 290,
                {"Category": [proj(col("Yield Drivers", "Feature"))], "Y": [proj(meas("Driver Importance"), "Importance")]},
                title="Key influencers of yield (random forest)", alt="Bar chart ranking yield drivers by permutation importance.",
                sort=(meas("Driver Importance"), "Descending")),
         visual(p, "seg", "clusteredBarChart", 24, 428, 520, 276,
                {"Category": [proj(col("Customer", "Customer Segment"))], "Y": [proj(meas("Net Revenue"), "Net revenue")]},
                title="Net revenue by customer segment (K-means)", alt="Bar chart of revenue by customer segment.",
                sort=(meas("Net Revenue"), "Descending")),
         visual(p, "segtab", "tableEx", 560, 428, 696, 276,
                {"Values": [proj(col("Customer", "Customer Segment")), proj(meas("Active Customers"), "Customers"),
                            proj(meas("Net Revenue"), "Net revenue"), proj(meas("Avg Realised Price (N$/kg)"), "N$/kg"),
                            proj(meas("Invoices"), "Invoices")]},
                title="Segment profile", alt="Table profiling each customer segment.", sort=(meas("Net Revenue"), "Descending"))]
    P.append(dict(name=rid("page", p), display="Advanced Analytics", visuals=v))

    # ------------------------------------------------------------------ Page 4: Operations & data quality
    p = "ops"
    v = [textbox(p, "t", "Operations, Inventory & Data Quality", 24, 10, 760, 40),
         slicer(p, "s1", "Date", "Fiscal Year", 24, 56, title="Fiscal year"),
         slicer(p, "s2", "Farm", "Farm", 236, 56, title="Farm"),
         card(p, "k1", "Closing Stock (t)", 448, 56, w=150, h=58, title="Closing stock t"),
         card(p, "k2", "Stock Cover (days)", 606, 56, w=150, h=58, title="Stock cover days"),
         card(p, "k3", "Shrinkage %", 764, 56, w=150, h=58, title="Shrinkage"),
         card(p, "k4", "Price Anomaly Lines", 922, 56, w=160, h=58, title="Price anomalies"),
         card(p, "k5", "Unknown Farm Revenue %", 1090, 56, w=166, h=58, title="Unknown-farm revenue"),
         visual(p, "stock", "lineChart", 24, 126, 620, 280,
                {"Category": [proj(col("Date", "Year Month"))], "Y": [proj(meas("Closing Stock (t)"), "Closing stock t")]},
                title="Closing stock by month (semi-additive)", alt="Line chart of month-end closing stock in tonnes."),
         visual(p, "flow", "clusteredColumnChart", 660, 126, 596, 280,
                {"Category": [proj(col("Date", "Fiscal Quarter"))],
                 "Y": [proj(meas("Stock Received (t)"), "Received t"), proj(meas("Stock Dispatched (t)"), "Dispatched t")]},
                title="Stock received vs dispatched by fiscal quarter", alt="Column chart comparing tonnes received and dispatched each quarter."),
         visual(p, "farmtab", "tableEx", 24, 418, 820, 286,
                {"Values": [proj(col("Farm", "Farm")), proj(col("Farm", "Irrigation Type (Current)"), "Irrigation now"),
                            proj(meas("Closing Stock (t)"), "Stock t"), proj(meas("Stock Cover (days)"), "Cover days"),
                            proj(meas("Shrinkage %"), "Shrinkage"), proj(meas("Corrected Harvest Records"), "Corrected records")]},
                title="Farm operations detail", alt="Table of stock, cover, shrinkage and data corrections by farm."),
         visual(p, "rls", "multiRowCard", 860, 418, 396, 286,
                {"Values": [proj(meas("Current User"), "Signed-in user"), proj(meas("Visible Farms"), "Farms visible (RLS)"),
                            proj(meas("Flagged Price Anomaly Revenue"), "Revenue awaiting review")]},
                title="Security & data-quality check", alt="Current user, number of farms visible under row-level security, flagged revenue.")]
    P.append(dict(name=rid("page", p), display="Operations & Data Quality", visuals=v))
    return P


def theme() -> dict:
    return {
        "name": "Green Basket Accessible",
        "dataColors": ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#008300", "#6250D6", "#E34948"],
        "background": "#FFFFFF", "foreground": "#0B0B0B", "tableAccent": "#2A78D6",
        "good": "#006300", "neutral": "#FAB219", "bad": "#D03B3B",
        "maximum": "#104281", "center": "#F0EFEC", "minimum": "#CDE2FB",
        "textClasses": {
            "callout": {"fontSize": 22, "fontFace": "Segoe UI Semibold", "color": "#0B0B0B"},
            "title": {"fontSize": 12, "fontFace": "Segoe UI Semibold", "color": "#0B0B0B"},
            "header": {"fontSize": 11, "fontFace": "Segoe UI Semibold", "color": "#0B0B0B"},
            "label": {"fontSize": 10, "fontFace": "Segoe UI", "color": "#52514E"}},
        "visualStyles": {
            "*": {"*": {
                "background": [{"show": True, "color": {"solid": {"color": "#FFFFFF"}}, "transparency": 0}],
                "border": [{"show": True, "color": {"solid": {"color": "#E1E0D9"}}, "radius": 6}],
                "valueAxis": [{"gridlineShow": True, "gridlineColor": {"solid": {"color": "#E1E0D9"}}, "gridlineStyle": "solid"}],
                "categoryAxis": [{"gridlineShow": False}],
                "lineStyles": [{"strokeWidth": 2}]}},
            "page": {"*": {"background": [{"color": {"solid": {"color": "#F9F9F7"}}, "transparency": 0}]}}},
    }


# =============================================================================================== writers / validation
def write_json(path: Path, obj: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_report(model: dict) -> list[Path]:
    if RP.exists():
        shutil.rmtree(RP)
    files = []
    write_json(RP / "definition.pbir", {"$schema": f"{SCHEMA_BASE}/item/report/definitionProperties/2.0.0/schema.json",
                                        "version": "4.0", "datasetReference": {"byPath": {"path": f"../{NAME}.SemanticModel"}}})
    files.append(RP / "definition.pbir")
    write_json(RP / ".platform", {"$schema": f"{SCHEMA_BASE}/gitIntegration/platformProperties/2.0.0/schema.json",
                                  "metadata": {"type": "Report", "displayName": "Green Basket Agriculture"},
                                  "config": {"version": "2.0", "logicalId": "6b0f7a52-3c1e-4d8e-9a51-1f2b3c4d5e6f"}})
    d = RP / "definition"
    write_json(d / "version.json", {"$schema": f"{SCHEMA_BASE}/item/report/definition/versionMetadata/1.0.0/schema.json",
                                    "version": "1.0.0"})
    base_theme = dict(theme(), name="CY24SU10")
    write_json(RP / "StaticResources/SharedResources/BaseThemes/CY24SU10.json", base_theme)
    write_json(RP / "StaticResources/RegisteredResources/GreenBasket_Accessible.json", theme())
    write_json(d / "report.json", {
        "$schema": f"{SCHEMA_BASE}/item/report/definition/report/1.0.0/schema.json",
        "themeCollection": {
            "baseTheme": {"name": "CY24SU10", "reportVersionAtImport": "5.61", "type": "SharedResources"},
            "customTheme": {"name": "GreenBasket_Accessible.json", "reportVersionAtImport": "5.61", "type": "RegisteredResources"}},
        "layoutOptimization": "None",
        "resourcePackages": [
            {"name": "SharedResources", "type": "SharedResources",
             "items": [{"name": "CY24SU10", "path": "BaseThemes/CY24SU10.json", "type": "BaseTheme"}]},
            {"name": "RegisteredResources", "type": "RegisteredResources",
             "items": [{"name": "GreenBasket_Accessible.json", "path": "GreenBasket_Accessible.json", "type": "CustomTheme"}]}],
        "settings": {"useStylableVisualContainerHeader": True, "defaultDrillFilterOtherVisuals": True,
                     "allowChangeFilterTypes": True, "useEnhancedTooltips": True}})
    files += [d / "version.json", d / "report.json"]
    pg = pages()
    write_json(d / "pages/pages.json", {"$schema": f"{SCHEMA_BASE}/item/report/definition/pagesMetadata/1.0.0/schema.json",
                                        "pageOrder": [p["name"] for p in pg], "activePageName": pg[0]["name"]})
    files.append(d / "pages/pages.json")
    for p in pg:
        pdir = d / "pages" / p["name"]
        write_json(pdir / "page.json", {"$schema": f"{SCHEMA_BASE}/item/report/definition/page/1.0.0/schema.json",
                                        "name": p["name"], "displayName": p["display"], "displayOption": "FitToPage",
                                        "height": 720, "width": 1280})
        files.append(pdir / "page.json")
        for i, (vname, vjson) in enumerate(p["visuals"]):
            # keyboard tab order follows the reading order the page was designed in: title, slicers, cards, charts
            vjson["position"]["tabOrder"] = i * 1000
            v = vjson["visual"]
            if v["visualType"] != "textbox":  # text boxes are read out as their own content
                alt = v.get("visualContainerObjects", {}).get("general", [{}])[0].get("properties", {}).get("altText")
                assert alt, f"visual {vname} on page {p['display']} has no alt text"
            write_json(pdir / "visuals" / vname / "visual.json", vjson)
            files.append(pdir / "visuals" / vname / "visual.json")
    print("Accessibility: every data visual has alt text; tab order set in reading order")
    return files


def validate_report(files: list[Path], schema_root: Path):
    import jsonschema
    from referencing import Registry, Resource

    def retrieve(uri: str):
        rel = uri.replace("https://developer.microsoft.com/json-schemas/", "")
        return Resource.from_contents(json.loads((schema_root / rel).read_text()))

    registry = Registry(retrieve=retrieve)
    for f in files:
        doc = json.loads(f.read_text())
        sch = doc.get("$schema")
        if not sch:
            continue
        schema = json.loads((schema_root / sch.replace("https://developer.microsoft.com/json-schemas/", "")).read_text())
        jsonschema.validate(doc, schema, cls=jsonschema.Draft7Validator, registry=registry)
    print(f"PBIR schema validation OK: {len(files)} files")


def check_field_references(model: dict, files: list[Path]):
    cols = {(t["name"], c["name"]) for t in model["model"]["tables"] for c in t.get("columns", [])}
    meas_names = {(t["name"], m["name"]) for t in model["model"]["tables"] for m in t.get("measures", [])}
    missing = []

    def walk(o):
        if isinstance(o, dict):
            for k in ("Column", "Measure"):
                if k in o and isinstance(o[k], dict) and "Property" in o[k]:
                    ent = o[k]["Expression"]["SourceRef"]["Entity"]
                    ref = (ent, o[k]["Property"])
                    if (k == "Column" and ref not in cols) or (k == "Measure" and ref not in meas_names):
                        missing.append(ref)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    for f in files:
        walk(json.loads(f.read_text()))
    if missing:
        raise SystemExit(f"Unresolved field references: {sorted(set(missing))}")
    print("Visual field references OK")


def write_measures_dax(model: dict):
    out = ["// measures.dax - Green Basket semantic model measures (generated by build_pbip.py)",
           "// Paste into DAX query view / Tabular Editor, or read alongside report section 3.4.", ""]
    for m in model["model"]["tables"][0]["measures"]:
        out.append(f"// [{m['displayFolder']}] {m['description']}")
        out.append(f"MEASURE '_Measures'[{m['name']}] =")
        out += ["    " + line for line in m["expression"].split("\n")]
        out.append("")
    out.append("// Row-level security role filters")
    for r in model["model"]["roles"]:
        for tp in r.get("tablePermissions", []):
            out.append(f"// Role '{r['name']}' on table '{tp['name']}':")
            out += ["//   " + line for line in tp["filterExpression"].split("\n")]
    (HERE / "measures.dax").write_text("\n".join(out) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tomtool", default=None, help="path to TomTool.dll (built from tools/TomTool)")
    ap.add_argument("--schemas", default=None, help="local mirror of https://developer.microsoft.com/json-schemas/")
    args = ap.parse_args()
    model = build_model()
    check_dax(model)
    (HERE / "model.bim").write_text(json.dumps(model, indent=2, ensure_ascii=False))
    write_measures_dax(model)
    (HERE / "theme").mkdir(exist_ok=True)
    write_json(HERE / "theme" / "GreenBasket_Accessible.json", theme())
    print(f"model.bim: {len(model['model']['tables'])} tables, {len(model['model']['tables'][0]['measures'])} measures, "
          f"{len(model['model']['relationships'])} relationships, {len(model['model']['roles'])} roles")

    # semantic model folder (TMDL via Microsoft's serializer)
    if SM.exists():
        shutil.rmtree(SM)
    SM.mkdir()
    write_json(SM / "definition.pbism", {"$schema": f"{SCHEMA_BASE}/item/semanticModel/definitionProperties/1.0.0/schema.json",
                                         "version": "4.0", "settings": {}})
    write_json(SM / ".platform", {"$schema": f"{SCHEMA_BASE}/gitIntegration/platformProperties/2.0.0/schema.json",
                                  "metadata": {"type": "SemanticModel", "displayName": "Green Basket Agriculture"},
                                  "config": {"version": "2.0", "logicalId": "3f9d2c1b-7a6e-4b5c-8d4e-2a1b0c9d8e7f"}})
    if args.tomtool:
        res = subprocess.run(["dotnet", args.tomtool, "bim2tmdl", str(HERE / "model.bim"), str(SM / "definition"),
                              str(HERE / "model.normalised.bim")], capture_output=True, text=True)
        print(res.stdout)
        if res.returncode != 0:
            print(res.stderr)
            raise SystemExit("TOM validation failed")
        (HERE / "model.normalised.bim").unlink(missing_ok=True)
    else:
        print("WARNING: --tomtool not given; TMDL folder not generated (model.bim only)")

    files = build_report(model)
    write_json(HERE / f"{NAME}.pbip", {"$schema": f"{SCHEMA_BASE}/pbip/pbipProperties/1.0.0/schema.json", "version": "1.0",
                                       "artifacts": [{"report": {"path": f"{NAME}.Report"}}],
                                       "settings": {"enableAutoRecovery": True}})
    files.append(HERE / f"{NAME}.pbip")
    files.append(SM / "definition.pbism")
    check_field_references(model, files)
    if args.schemas:
        validate_report(files, Path(args.schemas))



# =============================================================================================== static DAX checks
DAX_FUNCTIONS = {
    "SUM", "SUMX", "AVERAGE", "AVERAGEX", "MIN", "MAX", "COUNTROWS", "DISTINCTCOUNT", "DIVIDE", "CALCULATE", "CALCULATETABLE",
    "KEEPFILTERS", "REMOVEFILTERS", "VALUES", "TOPN", "IF", "NOT", "ISBLANK", "DATE", "INT", "MOD", "TOTALYTD", "EDATE",
    "SAMEPERIODLASTYEAR", "DATESINPERIOD", "USERELATIONSHIP", "SELECTEDVALUE", "FILTER", "ABS", "HASONEVALUE", "TRUE",
    "USERPRINCIPALNAME", "FORMAT", "ROW", "NAMEOF", "IN",
}


def check_dax(model: dict):
    tables = {t["name"]: {c["name"] for c in t.get("columns", [])} for t in model["model"]["tables"]}
    measures = {m["name"] for t in model["model"]["tables"] for m in t.get("measures", [])}
    exprs = [(m["name"], m["expression"]) for t in model["model"]["tables"] for m in t.get("measures", [])]
    exprs += [(f"role {r['name']}", tp["filterExpression"]) for r in model["model"]["roles"] for tp in r.get("tablePermissions", [])]
    exprs += [(t["name"], p["source"]["expression"]) for t in model["model"]["tables"] for p in t["partitions"] if p["source"]["type"] == "calculated"]
    problems = []
    for name, dax in exprs:
        code = re.sub(r'"[^"]*"', '""', dax)                       # blank out string literals
        if code.count("(") != code.count(")") or code.count("{") != code.count("}"):
            problems.append((name, "unbalanced brackets"))
        for tbl, col in re.findall(r"'([^']+)'\[([^\]]+)\]", code):
            if tbl not in tables or col not in tables[tbl] and col not in measures:
                problems.append((name, f"unknown reference '{tbl}'[{col}]"))
        bare = re.sub(r"'[^']+'\[[^\]]+\]", "", code)
        for ref in re.findall(r"\[([^\]]+)\]", bare):
            if ref not in measures:
                problems.append((name, f"unknown measure [{ref}]"))
        for fn in re.findall(r"\b([A-Z][A-Z0-9\.]+)\s*\(", re.sub(r"\[[^\]]*\]", "", code)):
            if fn not in DAX_FUNCTIONS:
                problems.append((name, f"unknown function {fn}"))
        for var in re.findall(r"\bVAR\s+(\w+)", code):
            if len(re.findall(rf"\b{var}\b", code)) < 2:
                problems.append((name, f"variable {var} never used"))
    if problems:
        raise SystemExit("DAX static check failed:\n" + "\n".join(f"  {a}: {b}" for a, b in problems))
    print(f"DAX static check OK: {len(exprs)} expressions (references, functions, brackets, variables)")


if __name__ == "__main__":
    main()
