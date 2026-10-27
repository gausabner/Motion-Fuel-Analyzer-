# 3.6 Interactive dashboard design

The report `GreenBasket_Agri.Report` has **four generated pages** on a 1280 × 720 canvas, plus a drill-through page
and a tooltip page that are added in Desktop (`04_powerbi/BUILD_GUIDE.md` §5). Each page answers specific business
questions for a specific audience.

<!-- table: Report pages, audiences and the questions they answer -->

| Page | Primary audience | Answers | Design pattern |
|---|---|---|---|
| 1 Executive Summary | Executive committee, CFO (non-technical) | BQ1: are we on track, and where does revenue come from? | KPI band → trend → breakdowns → farm scorecard |
| 2 Production & Yield | Zone and farm managers, agronomist | BQ2, BQ3: which farms and seasons miss plan, and why? | Matrix with drill-down + diagnostic charts |
| 3 Advanced Analytics | Analysts, sales management (technical and semi-technical) | BQ4: outlook, segments, yield drivers | Model outputs with accuracy shown next to them |
| 4 Operations & Data Quality | Inventory controller, data stewards, BI team (technical) | BQ5: is stock under control, and can we trust the numbers? | Operational KPIs + DQ / RLS check card |
| Farm Detail (drill-through) | Zone managers | Everything about one farm | Filtered copy of the key visuals |
| Revenue tip (tooltip) | All | Context on hover without leaving the page | Small multi-card page |

## Page designs

The four images below are **design mock-ups**. They are rendered from the PostgreSQL warehouse by
`06_report/build_mockups.py` with the same layout, titles and measure logic as the PBIR pages. They show what the
pages contain with real numbers. They are not Power BI screenshots: those are captured in Desktop after the
refresh (`BUILD_GUIDE.md` §9) and replace these files with the same names.

<!-- figure: figures/mockup_p1_executive.png | Page 1 - Executive Summary (FY2026 selected) - design mock-up from warehouse data -->

```text
WIREFRAME - PAGE 1  Executive Summary                                         1280 x 720
+------------------------------------------------------------------------------------+
| Green Basket Agriculture - Executive Summary              [Data to 30 Sep 2026]     |
| [Fiscal year v] [Management zone v] [Crop category v] [Sales channel v]   <- synced |
| +---------+ +---------+ +---------+ +---------+ +---------+ +-----------+           |
| | Net rev | | FYTD    | | Gross   | | Export  | | Yield   | | Stock     |  KPI band |
| | FYTD    | | YoY %   | | margin% | | share % | | vs plan | | value     |  (cards)  |
| +---------+ +---------+ +---------+ +---------+ +---------+ +-----------+           |
| +-------------------------------------------------+ +----------------------------+ |
| | LINE  Net revenue by month vs same month LY     | | BAR  Net revenue by crop   | |
| |  2 series + legend; FY>FQ>Month drill           | |  sorted desc; Category >   | |
| |  tooltip page "Revenue tip" on hover            | |  Crop > Product drill-down | |
| +-------------------------------------------------+ +----------------------------+ |
| +-------------------------+ +------------------------------------------------------+ |
| | COLUMN  Revenue by      | | TABLE  Farm scorecard: revenue, YoY % (icons),       | |
| | sales channel           | | GM %, yield  -> right-click: drill through to farm   | |
| +-------------------------+ +------------------------------------------------------+ |
+------------------------------------------------------------------------------------+
```

<!-- figure: figures/mockup_p2_production.png | Page 2 - Production & Yield Diagnostics (crop = white maize) - design mock-up -->

```text
WIREFRAME - PAGE 2  Production & Yield Diagnostics
+------------------------------------------------------------------------------------+
| Production & Yield Diagnostics                                                      |
| [Season v] [Crop v] [Farm irrigation (as-was) v] [Zone v]  |Yield t/ha|Gap vs NSA|Failed|
| +--------------------------------------------+ +---------------------------------+ |
| | MATRIX  Region > Farm (expand / collapse)  | | CLUSTERED COLUMN  Yield by       | |
| |  Yield | Plan | vs plan (icons) | NSA |     | | season x block irrigation method | |
| |  Cost N$/t (data bars)                     | | legend; Dryland vs irrigated gap | |
| +--------------------------------------------+ +---------------------------------+ |
| +--------------------------------------+ +---------------------------------------+ |
| | SCATTER  Rainfall per season vs      | | LINE  Harvest tonnes by month           | |
| | yield, one point per farm, colour =  | |  (shows harvest windows; drill to day)  | |
| | farm irrigation system               | |                                         | |
| +--------------------------------------+ +---------------------------------------+ |
+------------------------------------------------------------------------------------+
```

<!-- figure: figures/mockup_p3_advanced.png | Page 3 - Advanced Analytics: forecast, key influencers and customer segments - design mock-up -->

```text
WIREFRAME - PAGE 3  Advanced Analytics
+------------------------------------------------------------------------------------+
| Advanced Analytics - Forecast, Segments, Drivers                                    |
| [Forecast model: (o) Seasonal naive ( ) ETS ( ) SARIMA]  |WAPE (category)| |Top-10 %| |
| +--------------------------------------------------+ +------------------------------+ |
| | LINE  Actual + 12-month forecast + 80 % band      | | BAR  Key influencers of     | |
| |  (model slicer switches series; band = 2 lines)   | | yield (RF importance)        | |
| +--------------------------------------------------+ +------------------------------+ |
| +----------------------------+ +----------------------------------------------------+ |
| | BAR  Revenue by segment    | | TABLE  Segment profile: customers, revenue,       | |
| | (K-means), sorted          | | N$/kg, invoices; click a segment = cross-filter    | |
| +----------------------------+ +----------------------------------------------------+ |
+------------------------------------------------------------------------------------+
```

<!-- figure: figures/mockup_p4_operations.png | Page 4 - Operations, Inventory & Data Quality (latest month-end) - design mock-up -->

```text
WIREFRAME - PAGE 4  Operations, Inventory & Data Quality
+------------------------------------------------------------------------------------+
| Operations, Inventory & Data Quality                                                |
| [Fiscal year v] [Farm v] |Closing t| |Cover days| |Shrinkage| |Price anomalies| |Unknown %| |
| +-----------------------------------------+ +------------------------------------+ |
| | LINE  Closing stock by month            | | COLUMN  Received vs dispatched by  | |
| |  (semi-additive: last snapshot)         | | fiscal quarter (2 series + legend) | |
| +-----------------------------------------+ +------------------------------------+ |
| +-------------------------------------------------+ +------------------------------+ |
| | TABLE  Farm operations: irrigation now, stock,  | | MULTI-ROW CARD  Security &   | |
| | cover, shrinkage, corrected records (HV06)      | | DQ: signed-in user, farms    | |
| |                                                 | | visible (RLS), N$ awaiting   | |
| |                                                 | | review, reconciliation       | |
| +-------------------------------------------------+ +------------------------------+ |
+------------------------------------------------------------------------------------+
```

```text
WIREFRAME - DRILL-THROUGH  Farm Detail          (target of right-click on any farm)
+------------------------------------------------------------------------------------+
| < Back   Farm Detail: <farm name>  (zone, region, irrigation as-is, SCD version)    |
| |Net revenue| |Yield t/ha| |Cost N$/t| |GM %|   [Fiscal year v] (kept from source)  |
| +---------------------------------------------+ +--------------------------------+ |
| | LINE  Net revenue by month (this farm)      | | TABLE  Crop cycles: crop,      | |
| |                                             | | season, block, yield vs plan,  | |
| +---------------------------------------------+ | irrigation method, status      | |
|                                                 +--------------------------------+ |
+------------------------------------------------------------------------------------+
```

## Purposeful chart choice and visual hierarchy

<!-- table: Why each chart type was chosen -->

| Question shape | Chart used | Why not the alternatives |
|---|---|---|
| Single headline numbers (revenue, margin, share) | KPI **cards** with the comparison underneath (▲/▼ + text) | A gauge wastes space and hides the comparison. A card answers in under 5 seconds. |
| Change over time with a comparison | **Line** with 2 series (actual vs last year) and a legend | Columns for 12 × 2 bars clutter. One axis only: no dual axes. |
| Ranking of categories (crops, segments, drivers) | **Horizontal bar**, sorted descending, with direct value labels | Long crop and segment names stay readable. A pie cannot rank 10 crops. |
| Part of a whole over few categories (channels) | **Column**, sorted | A donut makes six close shares hard to compare. |
| Two measures across entities (rain vs yield) | **Scatter**, colour = irrigation system | The relationship *is* the message, and two axes of different units belong on a scatter, not a dual-axis line. |
| Hierarchical detail with several measures | **Matrix** (Region › Farm) with icons and data bars | Gives managers numbers they can quote. Drill-down keeps it compact. |
| Uncertainty of a forecast | **Line + interval band** | Point forecasts alone overstate certainty. |

**Visual hierarchy.** Every page reads in a Z-pattern:

1. Title and data freshness.
2. Slicers in **one row** at the top.
3. The **KPI band**.
4. The main trend, top left and largest.
5. Breakdowns.
6. Detail tables at the bottom.

Above-the-fold space goes to what executives look at first. Detail is one click away (drill-down or drill-through),
not crammed onto the page.

**Consistent colour and typography.**

- One custom theme (`theme/GreenBasket_Accessible.json`) applies everywhere.
- Text uses Segoe UI: titles 12 pt semibold, labels 10 pt, card callouts 22 pt.
- Colour is assigned **by role, never by rank**:
  - a single-series chart uses one blue (#2A78D6);
  - multi-series charts take the fixed categorical order (blue, orange, green, amber, ...), so "Dryland" is always
    blue and "Centre pivot" always orange on every page;
  - status colours (good #006300, bad #D03B3B) appear only with an icon or text, never as a series colour.

## Accessibility

<!-- table: Accessibility measures and how they were verified -->

| Requirement | Implementation | Verification |
|---|---|---|
| Colour-blind safe palette | 8-colour categorical palette validated for lightness band, chroma, **CVD separation** (worst adjacent ΔE 9.1 under protanopia; ≥ 8 is the target) and normal-vision separation (ΔE ≥ 19.6) | `validate_palette.js` from the team's dataviz kit: **all checks pass** |
| Colour never the only cue | Legends on every multi-series chart; direct data labels on bars; ▲/▼ icons with text on KPIs and status | Design review against the mock-ups |
| Contrast | Primary text #0B0B0B on white is **19.7:1**; secondary text #52514E is **7.9:1**; good #006300 is 7.5:1; bad #D03B3B is 4.8:1, always paired with an icon. Three palette hues (green, amber, pink) fall below 3:1 against white, so those series always carry labels or a legend, and *Show as table* is available | WCAG 2.2 contrast formula (W3C, 2023) |
| Screen readers | **Alt text on every data visual**, generated in the PBIR (e.g. "Line chart of monthly net revenue compared with the same month of the previous year..."); text boxes are read as their own text | `build_pbip.py` **fails the build** if a data visual has no alt text |
| Keyboard navigation | Tab order is written into the PBIR in reading order: title → slicers → cards → charts → tables. Every chart supports *Show as a table* (Alt+Shift+F11) | Generated by `build_pbip.py`; confirm in *Selection pane › Tab order* (`BUILD_GUIDE.md` §5.8) |
| Readable sizes | No text under 9 pt; 1280 × 720 *Fit to page*; descriptive titles instead of abbreviations | Mock-up review |

## Interactivity, used on purpose

- **Slicers.** Fiscal year, zone, crop category and channel are **synced** across pages 1, 2 and 4, so a manager
  keeps the context when changing page. They are dropdowns, to save space, except the forecast model, which is a
  radio list because all three options should be visible.
- **Cross-filtering and cross-highlighting.**
  - Clicking a crop bar filters the trend and the scorecard.
  - KPI cards are set **not** to react to cross-highlighting (*Edit interactions*), so the headline stays stable
    while users explore.
- **Drill-down.**
  - Fiscal Calendar on the trend: FY › FQ › Month.
  - Category › Crop › Product on the crop chart.
  - Region › Farm in the yield matrix.
- **Drill-through.** *Farm Detail* receives the farm and keeps all filters, so a zone manager can go from "this
  farm is −7 % vs plan" to its crop cycles in one right-click.
- **Report-page tooltip.** *Revenue tip* shows YoY %, gross margin and export share when hovering over a month.
- **Bookmarks.**
  - *Executive view*: resets slicers to the current fiscal year.
  - *Analyst view*: reveals the Metric Selector visual.
  - Two buttons switch between them.
- **Field parameter.** *Metric Selector* swaps the trend measure among six KPIs. This is self-service without
  building visuals.
- **Dynamic titles.** Measures in folder *0 Labels* (e.g. `Title Revenue Trend`) put the selected fiscal year in the
  chart title, so screenshots and exports are self-describing.
- **Security-aware content.** RLS filters every visual automatically. Page 4's check card shows who is signed in and
  how many farms they can see.

## Design rationale: serving technical and non-technical users

Non-technical users get:

- plain-language titles that state the question ("Net revenue by month vs same month last year");
- KPI cards with explicit comparisons;
- no jargon on pages 1 and 2;
- the **app** experience with RLS, so a zone manager sees only their zone and nothing to configure.

Technical users get:

- the model accuracy (WAPE, model choice) next to the forecast, not hidden;
- the DQ and reconciliation status on page 4, linked to the audit tables;
- a model whose display folders, descriptions on every measure and hidden keys make building their own analyses safe.

The same semantic model serves both, so **every number is identical** wherever it appears. That is the "single
trusted view" in the problem statement.
