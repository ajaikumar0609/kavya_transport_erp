# =============================================================================
# Makefile — Kavya Transports ERP
# Run from the project root.
#
# Usage:
#   make help          List all targets
#   make clean         Remove caches, build artifacts, temp files (interactive)
#   make check         Run security pre-deploy check (production mode)
#   make check-dev     Run security check in dev mode (skips ENVIRONMENT/DEBUG)
#   make dev           Start backend + frontend in development mode
#   make build         Build frontend for production
#   make deploy-check  Full pre-deploy gate: clean → security check
#   make test          Run backend unit tests
#   make lint          Run ruff + mypy on backend
# =============================================================================

.PHONY: help clean check check-dev dev build deploy-check test lint

PROJECT_ROOT := $(shell pwd)
BACKEND_DIR  := $(PROJECT_ROOT)/backend
FRONTEND_DIR := $(PROJECT_ROOT)/frontend
PYTHON       := $(PROJECT_ROOT)/.venv/bin/python3

# Default target
help:
	@echo ""
	@echo "  Kavya Transports ERP — Make targets"
	@echo ""
	@printf "  %-20s %s\n" "make clean"        "Remove __pycache__, .DS_Store, stray logs, build caches"
	@printf "  %-20s %s\n" "make check"        "Production security pre-deploy check (strict)"
	@printf "  %-20s %s\n" "make check-dev"    "Security check in dev mode (skips ENVIRONMENT/DEBUG)"
	@printf "  %-20s %s\n" "make dev"          "Start backend + frontend concurrently (requires concurrently)"
	@printf "  %-20s %s\n" "make build"        "Build frontend for production (npm run build)"
	@printf "  %-20s %s\n" "make deploy-check" "Full pre-deploy gate: clean → security check → domain verify"
	@printf "  %-20s %s\n" "make verify"       "Check for localhost URLs in source (verify_domains.sh)"
	@printf "  %-20s %s\n" "make test"         "Run backend unit tests (pytest)"
	@printf "  %-20s %s\n" "make lint"         "Lint backend with ruff + mypy"
	@echo ""

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	@bash $(PROJECT_ROOT)/scripts/safe_cleanup.sh

clean-dry:
	@bash $(PROJECT_ROOT)/scripts/safe_cleanup.sh --dry-run

# ── Security check ────────────────────────────────────────────────────────────
check:
	@$(PYTHON) $(PROJECT_ROOT)/scripts/security_check.py

check-dev:
	@$(PYTHON) $(PROJECT_ROOT)/scripts/security_check.py --dev

# ── Development ───────────────────────────────────────────────────────────────
dev:
	@echo "Starting backend and frontend..."
	@cd $(BACKEND_DIR) && $(PYTHON) -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	@cd $(FRONTEND_DIR) && npm run dev

# ── Build frontend ────────────────────────────────────────────────────────────
build:
	@echo "Building frontend..."
	@cd $(FRONTEND_DIR) && npm ci && npm run build
	@echo "Frontend build complete: frontend/dist/"

# ── Full deploy gate ──────────────────────────────────────────────────────────
# Runs clean (non-interactive, --yes) then strict security check.
# Exits non-zero if any CRITICAL security check fails.
deploy-check:
	@echo "=== Step 1/3: Clean ==="
	@bash $(PROJECT_ROOT)/scripts/safe_cleanup.sh --yes
	@echo ""
	@echo "=== Step 2/3: Security check ==="
	@$(PYTHON) $(PROJECT_ROOT)/scripts/security_check.py
	@echo ""
	@echo "=== Step 3/3: Domain verification ==="
	@bash $(PROJECT_ROOT)/scripts/verify_domains.sh

# ── Domain verification ───────────────────────────────────────────────────────
verify:
	@bash $(PROJECT_ROOT)/scripts/verify_domains.sh

# ── Backend tests ─────────────────────────────────────────────────────────────
test:
	@cd $(BACKEND_DIR) && $(PYTHON) -m pytest tests/ -v --tb=short

test-fast:
	@cd $(BACKEND_DIR) && $(PYTHON) -m pytest tests/ -x -q --tb=line

# ── Lint ──────────────────────────────────────────────────────────────────────
lint:
	@cd $(BACKEND_DIR) && $(PYTHON) -m ruff check app/ --fix
	@cd $(BACKEND_DIR) && $(PYTHON) -m mypy app/ --ignore-missing-imports || true
