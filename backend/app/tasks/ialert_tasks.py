"""
iALERT GPS Polling — Celery Task
=================================
Periodic task that polls the Ashok Leyland iALERT DaaS API
and ingests vehicle GPS positions into the tracking pipeline.

Registered in celery_app.py beat_schedule as 'poll-ialert-gps'.
"""

import asyncio
import logging

from app.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.tasks.ialert_tasks.poll_ialert_gps",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    soft_time_limit=30,
    time_limit=45,
)
def poll_ialert_gps(self):
    """
    Poll iALERT API and ingest vehicle positions.

    Runs every IALERT_POLL_INTERVAL_SECONDS (default 60s).
    Silently skips if iALERT is not enabled/configured.
    """
    if not settings.IALERT_ENABLED:
        return {"status": "disabled"}

    if not settings.IALERT_API_TOKEN:
        return {"status": "no_token"}

    try:
        from app.services.ialert_gps_service import poll_and_ingest

        result = asyncio.run(poll_and_ingest())

        return {"status": "ok", **result}

    except Exception as exc:
        logger.error("[iALERT Task] Poll failed: %s", exc)
        raise self.retry(exc=exc)
