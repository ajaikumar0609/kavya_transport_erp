# Kavya Transports ERP — Disaster Recovery Playbook

> **Last updated**: April 2026  
> **Server**: AWS EC2 t4g.medium — ap-south-1 (Mumbai)  
> **Contact**: admin@kavyatransports.com

---

## Recovery Time Objectives

| Scenario | Target RTO | Target RPO |
|----------|-----------|-----------|
| App crash / restart | < 2 min | 0 (stateless) |
| DB corruption (restore from backup) | < 1 hour | 24 hours (daily backup) |
| Full server loss (new EC2) | < 4 hours | 24 hours |

---

## 1. App Won't Start (`kavya-api` service failed)

```bash
sudo systemctl status kavya-api
sudo journalctl -u kavya-api -n 100 --no-pager

# Common fixes:
cd /var/www/kavya/backend
source ../venv/bin/activate
python3 scripts/pre_start.py        # diagnose: DB/Redis/config issues
python3 scripts/security_check.py   # check env vars

sudo systemctl restart kavya-api
```

---

## 2. PostgreSQL Restore from S3

### 2a. Restore to same server

```bash
# 1. List available backups
aws s3 ls s3://kavyatransports-backups/postgres/ --region ap-south-1

# 2. Download latest (replace filename)
aws s3 cp s3://kavyatransports-backups/postgres/pg_kavya_transports_20260422_020000.sql.gz /tmp/

# 3. Stop the app (prevent writes during restore)
sudo systemctl stop kavya-api kavya-celery-worker kavya-celery-beat

# 4. Drop and recreate database
sudo -u postgres psql -c "DROP DATABASE IF EXISTS kavya_transports_restore;"
sudo -u postgres psql -c "CREATE DATABASE kavya_transports_restore OWNER kavya_app;"

# 5. Restore
gunzip -c /tmp/pg_kavya_transports_*.sql.gz | \
    PGPASSWORD="$DB_PASSWORD" psql -U kavya_app -h localhost kavya_transports_restore

# 6. Verify row counts
PGPASSWORD="$DB_PASSWORD" psql -U kavya_app -h localhost kavya_transports_restore \
    -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"

# 7. Swap databases (rename)
sudo -u postgres psql -c "ALTER DATABASE kavya_transports RENAME TO kavya_transports_old;"
sudo -u postgres psql -c "ALTER DATABASE kavya_transports_restore RENAME TO kavya_transports;"

# 8. Restart services
sudo systemctl start kavya-api kavya-celery-worker kavya-celery-beat

# 9. Drop old database after confirming app is healthy
# sudo -u postgres psql -c "DROP DATABASE kavya_transports_old;"
```

### 2b. Point-in-time (if WAL archiving enabled)

```bash
# WAL archiving is a future enhancement — for now rely on daily backups.
# Enable with: archive_mode=on, archive_command in postgresql.conf
```

---

## 3. MongoDB Restore from S3

```bash
# 1. Download backup
aws s3 cp s3://kavyatransports-backups/mongodb/mongo_20260422_023000.tar.gz /tmp/

# 2. Extract
cd /tmp && tar -xzf mongo_20260422_*.tar.gz

# 3. Restore (--drop to overwrite existing collections)
mongorestore --uri="mongodb://localhost:27017" \
    --drop \
    --dir=/tmp/mongo_20260422_*/transport_erp_logs

# 4. Verify
mongosh --eval "db.getSiblingDB('transport_erp_logs').getCollectionNames()"
```

---

## 4. Full Server Rebuild (New EC2 Instance)

### Prerequisites
- AMI snapshot or golden image
- `.env` file backed up in S3 (`kavyatransports-backups/config/`)
- Domain DNS pointing to old IP (update after new instance is ready)

### Step-by-step

```bash
# On new EC2 (Ubuntu 24.04 t4g.medium):

# 1. System setup
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip nginx postgresql-client \
    redis-tools awscli certbot python3-certbot-nginx git htop

# 2. Create app user
sudo useradd -m -s /bin/bash kavya
sudo mkdir -p /var/www/kavya /var/log/kavya /var/run/kavya
sudo chown -R kavya:kavya /var/www/kavya /var/log/kavya /var/run/kavya

# 3. Clone repo
sudo -u kavya git clone https://github.com/YOUR_ORG/kavya_transport_erp.git /var/www/kavya/app
cd /var/www/kavya

# 4. Restore env config from S3
aws s3 cp s3://kavyatransports-backups/config/config_latest.tar.gz /tmp/
sudo tar -xzf /tmp/config_latest.tar.gz -C /

# 5. Python venv
sudo -u kavya python3.11 -m venv /var/www/kavya/venv
sudo -u kavya /var/www/kavya/venv/bin/pip install -r /var/www/kavya/app/backend/requirements.txt

# 6. Frontend build
(cd /var/www/kavya/app/frontend && sudo npm ci && sudo npm run build)
sudo cp -r /var/www/kavya/app/frontend/dist /var/www/kavya/frontend/

# 7. Database: restore from S3 (see Section 2 above)

# 8. Install & start services
sudo cp /var/www/kavya/app/scripts/kavya-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable kavya-api kavya-celery-worker kavya-celery-beat
sudo systemctl start kavya-api kavya-celery-worker kavya-celery-beat

# 9. Nginx
sudo cp /var/www/kavya/app/scripts/nginx_kavyatransports.conf \
    /etc/nginx/sites-available/kavyatransports.com
sudo ln -s /etc/nginx/sites-available/kavyatransports.com \
    /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 10. SSL
sudo certbot --nginx -d kavyatransports.com -d www.kavyatransports.com

# 11. Update DNS to new Elastic IP
# (Do this last — wait for app to be healthy first)

# 12. Run smoke tests
python3 /var/www/kavya/app/scripts/smoke_test.py
```

---

## 5. Redis Recovery

Redis data is mostly ephemeral (rate limit counters, token blacklist, Celery results).  
**Recovery is usually not needed** — services auto-reconnect and rebuild state.

```bash
# If Redis is down, restart:
sudo systemctl restart redis

# If data restore is needed (weekly RDB backup):
aws s3 cp s3://kavyatransports-backups/redis/redis_latest.rdb.gz /tmp/
gunzip /tmp/redis_latest.rdb.gz
sudo systemctl stop redis
sudo cp /tmp/redis_latest.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb
sudo systemctl start redis
```

---

## 6. SSL Certificate Expired

```bash
# Check expiry
sudo certbot certificates

# Manual renewal
sudo certbot renew --force-renewal
sudo systemctl reload nginx

# If certbot is broken, re-issue:
sudo certbot --nginx -d kavyatransports.com -d www.kavyatransports.com
```

---

## 7. Emergency Contacts & Credentials

Store these in a secure password manager (1Password / Bitwarden), **not** in this file:

- AWS root account access keys
- PostgreSQL `postgres` superuser password
- `.env` production values
- Razorpay live keys
- MSG91 API key
- Brevo SMTP credentials

---

## 8. First 30 Minutes Checklist (After Any Incident)

```
□ Identify: which service failed? (API / DB / Redis / Nginx)
□ Check logs: sudo journalctl -u kavya-api -n 200
□ Run: python3 /var/www/kavya/scripts/smoke_test.py
□ If database issue: verify backups are intact before attempting restore
□ Notify: send manual alert to admin@kavyatransports.com with incident summary
□ Document: add entry to incident log with root cause + fix
□ Postmortem: schedule within 24 hours
```
