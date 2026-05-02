#!/usr/bin/env bash
# =============================================================
# scripts/backup.sh
# Kavya Transports — Automated backup to S3
# Schedule via cron (IST = UTC+5:30):
#
#   # PostgreSQL — daily 2:00 AM IST (20:30 UTC prev day)
#   30 20 * * * BACKUP_BUCKET=kavyatransports-backups DB_PASSWORD=... bash /var/www/kavya/scripts/backup.sh postgres
#
#   # MongoDB — daily 2:30 AM IST (21:00 UTC prev day)
#   0 21 * * * BACKUP_BUCKET=kavyatransports-backups bash /var/www/kavya/scripts/backup.sh mongodb
#
#   # Redis — weekly Sunday 3:00 AM IST (21:30 UTC Sat)
#   30 21 * * 0 BACKUP_BUCKET=kavyatransports-backups bash /var/www/kavya/scripts/backup.sh redis
#
#   # Config files — weekly Sunday 3:30 AM IST
#   0 22 * * 0 BACKUP_BUCKET=kavyatransports-backups bash /var/www/kavya/scripts/backup.sh config
#
# To install S3 lifecycle rules, run:
#   bash /var/www/kavya/scripts/backup.sh lifecycle
# =============================================================
set -euo pipefail

# ── Env vars ─────────────────────────────────────────────────
: "${BACKUP_BUCKET:?Set BACKUP_BUCKET (e.g. kavyatransports-backups)}"
: "${AWS_REGION:=ap-south-1}"
: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=kavya_transports}"
: "${DB_USER:=kavya_app}"
: "${DB_PASSWORD:=}"
: "${MONGO_URI:=mongodb://localhost:27017}"
: "${ALERT_EMAIL:=admin@kavyatransports.com}"
: "${SMTP_USER:=}"
: "${SMTP_PASSWORD:=}"
: "${SMTP_HOST:=smtp-relay.brevo.com}"
: "${SMTP_PORT:=587}"

BACKUP_TYPE="${1:-postgres}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TMP_DIR=$(mktemp -d)
LOG_FILE="/var/log/kavya/backup.log"
mkdir -p /var/log/kavya

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
ok()   { echo -e "${GREEN}  ✅  $*${NC}" | tee -a "$LOG_FILE"; }
fail() { echo -e "${RED}  ❌  $*${NC}" | tee -a "$LOG_FILE"; send_failure_alert "$*"; exit 1; }

send_failure_alert() {
    if [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASSWORD" ]; then return; fi
    python3 -c "
import smtplib
from email.mime.text import MIMEText
msg = MIMEText('Backup FAILED: $1\nHost: $(hostname)\nTime: $(date)')
msg['Subject'] = '[Kavya ERP] Backup FAILED: $BACKUP_TYPE'
msg['From'] = 'alerts@kavyatransports.com'
msg['To'] = '$ALERT_EMAIL'
with smtplib.SMTP('$SMTP_HOST', $SMTP_PORT) as s:
    s.starttls(); s.login('$SMTP_USER', '$SMTP_PASSWORD')
    s.sendmail(msg['From'], [msg['To']], msg.as_string())
" 2>/dev/null || true
}

send_success_alert() {
    if [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASSWORD" ]; then return; fi
    python3 -c "
import smtplib
from email.mime.text import MIMEText
msg = MIMEText('Backup SUCCESS: $1\nHost: $(hostname)\nTime: $(date)')
msg['Subject'] = '[Kavya ERP] Backup OK: $BACKUP_TYPE'
msg['From'] = 'alerts@kavyatransports.com'
msg['To'] = '$ALERT_EMAIL'
with smtplib.SMTP('$SMTP_HOST', $SMTP_PORT) as s:
    s.starttls(); s.login('$SMTP_USER', '$SMTP_PASSWORD')
    s.sendmail(msg['From'], [msg['To']], msg.as_string())
" 2>/dev/null || true
}

verify_s3_upload() {
    local s3_path="$1"
    local size
    size=$(aws s3 ls "$s3_path" --region "$AWS_REGION" 2>/dev/null | awk '{print $3}')
    if [ -z "$size" ] || [ "$size" -eq 0 ]; then
        fail "S3 upload verification failed — file missing or empty: $s3_path"
    fi
    ok "S3 upload verified: $s3_path ($size bytes)"
}

# ── PostgreSQL backup ────────────────────────────────────────
backup_postgres() {
    log "Starting PostgreSQL backup ($DB_NAME) ..."
    local filename="pg_${DB_NAME}_${TIMESTAMP}.sql.gz"
    local local_path="$TMP_DIR/$filename"
    local s3_path="s3://$BACKUP_BUCKET/postgres/$filename"

    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -U "$DB_USER" \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        --no-password \
        --format=plain \
        "$DB_NAME" | gzip > "$local_path" || fail "pg_dump failed"

    local size
    size=$(wc -c < "$local_path")
    [ "$size" -gt 1000 ] || fail "Dump file suspiciously small ($size bytes)"

    aws s3 cp "$local_path" "$s3_path" --region "$AWS_REGION" \
        --storage-class STANDARD_IA || fail "S3 upload failed"

    verify_s3_upload "$s3_path"
    rm -f "$local_path"
    ok "PostgreSQL backup complete → $s3_path"
    send_success_alert "$s3_path"
}

# ── MongoDB backup ───────────────────────────────────────────
backup_mongodb() {
    log "Starting MongoDB backup ..."
    local dir_name="mongo_${TIMESTAMP}"
    local archive="$TMP_DIR/${dir_name}.tar.gz"
    local s3_path="s3://$BACKUP_BUCKET/mongodb/${dir_name}.tar.gz"

    mongodump --uri="$MONGO_URI" --out="$TMP_DIR/$dir_name" --quiet \
        || fail "mongodump failed"

    tar -czf "$archive" -C "$TMP_DIR" "$dir_name" || fail "tar failed"
    aws s3 cp "$archive" "$s3_path" --region "$AWS_REGION" \
        --storage-class STANDARD_IA || fail "S3 upload failed"

    verify_s3_upload "$s3_path"
    rm -rf "$TMP_DIR/$dir_name" "$archive"
    ok "MongoDB backup complete → $s3_path"
    send_success_alert "$s3_path"
}

# ── Redis backup ─────────────────────────────────────────────
backup_redis() {
    log "Starting Redis backup (RDB snapshot) ..."
    local rdb_src
    rdb_src=$(redis-cli CONFIG GET dir | tail -1)/$(redis-cli CONFIG GET dbfilename | tail -1)
    local filename="redis_${TIMESTAMP}.rdb.gz"
    local archive="$TMP_DIR/$filename"
    local s3_path="s3://$BACKUP_BUCKET/redis/$filename"

    # Trigger BGSAVE and wait for completion
    redis-cli BGSAVE
    while [ "$(redis-cli LASTSAVE)" = "$(redis-cli LASTSAVE)" ]; do sleep 1; done

    gzip -c "$rdb_src" > "$archive" || fail "Redis RDB compress failed"
    aws s3 cp "$archive" "$s3_path" --region "$AWS_REGION" || fail "S3 upload failed"

    verify_s3_upload "$s3_path"
    rm -f "$archive"
    ok "Redis backup complete → $s3_path"
    send_success_alert "$s3_path"
}

# ── Config backup ─────────────────────────────────────────────
backup_config() {
    log "Starting config file backup ..."
    local filename="config_${TIMESTAMP}.tar.gz"
    local archive="$TMP_DIR/$filename"
    local s3_path="s3://$BACKUP_BUCKET/config/$filename"

    tar -czf "$archive" \
        /var/www/kavya/backend/.env \
        /etc/nginx/sites-available/kavyatransports.com \
        /etc/systemd/system/kavya-*.service \
        2>/dev/null || fail "Config tar failed"

    aws s3 cp "$archive" "$s3_path" --region "$AWS_REGION" || fail "S3 upload failed"
    verify_s3_upload "$s3_path"
    rm -f "$archive"
    ok "Config backup complete → $s3_path"
    send_success_alert "$s3_path"
}

# ── S3 Lifecycle rules ───────────────────────────────────────
setup_lifecycle() {
    log "Setting S3 lifecycle rules on $BACKUP_BUCKET ..."
    aws s3api put-bucket-lifecycle-configuration \
        --bucket "$BACKUP_BUCKET" \
        --region "$AWS_REGION" \
        --lifecycle-configuration '{
          "Rules": [
            {
              "ID": "postgres-retention",
              "Filter": {"Prefix": "postgres/"},
              "Status": "Enabled",
              "Transitions": [{"Days": 7, "StorageClass": "GLACIER"}],
              "Expiration": {"Days": 90}
            },
            {
              "ID": "mongodb-retention",
              "Filter": {"Prefix": "mongodb/"},
              "Status": "Enabled",
              "Transitions": [{"Days": 7, "StorageClass": "GLACIER"}],
              "Expiration": {"Days": 90}
            },
            {
              "ID": "redis-retention",
              "Filter": {"Prefix": "redis/"},
              "Status": "Enabled",
              "Expiration": {"Days": 30}
            },
            {
              "ID": "config-retention",
              "Filter": {"Prefix": "config/"},
              "Status": "Enabled",
              "Expiration": {"Days": 90}
            }
          ]
        }'
    ok "S3 lifecycle rules applied"
}

# ── Dispatch ─────────────────────────────────────────────────
log "═══════════════════════════════"
log " Kavya Transports Backup — $BACKUP_TYPE"
log "═══════════════════════════════"

case "$BACKUP_TYPE" in
    postgres)  backup_postgres ;;
    mongodb)   backup_mongodb ;;
    redis)     backup_redis ;;
    config)    backup_config ;;
    lifecycle) setup_lifecycle ;;
    all)
        backup_postgres
        backup_mongodb
        backup_redis
        backup_config
        ;;
    *)
        echo "Usage: $0 {postgres|mongodb|redis|config|lifecycle|all}"
        exit 1
        ;;
esac

rmdir "$TMP_DIR" 2>/dev/null || true
log "Done ✅"
