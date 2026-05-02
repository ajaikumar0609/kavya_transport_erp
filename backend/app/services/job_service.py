# Job Service - CRUD + Status workflow
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from datetime import datetime

from app.models.postgres.job import Job, JobStatus, JobStatusEnum, ContractType, JobPriority
from app.models.postgres.client import Client
from app.utils.generators import generate_job_number


VALID_STATUS_TRANSITIONS = {
    "draft": ["pending_approval", "cancelled"],
    "pending_approval": ["approved", "draft", "cancelled"],
    "approved": ["in_progress", "cancelled", "on_hold"],
    "in_progress": ["completed", "on_hold", "cancelled"],
    "on_hold": ["in_progress", "cancelled"],
    "completed": [],
    "cancelled": ["draft"],
}


def _coerce_enum(enum_cls, raw_value):
    if raw_value is None:
        return None
    if isinstance(raw_value, enum_cls):
        return raw_value

    text = str(raw_value).strip()
    if not text:
        return None

    for member in enum_cls:
        if text.lower() == str(member.value).lower() or text.upper() == member.name.upper():
            return member

    return raw_value


async def list_jobs(db: AsyncSession, page: int = 1, limit: int = 20, search: str = None, status: str = None, client_id: int = None):
    query = select(Job).where(Job.is_deleted == False)
    count_query = select(func.count(Job.id)).where(Job.is_deleted == False)

    if search:
        sf = or_(
            Job.job_number.ilike(f"%{search}%"),
            Job.origin_city.ilike(f"%{search}%"),
            Job.destination_city.ilike(f"%{search}%"),
            Job.material_type.ilike(f"%{search}%"),
        )
        query = query.where(sf)
        count_query = count_query.where(sf)

    if status:
        normalized_status = _coerce_enum(JobStatusEnum, status)
        query = query.where(Job.status == normalized_status)
        count_query = count_query.where(Job.status == normalized_status)

    if client_id:
        query = query.where(Job.client_id == client_id)
        count_query = count_query.where(Job.client_id == client_id)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Job.id.desc()))
    jobs = result.scalars().all()
    return jobs, total


async def get_job(db: AsyncSession, job_id: int):
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.is_deleted == False)
    )
    return result.scalar_one_or_none()


async def create_job(db: AsyncSession, data: dict, user_id: int = None) -> Job:
    data = dict(data)
    data["job_number"] = generate_job_number()
    data["created_by"] = user_id
    data["contract_type"] = _coerce_enum(ContractType, data.get("contract_type", "spot"))
    data["priority"] = _coerce_enum(JobPriority, data.get("priority", "normal"))
    data["status"] = _coerce_enum(JobStatusEnum, data.get("status", "draft"))

    # Calculate total
    rate = float(data.get("agreed_rate") or 0)
    loading = float(data.get("loading_charges") or 0)
    unloading = float(data.get("unloading_charges") or 0)
    other = float(data.get("other_charges") or 0)
    data["total_amount"] = rate + loading + unloading + other

    job = Job(**data)
    db.add(job)
    await db.flush()

    # Status history
    history = JobStatus(
        job_id=job.id, from_status=None, to_status="draft", changed_by=user_id, remarks="Job created"
    )
    db.add(history)
    await db.flush()
    return job


async def update_job(db: AsyncSession, job_id: int, data: dict):
    job = await get_job(db, job_id)
    if not job:
        return None

    data = dict(data)
    if "status" in data:
        data["status"] = _coerce_enum(JobStatusEnum, data.get("status"))
    if "contract_type" in data:
        data["contract_type"] = _coerce_enum(ContractType, data.get("contract_type"))
    if "priority" in data:
        data["priority"] = _coerce_enum(JobPriority, data.get("priority"))

    for k, v in data.items():
        if v is not None:
            setattr(job, k, v)
    # Recalculate total
    rate = float(job.agreed_rate or 0)
    loading = float(job.loading_charges or 0)
    unloading = float(job.unloading_charges or 0)
    other = float(job.other_charges or 0)
    job.total_amount = rate + loading + unloading + other
    return job


async def delete_job(db: AsyncSession, job_id: int) -> bool:
    job = await get_job(db, job_id)
    if not job:
        return False
    job.is_deleted = True
    return True


async def change_job_status(db: AsyncSession, job_id: int, new_status: str, user_id: int = None, remarks: str = None):
    job = await get_job(db, job_id)
    if not job:
        return None, "Job not found"

    current = job.status.value if hasattr(job.status, 'value') else str(job.status)
    current_normalized = str(current).strip().lower()
    target_status = str(new_status).strip().lower()

    allowed = VALID_STATUS_TRANSITIONS.get(current_normalized, [])
    if target_status not in allowed:
        return None, f"Cannot transition from '{current_normalized}' to '{target_status}'. Allowed: {allowed}"

    old_status = current_normalized
    job.status = _coerce_enum(JobStatusEnum, target_status)

    if target_status == "approved":
        job.approved_by = user_id
        job.approved_at = datetime.utcnow()
        job.approval_remarks = remarks
    elif target_status == "completed":
        job.completed_at = datetime.utcnow()
        job.completion_remarks = remarks

    history = JobStatus(
        job_id=job.id, from_status=old_status, to_status=target_status, changed_by=user_id, remarks=remarks
    )
    db.add(history)
    await db.flush()
    return job, None


async def get_job_with_client_name(db: AsyncSession, job: Job) -> dict:
    """Build response dict with client name."""
    result = await db.execute(select(Client.name).where(Client.id == job.client_id))
    client_name = result.scalar_one_or_none()

    from app.models.postgres.lr import LR
    from app.models.postgres.trip import Trip
    lr_count = (await db.execute(select(func.count(LR.id)).where(LR.job_id == job.id))).scalar() or 0
    trip_count = (await db.execute(select(func.count(Trip.id)).where(Trip.job_id == job.id))).scalar() or 0

    return {
        **{c.key: getattr(job, c.key) for c in job.__table__.columns},
        "client_name": client_name,
        "lr_count": lr_count,
        "trip_count": trip_count,
        "status": job.status.value if hasattr(job.status, 'value') else str(job.status),
        "contract_type": job.contract_type.value if hasattr(job.contract_type, 'value') else str(job.contract_type) if job.contract_type else None,
        "priority": job.priority.value if hasattr(job.priority, 'value') else str(job.priority) if job.priority else None,
    }
