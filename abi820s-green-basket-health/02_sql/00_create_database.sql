-- =============================================================================
-- 00_create_database.sql
-- Green Basket cc - Health Services (GBHS) | ABI820S BI project
-- Target platform: PostgreSQL 16 (tested on 16.15). Run as a superuser, e.g.
--   psql -U postgres -f 00_create_database.sql
-- Creates the warehouse database and the two least-privilege login roles.
-- Passwords below are placeholders for a local lab install; change them before
-- any shared deployment (never commit real credentials).
-- =============================================================================
SELECT 'CREATE DATABASE gbhs_health_dw ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'gbhs_health_dw')
\gexec

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gbhs_etl_loader') THEN
        CREATE ROLE gbhs_etl_loader LOGIN PASSWORD 'change-me-etl';      -- runs the pipeline
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gbhs_pbi_reader') THEN
        CREATE ROLE gbhs_pbi_reader LOGIN PASSWORD 'change-me-reader';   -- Power BI refresh account (mart only)
    END IF;
END $$;

GRANT CONNECT ON DATABASE gbhs_health_dw TO gbhs_etl_loader, gbhs_pbi_reader;
