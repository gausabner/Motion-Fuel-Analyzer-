# 3.1 Business case and requirements

## Organisation profile

Green Basket cc is a diversified Namibian close corporation. Its **Agriculture Division**, managed from Windhoek, grows
and distributes cereals, vegetables and fruit. The division farms 4,330 cultivated hectares on 14 farms in 11 regions,
grouped into four management zones. Its irrigation runs from dryland maize on the Oshikoto plains to drip-irrigated
table grapes on the Orange River.

<!-- table: Farm portfolio (current SCD Type 2 version, 30 Sep 2026) -->

| Zone | Farm (code) | Region | Irrigation | Cultivated ha | Main crops |
|---|---|---|---|---:|---|
| North-Central | Eenhana Dryland Farm (GB-OHA-01) | Ohangwena | Dryland | 380 | White maize, mahangu |
| North-Central | Outapi Canal Farm (GB-OMS-01) | Omusati | Drip (flood until Jun 2024) | 140 | Tomatoes, onions, cabbage, maize, watermelon |
| North-Central | Ongwediva Horticulture Hub (GB-OSH-01) | Oshana | Drip + shade-net | 45 | Tomatoes, onions, cabbage |
| North-Central | Tsumeb Triangle Farm (GB-OSK-01) | Oshikoto | Dryland (wheat on a borehole pivot block) | 520 | White maize, wheat |
| North-East | Mashare Riverside Farm (GB-KAE-01) | Kavango East | Centre pivot | 520 | Maize, wheat, potatoes, onions |
| North-East | Ndonga Linena Block (GB-KAE-02) | Kavango East | Drip | 180 | Maize, watermelon, butternut, cabbage |
| North-East | Nkurenkuru Valley Farm (GB-KAW-01) | Kavango West | Centre pivot (dryland until Jul 2023) | 450 | Maize, mahangu (dryland), watermelon |
| North-East | Liselo Floodplain Farm (GB-ZAM-01) | Zambezi | Centre pivot | 560 | Maize, wheat, tomatoes, cabbage |
| Central | Omaruru River Farm (GB-ERO-01) | Erongo | Drip + shade-net (from Oct 2026) | 40 | Tomatoes, onions, cabbage, butternut |
| Central | Grootfontein Plains Farm (GB-OTJ-01) | Otjozondjupa | Dryland | 520 | White maize |
| Central | Otavi Valley Farm (GB-OTJ-02) | Otjozondjupa | Centre pivot | 470 | Maize, wheat, potatoes |
| South | Hardap Dam Irrigation Farm (GB-HAR-01) | Hardap | Flood (canal) | 260 | Table grapes, maize, wheat, onions, butternut |
| South | Aussenkehr Orange River Vineyards (GB-KHA-01) | //Kharas | Drip | 150 | Table grapes (export), onions |
| South | Noordoewer River Farm (GB-KHA-02) | //Kharas | Drip | 95 | Table grapes, onions, butternut |

**Products and markets.**

- **Products:** 21 sellable products from 10 crops in three categories (cereals and grains, vegetables, fruit).
- **Customers:** 240 customers in six channels: wholesale, retail, informal market, institutional (schools, hospitals),
  miller/processor, and export.
- **Export markets:** buyers in the Netherlands, Germany and the United Kingdom take table grapes in the
  November–January window. Fresh produce also goes to South Africa, Botswana, Angola and the UAE.
- **Regulation:** white maize, wheat and mahangu are controlled crops under the Namibian Agronomic Board (NAB), so
  domestic millers are a captive but price-regulated channel (Namibian Agronomic Board, 2021). The NAB's Market Share
  Promotion scheme supports local horticulture by obliging importers to buy a share of their produce locally:
  currently at least 47 %, as a condition of an import permit (Namibian Agronomic Board, n.d.).

**Context.** National production is volatile:

- Namibia harvested 94,262 tonnes of grain in 2025 (Windhoek Express, 2025a), a recovery after the severe 2023/24
  drought.
- About 456,000 people (15 % of the population analysed) faced high acute food insecurity in July–September 2025,
  down from 1.15 million a year earlier, after above-average 2024/25 rainfall (Integrated Food Security Phase
  Classification [IPC], 2025).

**Size.** FY2026 net revenue was N$ 458.8 m. Table grapes earned 51 % of it, and exports 46 %.

**Current strategy.** The division's stated strategy is *"grow export horticulture, protect staple supply, and
climate-proof production"*. In practice that means:

- expanding drip-irrigated grape and vegetable blocks;
- converting dryland maize to centre pivots where water rights allow (Nkurenkuru in 2023, the Omaruru shade-net in October 2026);
- keeping NAB-controlled grain flowing to millers.

The strategy is implemented through the five SMART objectives below. Each one is tracked by KPIs on the dashboards.

<!-- table: Strategic objectives and the KPIs that measure them -->

| # | Objective (SMART) | Baseline (FY2026 / season 2024/25) | Target | KPIs |
|---|---|---|---|---|
| O1 | Grow net revenue at least 8 % a year to N$ 500 m by FY2028 while keeping gross margin at 50 % or more | N$ 458.8 m (+9.4 %), GM 53.8 % | ≥ N$ 500 m, GM ≥ 50 % | Net Revenue, FYTD YoY %, Gross Margin % |
| O2 | Close the yield gap: irrigated maize at or above plan and the NSA commercial benchmark; failed area below 3 % | Irrigated maize 8.68 t/ha vs plan 8.63; failed area 2.0 % | Yield vs plan ≥ 0 %, gap vs NSA ≥ 0 | Yield (t/ha), Yield vs Plan %, Gap vs Benchmark, Failed Area % |
| O3 | Reduce dependence on a few buyers: top-10 customer share below 50 % by FY2028, export share 40–50 % | Top-10 share 57.3 %, export 46.2 % | < 50 %, 40–50 % | Top 10 Customer Share %, Export Share %, segment revenue |
| O4 | Cut direct production cost per tonne by 5 % in real terms by FY2028 | Dryland maize N$ 3,270/t, irrigated N$ 3,850/t (2024/25) | −5 % real | Direct Cost per Tonne, cost by category |
| O5 | One trusted source: 100 % of management KPIs from the warehouse; month-end pack within 3 working days; critical DQ rules ≥ 98 % clean | Excel consolidation; no DQ measurement | 100 %; ≤ 3 days; ≥ 98 % | DQ rule results, reconciliation status, data freshness |

## Business problem

> **Problem statement.** The Agriculture Division cannot produce a timely, trusted and integrated view of production,
> yield, cost and revenue. Its data sits in nine unconnected sources with different codes, formats and quality levels.
> As a result, decisions on what to plant where, which blocks to irrigate, how to price and which customers to
> prioritise are made from manual spreadsheets that arrive late and disagree with each other.

The data profiling in §3.3 turns the problem into numbers:

- **Duplicates:** 2,587 duplicate ERP invoice lines from overlapping extracts. Left in, they overstate revenue.
- **Inconsistent names:** 47 spellings of 10 crop names and 217 non-standard farm codes in the harvest logs.
- **Mixed formats:** three harvest-log layouts with three date formats and four units of measure (kg, t, 10 kg crates, 400 kg bins).
- **Keying errors:** ×10 quantity errors that inflate a block to as much as 47 t/ha of maize.
- **Missing links:** 2,466 invoice lines with no farm of origin, and 694 lines for customers not yet in master data.
- **External data in awkward shapes:**
  - weather fill values of −999;
  - Pink Sheet "…" markers;
  - FX gaps on US holidays;
  - NSA region names that do not match the official list.

Without integration, management cannot link a yield shortfall (farm logs) to its cause (weather), its cost (ledger)
and its revenue effect (ERP). That link is exactly what the business questions below need.

## Business questions and KPIs

<!-- table: Business questions, KPIs, definitions and where they are answered -->

| BQ | Business question | KPIs (DAX measure) | Definition | Facts used | Page |
|---|---|---|---|---|---|
| BQ1 | Which crops, channels, farms and customers drive revenue and margin, and where is growth slipping? | Net Revenue; Net Revenue FYTD; FYTD YoY %; Gross Margin %; Avg Realised Price (N$/kg); Export Share % | Net revenue = invoice + credit-note revenue after discount in N$; GM % = (net revenue − COGS) / net revenue; FYTD YoY compares like-for-like periods to the last data date | Sales | 1 Executive |
| BQ2 | How does yield compare with plan and the national benchmark by crop, farm, irrigation system and season, and what drives the gap? | Yield (t/ha); Yield vs Plan %; Yield Gap vs Benchmark (t/ha); Failed Area %; Rainfall per Season (mm) | Yield = harvested kg / 1,000 / harvested ha of completed cycles; benchmark = NSA commercial-sector yield of the same region, crop and season | Crop Cycle, Harvest, Weather, Crop Estimate | 2 Production |
| BQ3 | What does a tonne cost to produce, by farm and crop, and which inputs drive it? | Direct Cost per Tonne; Direct Cost; cost by category | Direct cost of completed cycles (ledger postings by farm, crop and season) / harvested tonnes | Production Cost, Crop Cycle | 2 Production |
| BQ4 | Which customer segments matter, how concentrated is revenue, and what should we expect in the next 12 months? | Top 10 Customer Share %; Net Revenue by segment; Forecast Revenue; Backtest WAPE % | Top-10 share = revenue of the 10 largest customers in context / total; WAPE = Σ\|actual − forecast\| / Σ\|actual\| over the 12-month hold-out | Sales, Forecast | 3 Advanced |
| BQ5 | Is stock under control, and can we trust the numbers? | Closing Stock (t); Stock Cover (days); Shrinkage %; Price Anomaly Lines; Unknown Farm Revenue % | Closing stock is semi-additive (last snapshot in period); cover = closing stock / average daily dispatch over 90 days | Inventory, Sales, audit tables | 4 Operations |

## Stakeholder analysis

<!-- table: Stakeholder groups, information needs and how the solution serves them -->

| Group | Type | Information needs | Frequency | How served | Power / interest |
|---|---|---|---|---|---|
| Executive committee (managing director, CFO) | Non-technical | Revenue, margin, growth vs plan, concentration risk, 12-month outlook | Monthly, board packs | Page 1 KPI cards and trend; Power BI app; *Executive* role | High / high: sponsor |
| Zone and farm managers (4 zones) | Non-technical, operational | Their farms' yield vs plan, cost per tonne, stock, harvest progress; no access to other zones' commercial data | Weekly in season | Pages 2 and 4; drill-through to farm; *Zone Manager* dynamic RLS | Medium / high |
| Export desk and sales managers | Non-technical | Export volumes, prices, customer segments, December capacity | Weekly, daily in Nov–Jan | Pages 1 and 3; *Export Desk* static RLS | Medium / high |
| Agronomist | Semi-technical | Yield drivers, rainfall response, irrigation effect, varietal results | Per season | Page 2; regression results (§3.5) | Medium / high |
| Finance team | Semi-technical | Reconciled revenue and cost, margin by farm and crop, control totals | Month-end | Pages 1, 2, 4; reconciliation checks R05 and R09 | High / medium |
| Data stewards (farm, sales, finance, master data, external) | Technical / business | DQ rule results, quarantine queues, unmatched codes | Daily or weekly | Page 4 DQ cards; `audit.dq_issue_log`; `mart.dq_summary` | Medium / high |
| BI developers and data engineers | Technical | Lineage, load logs, model performance, reproducible builds | Continuous | `audit.etl_batch` and `etl_step_log`; PBIP in Git; Performance Analyzer protocol | Medium / high |
| IT / database administrator | Technical | Security, backup, refresh schedule, gateway | Weekly | Least-privilege database roles; `pg_dump` backup; incremental refresh | High / low |
| External: NAB, NSA, auditors | Non-technical | Statutory returns, traceability, audit trail | Ad hoc | Exports from `mart`; batch-stamped lineage | Medium / low |

**Engagement implications.**

- The sponsor (executive committee) needs one screen with the five headline KPIs. That screen is page 1.
- Zone managers are the largest user group and the main source of harvest data, so their dashboards double as the
  data-quality feedback loop: the "Corrected records" column on page 4 shows each farm its own keying errors.
- The technical groups need reproducibility and lineage. Those are covered in §3.3 and §3.8.

## Process model

The modelled process is **"plan → plant → harvest → pack and store → sell and invoice"**, the order-to-cash chain for
farm produce. Each step creates data in a different system. Those systems (S1–S5) are the internal sources of the
warehouse; S6–S9 are the external ones.

```mermaid name=bpmn caption="BPMN-style process flow: business lanes with their data capture points (S1-S9) feeding the nightly BI platform lane" width=100%
flowchart TB
  subgraph FARM["Farm operations - farm manager, agronomist"]
    direction LR
    A([Season<br/>plan]) --> B[Planting<br/>register - S1] --> C[Field operations<br/>S5 cost ledger] --> D{Harvest<br/>ready?}
    D -- no --> C
    D -- yes --> E[Harvest log<br/>per block - S1]
  end
  subgraph PACK["Packhouse and stock - inventory controller"]
    direction LR
    F[Grade and pack<br/>cull removed] --> G[Stock receipt<br/>S4 stock system] --> H[Month-end<br/>stock count]
  end
  subgraph SALES["Sales and export desk"]
    direction LR
    I[Order<br/>S2 customer] --> J[Dispatch<br/>from stock] --> K[Invoice or credit<br/>note - S3 ERP] --> L([Payment<br/>received])
  end
  subgraph BI["BI platform - nightly"]
    direction LR
    X[(External<br/>S6-S9)] -.-> M[Extract<br/>to landing] --> N{DQ rules<br/>pass?}
    N -- no --> O[Quarantine,<br/>steward queue]
    N -- yes --> P[Load star<br/>schema] --> Q[Reconcile<br/>R01-R19] --> R([Refresh<br/>Power BI])
  end
  FARM -- produce --> PACK
  PACK -- stock --> SALES
  FARM -. logs, ledger .-> BI
  PACK -. stock extract .-> BI
  SALES -. ERP extract .-> BI
```

**What the model reveals.** These are the design drivers for the warehouse:

1. **Harvest, stock and sales describe the same kilograms, but at three different points.** The harvest log records
   field weight (before cull). The stock system records packed weight. The ERP records invoiced weight. The
   warehouse keeps all three facts at their own grain and reconciles them across sources (checks R06 and R18 in §3.3).
2. **The farm of origin is lost at dispatch** unless the invoice line carries it. Rule SA05 measures that gap (0.81 % of lines).
3. **External context only matters once it is joined on conformed farm, region, crop and date keys.**
   - Weather joins by farm location and day.
   - Prices join by crop and month.
   - NSA estimates join by region, crop and season.
