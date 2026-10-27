# Executive summary

**The problem.** Green Basket cc's Agriculture Division runs 14 farms in 11 Namibian regions. It sells maize, wheat,
mahangu, vegetables and table grapes to 240 customers across six channels, including export buyers in Europe, the UK
and the Gulf. Its data lives in nine disconnected places:

- 14 farm harvest spreadsheets in three different layouts;
- a planting register and a master-data workbook;
- the ERP invoice extract, the stock system and the finance ledger;
- four external sources: weather, world prices, exchange rates and national crop estimates.

Management could not answer basic questions with confidence: which farms and crops make money, why yield missed
plan, and what the next season will bring. Profiling found 2,587 duplicate invoice lines, 47 spellings of 10 crop
names, three date formats across the harvest logs, and keying errors of ×10 in harvest quantities.

**The solution.** We built the components below. The whole build is reproducible with one command
(`python run_all.py`, about 3 minutes).

- A Kimball dimensional warehouse in PostgreSQL 16:
  - 9 fact tables and 9 conformed dimensions;
  - a complete date dimension with Namibian public holidays;
  - a snowflaked product → crop → crop category hierarchy;
  - SCD Type 2 history on farms and customers.
- An ELT pipeline with 37 data-quality rules and 19 reconciliation checks.
- A Power BI semantic model: 79 DAX measures, three security roles and four report pages.
- Four advanced analytics techniques, each validated against held-out data or known ground truth.

<div class="kpis">
<div><b>N$ 458.8 m</b><span>FY2026 net revenue, +9.4 % on FY2025; 6.6 % a year since FY2022</span></div>
<div><b>51 %</b><span>of FY2026 revenue from table grapes; 46 % exported</span></div>
<div><b>57 %</b><span>of FY2026 revenue from the top-10 customers (concentration risk)</span></div>
<div><b>18 / 19</b><span>reconciliation checks PASS; 1 WARN = N$ 4.9 m awaiting price review</span></div>
</div>

**What the data says.**

1. **Revenue is a grape business with a maize problem.**
   - Table grapes earned N$ 236.0 m in FY2026, and December alone N$ 182 m. A single month and crop carry the
     year, so the export desk's December logistics are the division's biggest operational risk.
   - Cereals earn only 34.8 % gross margin, against 60.6 % for fruit.
2. **Rainfall, not management, drives dryland yield.**
   - Holding crop, farm, heat and fertiliser constant, a 10 % rainfall shortfall cuts dryland yield by about 7 %
     (elasticity 0.73, p < 0.001; the generator's true value is about 0.77).
   - In the 2023/24 drought, dryland maize averaged 3.07 t/ha against a plan of 4.21 (−27 %). Irrigated maize held
     8.59 t/ha.
   - Nkurenkuru Valley Farm went from 0.56–2.23 t per planted ha (dryland) to 7.44–8.64 t after its centre pivot
     was installed in August 2023. The SCD Type 2 farm history makes this before/after comparison possible.
3. **The forecast is flat.**
   - The best hold-out model projects FY2027 revenue of N$ 465.6 m (+1.5 %). Hold-out error is 12.7 % WAPE at
     division level and 15–16 % at category level.
   - Growth must come from mix and margin, not volume.
4. **Customers form five behavioural segments.** Twenty bulk and export key accounts produce 58.6 % of trailing
   12-month revenue. Nineteen accounts have lapsed and are retention targets.

**Recommendations.**

1. Shift maize area from dryland to irrigated blocks where water rights allow. The measured yield gap of about
   5 t/ha is worth roughly N$ 16,000 per hectare per season in margin, before capital cost (§3.5).
2. Hedge grape-export concentration with a second export window or market.
3. Make the warehouse the system of record for management reporting. Retire the Excel consolidation and run the 37
   DQ rules weekly under named stewards (section 3.8).
4. Publish the Power BI app with the Zone Manager row-level security (section 3.4).

**How to read this report.**

- Sections 3.1–3.8 follow the brief.
- Section 3.9 holds the presentation outline, the Q&A bank and the reflection templates.
- Section 4 maps every required file to its location and self-assesses against the rubric.
- Every table of results is generated from the warehouse by the build scripts, and every code listing is copied
  verbatim from the submitted files. The PDF cannot drift from the code.

## Assumptions and scope

<!-- table: Assumptions (each one is tested or stated in the section shown) -->

| # | Assumption | Consequence / where handled |
|---|---|---|
| A1 | Green Basket cc is a teaching scenario. All internal data (farm logs, ERP, stock, ledger, master data) is **synthetic**, from a seeded generator (`01_data/generate_synthetic_data.py`, seed 20261028). Its volumes, prices and seasonality are anchored on public Namibian statistics. | No real person or company data is used (§3.8). The generator also records ground truth for every injected defect, so data-quality rules can be scored for precision and recall (§3.3). |
| A2 | The external sources are real public datasets: NASA POWER daily weather, the World Bank Pink Sheet, FRED exchange rates, and NSA/MAFWLR crop estimates. The build environment blocked these hosts, so the generator writes stand-ins in the **exact published file layouts**. | `01_data/fetch_public_data.py` downloads the real files into the same paths with no code change. NSA/MAFWLR estimates are published as PDFs and must be transcribed (§3.3). |
| A3 | The fiscal year runs April–March (FY2026 = 1 Apr 2025 – 31 Mar 2026). The agricultural season runs October–September (2024/25 = 1 Oct 2024 – 30 Sep 2025). | Both calendars are in `dim_date`. DAX year-to-date uses year end `"3/31"` (§3.4). |
| A4 | Reporting currency is the Namibia dollar (N$). The N$ is pegged 1:1 to the South African rand, so FRED's ZAR/USD series converts USD, EUR and GBP. | FX is applied at the monthly average rate of the invoice month (rule FX01). |
| A5 | The data cut-off is 30 Sep 2026. A day-2 master-data delta dated 5 Oct 2026 tests incremental loading and SCD Type 2. | FY2027 is a partial year (6 months), labelled as such everywhere. |
| A6 | Scale: about 303,000 sales lines over 5.5 years, plus 8 further facts. We take this as meeting the brief's "required scale"; the team will confirm with the lecturer. | Performance tests use this volume (§3.7). |
| A7 | Users, user principal names (`@greenbasket.example`, a reserved example domain) and manager codes are fictitious. | RLS tests use these accounts (§3.4). |
| A8 | Cost of goods sold is the standard cost per kg at invoice line. Direct production costs come from the ledger by farm and crop. | Gross margin and cost per tonne are defined in §3.1 and Appendix A. |
| A9 | Deployment target: PostgreSQL 16 on a Windows server, an on-premises data gateway, Power BI Pro workspace and app. | Licensing and governance in §3.8. |
