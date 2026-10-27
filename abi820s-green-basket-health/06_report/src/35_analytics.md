# 3.5 Advanced analytics

## OLAP operations

Each OLAP operation is shown twice:

- as SQL on the warehouse (`02_sql/11_olap_queries.sql`), whose captured output follows the query;
- as the Power BI interaction that performs it, as designed in §3.6. The page mock-ups are in §3.6; the screenshots
  from Power BI Desktop replace them under the same file names (`BUILD_GUIDE.md` step 9).

### Roll-up

**Roll-up** aggregates up a hierarchy: here quarter → year → total. In SQL this is `GROUP BY ROLLUP`, and
`GROUPING()` marks each level. In Power BI, the user collapses the *Calendar* hierarchy on the visual (drill up) or
removes the quarter level from the axis.

<!-- code: 02_sql/11_olap_queries.sql | from=-- name: olap_rollup | to=^ORDER BY d.calendar_year | lang=sql -->

<!-- table: Roll-up output: ED attendances and share seen within target, quarter -> year -> total -->
<!-- include: evidence/olap_rollup.md -->

The roll-up shows where the 2025 decline sits. Quarter 1 of 2025 (the malaria season) fell to 53.8 % of patients
seen within target, while the rest of 2025 recovered towards 2024 levels. The annual figure of 67.5 % hides this
seasonality.

### Drill-down

**Drill-down** moves from a summary to its detail along the snowflaked geography: region → facility → ward. On page 2
the matrix has the rows Region › Facility › Ward Code, and the user expands each level with the drill buttons.

<!-- code: 02_sql/11_olap_queries.sql | from=-- name: olap_drilldown | to=^ORDER BY r.region_name | lang=sql -->

<!-- table: Drill-down output (2025, the two endemic north-east regions): region -> facility -> ward -->
<!-- include: evidence/olap_drilldown.md -->

Katima Mulilo's hospital total of 91.3 % hides a medical ward at **108.5 %**: patients on trolleys and in overflow
beds. Its 18-bed complement grew to 22 in March 2026, and SCD2 keeps the 2025 occupancy measured against 18 beds.

### Slice

A **slice** fixes one member of one dimension (Condition = Malaria) and analyses the remaining sub-cube. In Power BI
this is the *IDSR condition* slicer on page 3, or a page filter.

<!-- code: 02_sql/11_olap_queries.sql | from=-- name: olap_slice | to=^ORDER BY malaria_cases | lang=sql -->

<!-- table: Slice output: malaria cases by facility, all epi years -->
<!-- include: evidence/olap_slice.md -->

### Dice

A **dice** selects a sub-cube on several dimensions at once: the malaria season (January–May 2025) × triage
YELLOW and GREEN × the North-East zone. In Power BI this is the slicers *Calendar year*, *Triage category* and
*Facility* used together on page 2, with a month filter.

<!-- code: 02_sql/11_olap_queries.sql | from=-- name: olap_dice | to=^ORDER BY f.facility_short_name | lang=sql -->

<!-- table: Dice output: ED waits and LWBS for YELLOW/GREEN patients in the north-east, January-May 2025 -->
<!-- include: evidence/olap_dice.md -->

The dice explains the LWBS crisis. At Katima Mulilo in February 2025, routine (GREEN) patients waited a median of
276 minutes, above the 4-hour target, and **52.7 % left without being seen**. Urgent (YELLOW) patients waited
169 minutes against a 60-minute target. Rundu shows the same pattern a month earlier.

### Pivot

A **pivot** rotates the cube so that a dimension becomes the columns: facility × epi year, with malaria incidence
per 100,000 catchment population. In Power BI this is the matrix on page 3, with Facility on the rows and Epi Year on
the columns. Swapping the two fields rotates it.

<!-- code: 02_sql/11_olap_queries.sql | from=-- name: olap_pivot | to=^ORDER BY "2025" | lang=sql -->

<!-- table: Pivot output: malaria incidence per 100 000 catchment population, facility x epi year -->
<!-- include: evidence/olap_pivot.md -->

### Drill-across and semi-additive aggregation

Two further operations show why the dimensions are conformed and why measures must respect their additivity.

- **Drill-across** combines two facts through conformed dimensions: e-roster nursing hours ÷ ward-census patient days,
  joined on Date and Care Unit. The result is NHPPD per ward type, the *NHPPD* measure in Power BI.
- **Semi-additive aggregation**: occupied beds may be summed across wards but **not across days**. The last column
  shows the wrong answer that an implicit `SUM` would give, which is why implicit measures are disabled (§3.4).

<!-- table: Drill-across output: nursing hours per patient day (NHPPD) and occupancy by facility and specialty, 2025 -->
<!-- include: evidence/olap_drill_across.md -->

<!-- table: Semi-additive output: average and closing occupied beds versus the (wrong) sum over days -->
<!-- include: evidence/olap_semi_additive.md -->

## Technique 1 – Forecasting weekly malaria cases (BQ4)

**Question.** How many malaria cases will the three north-east facilities (Rundu, Katima Mulilo, Nkurenkuru) see in
the next 1–4 weeks, so that rapid diagnostic tests, drugs, beds and doctors can be planned?

**Method** (`03_analytics/forecasting.py`, statsmodels; Seabold & Perktold, 2010). The series is the weekly confirmed malaria attendances (ICD-10 B50–B54)
from the PAS, 247 weeks from 2022-W01. The PAS is used rather than IDSR because it has no missing weeks, and the two
agree within 0.1 % (check R08). Three models are compared:

| Model | Specification |
|---|---|
| M1 Seasonal naive | The same week last year (benchmark) |
| M2 Holt-Winters exponential smoothing | On log(1 + cases), additive trend, 52-week seasonality |
| M3 Dynamic regression SARIMAX(1,0,1) | On log cases, with two Fourier pairs for the annual cycle and rainfall summed over weeks *t−8 … t−4* (NASA POWER) as an exogenous lead indicator, known four weeks ahead |

**Evaluation.**

- The evaluation is **rolling-origin**: over the last 52 weeks (2025-W40 to 2026-W39), each model is refitted every
  4 weeks and forecasts 1–4 weeks ahead, giving 52 forecasts per model. This is the time-series equivalent of
  cross-validation and avoids judging a model on one lucky split (Hyndman & Athanasopoulos, 2021).
- Metrics: MAE, RMSE, WAPE and MASE (scaled by the in-sample seasonal-naive error), and the coverage of the 80 %
  prediction interval.

<!-- table: Rolling-origin back-test, 52 weeks x horizons 1-4 -->
<!-- include: evidence/fc_metrics.md -->

<!-- table: WAPE by forecast horizon -->
<!-- include: evidence/fc_wape_by_horizon.md -->

<!-- table: SARIMAX coefficients (log scale) -->
<!-- include: evidence/fc_sarimax_terms.md -->

<!-- figure: figures/fc_malaria_backtest.png | Rolling-origin back-test: actual weekly malaria cases (north-east) against the forecasts of the three models | width=92% -->

<!-- figure: figures/fc_rain_driver.png | Rainfall 4-8 weeks earlier against weekly malaria cases: the lead indicator used by SARIMAX | width=80% -->

**Results.**

- **Holt-Winters is the best model.** It has a WAPE of 23.8 % and MASE 0.78, so its error is 22 % lower than the
  naive benchmark. One week ahead its WAPE is **19.4 %**, which the *Forecast error* card on page 4 shows.
- **Rainfall is a significant driver.** Its coefficient is 0.405 on the log–log scale (p < 0.001), so 10 % more rain
  4–8 weeks earlier is associated with about 4 % more cases. SARIMAX also has better-calibrated intervals (75 %
  coverage, against 65 % for Holt-Winters).
- **Operational choice.**
  - Publish the Holt-Winters point forecast.
  - Widen its interval, or use the SARIMAX interval, for stock planning, because the Holt-Winters 80 % interval
    covers only 65 % of outcomes.
  - Use rainfall on page 3 as the *lead* indicator for the season's start.

<!-- table: Forward forecast (Holt-Winters), first 8 weeks after the cut-off -->
<!-- include: evidence/fc_forward.md -->

<!-- figure: figures/fc_malaria_forward.png | 13-week forward forecast with 80 % prediction interval (Holt-Winters, north-east) | width=88% -->

**Assumptions and limitations.**

- Stable reporting and testing practice.
- The seasonality of the last four seasons repeats. The 2025 and 2026 seasons were exceptional, so one more "normal"
  season would shift the trend.
- The rainfall stand-ins must be replaced by the real NASA POWER data (`fetch_public_data.py`) before operational
  use.
- The forecast is for attendances at GBHS facilities, not for community incidence.

## Technique 2 – Classifying 30-day readmission risk (BQ5)

**Question.** Which patients discharged today are most likely to come back as an emergency within 30 days, so that
discharge planners can target follow-up calls and medicine reconciliation?

**Method** (`03_analytics/readmission_model.py`, scikit-learn; Pedregosa et al., 2011).

- **Population.** 79,457 eligible spells, i.e. discharged alive (home or against advice), not maternity, with 30 days
  of follow-up. The target is `readmitted_within_30d`, milestone 3 of the accumulating snapshot.
- **Features.** Only information available **at discharge**: age band, sex, payer group, specialty, ICD-10 chapter,
  chronic flag, severity, length of stay, prior admissions in 12 months, weekend discharge, against medical advice,
  emergency admission and ICU stay.
- **Models.** M1 logistic regression, with reference coding for interpretable odds ratios; M2 histogram gradient
  boosting.
- **Validation.** A **temporal split** prevents leakage from the future: train on discharges to 30 June 2025
  (58,012), test on 1 July 2025 – 31 August 2026 (21,388).

<!-- include: evidence/rm_summary.md -->

<!-- table: Test-set performance (prevalence 13.6 %) -->
<!-- include: evidence/rm_metrics.md -->

<!-- figure: figures/rm_roc_calibration.png | ROC curves and calibration by decile of predicted risk (test set) | width=92% -->

<!-- table: Largest odds ratios of the logistic model (categories versus their reference level: age 0-4, female, government payer, intensive care) -->
<!-- include: evidence/rm_drivers.md -->

<!-- table: Fairness check at the operating threshold (top 20 % of risk) -->
<!-- include: evidence/rm_fairness.md -->

**Results.**

- **Discrimination is modest.** The AUC is 0.66 for both models, which is typical of published readmission models
  (0.6–0.7; Kansagara et al., 2011).
- **Calibration is good.** Predicted and observed rates agree in every decile, so the scores can be read as
  probabilities.
- **Targeting.** Calling the top 20 % by predicted risk reaches **37 % of all readmissions**, with a 25 % hit rate.
  That is about 1.9 times better than calling at random.
- **Drivers.**
  - Discharge against medical advice: odds ratio 2.09.
  - Chronic conditions: 1.69.
  - Age 65+: 1.29.
  - Weekend discharge: 1.28. This is actionable: weekend discharges need a follow-up call on Monday.
- **Fairness by sex.** Sexes are treated alike (true-positive rate 37.8 % for women, 36.0 % for men; calibration
  equal).
- **Fairness by age.** Older patients are flagged far more often (59.5 % of patients aged 65+). This reflects their
  higher observed risk (21.7 %), not miscalibration, but it should be reviewed by the clinical governance committee.

**Assumptions and limitations.**

- Readmissions to other providers are invisible, so the rate is a lower bound.
- There are no medication, laboratory or social features.
- An AUC of 0.66 supports **prioritising** a call list, not decisions about individual care.
- The model must be monitored for drift and re-validated yearly.

## Technique 3 – Outbreak detection in IDSR surveillance (BQ3)

**Question.** Can GBHS detect unusual rises of priority diseases within 1–2 weeks of their start, without drowning
surveillance officers in false alarms?

**Method** (`03_analytics/outbreak_detection.py`). Each method runs on every facility × condition weekly series:

| Method | Rule |
|---|---|
| M1 **EARS C2** (CDC Early Aberration Reporting System; Hutwagner et al., 2003) | Alert when cases exceed the mean + 3 SD of weeks *t−8 … t−2*, with a one-week guard band |
| M2 **CUSUM** on the standardised C2 residuals (Page, 1954) | k = 1, h = 2.5; reset after an alert |
| M3 **Historical limits** for malaria (Stroup et al., 1989) | Alert when cases exceed the mean + 2 SD of the same epi week ± 2 weeks in previous years. This is the WHO-style malaria epidemic threshold |

All methods also require at least 3 cases in the week. **Ground truth:** the generator injected 12 outbreaks of
hepatitis E, measles, acute watery diarrhoea, malaria, typhoid and meningitis, with known facility, start week and
size.

<!-- table: Detection performance against the 12 injected outbreaks -->
<!-- include: evidence/ob_summary.md -->

<!-- table: Outbreak-level results (delay = weeks from onset to first alert) -->
<!-- include: evidence/ob_events.md -->

<!-- figure: figures/ob_measles_rundu.png | Measles at Rundu, 2024 (outbreak OB07): weekly cases with EARS C2 threshold and CUSUM alerts | width=88% -->

<!-- table: First malaria historical-limits alert per season, north-east facilities -->
<!-- include: evidence/ob_malaria_first_alert.md -->

<!-- figure: figures/ob_malaria_threshold.png | Malaria epidemic threshold (historical limits) at Katima Mulilo: the 2025 and 2026 upsurges cross it in epi weeks 2 and 3 | width=88% -->

**Results.**

- **CUSUM detected 11 of 12 outbreaks** and EARS C2 9 of 12. The median delay for both is 1 week, with fewer than 1
  false alert per 100 facility-condition-weeks.
- CUSUM caught the small, slow outbreaks that C2 missed (meningitis at Katima, diarrhoea at Keetmanshoop). It
  accumulates small excesses that never cross a 3-SD line on their own.
- Both missed OB08 (measles at Nkurenkuru, 22 extra cases over 6 weeks). Its weekly counts stayed within the noise of
  a busy clinic.
- **Positive predictive value is only 7 %.** Most alerts are not injected outbreaks, so every alert needs a short
  triage by a surveillance officer. That is acceptable at fewer than 1 alert per 100 weeks.
- For malaria, the historical-limits alert fired in **2025-W01 to W04 and 2026-W02 to W03**, 2–6 weeks before the
  seasonal peaks (2025-W07, 2026-W05). Combined with the forecast, this is the trigger for the seasonal staffing
  uplift (§3.7).

**Assumptions and limitations.**

- The injected outbreaks are cleaner than real ones.
- A few weekly reporting delays and missing reports (2 % of weeks) can mask or fake a signal, which is why the
  completeness measure sits next to the alerts.
- Historical limits need at least two prior seasons, so a new facility has no threshold.

## Technique 4 – What drives ED waiting time (BQ1)

**Question.** What lengthens door-to-doctor time: patient mix, load per doctor, bed occupancy (access block), night
shift or the malaria season? And which levers can management pull?

**Method** (`03_analytics/ed_wait_drivers.py`).

- **Data.** ORANGE, YELLOW and GREEN ED attendances with a valid door-to-doctor time, **drilled across** to:
  - the e-roster: doctors on duty in the arrival shift, giving arrivals per doctor-shift;
  - the ward census: hospital occupancy on the arrival day.
- **M1, ordinary least squares on log waiting time.**
  - It adjusts for triage category and facility (fixed effects).
  - Coefficients read as percentage effects.
  - Standard errors are HC3 heteroskedasticity-robust.
  - It is fitted on a 150,000-attendance sample.
- **M2, gradient-boosted trees.** Trained on 2022–2024 and tested on 2025–2026, with **permutation importance**, the
  same idea as the Power BI *Key influencers* visual.

<!-- include: evidence/ew_summary.md -->

<!-- table: OLS effects on door-to-doctor time (95 % confidence intervals, HC3) -->
<!-- include: evidence/ew_ols_effects.md -->

<!-- table: Gradient boosting: permutation importance on the 2025-2026 test set -->
<!-- include: evidence/ew_importance.md -->

<!-- figure: figures/ew_effects.png | Operational drivers of ED waiting time (OLS, % change with 95 % CI) | width=86% -->

<!-- figure: figures/ew_load_curve.png | Median wait of YELLOW (urgent) patients by arrivals per doctor-shift | width=86% -->

**Results.**

- **Case mix explains most of the variation.** Triage category accounts for 79 % of the importance, because SATS
  works as designed: ORANGE patients wait 93 % less than GREEN.
- **Load per doctor is the largest lever.**
  - Each extra arrival per doctor-shift adds **6.3 %** (CI 6.2–6.4 %) to the wait. It accounts for 21 % of the
    importance and is the only lever with real predictive power out of sample.
  - The median YELLOW wait rises from about 22 minutes below 4 arrivals per doctor to over 60 minutes above 16
    (figure above).
- **Access block.** Each 10 points of hospital occupancy adds 3.6 %.
- **Night shift adds 7.2 %.** The malaria season adds only 0.9 % once load is controlled, so the season acts
  *through* the load.
- The weekend has no effect (p = 0.38).
- The model explains about three-quarters of the variance of log waits, both in-sample (adjusted R² 0.757) and out
  of sample (R² 0.769).

**Natural experiment: the 2026 staffing intervention.** In January–June 2026, Rundu and Katima Mulilo had one extra
day-shift doctor; Oshakati is the comparison hospital, which had no change.

<!-- table: Staffing intervention, January-June 2026 versus January-June 2025 (Oshakati = comparison hospital) -->
<!-- include: evidence/ev_intervention.md -->

- At Katima Mulilo, day-shift doctors went from 1.0 to 1.85. The share of patients seen within target rose by
  **12.7 points**, and LWBS fell from 17.9 % to 10.8 %, despite 16 % more attendances.
- At Rundu, doctors went from 1.9 to 2.9. Patients seen within target rose 9.6 points, despite 23 % more
  attendances.
- Oshakati moved only 1.6 points.

This difference-in-differences pattern matches the regression. *Caveat:* the data are synthetic and the generator
planted this intervention. The point is that the warehouse and the model **recover** it, so the same analysis will
evaluate the real roster change.

**Assumptions and limitations.**

- This is observational: doctors are rostered *because* busy periods are expected, so the load effect may be
  underestimated (reverse causality).
- Unmeasured factors are not in the model: lab turnaround, senior decision-maker availability, ambulance offload.
- Effects are associations, not causal estimates. The intervention comparison is the closest thing to a causal test.
