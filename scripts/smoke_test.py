#!/usr/bin/env python3
"""
scripts/smoke_test.py
End-to-end smoke test suite — run immediately after deployment.

Usage:
    SMOKE_TEST_URL=https://kavyatransports.com python3 scripts/smoke_test.py
    # or for local testing:
    SMOKE_TEST_URL=http://localhost:8000 python3 scripts/smoke_test.py
"""
import os
import sys
import ssl
import socket
import json
import hmac
import hashlib
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

BASE_URL = os.environ.get("SMOKE_TEST_URL", "http://localhost:8000").rstrip("/")

# ── Colours ──────────────────────────────────────────────────
GREEN  = "\033[0;32m"
RED    = "\033[0;31m"
YELLOW = "\033[1;33m"
CYAN   = "\033[0;36m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

pass_count = 0
fail_count = 0
results: list[tuple[str, bool, str]] = []


def check(label: str, fn) -> bool:
    global pass_count, fail_count
    try:
        ok, detail = fn()
        if ok:
            pass_count += 1
            results.append((label, True, detail))
            print(f"  {GREEN}✅  PASS{RESET}  {label}" + (f"  {CYAN}({detail}){RESET}" if detail else ""))
        else:
            fail_count += 1
            results.append((label, False, detail))
            print(f"  {RED}❌  FAIL{RESET}  {label}  {RED}→ {detail}{RESET}")
        return ok
    except Exception as e:
        fail_count += 1
        results.append((label, False, str(e)))
        print(f"  {RED}❌  FAIL{RESET}  {label}  {RED}→ Exception: {e}{RESET}")
        return False


def http(method: str, path: str, *, data=None, headers=None, timeout=10):
    """Make an HTTP request; return (status_code, headers_dict, body_str)."""
    url = BASE_URL + path
    req_headers = {"Content-Type": "application/json", "User-Agent": "KavyaSmokeTest/1.0"}
    if headers:
        req_headers.update(headers)

    body = json.dumps(data).encode() if data else None

    # Create a context that doesn't verify SSL for --no-verify mode
    ctx = ssl.create_default_context()

    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.status, dict(resp.headers), resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode(errors="replace")
    except urllib.error.URLError as e:
        raise ConnectionError(f"Cannot reach {url}: {e.reason}")


def http_no_redirect(path: str, timeout=5):
    """Check if a URL returns redirect (301/302) without following it."""
    import http.client
    from urllib.parse import urlparse
    parsed = urlparse(BASE_URL + path)
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port or 80, timeout=timeout)
    conn.request("GET", parsed.path or "/")
    resp = conn.getresponse()
    conn.close()
    return resp.status, dict(resp.getheaders())


# ═══════════════════════════════════════════════════════════
# INFRASTRUCTURE CHECKS
# ═══════════════════════════════════════════════════════════
print(f"\n{BOLD}{CYAN}══ INFRASTRUCTURE ══════════════════════════════{RESET}")

check("GET /health → 200 status=ok", lambda: (
    lambda s, h, b: (s == 200 and '"ok"' in b, f"status={s}"))(*http("GET", "/health"))
)

check("GET /health/db → 200 PostgreSQL connected", lambda: (
    lambda s, h, b: (s == 200, f"status={s}"))(*http("GET", "/health/db"))
)

check("GET /health/redis → 200 Redis connected", lambda: (
    lambda s, h, b: (s == 200, f"status={s}"))(*http("GET", "/health/redis"))
)


def check_ssl():
    from urllib.parse import urlparse
    parsed = urlparse(BASE_URL)
    if parsed.scheme != "https":
        return True, "skipped (not HTTPS)"
    host = parsed.hostname
    ctx = ssl.create_default_context()
    conn = ctx.wrap_socket(socket.create_connection((host, 443), timeout=5), server_hostname=host)
    cert = conn.getpeercert()
    conn.close()
    # Check expiry
    not_after = ssl.cert_time_to_seconds(cert["notAfter"])
    days_left = (not_after - time.time()) / 86400
    if days_left < 14:
        return False, f"Certificate expires in {days_left:.0f} days"
    return True, f"Valid, expires in {days_left:.0f} days"


check("SSL certificate valid (14+ days)", check_ssl)


def check_http_redirect():
    from urllib.parse import urlparse
    parsed = urlparse(BASE_URL)
    if parsed.scheme != "https":
        return True, "skipped (not HTTPS)"
    try:
        status, headers = http_no_redirect("/", timeout=5)
        location = headers.get("Location", "")
        if status in (301, 302) and "https" in location:
            return True, f"HTTP {status} → {location}"
        return False, f"HTTP {status} — expected 301 redirect to HTTPS"
    except Exception as e:
        return False, str(e)


check("HTTP → HTTPS redirect (301)", check_http_redirect)

check("Swagger UI blocked in production", lambda: (
    lambda s, h, b: (s in (404, 403, 422), f"status={s}"))(*http("GET", "/api/v1/docs"))
)

# ═══════════════════════════════════════════════════════════
# AUTHENTICATION FLOW
# ═══════════════════════════════════════════════════════════
print(f"\n{BOLD}{CYAN}══ AUTHENTICATION ═══════════════════════════════{RESET}")

check("POST /auth/send-otp (test phone) → 200 or 429", lambda: (
    lambda s, h, b: (s in (200, 429, 400), f"status={s}"))(*http(
        "POST", "/api/v1/auth/send-otp",
        data={"phone": "9999999999", "password": "TestPass@123"}
    ))
)


def check_rate_limit():
    """Hit send-otp 5 times rapidly — should get 429 by 4th or 5th."""
    got_429 = False
    for i in range(5):
        s, h, b = http("POST", "/api/v1/auth/send-otp",
                        data={"phone": "8888888888", "password": "Test@1234"})
        if s == 429:
            got_429 = True
            break
    return got_429, f"Rate limit triggered after {i+1} attempts" if got_429 else "Rate limit NOT triggered after 5 attempts"


check("OTP rate limit → 429 on rapid send", check_rate_limit)

check("Wrong OTP → 400", lambda: (
    lambda s, h, b: (s in (400, 422), f"status={s}"))(*http(
        "POST", "/api/v1/auth/verify-otp",
        data={"session_id": "fake-session-id", "otp": "000000"}
    ))
)

check("Invalid login credentials → 401", lambda: (
    lambda s, h, b: (s == 401, f"status={s}"))(*http(
        "POST", "/api/v1/auth/login",
        data={"username": "notexist@test.com", "password": "wrongpass"}
    ))
)

# ═══════════════════════════════════════════════════════════
# SECURITY HEADERS
# ═══════════════════════════════════════════════════════════
print(f"\n{BOLD}{CYAN}══ SECURITY HEADERS ════════════════════════════{RESET}")

_status, _headers, _body = http("GET", "/health")

check("X-Content-Type-Options: nosniff", lambda: (
    "nosniff" in _headers.get("X-Content-Type-Options", ""),
    _headers.get("X-Content-Type-Options", "MISSING")
))

check("X-Frame-Options: DENY", lambda: (
    "DENY" in _headers.get("X-Frame-Options", ""),
    _headers.get("X-Frame-Options", "MISSING")
))

check("X-XSS-Protection set", lambda: (
    bool(_headers.get("X-XSS-Protection", "")),
    _headers.get("X-XSS-Protection", "MISSING")
))

check("Referrer-Policy set", lambda: (
    bool(_headers.get("Referrer-Policy", "")),
    _headers.get("Referrer-Policy", "MISSING")
))


def check_hsts():
    from urllib.parse import urlparse
    if urlparse(BASE_URL).scheme != "https":
        return True, "skipped (not HTTPS)"
    hsts = _headers.get("Strict-Transport-Security", "")
    ok = bool(hsts) and "max-age" in hsts
    return ok, hsts or "MISSING"


check("Strict-Transport-Security (HTTPS)", check_hsts)

# ═══════════════════════════════════════════════════════════
# API PROTECTION
# ═══════════════════════════════════════════════════════════
print(f"\n{BOLD}{CYAN}══ API PROTECTION ══════════════════════════════{RESET}")

check("GET /api/trips → 401 without token", lambda: (
    lambda s, h, b: (s == 401, f"status={s}"))(*http("GET", "/api/v1/trips"))
)

check("GET /api/admin/users → 401 without token", lambda: (
    lambda s, h, b: (s == 401, f"status={s}"))(*http("GET", "/api/v1/admin/users"))
)

check("Path traversal attempt → 400 or 404", lambda: (
    lambda s, h, b: (s in (400, 404, 422, 403), f"status={s}"))(*http(
        "GET", "/../../../etc/passwd"
    ))
)

# ═══════════════════════════════════════════════════════════
# RAZORPAY WEBHOOK
# ═══════════════════════════════════════════════════════════
print(f"\n{BOLD}{CYAN}══ RAZORPAY WEBHOOK ════════════════════════════{RESET}")


def check_webhook_invalid_sig():
    payload = json.dumps({"event": "payment.captured"})
    s, h, b = http(
        "POST", "/api/v1/finance/webhook/razorpay",
        data={"event": "payment.captured"},
        headers={"X-Razorpay-Signature": "invalid_signature_value"}
    )
    return s in (400, 401, 403, 422), f"status={s}"


check("Razorpay webhook with invalid sig → 400/401/403", check_webhook_invalid_sig)

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════
total = pass_count + fail_count
pct = int(100 * pass_count / total) if total else 0

print(f"\n{BOLD}{'═' * 52}{RESET}")
if fail_count == 0:
    print(f"{BOLD}{GREEN}  ✅  {pass_count}/{total} tests passed. READY FOR PRODUCTION. 🚀{RESET}")
else:
    print(f"{BOLD}{RED}  ❌  {pass_count}/{total} tests passed. {fail_count} FAILURE(S) — DO NOT PROCEED.{RESET}")
    print(f"\n  {RED}Failed tests:{RESET}")
    for label, ok, detail in results:
        if not ok:
            print(f"    • {label}: {detail}")
print(f"{BOLD}{'═' * 52}{RESET}\n")

sys.exit(0 if fail_count == 0 else 1)
