"""Backfill pod_uploaded=True on LRs linked to market trips that already have POD uploaded."""
import asyncio, sys
sys.path.insert(0, '.')
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models.postgres.market_trip import MarketTrip
from app.models.postgres.lr import LR

async def fix():
    engine = create_async_engine(settings.POSTGRES_URL)
    async with AsyncSession(engine) as db:
        res = await db.execute(select(MarketTrip).where(MarketTrip.pod_uploaded == True))
        trips = res.scalars().all()
        print(f"Found {len(trips)} market trips with POD uploaded")
        for t in trips:
            if t.job_id:
                lr_res = await db.execute(select(LR).where(LR.job_id == t.job_id))
                for lr in lr_res.scalars().all():
                    if not lr.pod_uploaded:
                        lr.pod_uploaded = True
                        if not lr.pod_file_url:
                            lr.pod_file_url = t.pod_file_url
                        print(f"  Fixed LR {lr.id} for job {t.job_id}")
        await db.commit()
        print("Done")

asyncio.run(fix())
