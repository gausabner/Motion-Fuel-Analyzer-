-- =============================================================================
-- 11_olap_queries.sql
-- OLAP operations on the health warehouse (each query is mirrored by a Power BI
-- interaction described in report section 3.5.1). Output captured by
-- 03_analytics/capture_sql_evidence.py into 06_report/evidence/olap_*.md
-- =============================================================================

-- name: olap_rollup
-- ROLL-UP along the time hierarchy: quarter -> year -> total of both years (ED attendances and % seen within target)
SELECT coalesce(d.calendar_year::text, '2024-2025')    AS year,
       CASE WHEN GROUPING(d.calendar_year) = 1 THEN '(grand total)' ELSE coalesce(d.year_quarter, '(year total)') END AS quarter,
       count(*)                                          AS ed_attendances,
       round(100.0 * sum(e.seen_within_target) / nullif(count(e.seen_within_target), 0), 1) AS pct_seen_within_target,
       GROUPING(d.calendar_year, d.year_quarter)        AS grouping_level
FROM dw.fact_encounter e
JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key AND ep.department_code = 'ED'
WHERE d.calendar_year BETWEEN 2024 AND 2025
GROUP BY ROLLUP (d.calendar_year, d.year_quarter)
ORDER BY d.calendar_year NULLS LAST, d.year_quarter NULLS LAST;

-- name: olap_drilldown
-- DRILL-DOWN along the geography snowflake: region -> facility -> care unit (inpatient bed occupancy, 2025)
SELECT coalesce(r.region_name, 'ALL REGIONS')        AS region,
       CASE WHEN GROUPING(r.region_name) = 1 THEN '' ELSE coalesce(f.facility_short_name, '(region total)') END AS facility,
       CASE WHEN GROUPING(f.facility_short_name) = 1 THEN '' ELSE coalesce(cu.unit_code, '(facility total)') END AS ward,
       sum(c.occupied_beds)                           AS patient_days,
       sum(c.beds_available)                          AS available_bed_days,
       round(100.0 * sum(c.occupied_beds) / nullif(sum(c.beds_available), 0), 1) AS occupancy_pct
FROM dw.fact_ward_census_daily c
JOIN dw.dim_care_unit cu ON cu.care_unit_key = c.care_unit_key
JOIN dw.dim_facility f ON f.facility_key = cu.facility_key
JOIN dw.dim_region r ON r.region_key = f.region_key
JOIN dw.dim_date d ON d.date_key = c.census_date_key
WHERE d.calendar_year = 2025 AND r.region_code IN ('NA-KE', 'NA-CA')
GROUP BY ROLLUP (r.region_name, f.facility_short_name, cu.unit_code)
ORDER BY r.region_name NULLS LAST, f.facility_short_name NULLS LAST, cu.unit_code NULLS LAST;

-- name: olap_slice
-- SLICE: fix one member (condition = Malaria) and compare facilities over all years (IDSR weekly returns)
SELECT f.facility_short_name AS facility, r.malaria_stratum,
       sum(s.cases_total) AS malaria_cases, sum(s.deaths_total) AS deaths,
       round(100.0 * sum(s.tests_positive) / nullif(sum(s.tests_done), 0), 1) AS test_positivity_pct,
       round(100 * sum(s.cases_total) / sum(sum(s.cases_total)) OVER (), 1) AS share_pct
FROM dw.fact_surveillance_weekly s
JOIN dw.dim_condition c ON c.condition_key = s.condition_key AND c.condition_code = 'MAL'
JOIN dw.dim_facility f ON f.facility_key = s.facility_key
JOIN dw.dim_region r ON r.region_key = f.region_key
GROUP BY f.facility_short_name, r.malaria_stratum
ORDER BY malaria_cases DESC;

-- name: olap_dice
-- DICE: sub-cube defined on three dimensions - ED attendances in the 2025 malaria season (Jan-May),
-- triage YELLOW/GREEN, facilities in the North-East zone - with LWBS and waiting time
SELECT f.facility_short_name AS facility, t.triage_code AS triage, d.month_short AS month,
       count(*) AS attendances,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.door_to_doctor_min)::numeric, 0) AS median_door_to_doctor_min,
       round(100.0 * avg(e.is_lwbs), 1) AS lwbs_pct
FROM dw.fact_encounter e
JOIN dw.dim_date d ON d.date_key = e.arrival_date_key
JOIN dw.dim_triage t ON t.triage_key = e.triage_key
JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
JOIN dw.dim_facility f ON f.facility_key = cu.facility_key
JOIN dw.dim_region r ON r.region_key = f.region_key
WHERE d.calendar_year = 2025 AND d.month_num BETWEEN 1 AND 5 AND t.triage_code IN ('YELLOW', 'GREEN')
  AND r.zone = 'North-East' AND cu.unit_type = 'Emergency department'
GROUP BY f.facility_short_name, t.triage_code, d.month_num, d.month_short
ORDER BY f.facility_short_name, t.triage_code, d.month_num;

-- name: olap_pivot
-- PIVOT: rows = facility, columns = calendar year (malaria cases per 100 000 catchment population)
SELECT f.facility_short_name AS facility,
       round(100000.0 * sum(s.cases_total) FILTER (WHERE d.epi_year = 2022) / max(cp.pop) FILTER (WHERE cp.y = 2022), 0) AS "2022",
       round(100000.0 * sum(s.cases_total) FILTER (WHERE d.epi_year = 2023) / max(cp.pop) FILTER (WHERE cp.y = 2023), 0) AS "2023",
       round(100000.0 * sum(s.cases_total) FILTER (WHERE d.epi_year = 2024) / max(cp.pop) FILTER (WHERE cp.y = 2024), 0) AS "2024",
       round(100000.0 * sum(s.cases_total) FILTER (WHERE d.epi_year = 2025) / max(cp.pop) FILTER (WHERE cp.y = 2025), 0) AS "2025",
       round(100000.0 * sum(s.cases_total) FILTER (WHERE d.epi_year = 2026) / max(cp.pop) FILTER (WHERE cp.y = 2026), 0) AS "2026 (to W39)"
FROM dw.fact_surveillance_weekly s
JOIN dw.dim_condition c ON c.condition_key = s.condition_key AND c.condition_code = 'MAL'
JOIN dw.dim_date d ON d.date_key = s.epi_week_date_key
JOIN dw.dim_facility f ON f.facility_key = s.facility_key
JOIN (SELECT f2.facility_key, p.year_date_key / 10000 AS y, round(p.population * f2.catchment_share) AS pop
      FROM dw.fact_population p JOIN dw.dim_facility f2 ON f2.region_key = p.region_key) cp
  ON cp.facility_key = s.facility_key AND cp.y = d.epi_year
GROUP BY f.facility_short_name
ORDER BY "2025" DESC NULLS LAST;

-- name: olap_drill_across
-- DRILL-ACROSS: two facts joined through conformed dimensions (care unit x date):
-- ward census (patient days) and e-roster (nursing hours) -> nursing hours per patient day (NHPPD), 2025
SELECT f.facility_short_name AS facility, cu.specialty,
       sum(c.occupied_beds) AS patient_days, round(sum(r.nurse_hours)) AS nursing_hours,
       round(sum(r.nurse_hours) / nullif(sum(c.occupied_beds), 0), 2) AS nhppd,
       round(100.0 * sum(c.occupied_beds) / nullif(sum(c.beds_available), 0), 1) AS occupancy_pct
FROM dw.fact_ward_census_daily c
JOIN (SELECT roster_date_key, care_unit_key, sum(nurse_hours) AS nurse_hours FROM dw.fact_staff_roster GROUP BY 1, 2) r
  ON r.roster_date_key = c.census_date_key AND r.care_unit_key = c.care_unit_key
JOIN dw.dim_care_unit cu ON cu.care_unit_key = c.care_unit_key
JOIN dw.dim_facility f ON f.facility_key = cu.facility_key
JOIN dw.dim_date d ON d.date_key = c.census_date_key
WHERE d.calendar_year = 2025
GROUP BY f.facility_short_name, cu.specialty
ORDER BY nhppd;

-- name: olap_semi_additive
-- SEMI-ADDITIVE measure: occupied beds can be summed across wards but NOT across days.
-- Correct: average daily census (or last value); wrong: the sum over days (shown for contrast).
SELECT f.facility_short_name AS facility, d.year_month,
       round(avg(daily.occ), 1) AS avg_daily_occupied_beds,
       (array_agg(daily.occ ORDER BY daily.census_date_key DESC))[1] AS occupied_beds_last_day,
       sum(daily.occ) AS wrong_sum_over_days_equals_patient_days
FROM (SELECT c.census_date_key, cu.facility_key, sum(c.occupied_beds) AS occ
      FROM dw.fact_ward_census_daily c JOIN dw.dim_care_unit cu ON cu.care_unit_key = c.care_unit_key
      GROUP BY 1, 2) daily
JOIN dw.dim_facility f ON f.facility_key = daily.facility_key
JOIN dw.dim_date d ON d.date_key = daily.census_date_key
WHERE d.year_month IN ('2026-03', '2026-08') AND f.has_emergency_department
GROUP BY f.facility_short_name, d.year_month
ORDER BY f.facility_short_name, d.year_month;
