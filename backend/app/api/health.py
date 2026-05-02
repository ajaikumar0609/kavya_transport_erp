"""
app/api/health.py
Health check endpoints — no authentication required.
Used by load balancers, UptimeRobot, smoke tests, and pre-deploy validation.

Detailed endpoints (/health/db, /health/redis, etc.) are restricted to
requests originating from localhost or RFC-1918 private IP ranges so that
internal infrastructure state is not exposed to the public internet.
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from datetime import datetime, timezone
import time
import logging

log = logging.getLogger(__name__)
router = APIRouter()

_PRIVATE_PREFIXES = (
    "127.", "::1", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
    "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
    "192.168.",
)


def _require_internal(request: Request) -> None:
    """Raise 403 unless the caller is from localhost / private network."""
    # X-Forwarded-For is set by the AWS ALB / nginx reverse proxy
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = (forwarded.split(",")[0].strip() if forwarded else None) or (
        request.client.host if request.client else "unknown"
    )
    if not any(client_ip.startswith(p) for p in _PRIVATE_PREFIXES):
        raise HTTPException(status_code=403, detail="Restricted to internal networks")


async def _check_postgres() -> dict:
    t0 = time.monotonic()
    try:
        from app.db.postgres.connection import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        ms = round((time.monotonic() - t0) * 1000)
        return {"status": "ok", "response_ms": ms}
    except Exception as e:
        return {"status": "down", "error": str(e)[:120]}


async def _check_redis() -> dict:
    t0 = time.monotonic()
    try:
        import redis.asyncio as aioredis
        from app.core.config import settings
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
        await r.ping()
        await r.aclose()
        ms = round((time.monotonic() - t0) * 1000)
        return {"status": "ok", "response_ms": ms}
    except Exception as e:
        return {"status": "down", "error": str(e)[:120]}


async def _check_mongo() -> dict:
    t0 = time.monotonic()
    try:
        from app.db.mongodb.connection import MongoDB
        db = MongoDB.get_db()
        await db.command("ping")
        ms = round((time.monotonic() - t0) * 1000)
        return {"status": "ok", "response_ms": ms}
    except Exception as e:
        return {"status": "degraded", "error": str(e)[:120]}


async def _check_celery() -> dict:
    t0 = time.monotonic()
    try:
        from app.celery_app import celery_app
        inspector = celery_app.control.inspect(timeout=5)
        active = inspector.active()
        ms = round((time.monotonic() - t0) * 1000)
        if active is None:
            return {"status": "degraded", "error": "No workers responded", "response_ms": ms}
        worker_count = len(active)
        return {"status": "ok", "workers": worker_count, "response_ms": ms}
    except Exception as e:
        return {"status": "down", "error": str(e)[:120]}


# ── Liveness probe ──────────────────────────────────────────────
@router.get("/health", tags=["Health"], include_in_schema=False)
async def health_liveness():
    """Basic liveness — returns 200 if the app process is running."""
    return {
        "status": "ok",
        "service": "kavya-transports-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── PostgreSQL check ───────────────────────────────────────────
@router.get("/health/db", tags=["Health"], include_in_schema=False)
async def health_db(request: Request):
    _require_internal(request)
    result = await _check_postgres()
    status_code = 200 if result["status"] == "ok" else 503
    return JSONResponse(content=result, status_code=status_code)


# ── Redis check ────────────────────────────────────────────────
@router.get("/health/redis", tags=["Health"], include_in_schema=False)
async def health_redis(request: Request):
    _require_internal(request)
    result = await _check_redis()
    status_code = 200 if result["status"] == "ok" else 503
    return JSONResponse(content=result, status_code=status_code)


# ── Celery check ───────────────────────────────────────────────
@router.get("/health/celery", tags=["Health"], include_in_schema=False)
async def health_celery(request: Request):
    _require_internal(request)
    result = await _check_celery()
    status_code = 200 if result["status"] == "ok" else 503
    return JSONResponse(content=result, status_code=status_code)


# ── Full readiness probe ────────────────────────────────────────
@router.get("/health/full", tags=["Health"], include_in_schema=False)
async def health_full(request: Request):
    _require_internal(request)
    import asyncio
    pg, redis, mongo, celery = await asyncio.gather(
        _check_postgres(),
        _check_redis(),
        _check_mongo(),
        _check_celery(),
    )

    checks = {
        "postgres": pg,
        "redis": redis,
        "mongodb": mongo,
        "celery": celery,
    }

    # Critical: postgres + redis must be ok
    critical_ok = pg["status"] == "ok" and redis["status"] == "ok"
    any_down = any(v["status"] == "down" for v in checks.values())

    if not critical_ok:
        overall = "down"
        status_code = 503
    elif any_down:
        overall = "degraded"
        status_code = 200  # degraded is still OK for load balancer
    else:
        overall = "ok"
        status_code = 200

    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={
            "status": overall,
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        status_code=status_code,
    )
