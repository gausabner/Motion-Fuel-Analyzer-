// build_presentation.js - builds GBHS_ABI820S_Presentation.pptx (14 slides + 4 backup) with pptxgenjs.
// Every number comes from deck_data.json (run deck_data.py first); images come from 06_report.
// Usage: NODE_PATH=<dir with pptxgenjs> node build_presentation.js [apply_theme.js path]
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const D = JSON.parse(fs.readFileSync(path.join(HERE, "deck_data.json"), "utf8"));
const OUT = path.join(HERE, "GBHS_ABI820S_Presentation.pptx");
const APPLY = process.argv[2];

const THEME = {
  name: "GBHS Health",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0B0B0B", lt1: "FFFFFF", dk2: "0E3A47", lt2: "EAF1F3",
    accent1: "2A78D6", accent2: "EB6834", accent3: "1BAF7A", accent4: "EDA100", accent5: "E87BA4", accent6: "6250D6",
    hlink: "2A78D6", folHlink: "6250D6",
  },
};
// hex copies for the options that take hex only (chart colours, grid lines)
const HEX = { ink: "0B0B0B", ink2: "52514E", grid: "E1E0D9", petrol: "0E3A47", blue: "2A78D6", orange: "EB6834", green: "1BAF7A", gray: "B9B8B1" };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.title = "Green Basket Health Services - ABI820S group presentation";
pres.subject = "End-to-end BI solution for patient flow, resource utilisation and disease surveillance";
pres.author = "ABI820S consulting group";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ------------------------------------------------------------------ layouts
pres.defineSlideMaster({
  title: "GBHS_TITLE",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.5, w: 11.7, h: 2.4, fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 4.15, w: 11.7, h: 1.3, fontSize: 20, color: C.background2, valign: "top", align: "left" }, text: "" } },
    { text: { text: "ABI820S Advanced Business Intelligence and Analytics | NUST | 28 October 2026", options: { x: 0.8, y: 6.6, w: 11.7, h: 0.4, fontSize: 12, color: C.background2 } } },
  ],
});
pres.defineSlideMaster({
  title: "GBHS_CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.3, w: 12.1, h: 0.85, fontSize: 28, bold: true, color: C.text2, valign: "middle", align: "left" }, text: "" } },
    { text: { text: "Green Basket Health Services (GBHS) | ABI820S group project", options: { x: 0.6, y: 7.0, w: 8, h: 0.3, fontSize: 10, color: C.text1 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.text1, align: "right" },
});
pres.defineSlideMaster({
  title: "GBHS_CLOSING",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 0.5, w: 11.7, h: 1.0, fontSize: 36, bold: true, color: C.background1, align: "left" }, text: "" } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.background2, align: "right" },
});

// ------------------------------------------------------------------ helpers
const n0 = (v) => Math.round(v).toLocaleString("en-US");
const n1 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function circleNum(slide, n, x, y, d = 0.55, fill = C.text2, color = C.background1) {
  slide.addText(String(n), { shape: pres.shapes.OVAL, x, y, w: d, h: d, fill: { color: fill }, color, fontSize: 16, bold: true,
    align: "center", valign: "middle", margin: 0, objectName: `step ${n}` });
}
function card(slide, x, y, w, h, name) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name });
}
function stat(slide, x, y, w, big, label, color = C.text2, bigSize = 36) {
  label = nb(label);
  slide.addText(nb(big), { x, y, w, h: 0.75, fontSize: bigSize, bold: true, color, margin: 0, isTextBox: true, fontFace: THEME.headFontFace, valign: "bottom" });
  slide.addText(label, { x, y: y + 0.8, w, h: 0.75, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true });
}
// keep a number and its unit on one line: non-breaking space before %, and in "95 % CI"
const nb = (t) => (typeof t === "string" ? t.replace(/(\d) %/g, "$1\u00A0%") : t.map((r) => Object.assign({}, r, { text: nb(r.text) })));
function text(slide, t, o) { slide.addText(nb(t), Object.assign({ isTextBox: true, fontSize: 14, color: C.text1, valign: "top" }, o)); }
const title = (slide, t) => slide.addText(nb(t), { placeholder: "title" });
const AX = { catAxisLabelColor: HEX.ink2, valAxisLabelColor: HEX.ink2, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
  catAxisLabelFontSize: 11, valAxisLabelFontSize: 11, valGridLine: { color: HEX.grid, size: 0.75 }, catGridLine: { style: "none" },
  titleFontFace: "+mn-lt", titleFontSize: 13, titleColor: HEX.ink, showTitle: true, dataLabelFontFace: "+mn-lt", dataLabelFontSize: 11,
  dataLabelColor: HEX.ink2, legendFontFace: "+mn-lt", legendFontSize: 11, legendColor: HEX.ink2 };
const opt = (o) => Object.assign({}, AX, o);
const by = (arr, k, v) => arr.find((r) => r[k] === v);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// ------------------------------------------------------------------ 1-3 problem
pres.addSection({ title: "Problem" });
let s = pres.addSlide({ masterName: "GBHS_TITLE", sectionTitle: "Problem" });
s.addText("Green Basket Health Services: one trusted view of patient flow, resource use and disease surveillance", { placeholder: "title" });
s.addText("End-to-end BI solution: PostgreSQL data warehouse, ELT with validated data quality, Power BI with row-level security, and four analytics techniques", { placeholder: "body" });
s.addNotes("Member 1 (0:00-0:30). Good morning. We are the consulting team engaged by Green Basket Health Services, five hospitals and five clinics in nine Namibian regions. In ten minutes we show how we turned nine disconnected data sources into one trusted view of patient flow, beds and staff, and disease surveillance, and what that view tells management. All patient data are synthetic; the census figures are real NSA values.");

const acc = D.access, a24 = by(acc, "year", 2024), a25 = by(acc, "year", 2025), first = acc[0], last = acc[acc.length - 1];
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Problem" });
title(s, `ED patients seen on time fell from ${Math.round(first.seen)} % to ${Math.round(last.seen)} %`);
s.addChart(pres.charts.BAR, [{ name: "Seen within target", labels: acc.map((r) => (r === last ? `${r.year} YTD` : String(r.year))), values: acc.map((r) => r.seen) }],
  opt({ x: 0.6, y: 1.35, w: 7.4, h: 4.7, barDir: "col", chartColors: [HEX.blue], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: '0.0" %"', showLegend: false, title: "ED patients seen within their SATS triage target, % (target 80 %)",
    valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, valAxisLabelFormatCode: "0", barGapWidthPct: 60 }));
text(s, `Attendances rose ${Math.round(100 * (a25.ed / a24.ed - 1))} % in 2025 with the malaria upsurge, and patients leaving without being seen almost doubled (${n1(first.lwbs)} % to ${n1(a25.lwbs)} %).`,
  { x: 0.6, y: 6.15, w: 7.4, h: 0.7, margin: 0 });
text(s, "Nine sources, no single truth", { x: 8.4, y: 1.4, w: 4.3, h: 0.45, margin: 0, bold: true, fontSize: 18, color: C.text2 });
stat(s, 8.4, 1.95, 4.3, n0(D.problems.duplicates), "duplicate attendance rows from overlapping yearly extracts", C.accent2, 32);
stat(s, 8.4, 3.55, 4.3, n0(D.problems.superseded_spells), "superseded spell images in the change-data-capture export", C.accent2, 32);
stat(s, 8.4, 5.15, 4.3, String(D.problems.condition_spellings), "spellings of 9 notifiable conditions in the IDSR returns", C.accent2, 32);
s.addNotes(`Member 1 (0:30-1:15). Between 2022 and 2024 about ${Math.round(a24.seen)} percent of ED patients were seen within their South African Triage Scale target. In 2025 that fell to ${n1(a25.seen)} percent and it has not recovered. Management could not tell whether demand, beds or staff were to blame, because the data sat in nine places: the patient administration system, paper ward returns, the e-roster, weekly IDSR returns, a master-data workbook and two external sources. Profiling found ${n0(D.problems.duplicates)} duplicate attendance rows, ${n0(D.problems.superseded_spells)} superseded spell images and ${D.problems.condition_spellings} spellings of nine notifiable conditions.`);

s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Problem" });
s.addText("Five business questions, each tied to a KPI and a 2027 target", { placeholder: "title" });
const ww = D.warning_weeks["2025"];
const BQ = [
  ["Patient flow: are ED patients seen within their triage target, and what drives the delays?", "Seen within target %, median door-to-doctor, LWBS %, arrivals per doctor-shift", "≥ 80 % seen within target", `2025: ${n1(a25.seen)} %`],
  ["Resource use: are beds and nursing hours matched to demand by facility, ward and season?", "Bed occupancy, discharges before noon, length of stay, nursing hours per patient day", "≥ 40 % discharged before noon", `2025: ${n1(D.inpatient_2025.before_noon)} %`],
  ["Surveillance: where are notifiable diseases rising, and is IDSR reporting complete and on time?", "Notified cases, incidence per 1,000 person-years, positivity, completeness, timeliness", "≥ 80 % complete and on time", `2025: ${n1(D.idsr_2025.completeness)} % and ${n1(D.idsr_2025.timeliness)} %`],
  ["Preparedness: how many malaria cases should the north-east expect in the next 4\u201313 weeks?", "Forecast with 80 % interval, back-test error (WAPE)", "≥ 4 weeks' warning before the peak", `2025: ${Math.min(...ww)}\u2013${Math.max(...ww)} weeks`],
  ["Safe transitions: which discharged patients are most likely to be readmitted within 30 days?", "30-day readmission rate, top-20 % risk capture, calibration", "≤ 12 % readmitted within 30 days", `2025: ${n1(D.inpatient_2025.readmission)} %`],
];
text(s, "Target 2027 and 2025 baseline", { x: 9.15, y: 1.3, w: 3.55, h: 0.35, margin: 0, bold: true, fontSize: 14, color: C.text2 });
BQ.forEach(([q, k, t, b], i) => {
  const y = 1.75 + i * 1.03;
  circleNum(s, i + 1, 0.6, y + 0.12);
  text(s, [{ text: q, options: { bold: true, fontSize: 16, breakLine: true } }, { text: k, options: { fontSize: 14, color: C.text1 } }], { x: 1.4, y, w: 7.5, h: 0.95, margin: 0 });
  card(s, 9.15, y, 3.55, 0.88, `target ${i + 1}`);
  text(s, [{ text: t, options: { bold: true, breakLine: true, color: C.text2 } }, { text: b, options: { color: C.text1 } }], { x: 9.3, y: y + 0.06, w: 3.3, h: 0.76, margin: 0, fontSize: 14, valign: "middle" });
});
s.addNotes("Member 1 (1:15-1:45). Five business questions, each tied to one of the five strategic objectives, a KPI with an explicit definition, a 2025 baseline from the warehouse and a 2027 target agreed with the executive committee. Every page of the dashboard answers one or two of these questions; nothing on a page exists without a question behind it.");

// ------------------------------------------------------------------ 4-9 solution
pres.addSection({ title: "Solution" });
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Solution" });
s.addText("ELT in PostgreSQL 16: from raw extracts to one semantic model", { placeholder: "title" });
s.addImage({ path: path.join(ROOT, "06_report/diagrams/architecture.png"), x: 0.6, y: 1.45, w: 7.7, h: 4.7,
  altText: "Architecture: nine sources land in PostgreSQL, are cleansed in staging, loaded into a constellation of facts and dimensions, exposed through mart views to the Power BI semantic model and report; Python analytics write their outputs back" });
[["Lossless landing", "every warehouse figure traces back to its source file and row"],
 [`${D.dq_rules} DQ rules, ${(D.recon.PASS || 0) + (D.recon.WARN || 0) + (D.recon.FAIL || 0)} reconciliation checks`, "run on every load; each issue is logged with an owner"],
 ["One command, about 5 minutes", "python run_all.py rebuilds data, warehouse, evidence, model and backup"]].forEach(([h, b], i) => {
  const y = 1.6 + i * 1.75;
  circleNum(s, i + 1, 8.75, y);
  text(s, [{ text: h, options: { bold: true, fontSize: 18, breakLine: true, color: C.text2 } }, { text: b, options: { fontSize: 14 } }], { x: 9.5, y: y - 0.05, w: 3.2, h: 1.5, margin: 0 });
});
s.addNotes(`Member 3 (1:45-2:30). Extract, load, then transform inside PostgreSQL. Raw files land unchanged as text with their file name and row number, so any number can be traced back. Cleansed staging applies ${D.dq_rules} rules; the dimensional layer holds 8 facts and 13 conformed dimensions; thin mart views feed Power BI, and the Python analytics write forecasts, risk deciles and outbreak alerts back to the same schema. One command rebuilds everything, including a day-2 incremental load, in about five minutes.`);

const ro = D.rundu_occ, peak = ro.reduce((a, b) => (b.as_was > a.as_was ? b : a));
const bedsThen = D.rundu_beds[0].beds, bedsNow = D.rundu_beds[D.rundu_beds.length - 1].beds;
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Solution" });
title(s, "Type 2 history keeps the crowding visible");
s.addImage({ path: path.join(ROOT, "06_report/diagrams/erd_resource.png"), x: 0.6, y: 1.35, w: 4.76, h: 5.0,
  altText: "ERD of the ward census and e-roster facts with the Date and Shift dimensions and the snowflaked Care Unit to Facility to Region hierarchy" });
text(s, "ERD 3 of 5: Care Unit → Facility → Region is snowflaked, because some facts are recorded per ward and others per facility.", { x: 0.6, y: 6.4, w: 4.76, h: 0.55, margin: 0, fontSize: 12 });
s.addChart(pres.charts.LINE, [
  { name: "Beds valid that month (SCD Type 2)", labels: ro.map((r) => r.m), values: ro.map((r) => r.as_was) },
  { name: `Today's ${bedsNow} beds (no history)`, labels: ro.map((r) => r.m), values: ro.map((r) => r.as_is) },
], opt({ x: 5.8, y: 1.35, w: 6.9, h: 4.35, chartColors: [HEX.orange, HEX.gray], lineSize: 2, lineDataSymbol: "none", showLegend: true, legendPos: "b",
  title: "Rundu medical ward, monthly bed occupancy %", catAxisLabelFrequency: 6, catAxisLabelRotate: 0, valAxisMinVal: 0, valAxisLabelFormatCode: "0" }));
text(s, [{ text: `${monthName(peak.m)}: ${Math.round(peak.as_was)} % of the ${bedsThen} beds the ward had, not ${Math.round(peak.as_is)} % of today's ${bedsNow}. `, options: { bold: true } },
  { text: "Without Type 2 history, the malaria-season crowding that justified the expansion disappears." }], { x: 5.8, y: 5.85, w: 6.9, h: 1.0, margin: 0 });
s.addNotes(`Member 2 (2:30-3:15). Eight fact tables of four types - transaction, accumulating snapshot, periodic snapshot and factless coverage - share 13 conformed dimensions. We snowflaked Care Unit to Facility to Region because attendances and the census are recorded per ward while IDSR returns and weather are recorded per facility: one conformed Facility table filters both. Wards and patients keep Type 2 history. The chart shows why: Rundu's medical ward grew from ${bedsThen} to ${D.rundu_beds[1].beds} beds in April 2025 and to ${bedsNow} in October 2026. Measured against the beds it actually had, it ran at ${Math.round(peak.as_was)} percent in ${monthName(peak.m)}; against today's beds that crowding would vanish. Another example: WHK-MED2 was a COVID-19 isolation ward from January to March 2022, and spells in that period keep that version.`);

const dv = D.dq_validation;
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Solution" });
title(s, `${n0(dv.found)} of ${n0(dv.injected)} injected defects caught, ${dv.false_positives} false positives`);
stat(s, 0.6, 1.4, 3.4, `${n0(dv.found)}`, `of ${n0(dv.injected)} damaged records flagged by their own rule; the other ${dv.injected - dv.found} by another rule`, C.accent3, 36);
stat(s, 0.6, 3.15, 3.4, String(dv.false_positives), "false positives: no good record was changed", C.accent3, 36);
stat(s, 0.6, 4.9, 3.4, String(D.dq_rules), "rules, each with an owner, a DQ dimension and a logged action", C.accent3, 36);
const dd = D.dq_dims;
s.addChart(pres.charts.BAR, [{ name: "Issues", labels: dd.map((r) => r.dim), values: dd.map((r) => r.n) }],
  opt({ x: 4.25, y: 1.35, w: 4.4, h: 5.3, barDir: "bar", chartColors: [HEX.blue], showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: "#,##0", showLegend: false, title: "Issues logged in the full load, by DQ dimension (log scale)", valAxisLogScaleBase: 10,
    valAxisHidden: true, valGridLine: { style: "none" }, catAxisOrientation: "maxMin" }));
card(s, 8.95, 1.4, 3.75, 2.5, "fix card 1");
text(s, [{ text: "WC02: ×10 errors hid in small wards", options: { bold: true, breakLine: true, color: C.text2 } },
  { text: "A '3 × the bed complement' test missed 2 → 20 in a 24-bed ward. The PAS midnight count, added as a second witness, now catches all of them.", options: { fontSize: 14 } }],
  { x: 9.1, y: 1.5, w: 3.45, h: 2.3, margin: 0, valign: "middle" });
card(s, 8.95, 4.1, 3.75, 2.5, "fix card 2");
text(s, [{ text: "SV04: deaths are reported late", options: { bold: true, breakLine: true, color: C.text2 } },
  { text: "'Deaths > cases' fired on real deaths reported a week after the case. A margin of 3 removed the false alarms and still catches every injected defect.", options: { fontSize: 14 } }],
  { x: 9.1, y: 4.2, w: 3.45, h: 2.3, margin: 0, valign: "middle" });
s.addNotes(`Member 3 (3:15-4:00). Because the internal data are synthetic, the generator recorded every defect it injected, so we could measure our rules instead of trusting them. ${n0(dv.found)} of ${n0(dv.injected)} damaged records were flagged by their own rule and the remaining ${dv.injected - dv.found} by another rule; no good record was changed. Validation also improved two rules: a x10 keying error in a small ward slipped under a '3 times the beds' test until we added the PAS midnight count as a second witness, and the deaths-greater-than-cases rule fired on genuine deaths reported a week after the case until we allowed a margin.`);

const rc = D.recon, rTot = (rc.PASS || 0) + (rc.WARN || 0) + (rc.FAIL || 0);
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Solution" });
s.addText("Reconciled, owned and secured", { placeholder: "title" });
stat(s, 0.6, 1.4, 3.6, `${rc.PASS || 0} / ${rTot}`, `checks pass after the day-2 load; ${rc.WARN || 0} WARN explained, ${rc.FAIL || 0} FAIL`, C.accent3, 36);
text(s, [{ text: "R07 WARN: ", options: { bold: true } }, { text: "25 spells never discharged in the PAS add 17,242 bed-days the wards never had; now a steward task.", options: { breakLine: true } },
  { text: "R22 WARN: ", options: { bold: true } }, { text: "3 ward-days above 200 % occupancy; 6,002 days above 100 % are plausible overflow." }],
  { x: 0.6, y: 3.3, w: 3.6, h: 3.3, margin: 0, paraSpaceAfter: 10 });
[["Owners", "Chief Operating Officer (operational data); Clinical Director and Head of Surveillance (clinical and IDSR data)"],
 ["Stewards", "Nine rule owners, from the Health Information Manager to the Surveillance Officer, work weekly issue queues"],
 ["Custodian", "The BI team runs the pipeline, backups and change control; IT security reviews access quarterly"]].forEach(([h, b], i) => {
  const y = 1.4 + i * 1.75;
  card(s, 4.55, y, 3.95, 1.55, `role ${h}`);
  text(s, [{ text: h, options: { bold: true, breakLine: true, color: C.text2 } }, { text: b, options: { fontSize: 14 } }], { x: 4.7, y: y + 0.1, w: 3.65, h: 1.4, margin: 0 });
});
text(s, [
  { text: "Dynamic RLS: each facility manager sees only their own facilities", options: { bullet: true, breakLine: true } },
  { text: "OLS: the MoHSS surveillance partner sees aggregates only; patient tables are hidden", options: { bullet: true, breakLine: true } },
  { text: "Pseudonymised patients, no direct identifiers; counts of 1\u20134 suppressed in external outputs", options: { bullet: true, breakLine: true } },
  { text: "Namibian law: Constitution Art. 13 (privacy), Public and Environmental Health Act 2015 (notification); the Data Protection Bill is not yet law, so we design to its principles and to GDPR, POPIA and HIPAA", options: { bullet: true } },
], { x: 8.85, y: 1.4, w: 3.85, h: 5.3, margin: 0, paraSpaceAfter: 8 });
s.addNotes(`Member 3 (4:00-4:30). ${rTot} reconciliation checks run after every load: row counts, control totals, cross-source comparisons, integrity and plausibility. ${rc.PASS || 0} pass. The two warnings are findings, not pipeline errors: 25 spells never closed in the PAS, and three implausible ward-days. Every rule has a named steward. Security is layered: least-privilege database roles, dynamic row-level security per facility, object-level security for the Ministry's surveillance partner, sensitivity labels, pseudonymisation and small-cell suppression. Namibia's Data Protection Bill is not yet enacted, so we design to its principles and benchmark against GDPR, POPIA and HIPAA.`);

const md = D.model;
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Solution" });
title(s, `Semantic model: ${md.measures} governed measures, RLS and OLS`);
[["Import", "+ incremental refresh (5 years, 10 days)"], [String(md.measures), `DAX measures in ${md.folders} display folders`],
 [String(md.relationships), "relationships, one-to-many, single direction"], [String(md.roles), "security roles: dynamic and static RLS, OLS"]].forEach(([b, l], i) => {
  const x = 0.6 + i * 3.05;
  card(s, x, 1.3, 2.85, 1.25, `model stat ${i + 1}`);
  text(s, [{ text: b, options: { bold: true, fontSize: 28, breakLine: true, color: C.text2, fontFace: THEME.headFontFace } }, { text: l, options: { fontSize: 14 } }], { x: x + 0.15, y: 1.36, w: 2.6, h: 1.15, margin: 0 });
});
s.addText(D.dax.code, { x: 0.6, y: 2.75, w: 6.3, h: 3.6, fontFace: "Courier New", fontSize: 11, color: C.text1, fill: { color: C.background2 }, margin: 0.12,
  valign: "top", isTextBox: true, objectName: "DAX epi-year to date" });
const pick = (u, r) => D.rls.find((x) => x.upn.startsWith(u) && (!r || x.role.startsWith(r)));
const RL = [["Executive (all facilities)", pick("*(none)*", "Executive")], ["fm.katima (dynamic RLS)", pick("fm.katima")], ["fm.rundu (dynamic RLS)", pick("fm.rundu")],
  ["Unmapped user", pick("intruder")], ["North-East Zone (static)", pick("*(none)*", "North-East")], ["Surveillance Partner (OLS)", pick("*(none)*", "Surveillance")]];
const hdr = (t, al) => ({ text: t, options: { bold: true, align: al || "left", color: HEX.petrol } });
const rows = [[hdr("Identity"), hdr("Facilities", "right"), hdr("ED 2025", "right"), hdr("Malaria 2025", "right")]];
RL.forEach(([label, r]) => {
  const ed = r.ed2025.startsWith("error") ? "hidden" : r.ed2025;
  rows.push([label, { text: r.facilities, options: { align: "right" } }, { text: ed, options: { align: "right" } }, { text: r.mal2025, options: { align: "right" } }]);
});
s.addTable(rows, { x: 7.2, y: 2.75, w: 5.5, colW: [2.45, 0.95, 0.95, 1.15], fontSize: 13, color: HEX.ink, border: { type: "solid", pt: 0.5, color: HEX.grid }, fill: { color: "FFFFFF" }, margin: 0.05 });
text(s, "Expected values computed in SQL with the DAX logic; tested with View as role in Power BI Desktop. The five managers sum to the executive total.", { x: 7.2, y: 5.05, w: 5.5, h: 0.75, margin: 0, fontSize: 12 });
text(s, [{ text: "Left: ", options: { bold: true } }, { text: "IDSR counts by ISO epi week, and 2025-W01 began on 30 December 2024, so TOTALYTD would cut weeks in half. This measure filters the Epi Year attribute instead." }],
  { x: 7.2, y: 5.85, w: 5.5, h: 0.9, margin: 0, fontSize: 12 });
s.addNotes(`Member 4 (4:30-5:15). Import mode: about 0.9 million rows compress to roughly 12.5 megabytes, and incremental refresh re-reads only the last ten days. ${md.measures} measures carry descriptions and display folders. One example on the left: IDSR reports by ISO epi week, and epi year 2025 began on 30 December 2024, so a calendar TOTALYTD would cut weeks in half; this measure filters the Epi Year attribute instead. Malaria incidence uses person-time, so one measure works for a week or for five years. Row-level security maps each facility manager to their facilities from a warehouse table; the expected totals per identity come from SQL, and the View-as test in Desktop must match them.`);

s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Solution" });
s.addText("Live demo: from headline to ward in four steps", { placeholder: "title" });
s.addImage({ path: path.join(ROOT, "06_report/figures/mockup_p1_executive.png"), x: 0.6, y: 1.35, w: 8.6, h: 4.84,
  altText: "Executive Overview page: KPI cards for ED attendances, seen within target, waits, occupancy and readmissions; monthly trend against target; occupancy by hospital; facility scorecard" });
text(s, "Design mock-up rendered from warehouse data; replaced by the Power BI screenshot after the Desktop build.", { x: 0.6, y: 6.3, w: 8.6, h: 0.5, margin: 0, fontSize: 12 });
const kat = pick("fm.katima");
["Executive page, 2026: the KPI cards answer 'are we on track?'", "Drill through from the scorecard to Katima Mulilo",
 "Patient Flow page: drill Region › Facility › Ward, then Disease Surveillance", `View as fm.katima: ${kat.facilities} facility, ${kat.ed2025} ED attendances in 2025; then as the surveillance partner`].forEach((t, i) => {
  const y = 1.45 + i * 1.25;
  circleNum(s, i + 1, 9.5, y);
  text(s, t, { x: 10.2, y: y - 0.02, w: 2.5, h: 1.15, margin: 0 });
});
s.addNotes(`Member 4 (5:15-6:45). Demo path. One: the Executive Overview with Calendar Year 2026 - attendances, seen within target, median wait, occupancy and readmissions, each against target. Two: right-click Katima Mulilo in the scorecard and drill through to Facility Detail. Three: the Patient Flow page, expanding the matrix from Region to Facility to Ward; then the Disease Surveillance page with the epi-week trend and the rainfall lead indicator. Four: Modeling, View as role, fm.katima - one facility, ${kat.ed2025} attendances in 2025; then the Surveillance Partner role, where the patient tables disappear from the field list. If the live demo fails, use backup slides 15 to 18.`);

// ------------------------------------------------------------------ 10-13 insights
pres.addSection({ title: "Insights" });
const ols1 = D.ols[0], iv = (f, y) => D.intervention.find((r) => r.facility === f && r.year === y);
const dKat = iv("Katima Mulilo", 2026).seen - iv("Katima Mulilo", 2025).seen, dRun = iv("Rundu", 2026).seen - iv("Rundu", 2025).seen,
  dOsh = iv("Oshakati", 2026).seen - iv("Oshakati", 2025).seen;
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Insights" });
title(s, `Load per doctor drives the waits: ${ols1.effect} per extra arrival`);
const lc = D.load_curve;
s.addChart(pres.charts.BAR, [{ name: "Median wait", labels: lc.map((r) => r.band), values: lc.map((r) => r.median) }],
  opt({ x: 0.6, y: 1.35, w: 7.4, h: 4.75, barDir: "col", chartColors: [HEX.blue], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0",
    showLegend: false, title: "Median wait of urgent (YELLOW) patients, minutes, by arrivals per doctor in the 12-hour shift", valAxisMinVal: 0,
    valAxisLabelFormatCode: "0", barGapWidthPct: 50 }));
text(s, `The YELLOW target is 60 minutes; above 16 arrivals per doctor the median wait reaches ${Math.round(lc[lc.length - 1].median)}.`, { x: 0.6, y: 6.2, w: 7.4, h: 0.6, margin: 0 });
stat(s, 8.4, 1.4, 4.3, ols1.effect, `longer wait per extra arrival per doctor-shift (OLS, 95 % CI ${ols1.ci})`, C.accent1, 36);
stat(s, 8.4, 3.1, 4.3, `+${n1(dKat)} points`, `seen within target at Katima Mulilo with a second day-shift doctor (Jan\u2013Jun 2026 against 2025)`, C.accent1, 36);
stat(s, 8.4, 4.8, 4.3, `+${n1(dRun)} vs +${n1(dOsh)}`, "Rundu (extra doctor) against Oshakati (none): a difference-in-differences pattern", C.accent1, 36);
s.addNotes(`Member 5 (6:45-7:30). We joined each attendance to the doctors rostered in its shift and to hospital occupancy that day - a drill-across through conformed dimensions. After adjusting for triage and facility, each extra arrival per doctor in a shift adds ${ols1.effect} to the wait; at more than 16 arrivals per doctor the median urgent patient waits ${Math.round(lc[lc.length - 1].median)} minutes against a 60-minute target. The 2026 natural experiment confirms it: with a second day-shift doctor from January to June, Katima Mulilo improved by ${n1(dKat)} points and Rundu by ${n1(dRun)}, while Oshakati, without one, moved ${n1(dOsh)}. The regression is observational; the experiment is the stronger evidence.`);

const mw = D.malaria_weekly, w25 = D.warning_weeks["2025"], w26 = D.warning_weeks["2026"];
const lo = Math.min(...w25, ...w26), hi = Math.max(...w25, ...w26);
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Insights" });
title(s, `Malaria early warning: ${lo}\u2013${hi} weeks before the peak`);
s.addChart(pres.charts.LINE, [{ name: "Malaria attendances", labels: mw.map((r) => r.w), values: mw.map((r) => r.n) }],
  opt({ x: 0.6, y: 1.35, w: 7.6, h: 4.75, chartColors: [HEX.blue], lineSize: 2, lineDataSymbol: "none", showLegend: false,
    title: "Weekly malaria attendances, Rundu, Katima Mulilo and Nkurenkuru (PAS, ICD-10 B50-B54)", catAxisLabelFrequency: 52, valAxisMinVal: 0, valAxisLabelFormatCode: "#,##0" }));
text(s, `Seasonal peaks in epi weeks ${D.malaria_peaks["2025"]} and ${D.malaria_peaks["2026"]}; the 2025 and 2026 seasons were far larger than 2022\u20132024.`, { x: 0.6, y: 6.2, w: 7.6, h: 0.6, margin: 0 });
stat(s, 8.6, 1.4, 4.1, "4\u20138 weeks", `rainfall lead indicator: SARIMAX coefficient ${D.sarimax_rain} on log rainfall, p < 0.001`, C.accent2, 36);
stat(s, 8.6, 3.1, 4.1, `${lo}\u2013${hi} weeks`, "historical-limits alert before the seasonal peak, in time to extend clinic hours", C.accent2, 36);
stat(s, 8.6, 4.8, 4.1, D.wape_h1, "forecast error (WAPE) one week ahead, Holt-Winters, rolling-origin back-test", C.accent2, 36);
s.addNotes(`Member 5 (7:30-8:15). Malaria in the north-east follows the rains with a lag: rainfall four to eight weeks earlier is a significant driver in our SARIMAX model. The WHO-style historical-limits threshold fired ${lo} to ${hi} weeks before the 2025 and 2026 peaks - enough to start the roster uplift, but less than our 4-week objective, so the next step is rainfall-triggered thresholds. For stock planning, Holt-Winters forecasts one week ahead with ${D.wape_h1} weighted error in a 52-week rolling-origin back-test.`);

const rm = D.readmission, cal = D.calibration, cus = by(D.outbreaks, "method", "CUSUM"), c2 = by(D.outbreaks, "method", "EARS C2");
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Insights" });
s.addText("Target the follow-up calls; catch outbreaks within a week", { placeholder: "title" });
s.addChart(pres.charts.BAR, [
  { name: "Predicted", labels: cal.map((r) => String(r.decile)), values: cal.map((r) => r.pred) },
  { name: "Observed", labels: cal.map((r) => String(r.decile)), values: cal.map((r) => r.obs) },
], opt({ x: 0.6, y: 1.35, w: 6.9, h: 4.75, barDir: "col", barGrouping: "clustered", chartColors: [HEX.gray, HEX.blue], showLegend: true, legendPos: "b",
  title: "30-day readmission rate by decile of predicted risk, test set (%)", valAxisMinVal: 0, valAxisLabelFormatCode: "0", catAxisTitle: "Risk decile", showCatAxisTitle: true,
  catAxisTitleFontSize: 11, catAxisTitleColor: HEX.ink2, catAxisTitleFontFace: "+mn-lt" }));
text(s, "Well calibrated: predicted and observed rates agree in every decile, so the scores can be read as probabilities.", { x: 0.6, y: 6.2, w: 6.9, h: 0.6, margin: 0 });
stat(s, 7.9, 1.4, 4.8, `${Math.round(rm.capture_top20)} %`, `of readmissions fall in the top 20 % of predicted risk: ${(rm.capture_top20 / 20).toFixed(1)} times random (AUC ${rm.auc.toFixed(2)})`, C.accent1, 36);
stat(s, 7.9, 3.1, 4.8, cus.detected.replace(" / ", " of "), `injected outbreaks found by CUSUM, median delay ${Math.round(Number(cus.delay))} week, under 1 false alert per 100 facility-condition-weeks`, C.accent1, 36);
stat(s, 7.9, 4.8, 4.8, c2.detected.replace(" / ", " of "), "for EARS C2; both missed a 22-case measles cluster in a busy clinic", C.accent1, 36);
s.addNotes(`Member 5 (8:15-8:45). Thirty-day readmissions: a gradient-boosting model trained on spells before July 2025 and tested on later ones. An AUC of ${rm.auc.toFixed(2)} is typical for readmission models, and the model is well calibrated. Its value is prioritisation: calling the top 20 percent of patients by risk - about ${n0(rm.calls_per_year)} a year - reaches ${Math.round(rm.capture_top20)} percent of all readmissions. It ranks a call list; it never decides care. For surveillance, the generator injected 12 outbreaks; CUSUM found ${cus.detected.replace(" / ", " of ")} with a median delay of one week, EARS C2 found ${c2.detected.replace(" / ", " of ")}.`);

const pf = D.perf, pm = D.perf_model;
const SHORT = { Q1: "Q1 monthly KPIs", Q2: "Q2 slicer", Q3: "Q3 ward drill", Q4: "Q4 patient drill", Q5: "Q5 refresh window", Q6: "Q6 aggregate" };
s = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Insights" });
s.addText("Optimised: faster queries, smaller model, lighter refresh", { placeholder: "title" });
s.addChart(pres.charts.BAR, [
  { name: "Baseline (primary keys only)", labels: pf.map((r) => SHORT[r.q] || r.q), values: pf.map((r) => r.base) },
  { name: "Optimised", labels: pf.map((r) => SHORT[r.q] || r.q), values: pf.map((r) => r.opt) },
], opt({ x: 0.6, y: 1.35, w: 7.2, h: 5.3, barDir: "col", barGrouping: "clustered", chartColors: [HEX.orange, HEX.blue], showLegend: true, legendPos: "b",
  title: "Warehouse query latency, ms (median of 7 runs, log scale)", valAxisLogScaleBase: 10, valAxisLabelFormatCode: "#,##0.##" }));
const best = pf.reduce((a, b) => (b.x > a.x ? b : a));
stat(s, 8.2, 1.4, 4.5, `${Math.round(best.x)}×`, "faster patient drill-through: an index on the patient key", C.accent1, 36);
stat(s, 8.2, 3.1, 4.5, `-${Math.round(100 * (1 - pm.size_opt / pm.size_naive))} %`, `model size: ${n1(pm.size_naive)} to ${n1(pm.size_opt)} MB (columnar proxy for VertiPaq)`, C.accent1, 36);
stat(s, 8.2, 4.8, 4.5, `-${n1(100 * (1 - pm.rows_incr / pm.rows_full))} %`, `rows per daily refresh with incremental refresh (${n0(pm.rows_full)} to ${n0(pm.rows_incr)})`, C.accent1, 36);
s.addNotes(`Member 5 (8:45-9:15). We measured before we optimised. Seven techniques: B-tree indexes on fact foreign keys, a BRIN index on the arrival date, an aggregate table, removing unused and high-cardinality columns such as the encounter number, incremental refresh, a set-based idempotent ELT, and a stored durable patient key. Results: the patient drill-through is ${Math.round(best.x)} times faster, the model is ${Math.round(100 * (1 - pm.size_opt / pm.size_naive))} percent smaller, and a daily refresh reads ${n0(pm.rows_incr)} rows instead of ${n0(pm.rows_full)}. Two queries did not improve, because a full scan is already optimal for them; we report that rather than hide it. Power BI timings are recorded with Performance Analyzer and DAX Studio in Desktop.`);

// ------------------------------------------------------------------ 14 recommendations
pres.addSection({ title: "Close" });
s = pres.addSlide({ masterName: "GBHS_CLOSING", sectionTitle: "Close" });
s.addText("Recommendations", { placeholder: "title" });
[["Season-triggered roster uplift", `an extra ED day-shift doctor at Rundu and Katima Mulilo from January to May; the 2026 test recovered ${Math.round(dRun)}\u2013${Math.round(dKat)} points`],
 ["Discharge before noon, occupancy below 85 %", `${n1(D.inpatient_2025.before_noon)} % of discharges leave before noon; a 40 % target frees beds for the afternoon ED peak`],
 ["Call the top 20 % risk patients within 72 hours", `about ${n0(Math.round(rm.calls_per_year / 100) * 100)} patients a year, reaching ${Math.round(rm.capture_top20)} % of all 30-day readmissions`],
 ["Run the DQ process weekly and publish the app", `${D.dq_rules} rules with named stewards; facility RLS for managers, aggregates only for the MoHSS`]].forEach(([h, b], i) => {
  const y = 1.75 + i * 1.18;
  circleNum(s, i + 1, 0.8, y + 0.05, 0.6, C.background1, C.text2);
  s.addText([{ text: h, options: { bold: true, fontSize: 20, breakLine: true } }, { text: b, options: { fontSize: 16 } }],
    { x: 1.65, y, w: 10.9, h: 1.05, color: C.background1, margin: 0, valign: "top", isTextBox: true });
});
s.addText("Thank you \u2013 questions?", { x: 0.8, y: 6.55, w: 11.7, h: 0.5, fontSize: 20, bold: true, color: C.background2, isTextBox: true, fontFace: THEME.headFontFace });
s.addNotes("Member 1 (9:15-10:00). Four recommendations, each traced to evidence in the warehouse. First, trigger a roster uplift with the malaria season: the extra doctor was the only intervention with a measured effect. Second, discharge before noon and keep occupancy below 85 percent, so that morning beds are free for the afternoon ED peak. Third, a 72-hour follow-up call for the highest-risk fifth of discharges. Fourth, run the data-quality process weekly with named stewards and publish the Power BI app with row-level security. Thank you - each of us will answer questions on the part we built.");

// ------------------------------------------------------------------ 15-18 backup
pres.addSection({ title: "Backup" });
[["mockup_p2_flow.png", "Backup: Patient Flow & Resources page", "Patient Flow and Resources page: drill-down matrix Region to Facility to Ward, waits by hour, occupancy against patients seen on time, triage and load per doctor"],
 ["mockup_p3_surveillance.png", "Backup: Disease Surveillance page", "Disease Surveillance page: epi-year-to-date cards, weekly malaria against last year, rainfall lead indicator, incidence pivot by facility and epi year, IDSR completeness and timeliness"],
 ["mockup_p4_advanced.png", "Backup: Advanced Analytics & Data Quality page", "Advanced Analytics page: malaria forecast with interval, readmission calibration by decile, ED wait drivers, outbreak alerts and data-quality rules"],
 ["mockup_p5_drillthrough.png", "Backup: Facility Detail drill-through (Rundu)", "Facility Detail drill-through page for Rundu: KPI cards, seen within target by month, bed occupancy by ward, weekly malaria cases and staffing by year"]].forEach(([img, t, alt]) => {
  const b = pres.addSlide({ masterName: "GBHS_CONTENT", sectionTitle: "Backup" });
  b.addText(t, { placeholder: "title" });
  b.addImage({ path: path.join(ROOT, "06_report/figures", img), x: 1.69, y: 1.3, w: 9.96, h: 5.6, altText: alt });
  b.addNotes("Backup slide for the demo: design mock-up rendered from warehouse data (replace with the Power BI Desktop screenshot).");
});

pres.writeFile({ fileName: OUT }).then(async () => {
  if (APPLY) {
    const { applyTheme } = require(APPLY);
    await applyTheme(OUT, THEME);
  }
  console.log("written", OUT);
});
