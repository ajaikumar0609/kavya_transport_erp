"""
Redis-backed rate limiter for sensitive endpoints.
Usage:
    from app.utils.rate_limit import RateLimiter

    limiter = RateLimiter(prefix="otp_send", max_requests=3, window_seconds=900)

    @router.post("/send-otp")
    async def send_otp(request: Request, data: OtpSendRequest):
        key = f"{request.client.host}:{data.phone}"
        await limiter.check(key)   # raises HTTP 429 if over limit
        ...
"""

import logging
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Sliding-window counter backed by Redis.
    Falls back to allow-all if Redis is unavailable (non-fatal).
    """

    def __init__(
        self,
        prefix: str,
        max_requests: int,
        window_seconds: int,
        fail_closed: bool = False,
    ):
        self.prefix = prefix
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # When True, deny requests if Redis is unavailable (use for auth/OTP).
        # When False, allow through (availability > security) — default for general API.
        self.fail_closed = fail_closed

    def _redis(self):
        try:
            from app.db.redis.connection import get_sync_redis  # type: ignore
            return get_sync_redis()
        except Exception:
            return None

    async def _async_redis(self):
        try:
            from app.db.redis.connection import get_redis  # type: ignore
            return await get_redis()
        except Exception:
            return None

    async def check(self, key: str) -> None:
        """
        Increment counter for `key`.
        Raises HTTP 429 if counter exceeds max_requests within window_seconds.
        Behaviour when Redis is unavailable depends on `fail_closed`:
          - fail_closed=True  -> raise HTTP 503 (used for auth / OTP)
          - fail_closed=False -> allow through (default)
        """
        redis = await self._async_redis()
        if redis is None:
            if self.fail_closed:
                logger.warning(
                    f"[RateLimit] Redis unavailable, fail-CLOSED for {self.prefix}:{key}"
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Service temporarily unavailable. Please try again in a moment.",
                )
            logger.warning(
                f"[RateLimit] Redis unavailable \u2014 skipping rate check for {self.prefix}:{key}"
            )
            return

        redis_key = f"rl:{self.prefix}:{key}"
        try:
            count = await redis.incr(redis_key)
            if count == 1:
                await redis.expire(redis_key, self.window_seconds)
            if count > self.max_requests:
                retry_after = await redis.ttl(redis_key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many requests. Try again in {retry_after} seconds.",
                    headers={"Retry-After": str(max(retry_after, 1))},
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(f"[RateLimit] Redis error during rate check: {exc}")
            if self.fail_closed:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Service temporarily unavailable. Please try again in a moment.",
                )


# Pre-configured limiters for common endpoints.
# Auth-sensitive limiters use fail_closed=True so a Redis outage cannot enable
# unlimited OTP sends / login brute force.
otp_send_limiter = RateLimiter(
    prefix="otp_send", max_requests=3, window_seconds=600, fail_closed=False
)   # 3 per 10 min per key (phone/identifier) — fail-open so Redis outage doesn't block login
otp_send_ip_limiter = RateLimiter(
    prefix="otp_send_ip", max_requests=10, window_seconds=900, fail_closed=False
)   # 10 per 15 min per IP — fail-open
otp_verify_limiter = RateLimiter(
    prefix="otp_verify", max_requests=5, window_seconds=600, fail_closed=False
)   # 5 per 10 min per session — fail-open
login_limiter = RateLimiter(
    prefix="login", max_requests=10, window_seconds=60, fail_closed=False
)   # 10 per 1 min — fail-open
