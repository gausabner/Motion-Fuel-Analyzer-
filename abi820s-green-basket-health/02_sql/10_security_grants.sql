-- =============================================================================
-- 10_security_grants.sql
-- Least privilege: the Power BI refresh account reads ONLY the mart schema (no
-- pseudonyms, no raw extracts, no audit logs); the ETL account owns the pipeline.
-- =============================================================================
REVOKE ALL ON SCHEMA stg, ref, dw, etl, audit, sec FROM PUBLIC;
GRANT USAGE ON SCHEMA mart TO gbhs_pbi_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA mart TO gbhs_pbi_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA mart GRANT SELECT ON TABLES TO gbhs_pbi_reader;
GRANT USAGE ON SCHEMA stg, ref, dw, etl, audit, sec, mart TO gbhs_etl_loader;
GRANT ALL ON ALL TABLES IN SCHEMA stg, ref, dw, audit, sec, mart TO gbhs_etl_loader;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA etl TO gbhs_etl_loader;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA etl TO gbhs_etl_loader;
