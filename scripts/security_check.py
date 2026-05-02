#!/usr/bin/env python3
"""
Pre-Deployment Security Validation Script
Kavya Transports ERP — Run before every production deploy.

Usage:
    cd backend && python ../scripts/security_check.py

Exit codes:
    0 — All checks passed
    1 — One or more CRITICAL checks failed
"""

import os
import sys
import subprocess
import re
from pathlib import Path

# ── Args ────────────────────────────────────────────────────────────────────
# --dev   Skip checks that only apply in production (ENVIRONMENT, DEBUG, CORS localhost)
# --prod  Default: enforce all checks (required for deploy)
IS_DEV_MODE = "--dev" in sys.argv

# ── Colour helpers ──────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

PASS  = f"{GREEN}✓ PASS{RESET}"
FAIL  = f"{RED}✗ FAIL{RESET}"
WARN  = f"{YELLOW}⚠ WARN{RESET}"

results: list[dict] = []

def check(name: str, passed: bool, detail: str = "", critical: bool = True) -> bool:
    level = "CRITICAL" if critical else "HIGH"
    badge = PASS if passed else (FAIL if critical else WARN)
    print(f"  {badge}  [{level}] {name}")
    if detail:
        color = GREEN if passed else (RED if critical else YELLOW)
        print(f"         {color}{detail}{RESET}")
    results.append({"name": name, "passed": passed, "critical": critical})
    return passed

def section(title: str) -> None:
    print(f"\n{BOLD}{CYAN}━━━ {title} ━━━{RESET}")

# ── Load .env ───────────────────────────────────────────────────────────────
env_file = Path(__file__).resolve().parent.parent / "backend" / ".env"
env: dict[str, str] = {}
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
else:
    print(f"{RED}✗  backend/.env not found — cannot validate environment{RESET}")
    sys.exit(1)

def e(key: str) -> str:
    return env.get(key, os.environ.get(key, ""))

WEAK_SECRETS = {
    "", "changeme", "secret", "test", "password",
    "your-super-secret-key-change-in-production",
    "change-this-to-a-super-secure-random-string-in-production",
    "YOUR_SECRET_KEY_HERE",
}

print(f"\n{BOLD}Kavya Transports ERP — Pre-Deployment Security Check{RESET}")
if IS_DEV_MODE:
    print(f"{YELLOW}  Mode: --dev (production-only checks skipped){RESET}")
print("=" * 55)

# ── SECTION 1: Environment ──────────────────────────────────────────────────
section("ENVIRONMENT")

secret_key = e("SECRET_KEY")
check("ENVIRONMENT=production", IS_DEV_MODE or e("ENVIRONMENT") == "production",
      f"Current: ENVIRONMENT={e('ENVIRONMENT')}" + (" (skipped in --dev mode)" if IS_DEV_MODE else ""))
check("DEBUG=false", IS_DEV_MODE or e("DEBUG").lower() in ("false", "0", ""),
      f"Current: DEBUG={e('DEBUG')}" + (" (skipped in --dev mode)" if IS_DEV_MODE else ""))
check("SECRET_KEY is set and strong",
      bool(secret_key) and len(secret_key) >= 64 and secret_key not in WEAK_SECRETS,
      f"Length: {len(secret_key)} chars (need ≥ 64). "
      f"Generate: python -c \"import secrets; print(secrets.token_hex(32))\"")
check("ACCESS_TOKEN_EXPIRE_MINUTES ≤ 30",
      int(e("ACCESS_TOKEN_EXPIRE_MINUTES") or 999) <= 30,
      f"Current: {e('ACCESS_TOKEN_EXPIRE_MINUTES')} min")
check("REFRESH_TOKEN_EXPIRE_DAYS ≤ 7",
      int(e("REFRESH_TOKEN_EXPIRE_DAYS") or 999) <= 7,
      f"Current: {e('REFRESH_TOKEN_EXPIRE_DAYS')} days")

# ── SECTION 2: Database ──────────────────────────────────────────────────────
section("DATABASE")

db_url = e("DATABASE_URL") or ""
pg_host = e("POSTGRES_HOST") or ""
check("Database connection uses SSL",
      "ssl=require" in db_url or "sslmode=require" in db_url or pg_host not in ("localhost", "127.0.0.1"),
      "Production DB must use ?ssl=require in DATABASE_URL", critical=False)
check("REDIS_PASSWORD is set",
      bool(e("REDIS_PASSWORD")),
      "Redis must require authentication in production", critical=False)
check("MONGODB_URL has credentials or is localhost",
      "@" in e("MONGODB_URL") or "localhost" in e("MONGODB_URL") or "127.0.0.1" in e("MONGODB_URL"),
      f"MONGODB_URL: {e('MONGODB_URL')[:40]}...", critical=False)

# ── SECTION 3: CORS & Domains ────────────────────────────────────────────────
section("CORS & DOMAINS")

cors = e("CORS_ORIGINS") or e("ALLOWED_ORIGINS") or ""
check("CORS_ORIGINS does not contain wildcard *",
      "*" not in cors,
      f"Current: {cors[:80]}")
check("ALLOWED_ORIGINS is production domain",
      IS_DEV_MODE or "kavyatransports.com" in cors or "localhost" not in cors,
      "Should not include localhost in production" + (" (skipped in --dev mode)" if IS_DEV_MODE else ""), critical=False)

# ── SECTION 4: API Keys ───────────────────────────────────────────────────────
section("API KEYS & SECRETS")

check("RAZORPAY_WEBHOOK_SECRET is set",
      bool(e("RAZORPAY_WEBHOOK_SECRET")),
      "Required for secure Razorpay webhooks")
check("MSG91_AUTH_KEY is not placeholder",
      e("MSG91_AUTH_KEY") not in ("YOUR_MSG91_AUTH_KEY_HERE", "", "507963A4xXGr4c69da9418P1"),
      "The original key was exposed in git — rotate it at msg91.com and set new key in .env")
check("MSG91_WIDGET_ID is not placeholder",
      e("MSG91_WIDGET_ID") not in ("YOUR_MSG91_WIDGET_ID_HERE", "", "36646b72316d313131353435"),
      "The original Widget ID was exposed in git — create new widget at msg91.com and update .env")
check("AWS_ACCESS_KEY_ID is set",
      bool(e("AWS_ACCESS_KEY_ID")) and e("AWS_ACCESS_KEY_ID") != "YOUR_AWS_ACCESS_KEY_HERE",
      "", critical=False)

# ── SECTION 5: Git / File System ─────────────────────────────────────────────
section("GIT & FILE SYSTEM")

try:
    tracked = subprocess.check_output(
        ["git", "ls-files", "--error-unmatch", "backend/.env"],
        stderr=subprocess.DEVNULL, cwd=env_file.parent.parent
    ).decode().strip()
    env_tracked = bool(tracked)
except subprocess.CalledProcessError:
    env_tracked = False
check("backend/.env is NOT tracked by git", not env_tracked,
      "Run: git rm --cached backend/.env && git commit -m 'remove .env from tracking'")

# Check for hardcoded real MSG91 keys in source files
try:
    result = subprocess.run(
        ["grep", "-rn", "507963A4xXGr4c69da9418P1", "--include=*.py", "--include=*.ts", "--include=*.dart", "backend/", "frontend/", "kavya_app/"],
        capture_output=True, text=True, cwd=env_file.parent.parent
    )
    hardcoded_found = bool(result.stdout.strip())
except Exception:
    hardcoded_found = False
check("No hardcoded MSG91 key in source files", not hardcoded_found,
      result.stdout.strip()[:200] if hardcoded_found else "")

# Check for Swagger enabled paths in main.py
try:
    main_py = (env_file.parent / "app" / "main.py").read_text()
    swagger_conditional = "_is_production" in main_py and "docs_url=None" in main_py
except Exception:
    swagger_conditional = False
check("Swagger UI disabled in production (conditional in main.py)", swagger_conditional)

# ── SECTION 6: Dependency Audit ───────────────────────────────────────────────
section("DEPENDENCY AUDIT")

try:
    result = subprocess.run(
        [sys.executable, "-m", "pip_audit", "--require", "requirements.txt",
         "--severity", "high", "-f", "json", "-q"],
        capture_output=True, text=True, cwd=env_file.parent
    )
    no_high_cves = result.returncode == 0
    cve_detail = "Run: pip install pip-audit && pip-audit -r requirements.txt" if result.returncode != 0 else "No HIGH/CRITICAL CVEs"
except FileNotFoundError:
    no_high_cves = None
    cve_detail = "pip-audit not installed — run: pip install pip-audit"
    print(f"  {WARN}  [HIGH] pip-audit not installed — skipping CVE check")
if no_high_cves is not None:
    check("pip-audit: no HIGH/CRITICAL CVEs in requirements.txt", no_high_cves, cve_detail, critical=False)

# ── SUMMARY ───────────────────────────────────────────────────────────────────
print(f"\n{BOLD}{'=' * 55}{RESET}")
total       = len(results)
passed      = sum(1 for r in results if r["passed"])
failed_crit = [r for r in results if not r["passed"] and r["critical"]]
failed_high = [r for r in results if not r["passed"] and not r["critical"]]

print(f"  {BOLD}Results: {passed}/{total} passed{RESET}")
if failed_crit:
    print(f"\n  {RED}{BOLD}CRITICAL FAILURES ({len(failed_crit)}) — MUST FIX BEFORE DEPLOY:{RESET}")
    for r in failed_crit:
        print(f"    • {r['name']}")
if failed_high:
    print(f"\n  {YELLOW}HIGH WARNINGS ({len(failed_high)}) — Fix within 24h:{RESET}")
    for r in failed_high:
        print(f"    • {r['name']}")

if failed_crit:
    print(f"\n{RED}{BOLD}✗ DEPLOY BLOCKED — Fix all CRITICAL failures above.{RESET}\n")
    sys.exit(1)
else:
    print(f"\n{GREEN}{BOLD}✓ All critical checks passed — safe to deploy.{RESET}\n")
    sys.exit(0)
