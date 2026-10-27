-- =============================================================================
-- 13_optimisation.sql
-- Post-load physical optimisation (run after every full load; idempotent):
--   (1) B-tree indexes on the foreign keys used by refresh queries and drill-through,
--   (2) BRIN indexes on the ever-increasing date keys of the large facts (tiny, range scans),
--   (3) an aggregate (materialised view) at facility x day x triage x department grain that
--       serves the executive and patient-flow visuals several times faster than the detail fact (measured).
-- See 03_analytics/performance_benchmark.py for the measured before/after timings.
-- =============================================================================
CREATE INDEX IF NOT EXISTS ix_fact_encounter_unit_date ON dw.fact_encounter (care_unit_key, arrival_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_encounter_diag ON dw.fact_encounter (diagnosis_key);
CREATE INDEX IF NOT EXISTS ix_fact_encounter_patient ON dw.fact_encounter (patient_key);
CREATE INDEX IF NOT EXISTS brin_fact_encounter_date ON dw.fact_encounter USING brin (arrival_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_admission_unit_date ON dw.fact_admission (care_unit_key, admission_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_admission_patient ON dw.fact_admission (patient_key);
CREATE INDEX IF NOT EXISTS ix_fact_admission_discharge ON dw.fact_admission (discharge_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_census_unit ON dw.fact_ward_census_daily (care_unit_key, census_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_roster_unit ON dw.fact_staff_roster (care_unit_key, roster_date_key);
CREATE INDEX IF NOT EXISTS ix_fact_surv_cond ON dw.fact_surveillance_weekly (condition_key, epi_week_date_key);
CREATE INDEX IF NOT EXISTS ix_dim_patient_pseudo ON dw.dim_patient (patient_pseudo_id, scd_effective_from, scd_effective_to);
CREATE INDEX IF NOT EXISTS ix_dim_care_unit_code ON dw.dim_care_unit (unit_code, scd_effective_from, scd_effective_to);

DROP MATERIALIZED VIEW IF EXISTS mart.agg_ed_daily;
CREATE MATERIALIZED VIEW mart.agg_ed_daily AS
SELECT e.arrival_date_key, cu.facility_key, ep.department_code, e.triage_key,
       count(*) AS encounters,
       count(e.door_to_doctor_min) AS seen_with_time,
       sum(e.door_to_doctor_min) AS door_to_doctor_min_sum,
       count(e.seen_within_target) AS triaged_and_seen,
       sum(e.seen_within_target) AS seen_within_target,
       sum(e.is_lwbs) AS lwbs, sum(e.is_admitted) AS admitted
FROM dw.fact_encounter e
JOIN dw.dim_care_unit cu ON cu.care_unit_key = e.care_unit_key
JOIN dw.dim_encounter_profile ep ON ep.encounter_profile_key = e.encounter_profile_key
GROUP BY 1, 2, 3, 4;
CREATE UNIQUE INDEX ux_agg_ed_daily ON mart.agg_ed_daily (arrival_date_key, facility_key, department_code, triage_key);
COMMENT ON MATERIALIZED VIEW mart.agg_ed_daily IS 'Aggregate: attendances per facility x day x department x triage (performance optimisation, report 3.7).';
GRANT SELECT ON mart.agg_ed_daily TO gbhs_pbi_reader;
