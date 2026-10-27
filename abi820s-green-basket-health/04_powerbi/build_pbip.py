#!/usr/bin/env python3
"""
build_pbip.py - generates the Power BI Project (PBIP) for the GBHS health semantic model and report.

Outputs (04_powerbi/):
  GBHS_Health.pbip                           open this in Power BI Desktop
  GBHS_Health.SemanticModel/                 definition.pbism + definition/ (TMDL, written by Microsoft's TOM serializer)
  GBHS_Health.Report/                        definition.pbir + definition/ (PBIR JSON, validated against Microsoft's schemas)
  model.bim                                  the same model as TMSL JSON (for Tabular Editor / deployment)
  measures.dax                               every measure and security rule as a DAX script (documentation, copy-paste)
  theme/GBHS_Accessible.json                 report theme (colour-blind-safe palette)

Validation performed by this script:
  1. TMSL -> Tabular Object Model (Microsoft.AnalysisServices) deserialisation in Power BI mode: every table,
     column, relationship, sort-by column, hierarchy level, role, OLS permission and refresh policy is resolved;
     TMDL is then written by TmdlSerializer and parsed back (round trip).
  2. Every PBIR JSON file is validated against the official JSON schemas (github.com/microsoft/json-schemas).
  3. Every field referenced by a visual, page filter or drill-through binding is checked to exist in the model.
  4. A static DAX check: references, functions, brackets and variables of every measure and role filter.
DAX semantics cannot be validated outside the Analysis Services engine: open the PBIP and check the
measure list for errors (none expected), then compare the cards with BUILD_GUIDE.md.

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
NAME = "GBHS_Health"
DISPLAY = "GBHS Health Services"
SM = HERE / f"{NAME}.SemanticModel"
RP = HERE / f"{NAME}.Report"
SCHEMA_BASE = "https://developer.microsoft.com/json-schemas/fabric"


# =============================================================================================== model
def m_expression(t: dict) -> str:
    typed = ", ".join(f'{{"{src}", {S.M_TYPE[dt]}}}' for (_n, src, dt, _o) in t["columns"])
    inc = t.get("incremental")
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
        f'    Typed = Table.TransformColumnTypes(Source, {{{typed}}}, "en-US")' + ("," if inc else ""),
    ]
    if inc:
        lines.append("    // incremental refresh window (RangeStart/RangeEnd folded to SQL as integer date keys)")
        lines.append(f'    Filtered = Table.SelectRows(Typed, each [{inc}] >= Int64.From(DateTime.ToText(RangeStart, "yyyyMMdd"))'
                     f' and [{inc}] < Int64.From(DateTime.ToText(RangeEnd, "yyyyMMdd")))')
        lines += ["in", "    Filtered"]
    else:
        lines += ["in", "    Typed"]
    return "\n".join(lines)


# definitions and lineage from the warehouse catalogue (03_analytics/build_data_dictionary.py); model_spec "desc" wins
DESCRIPTIONS = json.loads((HERE / "column_descriptions.json").read_text(encoding="utf-8")) \
    if (HERE / "column_descriptions.json").exists() else {}


def column_json(name, src, dt, o, view="") -> dict:
    c = {"name": name, "dataType": dt, "sourceColumn": src}
    o = dict(o, desc=o.get("desc") or DESCRIPTIONS.get(f"{view}.{src}"))
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
        expr = m_expression(t)
        tj = {"name": t["name"], "description": t.get("desc", ""),
              "columns": [column_json(*c, view=t["view"]) for c in t["columns"]],
              "partitions": [{"name": t["name"], "mode": "import", "source": {"type": "m", "expression": expr}}]}
        if t.get("dataCategory"):
            tj["dataCategory"] = t["dataCategory"]
        if t.get("hidden"):
            tj["isHidden"] = True
        if t.get("hierarchies"):
            tj["hierarchies"] = [{"name": hn, "levels": [{"name": lv, "ordinal": i, "column": lv} for i, lv in enumerate(levels)]}
                                 for hn, levels in t["hierarchies"]]
        if t.get("incremental"):
            tj["refreshPolicy"] = dict(policyType="basic", **S.REFRESH_POLICY, sourceExpression=expr)
        tables.append(tj)
    # measure table
    measures = []
    for name, folder, fmt, desc, dax in S.MEASURES:
        m = {"name": name, "expression": dax, "displayFolder": folder, "description": desc}
        if fmt:
            m["formatString"] = fmt
        if name in S.HIDDEN_MEASURES:
            m["isHidden"] = True
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
    for name, desc, filters, ols in S.ROLES:
        r = {"name": name, "modelPermission": "read", "description": desc}
        perms = [{"name": table, "filterExpression": expr} for table, expr in filters.items()]
        perms += [{"name": table, "metadataPermission": "none"} for table in ols]
        if perms:
            r["tablePermissions"] = perms
        roles.append(r)
    exprs = [{"name": n, "kind": "m", "expression": e,
              "annotations": [{"name": "PBI_ResultType", "value": "DateTime" if n.startswith("Range") else "Text"}]}
             for n, e in S.PARAMETERS]
    return {"name": DISPLAY, "compatibilityLevel": 1567,
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
TIP_PAGE = rid("page", "tooltip")      # report-page tooltip shared by several visuals
SMALL_LABEL = {"labels": [{"properties": {"fontSize": lit(10)}}], "categoryLabels": [{"properties": {"show": lit(False)}}]}


def visual(page, key, vtype, x, y, w, h, roles: dict | None = None, title=None, alt=None, objects=None, sort=None,
           tooltip_page=None, sync=None, link=None):
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
    if tooltip_page:
        vco["visualTooltip"] = [{"properties": {"show": lit(True), "type": lit("Canvas"), "section": lit(tooltip_page)}}]
    if link:
        vco["visualLink"] = [{"properties": {"show": lit(True), "type": lit(link)}}]
    if vco:
        v["visualContainerObjects"] = vco
    if sync:
        v["syncGroup"] = {"groupName": sync, "fieldChanges": True, "filterChanges": True}
    name = rid(page, key)
    return name, {"$schema": VISUAL_SCHEMA, "name": name,
                  "position": {"x": x, "y": y, "z": 0, "width": w, "height": h, "tabOrder": 0},
                  "visual": v}


def card(page, key, measure, x, y, w=190, h=92, title=None, alt=None):
    return visual(page, key, "card", x, y, w, h, {"Values": [proj(meas(measure))]}, title=title or measure,
                  alt=alt or f"Card showing {title or measure}",
                  objects={"labels": [{"properties": {"fontSize": lit(22 if h >= 80 else 16)}}],
                           "categoryLabels": [{"properties": {"show": lit(False)}}]})


def slicer(page, key, table, column, x, y, w=200, h=58, mode="Dropdown", title=None, sync=None):
    return visual(page, key, "slicer", x, y, w, h, {"Values": [proj(col(table, column), active=True)]},
                  title=title or column, alt=f"Slicer for {title or column}",
                  objects={"data": [{"properties": {"mode": lit(mode)}}]}, sync=sync)


def textbox(page, key, text, x, y, w, h, size="18pt", bold=True, color="#0B0B0B"):
    style = {"fontSize": size, "color": color}
    if bold:
        style["fontWeight"] = "bold"
    name = rid(page, key)
    return name, {"$schema": VISUAL_SCHEMA, "name": name, "position": {"x": x, "y": y, "z": 0, "width": w, "height": h, "tabOrder": 0},
                  "visual": {"visualType": "textbox",
                             "objects": {"general": [{"properties": {"paragraphs": [{"textRuns": [{"value": text, "textStyle": style}]}]}}]}}}


def no_filter(source_key: str, target_keys: list[str], page: str) -> list[dict]:
    """Edit interactions: selections in the source visual do not filter the target visuals (stable headline cards)."""
    return [{"source": rid(page, source_key), "target": rid(page, t), "type": "NoFilter"} for t in target_keys]


def pages() -> list[dict]:
    P = []
    # ------------------------------------------------------------------ Page 1: Executive overview
    p = "exec"
    v = [textbox(p, "t", "GBHS Health Services - Executive Overview", 24, 10, 760, 40),
         visual(p, "asof", "card", 1040, 12, 216, 40, {"Values": [proj(meas("Data As Of"))]}, alt="Data freshness: latest attendance date in the model",
                objects=SMALL_LABEL),
         slicer(p, "s1", "Date", "Calendar Year", 24, 56, title="Calendar year", sync="Calendar year"),
         slicer(p, "s2", "Region", "Zone", 236, 56, title="Management zone", sync="Management zone"),
         slicer(p, "s3", "Facility", "Facility Type", 448, 56, title="Facility type"),
         slicer(p, "s4", "Facility", "Facility", 660, 56, title="Facility", sync="Facility"),
         card(p, "k1", "ED Attendances YTD", 24, 126, title="ED attendances YTD"),
         card(p, "k2", "ED Attendances YTD YoY %", 230, 126, title="YTD change vs last year"),
         card(p, "k3", "Seen Within Target %", 436, 126, title="Seen within triage target"),
         card(p, "k4", "Median Door-to-Doctor (min)", 642, 126, title="Median door-to-doctor (min)"),
         card(p, "k5", "Bed Occupancy %", 848, 126, title="Bed occupancy"),
         card(p, "k6", "Readmission Rate 30d %", 1054, 126, w=202, title="30-day readmissions"),
         visual(p, "trend", "lineChart", 24, 232, 820, 250,
                {"Category": [proj(col("Date", "Year Month"))],
                 "Y": [proj(meas("Seen Within Target %"), "Seen within target"), proj(meas("Seen Within Target % PY"), "Same month last year"),
                       proj(meas("Target Seen Within Target %"), "Target 80 %")]},
                title="Share of ED patients seen within their triage target, by month",
                alt="Line chart of the monthly share of triaged emergency patients seen by a doctor within the SATS target, against the same month "
                    "last year and the 80 percent target. Performance held near 78 percent in 2022-2024 and fell to about 67 percent in 2025-2026."),
         visual(p, "occ", "clusteredBarChart", 860, 232, 396, 250,
                {"Category": [proj(col("Facility", "Facility"))], "Y": [proj(meas("Bed Occupancy %"), "Bed occupancy")]},
                title="Bed occupancy by hospital", sort=(meas("Bed Occupancy %"), "Descending"), tooltip_page=TIP_PAGE,
                alt="Bar chart ranking the five hospitals by bed occupancy; hovering shows the KPI tooltip for the hospital."),
         visual(p, "mal", "lineChart", 24, 494, 400, 210,
                {"Category": [proj(col("Date", "Year Month"))], "Y": [proj(meas("Malaria Cases"), "Malaria cases")]},
                title="Notified malaria cases by month",
                alt="Line chart of confirmed malaria cases notified each month; the 2025 and 2026 seasons are three to four times the 2022-2024 seasons."),
         visual(p, "score", "tableEx", 440, 494, 816, 210,
                {"Values": [proj(col("Facility", "Facility")), proj(meas("ED Attendances"), "ED attendances"),
                            proj(meas("Seen Within Target %"), "Within target"), proj(meas("LWBS Rate %"), "LWBS"),
                            proj(meas("Bed Occupancy %"), "Occupancy"), proj(meas("ALOS (days)"), "ALOS (days)"),
                            proj(meas("Readmission Rate 30d %"), "Readmitted 30d"), proj(meas("Malaria Cases"), "Malaria cases")]},
                title="Facility scorecard (right-click a facility to drill through)", sort=(meas("ED Attendances"), "Descending"),
                tooltip_page=TIP_PAGE,
                alt="Table of facilities with ED attendances, share seen within target, left-without-being-seen rate, bed occupancy, "
                    "average length of stay, 30-day readmission rate and malaria cases.")]
    inter = no_filter("occ", ["k1", "k2", "k3", "k4", "k5", "k6"], p) + no_filter("score", ["k1", "k2", "k3", "k4", "k5", "k6"], p)
    P.append(dict(name=rid("page", p), display="Executive Overview", visuals=v, interactions=inter))

    # ------------------------------------------------------------------ Page 2: Patient flow & resource utilisation (diagnostic)
    p = "flow"
    v = [textbox(p, "t", "Patient Flow & Resource Utilisation - Diagnostics", 24, 10, 900, 40),
         slicer(p, "s1", "Date", "Calendar Year", 24, 56, title="Calendar year", sync="Calendar year"),
         slicer(p, "s2", "Facility", "Facility", 236, 56, title="Facility", sync="Facility"),
         slicer(p, "s3", "Triage", "Triage Category", 448, 56, title="Triage category"),
         slicer(p, "s4", "Hour", "Shift", 660, 56, title="Arrival shift"),
         card(p, "k1", "ED Arrivals per Doctor Shift", 872, 56, w=124, h=58, title="Arrivals / doctor-shift"),
         card(p, "k2", "NHPPD", 1004, 56, w=124, h=58, title="Nursing hrs / patient day"),
         card(p, "k3", "Agency %", 1136, 56, w=120, h=58, title="Agency share"),
         visual(p, "matrix", "pivotTable", 24, 128, 620, 280,
                {"Rows": [proj(col("Region", "Region")), proj(col("Facility", "Facility")), proj(col("Care Unit", "Ward Code"))],
                 "Values": [proj(meas("Bed Occupancy %"), "Occupancy"), proj(meas("Average Daily Census"), "Avg daily census"),
                            proj(meas("ALOS (days)"), "ALOS"), proj(meas("NHPPD"), "NHPPD"), proj(meas("Overtime %"), "Overtime")]},
                title="Ward utilisation (drill down region > facility > ward)",
                alt="Matrix of bed occupancy, average daily census, average length of stay, nursing hours per patient day and overtime, "
                    "expandable from region to facility to ward."),
         visual(p, "hour", "lineChart", 660, 128, 596, 280,
                {"Category": [proj(col("Hour", "Hour"))], "Y": [proj(meas("Median Door-to-Doctor (min)"), "Median door-to-doctor (min)")]},
                title="Median door-to-doctor time by hour of arrival",
                alt="Line chart of median minutes from arrival to doctor by hour of arrival; waits are longest between 07:00 and 18:00, "
                    "when arrivals peak, and shortest at night."),
         visual(p, "scatter", "scatterChart", 24, 420, 410, 284,
                {"Category": [proj(col("Facility", "Facility"))], "Series": [proj(col("Date", "Calendar Year"))],
                 "X": [proj(meas("Bed Occupancy %"), "Bed occupancy")], "Y": [proj(meas("Seen Within Target %"), "Seen within target")]},
                title="Access block: bed occupancy vs ED patients seen on time", tooltip_page=TIP_PAGE,
                alt="Scatter plot with one point per hospital and year: higher bed occupancy tends to go with a lower share of ED patients "
                    "seen within target (access block)."),
         visual(p, "triage", "clusteredBarChart", 450, 420, 390, 284,
                {"Category": [proj(col("Triage", "Triage Category"))], "Y": [proj(meas("Seen Within Target %"), "Seen within target")]},
                title="Seen within target by triage category",
                alt="Bar chart of the share of patients seen within target for each SATS triage category."),
         visual(p, "load", "lineChart", 856, 420, 400, 284,
                {"Category": [proj(col("Date", "Year Month"))], "Y": [proj(meas("ED Arrivals per Doctor Shift"), "ED arrivals per doctor-shift")]},
                title="ED arrivals per doctor-shift by month",
                alt="Line chart of ED attendances per doctor-shift by month; the load peaks in the 2025 and 2026 malaria seasons.")]
    P.append(dict(name=rid("page", p), display="Patient Flow & Resources", visuals=v))

    # ------------------------------------------------------------------ Page 3: Disease surveillance (operational)
    p = "surv"
    v = [textbox(p, "t", "Disease Surveillance - IDSR Priority Conditions", 24, 10, 760, 40),
         visual(p, "asof", "card", 900, 12, 356, 40, {"Values": [proj(meas("Surveillance As Of"))]},
                alt="Latest epidemiological week with IDSR returns", objects=SMALL_LABEL),
         slicer(p, "s1", "Date", "Epi Year", 24, 56, title="Epi year"),
         slicer(p, "s2", "Condition", "Condition", 236, 56, title="IDSR condition"),
         slicer(p, "s3", "Region", "Malaria Stratum", 448, 56, title="Malaria stratum"),
         slicer(p, "s4", "Facility", "Facility", 660, 56, title="Facility", sync="Facility"),
         card(p, "k1", "Malaria Cases Epi-YTD", 24, 126, title="Malaria cases, epi-YTD"),
         card(p, "k2", "Malaria Cases Epi-YTD YoY %", 230, 126, title="Change vs same weeks last year"),
         card(p, "k3", "Malaria Incidence per 1,000 PY", 436, 126, title="Incidence per 1,000 person-years"),
         card(p, "k4", "Malaria Test Positivity %", 642, 126, title="Malaria test positivity"),
         card(p, "k5", "IDSR Completeness %", 848, 126, title="IDSR report completeness"),
         card(p, "k6", "IDSR Timeliness %", 1054, 126, w=202, title="IDSR report timeliness"),
         visual(p, "weekly", "lineChart", 24, 230, 820, 240,
                {"Category": [proj(col("Date", "Epi Week Start"))],
                 "Y": [proj(meas("Malaria Cases"), "Malaria cases"), proj(meas("Malaria Cases Same Week Last Year"), "Same week last year")]},
                title="Weekly confirmed malaria cases vs the same epi week last year",
                alt="Line chart of weekly confirmed malaria cases with last year's curve for the same epi weeks; the 2025 and 2026 seasons peak far above 2024."),
         visual(p, "cond", "clusteredBarChart", 860, 230, 396, 240,
                {"Category": [proj(col("Condition", "Condition"))], "Y": [proj(meas("Notified Cases"), "Notified cases")]},
                title="Notified cases by IDSR condition", sort=(meas("Notified Cases"), "Descending"),
                alt="Bar chart ranking IDSR priority conditions by notified cases."),
         visual(p, "rain", "lineChart", 24, 482, 410, 222,
                {"Category": [proj(col("Date", "Epi Week Start"))], "Y": [proj(meas("Rainfall 4-8 Weeks Earlier (mm)"), "Rainfall 4-8 weeks earlier (mm)")]},
                title="Rainfall 4-8 weeks earlier (malaria lead indicator)",
                alt="Line chart of rainfall in the four weeks that ended four weeks before each epi week, averaged over the selected facilities."),
         visual(p, "pivot", "pivotTable", 450, 482, 420, 222,
                {"Rows": [proj(col("Facility", "Facility"))], "Columns": [proj(col("Date", "Epi Year"))],
                 "Values": [proj(meas("Malaria Incidence per 100k"), "Incidence per 100k")]},
                title="Malaria incidence per 100 000 catchment population",
                alt="Matrix pivoting malaria incidence per 100 000 catchment population by facility in rows and epi year in columns."),
         visual(p, "report", "clusteredColumnChart", 886, 482, 370, 222,
                {"Category": [proj(col("Facility", "Facility"))],
                 "Y": [proj(meas("IDSR Completeness %"), "Completeness"), proj(meas("IDSR Timeliness %"), "Timeliness")]},
                title="IDSR completeness and timeliness by facility",
                alt="Column chart comparing the completeness and timeliness of weekly IDSR reports for each facility.")]
    P.append(dict(name=rid("page", p), display="Disease Surveillance", visuals=v))

    # ------------------------------------------------------------------ Page 4: Advanced analytics, data quality & security
    p = "adv"
    v = [textbox(p, "t", "Advanced Analytics, Data Quality & Security", 24, 10, 900, 40),
         slicer(p, "s1", "Outbreak Alerts", "Method", 24, 56, w=300, mode="Basic", title="Outbreak detection method"),
         card(p, "k1", "Backtest WAPE % (1 Week Ahead)", 340, 56, w=180, h=58, title="Forecast error (WAPE)"),
         card(p, "k2", "Top-20% Risk Capture %", 528, 56, w=180, h=58, title="Readmissions in top-20 % risk"),
         card(p, "k3", "Alerts in Known Outbreak Weeks %", 716, 56, w=180, h=58, title="Alerts in true outbreaks"),
         card(p, "k4", "Reconciliation Pass %", 904, 56, w=170, h=58, title="Reconciliation passed"),
         card(p, "k5", "Visible Facilities", 1082, 56, w=174, h=58, title="Facilities visible (RLS)"),
         visual(p, "fc", "lineChart", 24, 126, 620, 290,
                {"Category": [proj(col("Date", "Epi Week Start"))],
                 "Y": [proj(meas("Model Actual Cases"), "Actual"), proj(meas("Backtest Forecast"), "Back-test (1 week ahead)"),
                       proj(meas("Forecast Cases"), "Forecast"), proj(meas("Forecast Lower 80"), "80 % lower"),
                       proj(meas("Forecast Upper 80"), "80 % upper")]},
                title="North-East malaria: weekly cases, back-test and 13-week forecast",
                alt="Line chart of weekly malaria cases in Rundu, Katima Mulilo and Nkurenkuru with one-week-ahead back-test forecasts "
                    "and a 13-week Holt-Winters forecast with its 80 percent prediction interval."),
         visual(p, "cal", "clusteredColumnChart", 660, 126, 596, 290,
                {"Category": [proj(col("Readmission Deciles", "Risk Decile"))],
                 "Y": [proj(meas("Readmission Predicted %"), "Predicted"), proj(meas("Readmission Observed %"), "Observed")]},
                title="Readmission risk model: predicted vs observed by risk decile",
                alt="Column chart of predicted and observed 30-day readmission rates in each risk decile of the test set; the bars track each other (good calibration)."),
         visual(p, "drv", "clusteredBarChart", 24, 428, 410, 276,
                {"Category": [proj(col("ED Wait Drivers", "Driver"))], "Y": [proj(meas("Wait Effect % (Operational)"), "Effect on waiting time")]},
                title="What lengthens ED waits? (% change, OLS)", sort=(meas("Wait Effect % (Operational)"), "Descending"),
                alt="Bar chart of the percentage change in door-to-doctor time associated with each operational driver: arrivals per doctor, "
                    "night shift, bed occupancy, malaria season and weekend."),
         visual(p, "alerts", "tableEx", 450, 428, 420, 276,
                {"Values": [proj(col("Date", "Epi Week Label"), "Epi week"), proj(col("Facility", "Facility")),
                            proj(col("Condition", "Condition")), proj(col("Outbreak Alerts", "Method")),
                            proj(col("Outbreak Alerts", "Is Known Outbreak"), "Known outbreak"), proj(meas("Outbreak Alerts"), "Alerts")]},
                title="Outbreak alerts (facility x condition x week)", sort=(col("Date", "Epi Week Label"), "Descending"),
                alt="Table of weeks flagged by the outbreak-detection methods, with facility, condition, method and whether the week lies in a known outbreak."),
         visual(p, "dq", "tableEx", 886, 428, 370, 276,
                {"Values": [proj(col("DQ Summary", "Rule Code"), "Rule"), proj(col("DQ Summary", "DQ Dimension"), "Dimension"),
                            proj(col("DQ Summary", "Action")), proj(meas("DQ Issues Logged"), "Issues")]},
                title="Data-quality rules and issues logged", sort=(meas("DQ Issues Logged"), "Descending"),
                alt="Table of data-quality rules with their dimension, handling action and number of issues logged.")]
    P.append(dict(name=rid("page", p), display="Advanced Analytics & DQ", visuals=v))

    # ------------------------------------------------------------------ Page 5: drill-through (Facility)
    p = "drill"
    fid = rid("filter", "drill", "facility")
    v = [visual(p, "back", "actionButton", 24, 14, 40, 36, title=None, alt="Back to the previous page", link="Back",
                objects={"icon": [{"properties": {"shapeType": lit("back")}}]}),
         visual(p, "title", "card", 72, 8, 700, 44, {"Values": [proj(meas("Facility Detail Title"))]},
                alt="Name of the facility drilled into", objects={"labels": [{"properties": {"fontSize": lit(18)}}],
                                                                  "categoryLabels": [{"properties": {"show": lit(False)}}]}),
         card(p, "k1", "ED Attendances", 24, 60, title="ED attendances"),
         card(p, "k2", "Seen Within Target %", 230, 60, title="Seen within target"),
         card(p, "k3", "LWBS Rate %", 436, 60, title="Left without being seen"),
         card(p, "k4", "Bed Occupancy %", 642, 60, title="Bed occupancy"),
         card(p, "k5", "ALOS (days)", 848, 60, title="Average length of stay"),
         card(p, "k6", "Malaria Cases", 1054, 60, w=202, title="Malaria cases"),
         visual(p, "trend", "lineChart", 24, 166, 620, 260,
                {"Category": [proj(col("Date", "Year Month"))],
                 "Y": [proj(meas("Seen Within Target %"), "Seen within target"), proj(meas("Target Seen Within Target %"), "Target 80 %")]},
                title="Seen within target by month", alt="Line chart of the facility's monthly share of ED patients seen within target against the 80 percent target."),
         visual(p, "wards", "clusteredBarChart", 660, 166, 596, 260,
                {"Category": [proj(col("Care Unit", "Ward Code"))], "Y": [proj(meas("Bed Occupancy %"), "Bed occupancy")]},
                title="Bed occupancy by ward", sort=(meas("Bed Occupancy %"), "Descending"),
                alt="Bar chart of bed occupancy for each ward of the facility."),
         visual(p, "mal", "lineChart", 24, 438, 620, 266,
                {"Category": [proj(col("Date", "Epi Week Start"))], "Y": [proj(meas("Malaria Cases"), "Malaria cases")]},
                title="Weekly malaria cases", alt="Line chart of weekly confirmed malaria cases notified by the facility."),
         visual(p, "staff", "tableEx", 660, 438, 596, 266,
                {"Values": [proj(col("Date", "Calendar Year")), proj(meas("NHPPD")), proj(meas("Overtime %"), "Overtime"),
                            proj(meas("Agency %"), "Agency"), proj(meas("ED Arrivals per Doctor Shift"), "ED arrivals / doctor-shift")]},
                title="Staffing by year", alt="Table of nursing hours per patient day, overtime, agency share and ED arrivals per doctor-shift by year.")]
    P.append(dict(name=rid("page", p), display="Facility Detail", visuals=v, hidden=True,
                  filters=[{"name": fid, "field": col("Facility", "Facility"), "type": "Categorical", "howCreated": "Drillthrough"}],
                  binding={"name": rid("binding", "drill"), "type": "Drillthrough",
                           "parameters": [{"name": rid("param", "drill", "facility"), "boundFilter": fid, "fieldExpr": col("Facility", "Facility")}]}))

    # ------------------------------------------------------------------ Page 6: report-page tooltip
    p = "tooltip"
    v = [visual(p, "kpis", "multiRowCard", 8, 8, 304, 224,
                {"Values": [proj(meas("Seen Within Target %"), "Seen within target"), proj(meas("ED Target Status"), "Status"),
                            proj(meas("Median Door-to-Doctor (min)"), "Median door-to-doctor (min)"), proj(meas("LWBS Rate %"), "LWBS"),
                            proj(meas("Bed Occupancy %"), "Bed occupancy"), proj(meas("Readmission Rate 30d %"), "Readmitted 30d")]},
                alt="Tooltip with the key patient-flow and utilisation KPIs of the hovered facility")]
    assert rid("page", p) == TIP_PAGE
    P.append(dict(name=TIP_PAGE, display="KPI Tooltip", visuals=v, hidden=True, displayOption="ActualSize", width=320, height=240,
                  binding={"name": rid("binding", "tooltip"), "type": "Tooltip"}))
    return P


def theme() -> dict:
    return {
        "name": "GBHS Accessible",
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
                                  "metadata": {"type": "Report", "displayName": DISPLAY},
                                  "config": {"version": "2.0", "logicalId": "8c2e4f61-5a3b-4c7d-9e18-2b3c4d5e6f70"}})
    d = RP / "definition"
    write_json(d / "version.json", {"$schema": f"{SCHEMA_BASE}/item/report/definition/versionMetadata/1.0.0/schema.json",
                                    "version": "1.0.0"})
    base_theme = dict(theme(), name="CY24SU10")
    write_json(RP / "StaticResources/SharedResources/BaseThemes/CY24SU10.json", base_theme)
    write_json(RP / "StaticResources/RegisteredResources/GBHS_Accessible.json", theme())
    write_json(d / "report.json", {
        "$schema": f"{SCHEMA_BASE}/item/report/definition/report/1.0.0/schema.json",
        "themeCollection": {
            "baseTheme": {"name": "CY24SU10", "reportVersionAtImport": "5.61", "type": "SharedResources"},
            "customTheme": {"name": "GBHS_Accessible.json", "reportVersionAtImport": "5.61", "type": "RegisteredResources"}},
        "layoutOptimization": "None",
        "resourcePackages": [
            {"name": "SharedResources", "type": "SharedResources",
             "items": [{"name": "CY24SU10", "path": "BaseThemes/CY24SU10.json", "type": "BaseTheme"}]},
            {"name": "RegisteredResources", "type": "RegisteredResources",
             "items": [{"name": "GBHS_Accessible.json", "path": "GBHS_Accessible.json", "type": "CustomTheme"}]}],
        "settings": {"useStylableVisualContainerHeader": True, "defaultDrillFilterOtherVisuals": True,
                     "allowChangeFilterTypes": True, "useEnhancedTooltips": True}})
    files += [d / "version.json", d / "report.json"]
    pg = pages()
    write_json(d / "pages/pages.json", {"$schema": f"{SCHEMA_BASE}/item/report/definition/pagesMetadata/1.0.0/schema.json",
                                        "pageOrder": [p["name"] for p in pg], "activePageName": pg[0]["name"]})
    files.append(d / "pages/pages.json")
    for p in pg:
        pdir = d / "pages" / p["name"]
        pj = {"$schema": f"{SCHEMA_BASE}/item/report/definition/page/1.0.0/schema.json",
              "name": p["name"], "displayName": p["display"], "displayOption": p.get("displayOption", "FitToPage"),
              "height": p.get("height", 720), "width": p.get("width", 1280)}
        if p.get("filters"):
            pj["filterConfig"] = {"filters": p["filters"]}
        if p.get("binding"):
            pj["pageBinding"] = p["binding"]
        if p.get("hidden"):
            pj["visibility"] = "HiddenInViewMode"
        if p.get("interactions"):
            pj["visualInteractions"] = p["interactions"]
        write_json(pdir / "page.json", pj)
        files.append(pdir / "page.json")
        names = set()
        for i, (vname, vjson) in enumerate(p["visuals"]):
            assert vname not in names, f"duplicate visual key on page {p['display']}"
            names.add(vname)
            pos = vjson["position"]
            assert pos["x"] + pos["width"] <= pj["width"] and pos["y"] + pos["height"] <= pj["height"], \
                f"visual {vname} on page {p['display']} overflows the canvas"
            # keyboard tab order follows the reading order the page was designed in: title, slicers, cards, charts
            pos["tabOrder"] = i * 1000
            v = vjson["visual"]
            if v["visualType"] != "textbox":  # text boxes are read out as their own content
                alt = v.get("visualContainerObjects", {}).get("general", [{}])[0].get("properties", {}).get("altText")
                assert alt, f"visual {vname} on page {p['display']} has no alt text"
            write_json(pdir / "visuals" / vname / "visual.json", vjson)
            files.append(pdir / "visuals" / vname / "visual.json")
        for it in p.get("interactions", []):
            assert it["source"] in names and it["target"] in names, f"interaction on page {p['display']} names an unknown visual"
    print("Accessibility: every data visual has alt text; tab order set in reading order; no visual overflows its page")
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
    pages_by_name = {}
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
        doc = json.loads(f.read_text())
        walk(doc)
        if f.name == "page.json":
            pages_by_name[doc["name"]] = doc
    if missing:
        raise SystemExit(f"Unresolved field references: {sorted(set(missing))}")
    # every tooltip binding must point at a page whose binding type is Tooltip
    for f in files:
        doc = json.loads(f.read_text())
        for tip in doc.get("visual", {}).get("visualContainerObjects", {}).get("visualTooltip", []):
            target = tip["properties"]["section"]["expr"]["Literal"]["Value"].strip("'")
            assert pages_by_name.get(target, {}).get("pageBinding", {}).get("type") == "Tooltip", f"bad tooltip target in {f}"
    print("Visual field references, drill-through binding and tooltip targets OK")


def write_measures_dax(model: dict):
    out = ["// measures.dax - GBHS semantic model measures (generated by build_pbip.py)",
           "// Paste into DAX query view / Tabular Editor, or read alongside report section 3.4.", ""]
    for m in model["model"]["tables"][0]["measures"]:
        out.append(f"// [{m['displayFolder']}] {m['description']}")
        out.append(f"MEASURE '_Measures'[{m['name']}] =")
        out += ["    " + line for line in m["expression"].split("\n")]
        out.append("")
    out.append("// Security roles: row-level filters (RLS) and object-level security (OLS)")
    for r in model["model"]["roles"]:
        out.append(f"// Role '{r['name']}': {r['description']}")
        for tp in r.get("tablePermissions", []):
            if "filterExpression" in tp:
                out.append(f"//   RLS filter on '{tp['name']}':")
                out += ["//     " + line for line in tp["filterExpression"].split("\n")]
            if tp.get("metadataPermission") == "none":
                out.append(f"//   OLS: table '{tp['name']}' is invisible to this role (metadataPermission = none)")
    (HERE / "measures.dax").write_text("\n".join(out) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tomtool", default=None, help="path to TomTool.dll (built from tools/TomTool)")
    ap.add_argument("--schemas", default=None, help="local mirror of https://developer.microsoft.com/json-schemas/")
    args = ap.parse_args()
    model = build_model()
    check_dax(model)
    (HERE / "model.bim").write_text(json.dumps(model, indent=2, ensure_ascii=False), encoding="utf-8")
    write_measures_dax(model)
    (HERE / "theme").mkdir(exist_ok=True)
    write_json(HERE / "theme" / "GBHS_Accessible.json", theme())
    print(f"model.bim: {len(model['model']['tables'])} tables, {len(model['model']['tables'][0]['measures'])} measures, "
          f"{len(model['model']['relationships'])} relationships, {len(model['model']['roles'])} roles")

    # semantic model folder (TMDL via Microsoft's serializer)
    if SM.exists():
        shutil.rmtree(SM)
    SM.mkdir()
    write_json(SM / "definition.pbism", {"$schema": f"{SCHEMA_BASE}/item/semanticModel/definitionProperties/1.0.0/schema.json",
                                         "version": "4.0", "settings": {}})
    write_json(SM / ".platform", {"$schema": f"{SCHEMA_BASE}/gitIntegration/platformProperties/2.0.0/schema.json",
                                  "metadata": {"type": "SemanticModel", "displayName": DISPLAY},
                                  "config": {"version": "2.0", "logicalId": "5d7a9b3c-1e2f-4a6b-8c9d-0e1f2a3b4c5d"}})
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
    "SUM", "SUMX", "AVERAGE", "AVERAGEX", "MIN", "MAX", "COUNT", "COUNTROWS", "DISTINCTCOUNT", "DIVIDE", "CALCULATE",
    "CALCULATETABLE", "KEEPFILTERS", "REMOVEFILTERS", "VALUES", "IF", "NOT", "ISBLANK", "BLANK", "DATE", "INT", "MOD",
    "TOTALYTD", "EDATE", "SAMEPERIODLASTYEAR", "DATESINPERIOD", "DATEADD", "USERELATIONSHIP", "SELECTEDVALUE", "FILTER",
    "ABS", "TRUE", "USERPRINCIPALNAME", "LOWER", "LEFT", "FORMAT", "ROW", "NAMEOF", "IN", "MEDIAN", "PERCENTILE.INC",
}


def check_dax(model: dict):
    tables = {t["name"]: {c["name"] for c in t.get("columns", [])} for t in model["model"]["tables"]}
    measures = {m["name"] for t in model["model"]["tables"] for m in t.get("measures", [])}
    exprs = [(m["name"], m["expression"]) for t in model["model"]["tables"] for m in t.get("measures", [])]
    exprs += [(f"role {r['name']}", tp["filterExpression"]) for r in model["model"]["roles"]
              for tp in r.get("tablePermissions", []) if "filterExpression" in tp]
    exprs += [(t["name"], p["source"]["expression"]) for t in model["model"]["tables"] for p in t["partitions"] if p["source"]["type"] == "calculated"]
    for r in model["model"]["roles"]:
        for tp in r.get("tablePermissions", []):
            assert tp["name"] in tables, f"role {r['name']} secures unknown table {tp['name']}"
    problems = []
    for name, dax in exprs:
        code = re.sub(r'"[^"]*"', '""', dax)                       # blank out string literals
        if code.count("(") != code.count(")") or code.count("{") != code.count("}"):
            problems.append((name, "unbalanced brackets"))
        for tbl, column in re.findall(r"'([^']+)'\[([^\]]+)\]", code):
            if tbl not in tables or column not in tables[tbl] and column not in measures:
                problems.append((name, f"unknown reference '{tbl}'[{column}]"))
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
        # measures may not be referenced inside boolean CALCULATE filter arguments: they must be captured in a VAR first
        for arg in re.findall(r"KEEPFILTERS \(([^()]*(?:\([^()]*\)[^()]*)*)\)", code):
            if re.search(r"(?<!')\[[^\]]+\]", re.sub(r"'[^']+'\[[^\]]+\]", "", arg)):
                problems.append((name, "measure referenced inside a KEEPFILTERS boolean filter"))
    if problems:
        raise SystemExit("DAX static check failed:\n" + "\n".join(f"  {a}: {b}" for a, b in problems))
    print(f"DAX static check OK: {len(exprs)} expressions (references, functions, brackets, variables, filter arguments)")


if __name__ == "__main__":
    main()
