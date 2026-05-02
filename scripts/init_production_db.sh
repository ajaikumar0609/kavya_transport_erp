#!/usr/bin/env bash
# =============================================================
# scripts/init_production_db.sh
# Kavya Transports — Production database initialisation
# Run on first deploy (and re-runnable — all steps are idempotent)
#
# Usage:
#   cd /var/www/kavya/backend
#   DB_PASSWORD=... bash scripts/init_production_db.sh
# =============================================================
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${CYAN}[$(date +%T)]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✅  $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️   $*${NC}"; }
fail() { echo -e "${RED}  ❌  $*${NC}"; exit 1; }

# ── Env vars check ─────────────────────────────────────────────
: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=kavya_transports}"
: "${DB_USER:=kavya_app}"
: "${DB_PASSWORD:?DB_PASSWORD must be set}"
: "${DB_SUPERUSER:=postgres}"
: "${DB_SUPERUSER_PASSWORD:?DB_SUPERUSER_PASSWORD must be set}"
: "${ADMIN_PHONE:?ADMIN_PHONE must be set}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL must be set}"

export PGPASSWORD="$DB_SUPERUSER_PASSWORD"
PSQL_SU="psql -h $DB_HOST -p $DB_PORT -U $DB_SUPERUSER"
export PGPASSWORD="$DB_PASSWORD"
PSQL_APP="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

log "═══════════════════════════════════════════════════"
log " Kavya Transports — Production DB Initialisation"
log "═══════════════════════════════════════════════════"

# ── STEP 1: Superuser setup ──────────────────────────────────
log "STEP 1 — PostgreSQL user & database setup"

export PGPASSWORD="$DB_SUPERUSER_PASSWORD"

# Create kavya_app user if not exists
USER_EXISTS=$($PSQL_SU -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" postgres)
if [ "$USER_EXISTS" != "1" ]; then
    $PSQL_SU postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
    ok "Created user $DB_USER"
else
    warn "User $DB_USER already exists — skipping create"
fi

# Create database if not exists
DB_EXISTS=$($PSQL_SU -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" postgres)
if [ "$DB_EXISTS" != "1" ]; then
    $PSQL_SU postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    ok "Created database $DB_NAME"
else
    warn "Database $DB_NAME already exists — skipping create"
fi

# Grant privileges
$PSQL_SU -d "$DB_NAME" postgres -c "GRANT CONNECT ON DATABASE $DB_NAME TO $DB_USER;"
$PSQL_SU -d "$DB_NAME" postgres -c "GRANT USAGE ON SCHEMA public TO $DB_USER;"
$PSQL_SU -d "$DB_NAME" postgres -c "GRANT CREATE ON SCHEMA public TO $DB_USER;"
$PSQL_SU -d "$DB_NAME" postgres -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_USER;"
$PSQL_SU -d "$DB_NAME" postgres -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $DB_USER;"
ok "Permissions granted to $DB_USER"

# Run hardening SQL (creates audit_log, financial_audit_log)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/postgres_hardening.sql" ]; then
    $PSQL_SU -d "$DB_NAME" postgres -f "$SCRIPT_DIR/postgres_hardening.sql" > /dev/null
    ok "postgres_hardening.sql applied"
else
    warn "postgres_hardening.sql not found — skipping"
fi

# ── STEP 2: Alembic migrations ───────────────────────────────
log "STEP 2 — Running Alembic migrations"
export PGPASSWORD="$DB_PASSWORD"

cd "$SCRIPT_DIR/.."

alembic current 2>&1 || true  # show current head (non-fatal if no revisions yet)

if ! alembic upgrade head; then
    fail "Alembic migration failed — check the migration output above"
fi
ok "Alembic migrations applied"

CURRENT_HEAD=$(alembic current 2>&1)
log "  Current head: $CURRENT_HEAD"

# ── STEP 3: Concurrent indexes ───────────────────────────────
log "STEP 3 — Creating performance indexes (CONCURRENTLY)"

$PSQL_APP <<'SQL'
-- trips
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_status       ON trips(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_driver_id    ON trips(driver_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_vehicle_id   ON trips(vehicle_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_created_at   ON trips(created_at DESC);

-- invoices
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_trip_id   ON invoices(trip_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_status    ON invoices(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- lorry receipts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lr_trip_id         ON lorry_receipts(trip_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lr_status          ON lorry_receipts(status);

-- audit_log
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user     ON audit_log(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_event    ON audit_log(event_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_created  ON audit_log(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_ip       ON audit_log(ip_address);

SQL
ok "Indexes created (or already exist)"

# ── STEP 4: Seed essential data (only if empty) ───────────────
log "STEP 4 — Seeding super_admin (only if users table is empty)"

USER_COUNT=$($PSQL_APP -tAc "SELECT COUNT(*) FROM users" 2>/dev/null || echo "0")
USER_COUNT="${USER_COUNT// /}"

if [ "$USER_COUNT" -eq "0" ]; then
    log "  Empty database detected — running seed_data.py"
    ADMIN_PHONE="$ADMIN_PHONE" ADMIN_EMAIL="$ADMIN_EMAIL" python3 seed_data.py
    ok "Seed data inserted"
else
    warn "users table has $USER_COUNT rows — skipping seed to avoid duplicates"
fi

# ── STEP 5: Verify row counts ────────────────────────────────
log "STEP 5 — Table row counts"

$PSQL_APP <<'SQL'
SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 20;
SQL

log "═══════════════════════════════════════════════════"
ok "Database initialized successfully ✅"
log "═══════════════════════════════════════════════════"
