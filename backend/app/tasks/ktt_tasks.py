"""
KTT GPS Polling — Celery Task
==============================
Periodic task that polls the KT Telematic (KTT) Pull API
and ingests vehicle GPS positions into the tracking pipeline.

Registered in celery_app.py beat_schedule as 'poll-ktt-gps'.
Rate-limit: KTT enforces 1 req/min, so interval is 60 s.
"""

import asyncio
import logging

from app.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.tasks.ktt_tasks.poll_ktt_gps",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    soft_time_limit=30,
    time_limit=45,
)
def poll_ktt_gps(self):
    """
    Poll KTT API and ingest vehicle positions.

    Runs every KTT_POLL_INTERVAL_SECONDS (default 60 s).
    Silently skips if KTT is not enabled/configured.
    """
    if not settings.KTT_ENABLED:
        return {"status": "disabled"}

    if not settings.KTT_ACCESS_TOKEN:
        return {"status": "no_token"}

    try:
        from app.services.ktt_gps_service import poll_and_ingest

        result = asyncio.run(poll_and_ingest())

        return {"status": "ok", **result}

    except Exception as exc:
        logger.error("[KTT Task] Poll failed: %s", exc)
        raise self.retry(exc=exc)
