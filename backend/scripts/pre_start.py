#!/usr/bin/env python3
"""
backend/scripts/pre_start.py
Pre-start validation script — runs before uvicorn starts.
Checks all required services are reachable and security config is valid.
Exits with code 1 if anything critical is wrong.
"""
import asyncio
import sys
import os
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("pre_start")

RETRY_COUNT = 5
RETRY_DELAY = 3  # seconds


# ──────────────────────────────────────────
# PostgreSQL
# ──────────────────────────────────────────
async def check_postgres() -> bool:
    try:
        import asyncpg
        from app.core.config import settings
        dsn = (
            f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
            f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        )
        conn = await asyncpg.connect(dsn=dsn, timeout=5)
        await conn.fetchval("SELECT 1")
        await conn.close()
        return True
    except Exception as e:
        log.warning(f"PostgreSQL check failed: {e}")
        return False


# ──────────────────────────────────────────
# Redis
# ──────────────────────────────────────────
async def check_redis() -> bool:
    try:
        import redis.asyncio as aioredis
        from app.core.config import settings
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
        await r.ping()
        await r.aclose()
        return True
    except Exception as e:
        log.warning(f"Redis check failed: {e}")
        return False


# ──────────────────────────────────────────
# MongoDB
# ──────────────────────────────────────────
async def check_mongo() -> bool:
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from app.core.config import settings
        client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=3000)
        await client.admin.command("ping")
        client.close()
        return True
    except Exception as e:
        log.warning(f"MongoDB check failed: {e}")
        return False


# ──────────────────────────────────────────
# Retry wrapper
# ──────────────────────────────────────────
async def retry_check(name: str, fn, required: bool = True) -> bool:
    for attempt in range(1, RETRY_COUNT + 1):
        ok = await fn()
        if ok:
            log.info(f"  ✅  {name} — connected")
            return True
        if attempt < RETRY_COUNT:
            log.info(f"  ⏳  {name} — attempt {attempt}/{RETRY_COUNT}, retrying in {RETRY_DELAY}s ...")
            await asyncio.sleep(RETRY_DELAY)
    level = log.error if required else log.warning
    level(f"  ❌  {name} — unreachable after {RETRY_COUNT} attempts")
    return False


# ──────────────────────────────────────────
# Security config validation
# ──────────────────────────────────────────
def check_security_config() -> bool:
    from app.core.config import settings
    failures = []

    env = settings.ENVIRONMENT
    if env == "production":
        if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 64:
            failures.append("SECRET_KEY too short (need ≥ 64 chars)")
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            failures.append("RAZORPAY_WEBHOOK_SECRET not set")
        if settings.DEBUG:
            failures.append("DEBUG=true in production")

    if failures:
        for f in failures:
            log.error(f"  🔴  Security: {f}")
        return False

    log.info("  ✅  Security config — OK")
    return True


# ──────────────────────────────────────────
# Main
# ──────────────────────────────────────────
async def main():
    # Add repo root to path so app.* imports work
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, repo_root)

    log.info("═" * 50)
    log.info(" Kavya Transports — Pre-start validation")
    log.info("═" * 50)

    security_ok = check_security_config()
    pg_ok = await retry_check("PostgreSQL", check_postgres, required=True)
    redis_ok = await retry_check("Redis", check_redis, required=True)
    mongo_ok = await retry_check("MongoDB", check_mongo, required=False)  # degraded OK

    log.info("─" * 50)

    if not (security_ok and pg_ok and redis_ok):
        log.error("❌  Startup failed — critical service(s) unavailable. Aborting.")
        sys.exit(1)

    if not mongo_ok:
        log.warning("⚠️   MongoDB unavailable — OTP and audit features degraded.")

    log.info("✅  All systems ready — starting uvicorn")


if __name__ == "__main__":
    asyncio.run(main())
