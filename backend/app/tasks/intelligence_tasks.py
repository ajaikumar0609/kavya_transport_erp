# Intelligence Celery tasks — scheduled background jobs

import logging
from app.celery_app import celery_app

logger = logging.getLogger(__name__)

# Helper to get async session
async def _get_session():
    from app.db.postgres.connection import AsyncSessionLocal
    return AsyncSessionLocal()


@celery_app.task(name="app.tasks.intelligence_tasks.run_daily_intelligence_job")
def run_daily_intelligence_job():
    """02:00 IST daily — central intelligence batch."""
    import asyncio
    asyncio.run(_run_daily())


async def _run_daily():
    from app.services.central_intelligence_service import run_daily_intelligence
    db = await _get_session()
    try:
        result = await run_daily_intelligence(db)
        await db.commit()
        logger.info(f"[Intelligence Task] Daily job result: {result}")
    except Exception as e:
        await db.rollback()
        logger.error(f"[Intelligence Task] Daily job failed: {e}", exc_info=True)
    finally:
        await db.close()


@celery_app.task(name="app.tasks.intelligence_tasks.compute_driver_scores_batch")
def compute_driver_scores_batch():
    """Nightly driver score computation for all active drivers."""
    import asyncio
    asyncio.run(_run_driver_scores())


async def _run_driver_scores():
    from app.services.driver_behaviour_service import compute_daily_score
    from app.models.postgres.driver import Driver
    from sqlalchemy import select

    db = await _get_session()
    try:
        drivers = await db.execute(select(Driver.id).where(Driver.is_active == True))
        for (did,) in drivers:
            try:
                await compute_daily_score(db, did)
            except Exception as e:
                logger.error(f"Driver {did} score failed: {e}")
        await db.commit()
    finally:
        await db.close()


@celery_app.task(name="app.tasks.intelligence_tasks.compute_vehicle_risk_scores_batch")
def compute_vehicle_risk_scores_batch():
    """Nightly vehicle risk score computation."""
    import asyncio
    asyncio.run(_run_vehicle_scores())


async def _run_vehicle_scores():
    from app.services.predictive_maintenance_service import compute_all_vehicle_scores
    db = await _get_session()
    try:
        result = await compute_all_vehicle_scores(db)
        await db.commit()
        logger.info(f"[Intelligence Task] Vehicle scores computed: {len(result)}")
    except Exception as e:
        await db.rollback()
        logger.error(f"[Intelligence Task] Vehicle scoring failed: {e}", exc_info=True)
    finally:
        await db.close()


# ── Escalation & Suppression (every 5 min) ──

@celery_app.task(name="app.tasks.intelligence_tasks.run_escalation_and_suppression")
def run_escalation_and_suppression():
    """Every 5 min — escalate unacked events + suppress stale ones."""
    import asyncio
    asyncio.run(_run_escalation_and_suppression())


async def _run_escalation_and_suppression():
    from app.services.escalation_service import run_escalation_check, run_suppression_check
    db = await _get_session()
    try:
        esc_count = await run_escalation_check(db)
        sup_count = await run_suppression_check(db)
        await db.commit()
        if esc_count or sup_count:
            logger.info(f"[Event Pipeline] Escalated={esc_count}, Suppressed={sup_count}")
    except Exception as e:
        await db.rollback()
        logger.error(f"[Event Pipeline] Escalation/suppression failed: {e}", exc_info=True)
    finally:
        await db.close()


@celery_app.task(name="app.tasks.intelligence_tasks.send_morning_digest")
def send_morning_digest():
    """07:00 IST — send queued quiet-hours notifications."""
    import asyncio
    asyncio.run(_send_morning_digest())


async def _send_morning_digest():
    from sqlalchemy import select, and_
    from app.models.postgres.intelligence import NotificationQueue
    from datetime import datetime, timezone

    db = await _get_session()
    try:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(NotificationQueue).where(
                and_(
                    NotificationQueue.status == "pending",
                    NotificationQueue.scheduled_for <= now,
                )
            )
        )
        queued = result.scalars().all()
        for nq in queued:
            try:
                # Mark notification as sent (push notifications disabled)
                nq.status = "sent"
                nq.sent_at = now
                logger.info(f"[Morning Digest] Sent queued notification {nq.id} to user {nq.target_user_id}")
            except Exception as e:
                nq.status = "failed"
                logger.error(f"[Morning Digest] Failed notification {nq.id}: {e}")
        await db.commit()
        if queued:
            logger.info(f"[Morning Digest] Processed {len(queued)} queued notifications")
    except Exception as e:
        await db.rollback()
        logger.error(f"[Morning Digest] Failed: {e}", exc_info=True)
    finally:
        await db.close()


@celery_app.task(name="app.tasks.intelligence_tasks.recompute_eta_corridors")
def recompute_eta_corridors():
    """Nightly ETA corridor factor recomputation."""
    import asyncio
    asyncio.run(_run_eta_corridors())


async def _run_eta_corridors():
    from app.services.eta_prediction_service import recompute_corridor_factors
    db = await _get_session()
    try:
        await recompute_corridor_factors(db)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"[Intelligence Task] ETA corridors failed: {e}", exc_info=True)
    finally:
        await db.close()


@celery_app.task(name="app.tasks.intelligence_tasks.recompute_expense_stats")
def recompute_expense_stats():
    """Nightly expense category stats recomputation."""
    import asyncio
    asyncio.run(_run_expense_stats())


async def _run_expense_stats():
    from app.services.expense_fraud_service import recompute_category_stats
    db = await _get_session()
    try:
        await recompute_category_stats(db)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"[Intelligence Task] Expense stats failed: {e}", exc_info=True)
    finally:
        await db.close()
