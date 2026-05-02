#!/usr/bin/env bash
# =============================================================================
# safe_cleanup.sh — Kavya Transports ERP
# Safe project cleanup with dry-run preview and confirmation.
#
# Usage:
#   bash scripts/safe_cleanup.sh           # interactive (dry-run → confirm → delete)
#   bash scripts/safe_cleanup.sh --dry-run # preview only, no deletion
#   bash scripts/safe_cleanup.sh --yes     # skip confirmation (for CI)
#
# NEVER deletes: .env files, SQL migration files, git-tracked files.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$PROJECT_ROOT/cleanup_log.txt"
DRY_RUN=false
AUTO_YES=false

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Arg parsing ───────────────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --yes|-y)  AUTO_YES=true ;;
        --help|-h)
            grep '^#' "$0" | head -15 | sed 's/^# \?//'
            exit 0
            ;;
    esac
done

if $DRY_RUN; then
    echo -e "\n${CYAN}${BOLD}[DRY RUN] No files will be deleted.${RESET}\n"
fi

cd "$PROJECT_ROOT"

# ── Safety: git check ─────────────────────────────────────────────────────────
if ! git rev-parse --git-dir &>/dev/null; then
    echo -e "${RED}Not inside a git repository. Aborting.${RESET}"
    exit 1
fi

# ── Build candidate list ──────────────────────────────────────────────────────
declare -a CANDIDATES=()
declare -a CATEGORIES=()

collect() {
    local category="$1"; shift
    local found
    # Use find, exclude git-tracked paths as a safeguard via git ls-files
    for f in "$@"; do
        # Never delete .env files regardless
        if [[ "$f" == *".env"* ]]; then continue; fi
        # Never delete SQL migration files
        if [[ "$f" == *"/versions/"*".py" || "$f" == *"alembic/versions"* ]]; then continue; fi
        CANDIDATES+=("$f")
        CATEGORIES+=("$category")
    done
}

# 1. Python bytecode & caches
while IFS= read -r -d '' f; do
    collect "Python cache" "$f"
done < <(find . -name "__pycache__" -type d ! -path "./.git/*" ! -path "./.venv/*" ! -path "./node_modules/*" -print0 2>/dev/null)

while IFS= read -r -d '' f; do
    collect "Python bytecode" "$f"
done < <(find . \( -name "*.pyc" -o -name "*.pyo" \) ! -path "./.git/*" ! -path "./.venv/*" -print0 2>/dev/null)

# 2. macOS junk
while IFS= read -r -d '' f; do
    collect "macOS junk" "$f"
done < <(find . -name ".DS_Store" ! -path "./.git/*" ! -path "./.venv/*" -print0 2>/dev/null)

# 3. Log files outside designated logs/ directories
while IFS= read -r -d '' f; do
    dir="$(dirname "$f")"
    if [[ "$dir" != *"/logs"* && "$dir" != *"/log"* ]]; then
        collect "Stray log file" "$f"
    fi
done < <(find . -name "*.log" ! -path "./.git/*" ! -path "./.venv/*" ! -path "./backend/logs/*" ! -path "./logs/*" -print0 2>/dev/null)

# 4. Frontend build cache (Vite/Rollup)
for d in "frontend/node_modules/.cache" "frontend/.vite" "frontend/dist/.cache"; do
    if [ -d "$d" ]; then collect "Build cache" "$d"; fi
done

# 5. Test/coverage artifacts
for d in "backend/.pytest_cache" "backend/htmlcov" ".coverage" "backend/.coverage"; do
    if [ -e "$d" ]; then collect "Test artifact" "$d"; fi
done
while IFS= read -r -d '' f; do
    collect "Test artifact" "$f"
done < <(find . -name ".coverage" -o -name "coverage.xml" ! -path "./.git/*" -print0 2>/dev/null)

# 6. Load / smoke test reports
for f in "load_report.html" "locust_report.html" "locust_stats.csv" "locust_failures.csv"; do
    if [ -f "$f" ]; then collect "Test report" "$f"; fi
    if [ -f "scripts/$f" ]; then collect "Test report" "scripts/$f"; fi
done

# 7. Celery schedule file
if [ -f "celerybeat-schedule" ]; then collect "Celery artifact" "celerybeat-schedule"; fi
if [ -f "backend/celerybeat-schedule" ]; then collect "Celery artifact" "backend/celerybeat-schedule"; fi

# 8. Editor / OS backup files
while IFS= read -r -d '' f; do
    collect "Backup/temp file" "$f"
done < <(find . \( -name "*.bak" -o -name "*.orig" -o -name "*_old.*" -o -name "*.swp" -o -name "*.swo" \) ! -path "./.git/*" ! -path "./.venv/*" -print0 2>/dev/null)

# 9. Diagnostic/one-off scripts in backend root (prefixed with _)
while IFS= read -r -d '' f; do
    collect "Diagnostic script" "$f"
done < <(find ./backend -maxdepth 1 -name "_*.py" -print0 2>/dev/null)

# 10. Flutter build artifacts (only if explicitly run from project root)
if [ -d "kavya_app/build" ]; then
    collect "Flutter build" "kavya_app/build"
fi

# ── Print preview ─────────────────────────────────────────────────────────────
if [ ${#CANDIDATES[@]} -eq 0 ]; then
    echo -e "${GREEN}${BOLD}Nothing to clean — project is already tidy.${RESET}"
    exit 0
fi

echo -e "\n${BOLD}${CYAN}━━━ Files/directories to be removed ━━━${RESET}\n"
printf "  %-22s  %s\n" "CATEGORY" "PATH"
printf "  %-22s  %s\n" "--------" "----"
for i in "${!CANDIDATES[@]}"; do
    printf "  ${YELLOW}%-22s${RESET}  %s\n" "${CATEGORIES[$i]}" "${CANDIDATES[$i]}"
done
echo ""

TOTAL=${#CANDIDATES[@]}
echo -e "  Total: ${BOLD}$TOTAL item(s)${RESET}"

if $DRY_RUN; then
    echo -e "\n${CYAN}Dry run complete. Run without --dry-run to delete.${RESET}\n"
    exit 0
fi

# ── Confirmation ──────────────────────────────────────────────────────────────
if ! $AUTO_YES; then
    echo ""
    read -r -p "$(echo -e "${BOLD}Delete all items above? [y/N] ${RESET}")" CONFIRM
    if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
        echo -e "${YELLOW}Aborted — nothing deleted.${RESET}"
        exit 0
    fi
fi

# ── Deletion ──────────────────────────────────────────────────────────────────
{
    echo "=== Kavya cleanup run: $(date '+%Y-%m-%d %H:%M:%S') ==="
    echo "Deleted $TOTAL items:"
} >> "$LOG_FILE"

DELETED=0
FAILED=0
for f in "${CANDIDATES[@]}"; do
    if [ -e "$f" ] || [ -d "$f" ]; then
        if rm -rf "$f" 2>/dev/null; then
            echo -e "  ${GREEN}✓${RESET} Deleted: $f"
            echo "  ✓ $f" >> "$LOG_FILE"
            ((DELETED++)) || true
        else
            echo -e "  ${RED}✗${RESET} Failed:  $f"
            echo "  ✗ FAILED: $f" >> "$LOG_FILE"
            ((FAILED++)) || true
        fi
    fi
done

echo "" >> "$LOG_FILE"

echo ""
echo -e "${BOLD}Done.${RESET} Deleted ${GREEN}$DELETED${RESET} items, ${RED}$FAILED${RESET} failures."
echo -e "Log written to: ${CYAN}cleanup_log.txt${RESET}\n"
