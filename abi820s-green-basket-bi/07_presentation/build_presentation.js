// build_presentation.js - builds GreenBasket_ABI820S_Presentation.pptx (13 slides + 3 backup) with pptxgenjs.
// Every number comes from deck_data.json (run deck_data.py first); images come from 06_report.
// Usage: NODE_PATH=<dir with pptxgenjs> node build_presentation.js [apply_theme.js path]
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const D = JSON.parse(fs.readFileSync(path.join(HERE, "deck_data.json"), "utf8"));
const OUT = path.join(HERE, "GreenBasket_ABI820S_Presentation.pptx");
const APPLY = process.argv[2];

const THEME = {
  name: "Green Basket",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0B0B0B", lt1: "FFFFFF", dk2: "1F4D3A", lt2: "EEF3EF",
    accent1: "2A78D6", accent2: "EB6834", accent3: "1BAF7A", accent4: "EDA100", accent5: "E87BA4", accent6: "6250D6",
    hlink: "2A78D6", folHlink: "6250D6",
  },
};
const HEX = { ink: "0B0B0B", ink2: "52514E", muted: "898781", grid: "E1E0D9", forest: "1F4D3A", blue: "2A78D6", orange: "EB6834", green: "1BAF7A", amber: "EDA100" };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.title = "Green Basket cc - ABI820S group presentation";
pres.subject = "End-to-end BI solution for the Agriculture Division";
pres.author = "ABI820S consulting group";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ------------------------------------------------------------------ layouts
pres.defineSlideMaster({
  title: "GB_TITLE",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.9, w: 11.7, h: 1.9, fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 4.0, w: 11.7, h: 1.3, fontSize: 20, color: C.background2, valign: "top", align: "left" }, text: "" } },
    { text: { text: "ABI820S Advanced Business Intelligence and Analytics | NUST | 28 October 2026", options: { x: 0.8, y: 6.6, w: 11.7, h: 0.4, fontSize: 12, color: C.background2 } } },
  ],
});
pres.defineSlideMaster({
  title: "GB_CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.3, w: 12.1, h: 0.85, fontSize: 28, bold: true, color: C.text2, valign: "middle", align: "left" }, text: "" } },
    { text: { text: "Green Basket cc - Agriculture Division | ABI820S group project", options: { x: 0.6, y: 7.0, w: 8, h: 0.3, fontSize: 10, color: C.text1 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.text1, align: "right" },
});
pres.defineSlideMaster({
  title: "GB_CLOSING",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 0.5, w: 11.7, h: 1.0, fontSize: 36, bold: true, color: C.background1, align: "left" }, text: "" } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.background2, align: "right" },
});

// ------------------------------------------------------------------ helpers
const fmt1 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function circleNum(slide, n, x, y, d = 0.55, fill = C.text2, color = C.background1) {
  slide.addText(String(n), { shape: pres.shapes.OVAL, x, y, w: d, h: d, fill: { color: fill }, color, fontSize: 16, bold: true,
    align: "center", valign: "middle", margin: 0, objectName: `step ${n}` });
}
function card(slide, x, y, w, h, name) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name });
}
function stat(slide, x, y, w, big, label, color = C.text2, bigSize = 40) {
  slide.addText(big, { x, y, w, h: 0.8, fontSize: bigSize, bold: true, color, margin: 0, isTextBox: true, fontFace: THEME.headFontFace });
  slide.addText(label, { x, y: y + 0.8, w, h: 0.6, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true });
}
function text(slide, t, o) { slide.addText(t, Object.assign({ isTextBox: true, fontSize: 14, color: C.text1, valign: "top" }, o)); }
const AX = { catAxisLabelColor: HEX.ink2, valAxisLabelColor: HEX.ink2, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
  catAxisLabelFontSize: 11, valAxisLabelFontSize: 11, valGridLine: { color: HEX.grid, size: 0.75 }, catGridLine: { style: "none" },
  titleFontFace: "+mn-lt", titleFontSize: 13, titleColor: HEX.ink, showTitle: true, dataLabelFontFace: "+mn-lt", dataLabelFontSize: 10,
  dataLabelColor: HEX.ink2, legendFontFace: "+mn-lt", legendFontSize: 11, legendColor: HEX.ink2 };
const opt = (o) => Object.assign({}, AX, o);

// ------------------------------------------------------------------ slides
pres.addSection({ title: "Problem" });
let s = pres.addSlide({ masterName: "GB_TITLE", sectionTitle: "Problem" });
s.addText("Green Basket cc: one trusted view of production, yield, cost and revenue", { placeholder: "title" });
s.addText("End-to-end BI solution for the Agriculture Division - data warehouse, ELT, Power BI, advanced analytics and governance", { placeholder: "body" });
s.addNotes("Member 1 (0:00-0:30). Good morning. We are the consulting team engaged by Green Basket cc's Agriculture Division. In ten minutes we show how we turned nine disconnected data sources into one trusted view - and what that view tells management.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Problem" });
s.addText("Nine sources, no single truth", { placeholder: "title" });
const SRC = [
  ["S1 Farm harvest logs", "14 files, 3 layouts, 3 date formats, x10 keying errors"],
  ["S2 Master data", "18 region spellings, 3 duplicate customers, 'NA' read as null"],
  ["S3 ERP invoices", "2,587 duplicate lines from overlapping extracts"],
  ["S4 Stock system", "Negative balances and missing months"],
  ["S5 Cost ledger", "47 category spellings, amounts stored as text"],
  ["S6 NASA POWER weather", "-999 fill values, 3-day latency"],
  ["S7 World Bank prices", "Wide sheet, '...' missing markers"],
  ["S8 FRED exchange rates", "Blank observations on US holidays"],
  ["S9 NSA crop estimates", "Region names off the official list"],
];
SRC.forEach(([h, b], i) => {
  const x = 0.6 + (i % 3) * 2.85, y = 1.4 + Math.floor(i / 3) * 1.8;
  card(s, x, y, 2.65, 1.6, `source card ${i + 1}`);
  text(s, [{ text: h, options: { bold: true, breakLine: true, color: C.text2 } }, { text: b, options: { fontSize: 14 } }], { x: x + 0.15, y: y + 0.12, w: 2.35, h: 1.4, margin: 0 });
});
stat(s, 9.4, 1.4, 3.3, "2,587", "duplicate invoice lines would have inflated revenue", C.accent2);
stat(s, 9.4, 3.2, 3.3, "47", "spellings of 10 crop names across logs and ledger", C.accent2);
stat(s, 9.4, 5.0, 3.3, "x10", "harvest keying errors - up to 47 t/ha of maize", C.accent2);
s.addNotes("Member 1 (0:30-1:30). Production data sits in 14 farm spreadsheets in three layouts; sales in the ERP; stock and cost in two more systems; plus four external sources. Profiling quantified the damage: 2,587 duplicate invoice lines from overlapping extracts, 47 spellings of 10 crops, and keying errors of ten times the real quantity. Management consolidated this in Excel and got numbers that disagreed.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Problem" });
s.addText("Five business questions, each answered by KPIs", { placeholder: "title" });
const BQ = [
  ["Which crops, channels, farms and customers drive revenue and margin?", "Net revenue, FYTD growth, gross margin %, export share"],
  ["How does yield compare with plan and the national benchmark - and why?", "Yield t/ha, yield vs plan, gap vs NSA, failed area"],
  ["What does a tonne cost to produce, by farm and crop?", "Direct cost per tonne, cost by category"],
  ["Which customers matter, how concentrated are we, what comes next?", "Top-10 share, segments, 12-month forecast with error"],
  ["Is stock under control - and can we trust the numbers?", "Closing stock, cover days, shrinkage, DQ and reconciliation status"],
];
BQ.forEach(([q, k], i) => {
  const y = 1.45 + i * 1.08;
  circleNum(s, i + 1, 0.6, y + 0.12);
  text(s, [{ text: q, options: { bold: true, fontSize: 18, breakLine: true } }, { text: k, options: { fontSize: 14, color: C.text1 } }], { x: 1.4, y, w: 11.3, h: 0.95, margin: 0 });
});
s.addNotes("Member 1 (1:30-2:00). Five business questions, each tied to a strategic objective and to KPIs with explicit definitions. Every page of the dashboard answers one or two of these questions - nothing on a page exists without a question behind it.");

pres.addSection({ title: "Solution" });
s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Solution" });
s.addText("ELT in PostgreSQL 16: from raw files to one semantic model", { placeholder: "title" });
s.addImage({ path: path.join(ROOT, "06_report/diagrams/architecture.png"), x: 0.6, y: 1.35, w: 7.7, h: 5.64, altText: "Architecture: nine sources land in PostgreSQL staging, are cleansed and loaded into a star schema, exposed through mart views to the Power BI semantic model and report" });
[["Lossless landing", "every warehouse figure traces back to a source file and row"],
 ["37 DQ rules, 19 reconciliation checks", "run on every load; issues logged with owner"],
 ["One command, about 3 minutes", "python run_all.py rebuilds data, model, evidence and backup"]].forEach(([h, b], i) => {
  const y = 1.6 + i * 1.75;
  circleNum(s, i + 1, 8.75, y);
  text(s, [{ text: h, options: { bold: true, fontSize: 18, breakLine: true, color: C.text2 } }, { text: b, options: { fontSize: 14 } }], { x: 9.5, y: y - 0.05, w: 3.3, h: 1.5, margin: 0 });
});
s.addNotes("Member 3 (2:00-2:45). Extract, load, then transform inside PostgreSQL. Raw files land unchanged as text with file and row, so any number is traceable. Cleansed staging applies 37 rules; the dimensional layer holds 9 facts and 9 conformed dimensions; mart views feed Power BI. One command rebuilds everything in about three minutes.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Solution" });
s.addText("Nine stars, conformed dimensions, SCD2 history", { placeholder: "title" });
s.addImage({ path: path.join(ROOT, "06_report/diagrams/erd_sales.png"), x: 0.6, y: 1.4, w: 6.3, h: 4.38, altText: "ERD of the sales and inventory stars with the snowflaked product to crop to category hierarchy" });
text(s, "Snowflake only where a level is itself a fact grain: six facts are recorded per crop, so Crop is a conformed dimension of its own.", { x: 0.6, y: 5.95, w: 6.3, h: 0.9, margin: 0 });
const nk = D.nkurenkuru;
s.addChart(pres.charts.BAR, [
  { name: "Dryland version", labels: nk.map((r) => r.season), values: nk.map((r) => (r.irr === "Dryland" ? r.y : 0)) },
  { name: "Centre-pivot version", labels: nk.map((r) => r.season), values: nk.map((r) => (r.irr !== "Dryland" ? r.y : 0)) },
], opt({ x: 7.3, y: 1.4, w: 5.4, h: 4.4, barDir: "col", barGrouping: "stacked", chartColors: [HEX.orange, HEX.blue], showValue: true,
  dataLabelPosition: "inEnd", dataLabelFormatCode: "0.0;;;", dataLabelColor: "FFFFFF", showLegend: true, legendPos: "b",
  title: "Nkurenkuru maize, t per planted ha, by farm version at planting", valAxisLabelFormatCode: "0" }));
text(s, "With SCD Type 1, all six seasons would read 'Centre pivot' and the drought years would distort the pivot's record.", { x: 7.3, y: 5.95, w: 5.4, h: 0.9, margin: 0 });
s.addNotes("Member 2 (2:45-3:45). Nine fact tables at declared grains share Date, Farm, Region and Crop. We snowflaked Product to Crop to Category because six facts are recorded per crop, not per product - one Crop table keeps them conformed. Farms and customers are SCD Type 2. The chart is why: Nkurenkuru Valley installed a pivot in August 2023. Because each season links to the farm version valid at planting, dryland and pivot seasons stay separate.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Solution" });
s.addText("Data quality: 236 of 237 defects caught, 0 false positives", { placeholder: "title" });
stat(s, 0.6, 1.4, 3.2, "236 / 237", "injected defect records found by the rules (synthetic ground truth)", C.accent3, 36);
stat(s, 0.6, 3.1, 3.2, "0", "false positives - no good record was changed", C.accent3, 36);
stat(s, 0.6, 4.8, 3.2, "37", "rules with an owner, a dimension and a logged action", C.accent3, 36);
const dqa = D.dq_actions;
s.addChart(pres.charts.BAR, [{ name: "Rows", labels: dqa.map((r) => r.action), values: dqa.map((r) => r.n) }],
  opt({ x: 4.0, y: 1.35, w: 4.6, h: 5.2, barDir: "bar", chartColors: [HEX.blue], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "#,##0", showLegend: false, title: "Rows handled per rule action, full load", valAxisHidden: true, valGridLine: { style: "none" } }));
card(s, 8.9, 1.4, 3.8, 2.5, "bug card 1");
text(s, [{ text: "Bug 1: HV06 masked itself", options: { bold: true, breakLine: true, color: C.text2 } },
  { text: "A 2-block median included the outlier, so a 47 t/ha block passed. Leave-one-out median: recall 6/8 to 7/8, still 0 false positives.", options: { fontSize: 14 } }],
  { x: 9.05, y: 1.5, w: 3.5, h: 2.3, margin: 0 });
card(s, 8.9, 4.1, 3.8, 2.45, "bug card 2");
text(s, [{ text: "Bug 2: 'NA' is a country", options: { bold: true, breakLine: true, color: C.text2 } },
  { text: "pandas read Namibia's ISO code as null: 226 customers lost their country. Fixed with keep_default_na=False.", options: { fontSize: 14 } }],
  { x: 9.05, y: 4.2, w: 3.5, h: 2.25, margin: 0 });
s.addNotes("Member 3 (3:45-4:45). Because our internal data is synthetic, the generator logged every defect it injected - so we could measure our rules. 236 of 237 bad records caught, no false positives. The validation also caught two real bugs in our own pipeline: a median that included the outlier it was testing, and pandas turning Namibia's country code NA into a null. Row counts would never have shown either.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Solution" });
s.addText("Reconciled, owned and secured", { placeholder: "title" });
stat(s, 0.6, 1.45, 3.6, `${D.recon.PASS || 0} / ${(D.recon.PASS || 0) + (D.recon.WARN || 0) + (D.recon.FAIL || 0)}`, `reconciliation checks pass on the latest full load; ${D.recon.WARN || 0} WARN, ${D.recon.FAIL || 0} FAIL`, C.accent3, 36);
text(s, "The one WARN is a business action: 119 mispriced invoice lines (N$ 4.9 m) wait for credit notes.", { x: 0.6, y: 3.0, w: 3.6, h: 1.2, margin: 0 });
text(s, "Row counts, control totals (kg, N$), cross-source ERP vs stock, SCD2 integrity, completeness, plausibility vs NSA.", { x: 0.6, y: 4.3, w: 3.6, h: 1.4, margin: 0 });
[["Owners", "CFO (commercial data) and operations manager (production data) approve definitions and access"],
 ["Stewards", "Farm, sales, finance, master-data and external stewards work their rules' issue queues"],
 ["Custodian", "IT runs the database, backups, TLS and the data gateway"]].forEach(([h, b], i) => {
  const y = 1.45 + i * 1.7;
  card(s, 4.6, y, 3.9, 1.5, `role ${h}`);
  text(s, [{ text: h, options: { bold: true, breakLine: true, color: C.text2 } }, { text: b, options: { fontSize: 14 } }], { x: 4.75, y: y + 0.1, w: 3.6, h: 1.35, margin: 0 });
});
text(s, [
  { text: "Row-level security: Zone Manager (dynamic), Export Desk (static), Executive", options: { bullet: true, breakLine: true } },
  { text: "App audiences for viewers; workspace roles for the BI team only", options: { bullet: true, breakLine: true } },
  { text: "Sensitivity label 'Confidential - Commercial' inherited by exports", options: { bullet: true, breakLine: true } },
  { text: "No personal identifiers: minimisation in line with Namibia's draft Data Protection Bill and GDPR", options: { bullet: true } },
], { x: 8.9, y: 1.45, w: 3.8, h: 5.0, margin: 0, paraSpaceAfter: 8 });
s.addNotes("Member 3 (4:45-5:15). Nineteen checks run after every load - eighteen pass; the warning is N$ 4.9 million of mispriced invoices that sales must credit. Every rule has an owner. Security is layered: least-privilege database roles, row-level security, app audiences and a Confidential sensitivity label. We hold no personal identifiers.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Solution" });
s.addText("Semantic model: Import, 79 governed measures, dynamic RLS", { placeholder: "title" });
[["Import", "+ incremental refresh"], ["79", "DAX measures, 8 folders"], ["34", "relationships, 1:* single"], ["3", "security roles"]].forEach(([b, l], i) => {
  const x = 0.6 + i * 3.05;
  card(s, x, 1.35, 2.85, 1.35, `model stat ${i + 1}`);
  text(s, [{ text: b, options: { bold: true, fontSize: 28, breakLine: true, color: C.text2, fontFace: THEME.headFontFace } }, { text: l, options: { fontSize: 14 } }], { x: x + 0.15, y: 1.42, w: 2.6, h: 1.2, margin: 0 });
});
s.addText("Net Revenue FYTD PY =\nVAR _cutoffPY =\n    EDATE ( [Last Sales Date], -12 )\nRETURN\n    CALCULATE (\n        [Net Revenue FYTD Raw],\n        SAMEPERIODLASTYEAR ( 'Date'[Date] ),\n        KEEPFILTERS ( 'Date'[Date] <= _cutoffPY )\n    )",
  { x: 0.6, y: 3.0, w: 6.1, h: 3.1, fontFace: "Courier New", fontSize: 13, color: C.text1, fill: { color: C.background2 }, margin: 0.15, valign: "top", isTextBox: true, objectName: "DAX like-for-like" });
text(s, "Like-for-like: without the cut-off, half of FY2027 would be compared with all of FY2026 (a false -73 %).", { x: 0.6, y: 6.2, w: 6.1, h: 0.7, margin: 0 });
const rows = [[{ text: "Zone (RLS test identity)", options: { bold: true } }, { text: "Farms", options: { bold: true, align: "right" } }, { text: "FY2026 N$ m", options: { bold: true, align: "right" } }]];
D.rls.forEach((r) => rows.push([r.zone === "Unknown" ? "Unknown farm (executive only)" : r.zone, { text: r.farms ? String(r.farms) : "-", options: { align: "right" } }, { text: fmt1(r.rev_m), options: { align: "right" } }]));
s.addTable(rows, { x: 7.1, y: 3.0, w: 5.6, colW: [3.2, 1.0, 1.4], fontSize: 14, color: HEX.ink, border: { type: "solid", pt: 0.5, color: HEX.grid }, fill: { color: "FFFFFF" }, margin: 0.06 });
text(s, "Expected values computed in SQL; tested with View as role in Desktop.", { x: 7.1, y: 6.2, w: 5.6, h: 0.7, margin: 0 });
s.addNotes("Member 4 (5:15-6:00). Import mode: 303 thousand rows compress to about 11 megabytes; incremental refresh re-reads ten days. 79 measures with descriptions and folders. One example: our year-to-date comparison stops at the same day last year - otherwise a half year is compared with a full year. Row-level security maps each zone manager to their zone from a warehouse table; the expected totals per identity come from SQL, and the test in Desktop must match them.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Solution" });
s.addText("Live demo: from headline to farm in three clicks", { placeholder: "title" });
s.addImage({ path: path.join(ROOT, "06_report/figures/mockup_p1_executive.png"), x: 0.6, y: 1.35, w: 8.6, h: 4.84, altText: "Executive summary page: KPI cards, monthly revenue versus last year, revenue by crop and channel, farm scorecard" });
text(s, "Design mock-up rendered from warehouse data - replaced by the Power BI screenshot after the Desktop build.", { x: 0.6, y: 6.3, w: 8.6, h: 0.5, margin: 0, fontSize: 12 });
["Executive page, FY2026: KPI band answers 'are we on track?'", "Drill the trend from year to quarter to month", "Production page: matrix Region > Farm, then drill through to one farm", "View as zm.northcentral: 4 farms, N$ 62.7 m"].forEach((t, i) => {
  const y = 1.45 + i * 1.25;
  circleNum(s, i + 1, 9.5, y);
  text(s, t, { x: 10.2, y: y - 0.02, w: 2.55, h: 1.15, margin: 0 });
});
s.addNotes("Member 4 (6:00-7:30). Demo path: (1) Executive page with FY2026 - revenue N$ 458.8 million, up 9.4 percent. (2) Drill the trend into quarters - the October-December grape window carries 60 percent of the year. (3) Production page - expand Region to Farm, right-click a farm, drill through. (4) Modeling, View as zm.northcentral - four farms, N$ 62.7 million. If the live demo fails, use backup slides 14 to 16.");

pres.addSection({ title: "Insights" });
s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Insights" });
const fyNow = D.fy.find((r) => r.fy === "FY2026");
s.addText("The outlook is flat: FY2027 forecast N$ 465.6 m, +1.5 %", { placeholder: "title" });
const months = D.actual.map((r) => r.m).concat(D.forecast.map((r) => r.m));
const act = D.actual.map((r) => r.v).concat(D.forecast.map(() => null));
const fcv = D.actual.map((r, i) => (i === D.actual.length - 1 ? r.v : null)).concat(D.forecast.map((r) => r.f));
s.addChart(pres.charts.LINE, [
  { name: "Actual", labels: months, values: act },
  { name: "Forecast (seasonal naive)", labels: months, values: fcv },
], opt({ x: 0.6, y: 1.35, w: 7.6, h: 4.6, chartColors: [HEX.blue, HEX.orange], lineSize: 2, lineDataSymbol: "none", showLegend: true,
  legendPos: "b", title: "Monthly net revenue, N$ million", catAxisLabelFrequency: 12, valAxisLabelFormatCode: "0" }));
text(s, `Hold-out WAPE 12.7 % at division level; the simple seasonal benchmark beat ETS and SARIMA. FY2026: N$ ${fmt1(fyNow.rev_m)} m.`, { x: 0.6, y: 6.05, w: 7.6, h: 0.8, margin: 0 });
const sg = D.segments;
s.addChart(pres.charts.BAR, [{ name: "Share of 12-month revenue", labels: sg.map((r) => `${r.segment} (${r.customers})`), values: sg.map((r) => r.share_pct) }],
  opt({ x: 8.5, y: 1.35, w: 4.2, h: 4.6, barDir: "bar", chartColors: [HEX.blue], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0\"%\"",
    showLegend: false, title: "Customer segments (K-means, k = 5)", valAxisHidden: true, valGridLine: { style: "none" }, catAxisLabelFontSize: 10, catAxisOrientation: "maxMin" }));
text(s, `20 key accounts earn 58.6 %; top-10 customers ${fmt1(D.top10_pct)} % of FY2026.`, { x: 8.5, y: 6.05, w: 4.2, h: 0.8, margin: 0 });
s.addNotes("Member 5 (7:30-8:15). We tested three forecasting models on a 12-month hold-out. The simple seasonal benchmark won at division level with 12.7 percent weighted error: this business repeats its seasons. FY2027 lands near N$ 466 million, plus 1.5 percent - below the 8 percent growth objective. K-means found five customer segments; 20 key accounts earn 59 percent of revenue, so concentration risk is real.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Insights" });
s.addText("Irrigation doubles maize yield; rain drives dryland swings", { placeholder: "title" });
const my = D.maize_yield, seasons = [...new Set(my.map((r) => r.season))];
const pick = (irr) => seasons.map((se) => (my.find((r) => r.season === se && r.irrigated === irr) || { y: 0 }).y);
s.addChart(pres.charts.BAR, [{ name: "Irrigated", labels: seasons, values: pick(true) }, { name: "Dryland", labels: seasons, values: pick(false) }],
  opt({ x: 0.6, y: 1.35, w: 7.2, h: 4.9, barDir: "col", barGrouping: "clustered", chartColors: [HEX.blue, HEX.orange], showValue: true,
    dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0", showLegend: true, legendPos: "b", title: "White maize yield, t/ha (completed cycles)", valAxisLabelFormatCode: "0" }));
stat(s, 8.2, 1.4, 4.5, "0.77", "within-farm rainfall elasticity of dryland maize - equals the generator's true value", C.accent2, 36);
stat(s, 8.2, 3.05, 4.5, "~N$ 16,000/ha", "margin per season from irrigating a dryland maize block, before capital cost", C.accent2, 32);
stat(s, 8.2, 4.7, 4.5, "1.00 vs 0.33", "precision: domain rule HV06 vs Isolation Forest on harvest keying errors", C.accent2, 32);
s.addNotes("Member 5 (8:15-8:45). Irrigated maize yields 8 to 9 tonnes a hectare every season; dryland swings with rain - 3.1 in the 2023/24 drought, 4.8 in the good 2024/25 season. Our fixed-effects regression recovers the true rainfall elasticity of 0.77, which validates the whole chain from ETL to drill-across. A pivot is worth about N$ 16,000 per hectare per season in margin. And for keying errors, our domain rule beats an unsupervised Isolation Forest - the forest is useful only for triage.");

s = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Insights" });
s.addText("Optimised: faster queries, smaller model, lighter refresh", { placeholder: "title" });
const pf = D.perf;
const SHORT = { Q1: "Q1 by category", Q2: "Q2 slicer", Q3: "Q3 top-10", Q4: "Q4 drill-through", Q5: "Q5 refresh window", Q6: "Q6 aggregate" };
s.addChart(pres.charts.BAR, [
  { name: "Baseline", labels: pf.map((r) => SHORT[r.q] || r.q), values: pf.map((r) => r.base) },
  { name: "Optimised", labels: pf.map((r) => SHORT[r.q] || r.q), values: pf.map((r) => r.opt) },
], opt({ x: 0.6, y: 1.35, w: 7.2, h: 5.3, barDir: "col", barGrouping: "clustered", chartColors: [HEX.orange, HEX.blue], showLegend: true, legendPos: "b",
  title: "Warehouse query latency, ms (median of 7 runs, log scale)", valAxisLogScaleBase: 10, valAxisLabelFormatCode: "0.0#" }));
const best = pf.reduce((a, b) => (b.x > a.x ? b : a));
stat(s, 8.2, 1.4, 4.5, `${Math.round(best.x)}x`, `faster: ${best.label.toLowerCase()} (covering index)`, C.accent1, 36);
stat(s, 8.2, 3.05, 4.5, "-32 %", "columns imported (243 to 165); model size proxy 16.0 to 10.8 MB", C.accent1, 36);
stat(s, 8.2, 4.7, 4.5, "-99.3 %", "rows per daily refresh with incremental refresh (302,903 to 2,162)", C.accent1, 36);
s.addNotes("Member 5 (8:45-9:15). Five techniques: B-tree, BRIN and covering indexes; a monthly aggregate table; removing unused and high-cardinality columns; incremental refresh with query folding; and DAX patterns that avoid iterators. The numbers on the right are measured. Power BI-side timings are captured with Performance Analyzer and DAX Studio in Desktop.");

pres.addSection({ title: "Close" });
s = pres.addSlide({ masterName: "GB_CLOSING", sectionTitle: "Close" });
s.addText("Recommendations", { placeholder: "title" });
[["Irrigate maize where water rights allow", "a 4.9 t/ha gap, about N$ 16,000/ha per season in margin"],
 ["De-risk revenue concentration", "57 % from 10 buyers, 60 % in one quarter: add a second export window"],
 ["Run the data-quality process weekly", "37 rules with named stewards; credit the N$ 4.9 m mispriced invoices"],
 ["Publish the Power BI app with RLS", "one trusted view for executives, zone managers and the export desk"]].forEach(([h, b], i) => {
  const y = 1.75 + i * 1.18;
  circleNum(s, i + 1, 0.8, y + 0.05, 0.6, C.background1, C.text2);
  s.addText([{ text: h, options: { bold: true, fontSize: 20, breakLine: true } }, { text: b, options: { fontSize: 16 } }],
    { x: 1.65, y, w: 10.9, h: 1.05, color: C.background1, margin: 0, valign: "top", isTextBox: true });
});
s.addText("Thank you - questions?", { x: 0.8, y: 6.55, w: 11.7, h: 0.5, fontSize: 20, bold: true, color: C.background2, isTextBox: true, fontFace: THEME.headFontFace });
s.addNotes("Member 1 (9:15-10:00). Four recommendations, each traced to evidence in the warehouse. Irrigate maize where water rights allow. Reduce concentration. Run the data-quality process weekly. Publish the app with row-level security. Thank you - we welcome your questions; each of us will answer on the part we built.");

pres.addSection({ title: "Backup" });
[["mockup_p2_production.png", "Backup: Production and Yield page", "Production and yield diagnostics page: yield by region and farm, yield by season and irrigation method, rainfall versus yield, harvest by month"],
 ["mockup_p3_advanced.png", "Backup: Advanced Analytics page", "Advanced analytics page: forecast with interval, yield drivers, customer segments"],
 ["mockup_p4_operations.png", "Backup: Operations and Data Quality page", "Operations page: closing stock, received versus dispatched, farm operations table, security and data-quality card"]].forEach(([img, t, alt]) => {
  const b = pres.addSlide({ masterName: "GB_CONTENT", sectionTitle: "Backup" });
  b.addText(t, { placeholder: "title" });
  b.addImage({ path: path.join(ROOT, "06_report/figures", img), x: 1.69, y: 1.3, w: 9.96, h: 5.6, altText: alt });
  b.addNotes("Backup slide for the demo: design mock-up rendered from warehouse data (replace with the Desktop screenshot).");
});

pres.writeFile({ fileName: OUT }).then(async () => {
  if (APPLY) {
    const { applyTheme } = require(APPLY);
    await applyTheme(OUT, THEME);
  }
  console.log("written", OUT);
});
