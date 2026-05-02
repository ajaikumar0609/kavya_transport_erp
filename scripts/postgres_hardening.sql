-- ============================================================
-- PostgreSQL Production Hardening Script
-- Kavya Transports ERP — run once on production DB setup
-- ============================================================

-- 1. Create limited-privilege app user (never use postgres superuser in app)
CREATE USER kavya_app WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';

-- 2. Grant only what the app needs on the existing schema
GRANT CONNECT ON DATABASE transport_erp TO kavya_app;
GRANT USAGE ON SCHEMA public TO kavya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kavya_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kavya_app;

-- Apply to future tables too (run whenever schema changes)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kavya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO kavya_app;

-- 3. Explicitly DENY dangerous operations (defence in depth)
REVOKE CREATE ON SCHEMA public FROM kavya_app;

-- 4. Audit log table for auth/security events
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    event_type      VARCHAR(50)  NOT NULL,           -- login_success, otp_failed, 403, etc.
    user_id         INTEGER,                          -- NULL for unauthenticated events
    role            VARCHAR(50),
    ip_address      INET,
    user_agent      TEXT,
    endpoint        VARCHAR(255),
    http_status     SMALLINT,
    metadata        JSONB,                            -- old/new values, error details, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_log_user_id    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS ix_audit_log_created_at ON audit_log(created_at DESC);

-- 5. Financial change log — track before/after for payments, invoices
CREATE TABLE IF NOT EXISTS financial_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    table_name      VARCHAR(100) NOT NULL,
    record_id       INTEGER      NOT NULL,
    field_name      VARCHAR(100) NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_by      INTEGER,                          -- user_id
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_fin_audit_record ON financial_audit_log(table_name, record_id);

-- 6. Connection pool guidance for t4g.medium (2 vCPU, 4 GB RAM)
-- Set in backend DATABASE_URL or PgBouncer:
--   pool_size=10, max_overflow=10 → total max 20 connections
-- PostgreSQL max_connections should be 100 (default) — this gives headroom.

-- 7. SSL verification (run from psql to confirm SSL is active)
-- SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();
