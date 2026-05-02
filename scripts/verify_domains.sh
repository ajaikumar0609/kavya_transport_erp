#!/usr/bin/env bash
# =============================================================================
# verify_domains.sh — Kavya Transports ERP
# Scans the codebase for localhost/dev URLs before production deploy.
#
# Usage:
#   bash scripts/verify_domains.sh
#
# Exit code:
#   0  — clean (or only warnings in .env.development / comments)
#   1  — localhost found in source code (blocks deploy)
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

BLOCKED=0

EXCLUDE_DIRS=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=__pycache__
  --exclude-dir=build
  --exclude-dir=dist
  --exclude-dir=.dart_tool
  --exclude-dir=.venv
  --exclude-dir=ios
)

SOURCE_TYPES=(
  --include="*.py"
  --include="*.ts"
  --include="*.tsx"
  --include="*.dart"
)

CONFIG_TYPES=(
  --include="*.yaml"
  --include="*.yml"
  --include="*.sh"
  --include="*.conf"
  --include="*.toml"
  --include="*.json"
)

echo ""
echo -e "${BOLD}${CYAN}Kavya Transports — Domain Verification${RESET}"
echo -e "${CYAN}Scanning: $PROJECT_ROOT${RESET}"
echo "=================================================="

# ── Helper ────────────────────────────────────────────────────────────────────
check_pattern() {
    local label="$1"
    local pattern="$2"
    local critical="$3"        # "true" = block deploy on match
    local warn_only_files="$4" # regex: files where match is a warning (not failure)
    local extra_include="${5:-}"  # optional extra --include arg

    local results
    if [ -n "$extra_include" ]; then
        results=$(grep -rn "$pattern" \
            "${SOURCE_TYPES[@]}" \
            "$extra_include" \
            "${EXCLUDE_DIRS[@]}" \
            . 2>/dev/null || true)
    else
        results=$(grep -rn "$pattern" \
            "${SOURCE_TYPES[@]}" \
            "${EXCLUDE_DIRS[@]}" \
            . 2>/dev/null || true)
    fi

    if [ -z "$results" ]; then
        echo -e "  ${GREEN}✅  CLEAN${RESET}  $label"
        return
    fi

    # Separate warn-only from blocking
    local blocking warn
    blocking=$(echo "$results" | grep -v "$warn_only_files" | grep -v "^Binary" || true)
    warn=$(echo "$results" | grep "$warn_only_files" | grep -v "^Binary" || true)

    if [ -n "$blocking" ] && [ "$critical" = "true" ]; then
        echo -e "  ${RED}❌  FOUND${RESET}   $label"
        echo "$blocking" | while IFS= read -r line; do
            echo -e "         ${RED}$line${RESET}"
        done
        BLOCKED=1
    elif [ -n "$blocking" ]; then
        echo -e "  ${YELLOW}⚠   FOUND${RESET}   $label (non-critical)"
        echo "$blocking" | while IFS= read -r line; do
            echo -e "         ${YELLOW}$line${RESET}"
        done
    fi

    if [ -n "$warn" ]; then
        echo -e "  ${YELLOW}⚠   WARN${RESET}    $label (in dev/test files — acceptable)"
        echo "$warn" | while IFS= read -r line; do
            echo -e "         ${YELLOW}$line${RESET}"
        done
    fi
}

echo ""
echo -e "${BOLD}━━━ Source Files (*.py *.ts *.tsx *.dart) ━━━${RESET}"

check_pattern \
    "localhost:3001 in source" \
    "localhost:3001" \
    "true" \
    "\.env\.development\|\.env\.dev\|test\|spec\|_test\."

check_pattern \
    "localhost:8000 in source" \
    "localhost:8000" \
    "true" \
    "\.env\.development\|\.env\.dev\|\.env$\|test\|spec\|_test\.\|load_test\|smoke_test\|import\.meta\.env\.DEV\|String\.fromEnvironment\|defaultValue\|VITE_PROXY_TARGET\| \* \|^[[:space:]]*/\|config\.py\|api_service\.dart\|websocket_service\.dart"

check_pattern \
    "127.0.0.1:8000 in source (not nginx proxy_pass)" \
    "127\.0\.0\.1:8000" \
    "true" \
    "nginx\|\.conf\|proxy_pass\|\.env\.development\|\.env$\|vite\.config\|VITE_PROXY_TARGET"

check_pattern \
    "10.0.2.2 (Android emulator) in Dart source" \
    "10\.0\.2\.2" \
    "true" \
    "_test\.\|test/\|String\.fromEnvironment\|defaultValue\|Platform\.isAndroid\|// " \
    "--include=*.dart"

echo ""
echo -e "${BOLD}━━━ Config / Env Files ━━━${RESET}"

# Check .env.production for localhost in API-facing vars (DB/Redis localhost is CORRECT)
ENV_PROD="./backend/.env.production"
if [ -f "$ENV_PROD" ]; then
    # These vars must NOT contain localhost in production
    API_FACING_VARS="CORS_ORIGINS\|FRONTEND_URL\|BACKEND_URL\|CALLBACK_URL\|REDIRECT_URL\|API_BASE_URL"
    PROD_VIOLATIONS=$(grep -n "$API_FACING_VARS" "$ENV_PROD" 2>/dev/null | grep -i "localhost\|127\.0\.0\.1" || true)
    PROD_COMMENTS=$(grep -n "# " "$ENV_PROD" 2>/dev/null | grep -i "localhost" || true)

    if [ -n "$PROD_VIOLATIONS" ]; then
        echo -e "  ${RED}❌  FOUND${RESET}   localhost in .env.production API URLs (CRITICAL)"
        echo "$PROD_VIOLATIONS" | while IFS= read -r line; do
            echo -e "         ${RED}$ENV_PROD:$line${RESET}"
        done
        BLOCKED=1
    else
        echo -e "  ${GREEN}✅  CLEAN${RESET}  .env.production API URLs use production domains"
        echo -e "  ${GREEN}✅  OK${RESET}     .env.production DB/Redis localhost (internal — correct)"
    fi
else
    echo -e "  ${YELLOW}⚠   WARN${RESET}    backend/.env.production not found — create from backend/.env.production template"
fi

# .env.development — localhost is expected here
DEV_ENV_COUNT=$(grep -rl "localhost\|127\.0\.0\.1\|10\.0\.2\.2" \
    --include="*.env*" --exclude-dir=.git . 2>/dev/null | grep -v "\.env\.production" | wc -l | tr -d ' ')
if [ "$DEV_ENV_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠   WARN${RESET}    localhost in .env/.env.development (acceptable — dev only)"
fi

# Nginx proxy_pass — 127.0.0.1:8000 is CORRECT in nginx configs (keep it)
NGINX_LOCAL=$(grep -rn "127\.0\.0\.1:8000" --include="*.conf" . 2>/dev/null || true)
if [ -n "$NGINX_LOCAL" ]; then
    echo -e "  ${GREEN}✅  OK${RESET}     Nginx proxy_pass 127.0.0.1:8000 (internal — correct)"
fi

echo ""
echo "=================================================="

if [ $BLOCKED -eq 1 ]; then
    echo -e "${RED}${BOLD}❌  DEPLOY BLOCKED — localhost URLs found in source files.${RESET}"
    echo -e "${RED}    Fix all red items above before deploying.${RESET}\n"
    exit 1
else
    echo -e "${GREEN}${BOLD}✅  All domain checks passed — safe to deploy.${RESET}\n"
    exit 0
fi
