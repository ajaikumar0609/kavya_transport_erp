#!/usr/bin/env bash
# Aggregate security checks. Run before every deploy or in CI.
# Exit non-zero on any failure.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== [1/5] Secret scan ==="
python3 scripts/check_secrets.py

echo ""
echo "=== [2/5] Production config check (security_check.py) ==="
python3 scripts/security_check.py "${@:-}"

echo ""
echo "=== [3/5] Bandit (Python security linting) ==="
if ! command -v bandit >/dev/null 2>&1; then
  python3 -m pip install --quiet bandit
fi
bandit -r backend/app -ll -c bandit.yaml || {
  echo "Bandit reported medium/high severity issues."
  exit 1
}

echo ""
echo "=== [4/5] pip-audit (dependency CVEs) ==="
if ! command -v pip-audit >/dev/null 2>&1; then
  python3 -m pip install --quiet pip-audit
fi
pip-audit -r backend/requirements.txt --strict || {
  echo "pip-audit found vulnerable dependencies."
  exit 1
}

echo ""
echo "=== [5/5] npm audit (frontend) ==="
if [ -d frontend/node_modules ]; then
  (cd frontend && npm audit --audit-level=high)
else
  echo "Skipping npm audit (frontend/node_modules not installed)."
fi

echo ""
echo "All security checks passed."
