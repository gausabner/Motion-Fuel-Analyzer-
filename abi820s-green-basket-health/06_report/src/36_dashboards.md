# 3.6 Dashboards and visual analytics

## Pages

The report `GBHS_Health.Report` has **four report pages**, one drill-through page and one report-page tooltip. The
brief asks for at least three: an executive, an analytical/diagnostic and an advanced/operational page. The pages
contain 71 visuals; every one of the 67 data visuals has alt text, a title and a keyboard tab order.

<!-- table: Report pages, audiences and the business questions they answer -->

| Page | Type (brief) | Audience | Answers | Main visuals |
|---|---|---|---|---|
| 1 Executive Overview | Executive | CEO, executive committee, board | BQ1–BQ3 at a glance; KPIs against targets | 6 KPI cards; line chart of patients seen within target against the previous year and the 80 % target; occupancy by hospital; malaria by month; facility scorecard |
| 2 Patient Flow & Resources | Analytical / diagnostic | Facility, ED and nursing managers | BQ1, BQ2: *why* are waits long, and where are beds and staff stretched? | Load and staffing cards; Region › Facility › Ward matrix (drill-down); median wait by arrival hour; access-block scatter of occupancy against patients seen on time; patients seen within target by triage; arrivals per doctor-shift |
| 3 Disease Surveillance | Operational | Surveillance officers, MoHSS partner, task team | BQ3: where and when are diseases rising? Is reporting complete? | Epi-YTD, incidence, positivity, completeness and timeliness cards; weekly malaria against the same week last year; cases by condition; rainfall lead indicator; incidence pivot facility × epi year; reporting compliance by facility |
| 4 Advanced Analytics & DQ | Advanced | Analysts, BI team, data stewards, the security officer | BQ4, BQ5, model quality, data quality, RLS check | Forecast with back-test and 80 % interval; readmission calibration by decile; ED wait drivers; outbreak alerts table; DQ issues by rule; facilities visible under RLS |
| Facility Detail (drill-through) | Diagnostic | Managers | One facility on one page | 6 KPI cards; patients seen within target against the target; occupancy by ward; weekly malaria; staffing by year |
| KPI Tooltip (report-page tooltip) | – | Everyone | Context on hover | Seen within target with ▲/▼ status, median wait, LWBS, occupancy, readmissions |

<!-- figure: figures/mockup_p1_executive.png | Page 1 - Executive Overview (calendar year 2026, design mock-up rendered from the warehouse) | width=100% -->

<!-- figure: figures/mockup_p2_flow.png | Page 2 - Patient Flow & Resources: drill-down matrix, wait by hour, access-block scatter, triage and load (all years) | width=100% -->

<!-- figure: figures/mockup_p3_surveillance.png | Page 3 - Disease Surveillance: epi-week trend, lead indicator, incidence pivot and reporting compliance | width=100% -->

<!-- figure: figures/mockup_p4_advanced.png | Page 4 - Advanced Analytics & DQ: forecast, readmission calibration, wait drivers, outbreak alerts, DQ rules | width=100% -->

<!-- figure: figures/mockup_p5_drillthrough.png | Drill-through page Facility Detail (from the scorecard, Rundu) | width=100% -->

<!-- figure: figures/mockup_p6_tooltip.png | Report-page tooltip shown when hovering a hospital (Katima Mulilo, 2025) | width=34% -->

The images above are **design mock-ups**. They have the same layout, titles and measures as the generated PBIR
pages and are rendered from the warehouse with SQL that mirrors the DAX (`06_report/build_mockups.py`). The team
replaces them with Power BI screenshots after the Desktop build (`BUILD_GUIDE.md` step 9).

## Design good practice

**Chart choice follows the question** (Few, 2013; Knaflic, 2015):

| Question | Chart |
|---|---|
| A trend over time | Line chart: monthly *seen within target*, weekly malaria |
| A ranking | Sorted bar chart: occupancy by hospital, cases by condition, wait drivers |
| A comparison of a few series | Clustered column: reporting completeness and timeliness; predicted against observed risk |
| A relationship | Scatter: occupancy against patients seen on time, one point per hospital-year |
| Detail and drill-down | Matrix and table: ward utilisation, incidence pivot, scorecard |
| A headline number | Card: KPIs |

- **No pie charts, no gauges, no 3-D.** A line rather than a column shows the 80 % target, so the comparison is
  immediate.
- **No dual axes.** When two measures have different units (malaria cases and rainfall) they get two separate charts
  with the same weekly time axis instead of one chart with two y-axes. The two scales would otherwise invite a false visual correlation.

**Visual hierarchy.** Every page follows the same reading order:

1. Title and data-freshness label (top left / top right).
2. Slicers in one row.
3. KPI cards.
4. The main chart, largest and top left.
5. Supporting and detail visuals below.

The keyboard tab order is generated in the same order. At most six KPI cards and six analytical visuals appear on a
page, on a 1280 × 720 canvas with a 24 px grid and white visual containers on a light grey page background.

**Colour and typography.**

- **One validated palette.** The theme `GBHS_Accessible.json` uses an 8-colour categorical palette that passed the
  colour-vision-deficiency (CVD) validator: lightness band, chroma floor, adjacent-pair separation for protanopia,
  deuteranopia and tritanopia, and the normal-vision floor (below).
- **Fixed series order.** Series colours are assigned in a fixed order (blue first, orange second), so the same
  series keeps its colour on every page.
- **Status colours are reserved** (good #006300, bad #D03B3B) and always come with a symbol and words, e.g.
  "▼ Below target (80 %)". Meaning never depends on colour alone.
- **Typography.** Segoe UI for text, Segoe UI Semibold for titles and callouts, 10–12 pt labels, sentence case, and
  titles phrased as the question or the finding.

<!-- include: evidence/viz_palette_validation.md -->

The validator warns that three hues (green, amber, pink) have contrast below 3:1 against white. The report
therefore puts the primary series in blue and orange (contrast at least 3:1). Where the weaker hues appear, data
labels or a table view carry the values: every chart supports *Show as a table*.

**Accessibility (WCAG 2.2 principles; W3C, 2023):**

- alt text on all 67 data visuals, written as the *finding* ("… fell to about 67 percent in 2025–2026"), not as the
  chart type;
- tab order in reading order;
- text contrast at least 4.5:1 (ink #0B0B0B on white);
- a CVD-safe palette, with secondary encodings: symbols, labels and line styles;
- no information in tooltips only;
- data labels where exact values matter;
- page titles and visual titles that make sense when read by a screen reader.

**Uncluttered layout.** Gridlines are light (#E1E0D9), there are no borders inside charts, axis titles appear only
when the unit is not in the title, and there are at most six series per chart.

## Interactivity

- **Slicers.** Calendar year, management zone, facility type, facility, triage category, arrival shift, epi year,
  IDSR condition, malaria stratum and outbreak method. *Calendar year*, *Facility* and *Management zone* are
  **synchronised across pages** through slicer sync groups.
- **Cross-filtering and cross-highlighting** between all visuals. On page 1, *edit interactions* stops the
  occupancy chart and the scorecard from filtering the six KPI cards, so the headline stays stable while managers
  explore.
- **Drill-down.** The page 2 matrix goes Region › Facility › Ward, and the date hierarchies go Year › Quarter › Month
  and Epi Year › Epi Week.
- **Drill-through.** Right-clicking a facility anywhere opens *Facility Detail*, filtered to that facility, with a
  Back button.
- **Report-page tooltip.** Hovering a hospital (occupancy chart, scorecard, scatter) shows the *KPI Tooltip* page:
  five KPIs and a status.
- **Field parameter.** `Metric Selector` switches one chart between nine KPIs (built in Desktop, `BUILD_GUIDE.md`
  step 5).
- **Bookmarks.** *Current year* and *Malaria season* views behind two buttons (built in Desktop).
- **Personalisation by security.** The same report shows each facility manager only their own facilities (dynamic
  RLS). Every slicer and total then reflects their scope, with no separate report per facility.

## Design rationale for non-technical and technical users

- **Non-technical users** (executives, facility and nursing managers) get:
  - answers before analysis: page 1 is readable in 30 seconds;
  - KPIs stated in operational language ("seen within triage target", not "SWT ratio");
  - comparisons built in: against target, against last year, against the other facilities;
  - one click to the facility detail.
  - Waiting-time KPIs use medians and the share within target, not means, because a few very long waits would
    distort a mean.
- **Surveillance officers** get epidemiological conventions: ISO epi weeks, epi-year-to-date, incidence per
  person-time, IDSR completeness and timeliness against the WHO AFRO 80 % targets, and small-cell suppression for
  external sharing.
- **Technical users** (analysts, BI team, stewards) get model diagnostics rather than just model outputs: back-test
  error and intervals, calibration by decile, effect sizes with confidence intervals, the DQ issue counts and the
  RLS check. Trust in the analytics then comes from evidence, and the stewards see their queues.
- **One semantic model serves all audiences.** The same certified measures appear on every page, so the executive and
  the analyst can never see two versions of "occupancy".
