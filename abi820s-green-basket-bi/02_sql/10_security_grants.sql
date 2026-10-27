-- =============================================================================
-- 10_security_grants.sql
-- Least privilege: the Power BI refresh account reads ONLY the mart schema;
-- the ETL account owns staging/warehouse objects. PUBLIC gets nothing.
-- =============================================================================
REVOKE ALL ON SCHEMA stg, ref, dw, etl, mart, audit, sec FROM PUBLIC;

GRANT USAGE ON SCHEMA stg, ref, dw, etl, mart, audit, sec TO gb_etl_loader;
GRANT ALL ON ALL TABLES IN SCHEMA stg, ref, dw, audit, sec TO gb_etl_loader;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dw, audit TO gb_etl_loader;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA etl TO gb_etl_loader;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA etl TO gb_etl_loader;

GRANT USAGE ON SCHEMA mart TO gb_pbi_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA mart TO gb_pbi_reader;
-- views run with the owner's rights, so the reader needs no access to dw/audit/sec
ALTER DEFAULT PRIVILEGES IN SCHEMA mart GRANT SELECT ON TABLES TO gb_pbi_reader;
