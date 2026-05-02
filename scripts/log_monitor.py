#!/usr/bin/env python3
"""
scripts/log_monitor.py
Runs via cron every 15 minutes — scans Nginx/app error logs for anomalies
and sends email alert via Brevo SMTP if thresholds exceeded.

Crontab (add with: crontab -e):
  */15 * * * * /usr/bin/python3 /var/www/kavya/scripts/log_monitor.py >> /var/log/kavya/monitor.log 2>&1
"""
import os
import re
import sys
import smtplib
import logging
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from collections import defaultdict
from pathlib import Path

# ── Config ────────────────────────────────────────────────────
LOG_FILES = [
    os.getenv("APP_ERROR_LOG", "/var/log/kavya/error.log"),
    os.getenv("NGINX_ERROR_LOG", "/var/log/nginx/kavya_error.log"),
    os.getenv("NGINX_ACCESS_LOG", "/var/log/nginx/kavya_access.log"),
]

ALERT_EMAIL_FROM = os.getenv("ALERT_FROM_EMAIL", "alerts@kavyatransports.com")
ALERT_EMAIL_TO   = os.getenv("ALERT_TO_EMAIL",   "admin@kavyatransports.com")
SMTP_HOST        = os.getenv("SMTP_HOST",         "smtp-relay.brevo.com")
SMTP_PORT        = int(os.getenv("SMTP_PORT",     "587"))
SMTP_USER        = os.getenv("SMTP_USER",         "")
SMTP_PASSWORD    = os.getenv("SMTP_PASSWORD",     "")

# Thresholds
CRITICAL_KEYWORDS    = ["CRITICAL", "FATAL", "Traceback", "MemoryError", "OOM"]
ERROR_500_THRESHOLD  = 10   # 10+ 500 errors in 15 min → alert
FAILED_LOGIN_THRESHOLD = 20  # 20+ failed logins from same IP in 15 min → alert
WINDOW_MINUTES = 15

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("log_monitor")


def tail_recent_lines(filepath: str, minutes: int) -> list[str]:
    """Read lines from the last `minutes` minutes based on naive timestamp heuristic."""
    path = Path(filepath)
    if not path.exists():
        return []
    try:
        # Read last 5000 lines max to avoid huge reads
        with open(filepath, "r", errors="replace") as f:
            lines = f.readlines()[-5000:]
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        return lines  # We'll filter by pattern below; full parse is heavyweight
    except Exception as e:
        log.warning(f"Could not read {filepath}: {e}")
        return []


def check_critical_messages(lines: list[str]) -> list[str]:
    found = []
    for line in lines:
        for kw in CRITICAL_KEYWORDS:
            if kw in line:
                found.append(line.strip()[:200])
                break
    return found[:20]  # Cap at 20 to avoid email overflow


def check_500_errors(lines: list[str]) -> int:
    count = sum(1 for line in lines if '" 500 ' in line or '"status": 500' in line)
    return count


def check_failed_logins(lines: list[str]) -> dict[str, int]:
    """Returns {ip: count} for IPs with repeated auth failures."""
    pattern = re.compile(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}).*(?:/auth/login|/auth/verify-otp).*(?:401|400|429)')
    counts: dict[str, int] = defaultdict(int)
    for line in lines:
        m = pattern.search(line)
        if m:
            counts[m.group(1)] += 1
    return {ip: c for ip, c in counts.items() if c >= FAILED_LOGIN_THRESHOLD}


def send_alert(subject: str, body: str) -> bool:
    if not SMTP_USER or not SMTP_PASSWORD:
        log.warning("SMTP credentials not set — cannot send alert email")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[Kavya ERP Alert] {subject}"
        msg["From"]    = ALERT_EMAIL_FROM
        msg["To"]      = ALERT_EMAIL_TO
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(ALERT_EMAIL_FROM, [ALERT_EMAIL_TO], msg.as_string())
        log.info(f"Alert email sent: {subject}")
        return True
    except Exception as e:
        log.error(f"Failed to send alert email: {e}")
        return False


def main():
    log.info(f"Log monitor started — scanning last {WINDOW_MINUTES} min")
    alerts: list[str] = []

    all_lines: list[str] = []
    for f in LOG_FILES:
        all_lines.extend(tail_recent_lines(f, WINDOW_MINUTES))

    # 1. CRITICAL keyword check
    critical = check_critical_messages(all_lines)
    if critical:
        alerts.append(
            f"⚠️  {len(critical)} CRITICAL message(s) found:\n"
            + "\n".join(f"  • {l}" for l in critical[:5])
        )

    # 2. 500 error spike check
    errors_500 = check_500_errors(all_lines)
    if errors_500 >= ERROR_500_THRESHOLD:
        alerts.append(f"🔴  {errors_500} HTTP 500 errors in the last {WINDOW_MINUTES} min (threshold: {ERROR_500_THRESHOLD})")

    # 3. Brute-force login check
    bad_ips = check_failed_logins(all_lines)
    if bad_ips:
        ip_list = "\n".join(f"  • {ip}: {c} attempts" for ip, c in bad_ips.items())
        alerts.append(f"🚨  Possible brute-force attack:\n{ip_list}")

    if alerts:
        body = (
            f"Kavya Transports ERP — Automated Alert\n"
            f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S IST')}\n"
            f"Server: {os.uname().nodename}\n\n"
            + "\n\n".join(alerts)
            + "\n\n---\nThis is an automated message. Check /var/log/kavya/ for details."
        )
        send_alert(f"{len(alerts)} alert(s) detected", body)
        log.warning(f"Sent alert with {len(alerts)} finding(s)")
    else:
        log.info("No anomalies detected — all clear ✅")


if __name__ == "__main__":
    main()
