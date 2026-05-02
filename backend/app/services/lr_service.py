# LR Service - CRUD + Status workflow
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.postgres.lr import LR, LRItem, LRDocument, LRStatus, PaymentMode
from app.models.postgres.job import Job
from app.models.postgres.vehicle import Vehicle
from app.models.postgres.driver import Driver
from app.models.postgres.trip import Trip, TripStatusEnum
from app.utils.generators import generate_lr_number, generate_trip_number


VALID_LR_TRANSITIONS = {
    "draft": ["generated", "cancelled"],
    "generated": ["in_transit", "pod_received", "cancelled"],
    "in_transit": ["delivered", "pod_received", "cancelled"],
    "delivered": ["pod_received"],
    "pod_received": [],
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


async def get_next_eway_bill_number(db: AsyncSession) -> str:
    """Return the next sequential E-way bill number, auto-incremented from the last used one."""
    _BASE = 254733886084
    result = await db.execute(
        select(func.max(LR.eway_bill_number)).where(LR.eway_bill_number.isnot(None))
    )
    max_ewb = result.scalar_one_or_none()
    if max_ewb is None:
        return str(_BASE)
    try:
        return str(int(max_ewb) + 1)
    except (ValueError, TypeError):
        return str(_BASE)


async def get_last_cargo_items_for_client(db: AsyncSession, client_id: int) -> list:
    """Return cargo items from the most recent LR for a given client, for auto-fill suggestions."""
    result = await db.execute(
        select(LR)
        .join(Job, LR.job_id == Job.id)
        .where(Job.client_id == client_id)
        .order_by(LR.created_at.desc())
        .limit(1)
    )
    lr = result.scalar_one_or_none()
    if not lr:
        return []
    items_result = await db.execute(
        select(LRItem).where(LRItem.lr_id == lr.id).order_by(LRItem.item_number)
    )
    items = items_result.scalars().all()
    return [
        {
            "description": item.description or "",
            "hsn_code": item.hsn_code or "",
            "packages": str(item.packages) if item.packages else "",
            "package_type": item.package_type or "boxes",
            "actual_weight": str(int(item.actual_weight)) if item.actual_weight else "",
            "charged_weight": str(int(item.charged_weight)) if item.charged_weight else "",
        }
        for item in items
    ]


async def list_lrs(db: AsyncSession, page: int = 1, limit: int = 20, search: str = None, status: str = None, job_id: int = None, trip_id: int = None, transport_type: str = None, created_by: int = None):
    query = select(LR).where(LR.is_deleted == False)
    count_query = select(func.count(LR.id)).where(LR.is_deleted == False)

    if search:
        sf = or_(
            LR.lr_number.ilike(f"%{search}%"),
            LR.consignor_name.ilike(f"%{search}%"),
            LR.consignee_name.ilike(f"%{search}%"),
            LR.origin.ilike(f"%{search}%"),
            LR.destination.ilike(f"%{search}%"),
        )
        query = query.where(sf)
        count_query = count_query.where(sf)

    if status:
        normalized_status = _coerce_enum(LRStatus, status)
        query = query.where(LR.status == normalized_status)
        count_query = count_query.where(LR.status == normalized_status)

    if job_id:
        query = query.where(LR.job_id == job_id)
        count_query = count_query.where(LR.job_id == job_id)

    if trip_id:
        query = query.where(LR.trip_id == trip_id)
        count_query = count_query.where(LR.trip_id == trip_id)

    if transport_type:
        query = query.where(LR.transport_type == transport_type)
        count_query = count_query.where(LR.transport_type == transport_type)

    if created_by is not None:
        query = query.where(LR.created_by == created_by)
        count_query = count_query.where(LR.created_by == created_by)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(LR.id.desc()))
    return result.scalars().all(), total


async def get_lr(db: AsyncSession, lr_id: int):
    result = await db.execute(
        select(LR).where(LR.id == lr_id, LR.is_deleted == False)
    )
    return result.scalar_one_or_none()


async def create_lr(db: AsyncSession, data: dict, user_id: int = None) -> LR:
    data = dict(data)
    items_data = data.pop("items", [])
    data["lr_number"] = generate_lr_number()
    data["created_by"] = user_id
    data["status"] = _coerce_enum(LRStatus, data.get("status", "draft"))
    data["payment_mode"] = _coerce_enum(PaymentMode, data.get("payment_mode", "to_be_billed"))

    # Calculate total freight
    freight = float(data.get("freight_amount") or 0)
    loading = float(data.get("loading_charges") or 0)
    unloading = float(data.get("unloading_charges") or 0)
    detention = float(data.get("detention_charges") or 0)
    other = float(data.get("other_charges") or 0)
    data["total_freight"] = freight + loading + unloading + detention + other

    lr = LR(**data)
    db.add(lr)
    await db.flush()

    await _ensure_trip_for_lr_assignment(db, lr)

    # Add items
    for idx, item_data in enumerate(items_data, 1):
        item = LRItem(lr_id=lr.id, item_number=idx, **item_data)
        db.add(item)
    await db.flush()

    return lr


async def update_lr(db: AsyncSession, lr_id: int, data: dict):
    lr = await get_lr(db, lr_id)
    if not lr:
        return None

    data = dict(data)
    if "status" in data:
        data["status"] = _coerce_enum(LRStatus, data.get("status"))
    if "payment_mode" in data:
        data["payment_mode"] = _coerce_enum(PaymentMode, data.get("payment_mode"))

    for k, v in data.items():
        if v is not None:
            setattr(lr, k, v)
    # Recalculate freight
    lr.total_freight = float(lr.freight_amount or 0) + float(lr.loading_charges or 0) + float(lr.unloading_charges or 0) + float(lr.detention_charges or 0) + float(lr.other_charges or 0)

    await _ensure_trip_for_lr_assignment(db, lr)

    return lr


async def _ensure_trip_for_lr_assignment(db: AsyncSession, lr: LR) -> None:
    """Ensure LR assignment is represented as a trip so it appears in driver pages."""
    if not lr.vehicle_id or not lr.driver_id or not lr.job_id:
        return

    # Keep linked trip aligned when already present.
    existing_trip = None
    if lr.trip_id:
        trip_result = await db.execute(select(Trip).where(Trip.id == lr.trip_id, Trip.is_deleted == False))
        existing_trip = trip_result.scalar_one_or_none()

    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == lr.vehicle_id, Vehicle.is_deleted == False))
    vehicle = vehicle_result.scalar_one_or_none()
    driver_result = await db.execute(select(Driver).where(Driver.id == lr.driver_id, Driver.is_deleted == False))
    driver = driver_result.scalar_one_or_none()
    if not vehicle or not driver:
        return

    origin = lr.origin or "Unknown"
    destination = lr.destination or "Unknown"

    if existing_trip:
        existing_trip.vehicle_id = lr.vehicle_id
        existing_trip.driver_id = lr.driver_id
        existing_trip.vehicle_registration = vehicle.registration_number
        existing_trip.driver_name = driver.full_name
        existing_trip.driver_phone = driver.phone
        existing_trip.origin = origin
        existing_trip.destination = destination
        if not existing_trip.trip_date:
            existing_trip.trip_date = lr.lr_date
        return

    new_trip = Trip(
        trip_number=generate_trip_number(),
        trip_date=lr.lr_date,
        job_id=lr.job_id,
        vehicle_id=lr.vehicle_id,
        vehicle_registration=vehicle.registration_number,
        driver_id=lr.driver_id,
        driver_name=driver.full_name,
        driver_phone=driver.phone,
        origin=origin,
        destination=destination,
        status=TripStatusEnum.DRIVER_ASSIGNED,
        created_by=lr.created_by,
    )
    db.add(new_trip)
    await db.flush()
    lr.trip_id = new_trip.id


async def delete_lr(db: AsyncSession, lr_id: int) -> bool:
    lr = await get_lr(db, lr_id)
    if not lr:
        return False
    lr.is_deleted = True
    return True


async def change_lr_status(db: AsyncSession, lr_id: int, new_status: str, user_id: int = None, remarks: str = None, received_by: str = None):
    lr = await get_lr(db, lr_id)
    if not lr:
        return None, "LR not found"

    current = (lr.status.value if hasattr(lr.status, 'value') else str(lr.status)).lower()
    normalized_new_status = str(new_status).lower()
    allowed = VALID_LR_TRANSITIONS.get(current, [])
    if normalized_new_status not in allowed:
        return None, f"Cannot transition from '{current}' to '{normalized_new_status}'. Allowed: {allowed}"

    lr.status = _coerce_enum(LRStatus, normalized_new_status)

    if normalized_new_status == "delivered":
        from datetime import datetime
        lr.delivered_at = datetime.utcnow()
        lr.delivery_remarks = remarks
        lr.received_by = received_by

    await db.flush()
    return lr, None


async def get_lr_with_details(db: AsyncSession, lr: LR) -> dict:
    """Build response dict with related data."""
    # Get job number
    job_number = None
    if lr.job_id:
        result = await db.execute(select(Job.job_number).where(Job.id == lr.job_id))
        job_number = result.scalar_one_or_none()

    # Get vehicle registration
    vehicle_reg = None
    if lr.vehicle_id:
        result = await db.execute(select(Vehicle.registration_number).where(Vehicle.id == lr.vehicle_id))
        vehicle_reg = result.scalar_one_or_none()

    # Get driver name and phone
    driver_name = None
    driver_phone = None
    if lr.driver_id:
        result = await db.execute(select(Driver.first_name, Driver.last_name, Driver.phone).where(Driver.id == lr.driver_id))
        row = result.one_or_none()
        if row:
            driver_name = f"{row.first_name} {row.last_name or ''}".strip()
            driver_phone = row.phone

    # Get items
    items_result = await db.execute(select(LRItem).where(LRItem.lr_id == lr.id).order_by(LRItem.item_number))
    items = items_result.scalars().all()

    total_packages = sum(item.packages or 0 for item in items)
    total_actual_weight = sum(float(item.actual_weight or 0) for item in items)

    return {
        **{c.key: getattr(lr, c.key) for c in lr.__table__.columns},
        "job_number": job_number,
        "vehicle_registration": vehicle_reg,
        "driver_name": driver_name,
        "driver_phone": driver_phone,
        "total_packages": total_packages,
        "total_weight": round(total_actual_weight, 3) if total_actual_weight else None,
        "status": lr.status.value if hasattr(lr.status, 'value') else str(lr.status),
        "payment_mode": lr.payment_mode.value if hasattr(lr.payment_mode, 'value') else str(lr.payment_mode) if lr.payment_mode else None,
        "items": [{c.key: getattr(item, c.key) for c in item.__table__.columns} for item in items],
    }
