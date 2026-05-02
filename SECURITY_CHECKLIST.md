# Kavya Transports — Pre-Deploy Security Checklist

Run through this list before every production deployment. Tick each item;
if any cannot be ticked, do not deploy.

## Secrets & Config
- [ ] `.env` is NOT committed (`git status` shows it ignored)
- [ ] `python3 scripts/check_secrets.py` exits clean
- [ ] `SECRET_KEY` is 32+ chars (startup will refuse to boot otherwise)
- [ ] All API keys (MSG91, Brevo, AWS) are current — none expired/revoked
- [ ] Any key ever committed to git history has been **rotated** at the provider

## IDOR & Tenant Isolation
- [ ] Cross-tenant `GET /api/v1/drivers/{id}` returns **404** (not 403, not 200)
- [ ] Same for `PUT/DELETE /api/v1/drivers/{id}`
- [ ] Sub-resources also return 404 cross-tenant:
      `payment-info`, `licenses`, `trips`, `behaviour`, `documents`, `performance`, `attendance`
- [ ] Same coverage verified for `vehicles` and `clients`
- [ ] JWT with tampered `tenant_id` is rejected (signature check holds)

## Auth & Rate Limiting
- [ ] OTP send: max 3 / phone / 15 min (test: 4th call → 429)
- [ ] OTP send: max 10 / IP / 15 min across phones (defeats IP rotation)
- [ ] OTP verify: max 5 / session / 10 min
- [ ] Login: max 10 / 60 sec
- [ ] Stop Redis → call `/auth/send-otp` → returns **503** (fail-closed)
- [ ] Restart Redis → returns to normal

## File Uploads
- [ ] Renaming `evil.exe` to `evil.pdf` is rejected (magic-byte sniffing)
- [ ] File > 10 MB is rejected
- [ ] Uploaded files use UUID-based safe filenames in S3 / disk
- [ ] Original filename is sanitized before being stored as display metadata

## HTTP Security Headers
After running the API, `curl -I https://<host>/api/v1/health` shows ALL of:
- [ ] `x-content-type-options: nosniff`
- [ ] `x-frame-options: DENY`
- [ ] `content-security-policy: default-src 'none'; frame-ancestors 'none'`
- [ ] `referrer-policy: strict-origin-when-cross-origin`
- [ ] `permissions-policy: geolocation=(), microphone=(), camera=()`
- [ ] `strict-transport-security` (production only)
- [ ] No `server:` or `x-powered-by:` header in response

## CI Security Gates
- [ ] `bash scripts/security_check.sh --dev` passes locally
- [ ] No HIGH/CRITICAL CVEs reported by `pip-audit`
- [ ] No HIGH severity findings from `npm audit`
- [ ] No medium+ findings from `bandit`

## Flutter Release Build
- [ ] APK built with: `flutter build apk --release --obfuscate --split-debug-info=build/debug-info --split-per-abi`
- [ ] `build/debug-info/` archived securely (needed for stack symbolication)
- [ ] `build/debug-info/` is NOT in git (verify: `git check-ignore kavya_app/build/debug-info/`)
- [ ] Release build uses a real signing key, not the debug key
      (currently `kavya_app/android/app/build.gradle.kts` still has TODO for this)

## Monitoring (post-deploy)
- [ ] Logs are capturing OTP rate-limit hits (look for `[RateLimit]`)
- [ ] Failed login attempts are logged with IP
- [ ] 5xx error rate baseline is recorded — alert if it spikes
