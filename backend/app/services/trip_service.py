# Trip Service - CRUD + Status workflow + Expenses + Fuel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from datetime import datetime, timezone, date

from app.models.postgres.trip import Trip, TripExpense, TripFuelEntry, TripStatus, TripStatusEnum, ExpenseCategory
from app.models.postgres.job import Job, JobStatusEnum, JobStatus
from app.models.postgres.vehicle import Vehicle, VehicleStatus
from app.models.postgres.driver import Driver, DriverStatus, DriverLicense
from app.models.postgres.lr import LR, LRStatus
from app.utils.generators import generate_trip_number


VALID_TRIP_TRANSITIONS = {
    "planned": ["vehicle_assigned", "started", "cancelled"],
    "vehicle_assigned": ["driver_assigned", "planned", "cancelled"],
    "driver_assigned": ["ready", "started", "vehicle_assigned", "cancelled"],
    "ready": ["started", "completed", "cancelled"],
    "started": ["loading", "in_transit", "completed", "cancelled"],
    "loading": ["in_transit", "completed"],
    "in_transit": ["unloading", "completed"],
    "unloading": ["completed"],
    "completed": [],
    "cancelled": ["planned"],
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


def _to_naive_utc(dt: datetime | None) -> datetime | None:
    """Convert aware datetimes to naive UTC for TIMESTAMP WITHOUT TIME ZONE columns."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


async def list_trips(db: AsyncSession, page: int = 1, limit: int = 20, search: str = None, status: str = None, vehicle_id: int = None, driver_id: int = None):
    query = select(Trip).where(Trip.is_deleted == False)
    count_query = select(func.count(Trip.id)).where(Trip.is_deleted == False)

    if search:
        sf = or_(
            Trip.trip_number.ilike(f"%{search}%"),
            Trip.origin.ilike(f"%{search}%"),
            Trip.destination.ilike(f"%{search}%"),
            Trip.driver_name.ilike(f"%{search}%"),
            Trip.vehicle_registration.ilike(f"%{search}%"),
        )
        query = query.where(sf)
        count_query = count_query.where(sf)

    if status:
        if status.lower() == 'pending':
            pending_statuses = [
                TripStatusEnum.PLANNED, TripStatusEnum.VEHICLE_ASSIGNED,
                TripStatusEnum.DRIVER_ASSIGNED, TripStatusEnum.READY,
                TripStatusEnum.STARTED, TripStatusEnum.LOADING,
                TripStatusEnum.IN_TRANSIT, TripStatusEnum.UNLOADING,
            ]
            query = query.where(Trip.status.in_(pending_statuses))
            count_query = count_query.where(Trip.status.in_(pending_statuses))
        else:
            normalized_status = _coerce_enum(TripStatusEnum, status)
            query = query.where(Trip.status == normalized_status)
            count_query = count_query.where(Trip.status == normalized_status)

    if vehicle_id:
        query = query.where(Trip.vehicle_id == vehicle_id)
        count_query = count_query.where(Trip.vehicle_id == vehicle_id)

    if driver_id:
        query = query.where(Trip.driver_id == driver_id)
        count_query = count_query.where(Trip.driver_id == driver_id)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Trip.id.desc()))
    return result.scalars().all(), total


async def get_trip(db: AsyncSession, trip_id: int):
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.is_deleted == False)
    )
    return result.scalar_one_or_none()


async def create_trip(db: AsyncSession, data: dict, user_id: int = None) -> Trip:
    data = dict(data)
    lr_ids = data.pop("lr_ids", [])
    count_result = await db.execute(select(func.count(Trip.id)))
    seq = (count_result.scalar() or 0) + 1
    data["trip_number"] = generate_trip_number(seq)
    data["created_by"] = user_id
    data["status"] = _coerce_enum(TripStatusEnum, data.get("status", "planned"))

    # Denormalize vehicle and driver info
    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == data["vehicle_id"]))
    vehicle = vehicle_result.scalar_one_or_none()
    if vehicle:
        data["vehicle_registration"] = vehicle.registration_number

    driver_result = await db.execute(select(Driver).where(Driver.id == data["driver_id"]))
    driver = driver_result.scalar_one_or_none()
    if driver:
        data["driver_name"] = f"{driver.first_name} {driver.last_name or ''}".strip()
        data["driver_phone"] = driver.phone

    trip = Trip(**data)
    db.add(trip)
    await db.flush()

    # Link LRs to trip
    for lr_id in lr_ids:
        lr_result = await db.execute(select(LR).where(LR.id == lr_id))
        lr = lr_result.scalar_one_or_none()
        if lr:
            lr.trip_id = trip.id
            lr.vehicle_id = data["vehicle_id"]
            lr.driver_id = data["driver_id"]
            lr.status = LRStatus.IN_TRANSIT

    # Update vehicle status
    if vehicle:
        vehicle.status = VehicleStatus.ON_TRIP

    # Update driver status
    if driver:
        driver.status = DriverStatus.ON_TRIP

    # Auto-transition job to in_progress
    if trip.job_id:
        job_result = await db.execute(select(Job).where(Job.id == trip.job_id))
        job = job_result.scalar_one_or_none()
        if job and job.status == JobStatusEnum.APPROVED:
            job.status = JobStatusEnum.IN_PROGRESS

    # Status history
    history = TripStatus(
        trip_id=trip.id, from_status=None, to_status="planned", changed_by=user_id, remarks="Trip created"
    )
    db.add(history)
    await db.flush()
    return trip


async def update_trip(db: AsyncSession, trip_id: int, data: dict):
    trip = await get_trip(db, trip_id)
    if not trip:
        return None

    data = dict(data)
    if "status" in data:
        data["status"] = _coerce_enum(TripStatusEnum, data.get("status"))

    for k, v in data.items():
        if v is not None:
            setattr(trip, k, v)
    return trip


async def delete_trip(db: AsyncSession, trip_id: int) -> bool:
    trip = await get_trip(db, trip_id)
    if not trip:
        return False
    trip.is_deleted = True
    return True


async def change_trip_status(db: AsyncSession, trip_id: int, new_status: str, user_id: int = None, remarks: str = None, odometer_reading: float = None, latitude: float = None, longitude: float = None, location_name: str = None):
    trip = await get_trip(db, trip_id)
    if not trip:
        return None, "Trip not found"

    current = trip.status.value if hasattr(trip.status, 'value') else str(trip.status)
    current_normalized = str(current).strip().lower()
    target_status = str(new_status).strip().lower()

    allowed = VALID_TRIP_TRANSITIONS.get(current_normalized, [])
    if target_status not in allowed:
        return None, f"Cannot transition from '{current_normalized}' to '{target_status}'. Allowed: {allowed}"

    old_status = current_normalized
    trip.status = _coerce_enum(TripStatusEnum, target_status)

    now = datetime.utcnow()
    if target_status == "started":
        trip.actual_start = now
        if odometer_reading:
            trip.start_odometer = odometer_reading

        # Ensure linked resources reflect active trip state.
        if trip.vehicle_id:
            vr = await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))
            v = vr.scalar_one_or_none()
            if v:
                v.status = VehicleStatus.ON_TRIP

        if trip.driver_id:
            dr = await db.execute(select(Driver).where(Driver.id == trip.driver_id))
            d = dr.scalar_one_or_none()
            if d:
                d.status = DriverStatus.ON_TRIP

        if trip.job_id:
            jr = await db.execute(select(Job).where(Job.id == trip.job_id))
            j = jr.scalar_one_or_none()
            if j:
                job_status = getattr(j.status, "value", j.status)
                job_status = str(job_status).strip().lower()
                if job_status not in {"in_progress", "completed", "cancelled", "closed"}:
                    j.status = JobStatusEnum.IN_PROGRESS
                    db.add(JobStatus(
                        job_id=j.id,
                        from_status=job_status,
                        to_status="in_progress",
                        changed_by=user_id,
                        remarks="Auto-moved to in_progress when trip started",
                    ))

        # Keep linked LRs in transit once the trip starts.
        from sqlalchemy import update
        await db.execute(
            update(LR).where(LR.trip_id == trip.id).values(status=LRStatus.IN_TRANSIT)
        )
    elif target_status == "vehicle_assigned":
        # Driver declined – release the driver back to available
        if trip.driver_id:
            dr = await db.execute(select(Driver).where(Driver.id == trip.driver_id))
            d = dr.scalar_one_or_none()
            if d:
                d.status = DriverStatus.AVAILABLE
        trip.driver_id = None
    elif target_status == "loading":
        trip.loading_start = now
    elif target_status == "in_transit":
        if not trip.loading_end and trip.loading_start:
            trip.loading_end = now
    elif target_status == "unloading":
        trip.unloading_start = now
    elif target_status == "completed":
        trip.actual_end = now
        if trip.unloading_start and not trip.unloading_end:
            trip.unloading_end = now
        if odometer_reading:
            trip.end_odometer = odometer_reading
            if trip.start_odometer:
                trip.actual_distance_km = float(odometer_reading) - float(trip.start_odometer)
        # Backfill actual_distance_km if odometer readings already on the trip but distance was never computed
        if not trip.actual_distance_km and trip.end_odometer and trip.start_odometer:
            trip.actual_distance_km = float(trip.end_odometer) - float(trip.start_odometer)

        # Backfill revenue from linked LR/job if it is missing so financials are meaningful.
        current_revenue = float(trip.revenue or 0)
        if current_revenue <= 0:
            lr_rows = (await db.execute(select(LR).where(LR.trip_id == trip.id))).scalars().all()
            lr_revenue = sum(float(getattr(lr, "total_freight", 0) or 0) for lr in lr_rows)
            if lr_revenue <= 0:
                lr_revenue = sum(float(getattr(lr, "freight_amount", 0) or 0) for lr in lr_rows)

            if lr_revenue > 0:
                trip.revenue = lr_revenue
            elif trip.job_id:
                jr = await db.execute(select(Job).where(Job.id == trip.job_id))
                job_for_revenue = jr.scalar_one_or_none()
                if job_for_revenue:
                    job_rate = float(getattr(job_for_revenue, "agreed_rate", 0) or 0)
                    job_total = float(getattr(job_for_revenue, "total_amount", 0) or 0)
                    if job_rate > 0:
                        trip.revenue = job_rate
                    elif job_total > 0:
                        trip.revenue = job_total

        # Release vehicle and driver
        if trip.vehicle_id:
            vr = await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))
            v = vr.scalar_one_or_none()
            if v:
                v.status = VehicleStatus.AVAILABLE
                if odometer_reading:
                    v.odometer_reading = odometer_reading
        if trip.driver_id:
            dr = await db.execute(select(Driver).where(Driver.id == trip.driver_id))
            d = dr.scalar_one_or_none()
            if d:
                d.status = DriverStatus.AVAILABLE
        # Calculate profit/loss
        trip.profit_loss = float(trip.revenue or 0) - float(trip.total_expense or 0)

        # Auto-update LR statuses to delivered
        await db.execute(
            select(LR).where(LR.trip_id == trip.id)  # just load check
        )
        from sqlalchemy import update
        await db.execute(
            update(LR).where(LR.trip_id == trip.id).values(status=LRStatus.DELIVERED)
        )

        # Auto-generate invoice from completed trip. Isolate failures to a savepoint
        # so trip completion does not fail when invoice generation has data issues.
        try:
            from app.services.finance_service import auto_generate_invoice_from_trip
            async with db.begin_nested():
                await auto_generate_invoice_from_trip(db, trip)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Auto-invoice generation failed for trip {trip.id}: {e}")

        # Auto-generate driver settlement for this trip
        try:
            from app.models.postgres.finance_automation import DriverSettlement, SettlementStatus
            from app.utils.generators import generate_settlement_number
            from decimal import Decimal

            driver_pay = Decimal(str(trip.driver_pay or 0))
            driver_advance = Decimal(str(trip.driver_advance or 0))
            trip_expense_total = Decimal(str(trip.total_expense or 0))
            gross = driver_pay
            net = gross - driver_advance - trip_expense_total
            if net < 0:
                net = Decimal("0")

            async with db.begin_nested():
                settlement = DriverSettlement(
                    settlement_number=generate_settlement_number(),
                    settlement_date=now.date() if hasattr(now, 'date') else date.today(),
                    driver_id=trip.driver_id,
                    trip_id=trip.id,
                    period_from=trip.trip_date,
                    period_to=trip.trip_date,
                    base_salary=Decimal("0"),
                    trip_allowance=Decimal("0"),
                    gross_amount=gross,
                    advance_deducted=driver_advance,
                    total_deductions=driver_advance + trip_expense_total,
                    net_amount=net,
                    trips_completed=1,
                    total_km=Decimal(str(trip.actual_distance_km or trip.planned_distance_km or 0)),
                    status=SettlementStatus.PENDING,
                    created_by=user_id,
                )
                db.add(settlement)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Auto-settlement generation failed for trip {trip.id}: {e}")

        # Keep job lifecycle aligned with trip completion.
        if trip.job_id:
            jr = await db.execute(select(Job).where(Job.id == trip.job_id))
            job = jr.scalar_one_or_none()
            if job:
                current_job_status = str(getattr(job.status, "value", job.status) or "").strip().lower()

                active_trip_count = (await db.execute(
                    select(func.count(Trip.id)).where(
                        Trip.job_id == trip.job_id,
                        Trip.is_deleted == False,
                        Trip.id != trip.id,
                        Trip.status.notin_([
                            _coerce_enum(TripStatusEnum, "completed"),
                            _coerce_enum(TripStatusEnum, "cancelled"),
                        ])
                    )
                )).scalar() or 0

                if active_trip_count == 0 and current_job_status not in {"completed", "cancelled", "closed"}:
                    job.status = _coerce_enum(JobStatusEnum, "completed")
                    job.completed_at = now
                    db.add(JobStatus(
                        job_id=job.id,
                        from_status=current_job_status or None,
                        to_status="completed",
                        changed_by=user_id,
                        remarks="Auto-completed when all trips were completed",
                    ))
                elif active_trip_count > 0 and current_job_status != "in_progress":
                    job.status = _coerce_enum(JobStatusEnum, "in_progress")
                    db.add(JobStatus(
                        job_id=job.id,
                        from_status=current_job_status or None,
                        to_status="in_progress",
                        changed_by=user_id,
                        remarks="Auto-updated while other trips are still active",
                    ))

    history = TripStatus(
        trip_id=trip.id, from_status=old_status, to_status=target_status,
        changed_by=user_id, remarks=remarks,
        latitude=latitude, longitude=longitude, location_name=location_name,
    )
    db.add(history)
    await db.flush()
    return trip, None


# --- Expenses ---
async def list_trip_expenses(db: AsyncSession, trip_id: int):
    result = await db.execute(
        select(TripExpense).where(TripExpense.trip_id == trip_id).order_by(TripExpense.expense_date.desc())
    )
    return result.scalars().all()


async def add_trip_expense(db: AsyncSession, trip_id: int, data: dict, user_id: int = None):
    data = dict(data)
    data["category"] = _coerce_enum(ExpenseCategory, data.get("category", "misc"))
    data["expense_date"] = _to_naive_utc(data.get("expense_date"))
    expense = TripExpense(trip_id=trip_id, entered_by=user_id, **data)
    db.add(expense)
    await db.flush()

    # Update trip total
    trip = await get_trip(db, trip_id)
    if trip:
        total_result = await db.execute(
            select(func.sum(TripExpense.amount)).where(TripExpense.trip_id == trip_id)
        )
        trip.total_expense = total_result.scalar() or 0
        trip.profit_loss = float(trip.revenue or 0) - float(trip.total_expense or 0)

    return expense


async def verify_expense(db: AsyncSession, expense_id: int, user_id: int, remarks: str = None):
    result = await db.execute(select(TripExpense).where(TripExpense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        return None
    expense.is_verified = True
    expense.verified_by = user_id
    expense.verified_at = datetime.utcnow()
    expense.verification_remarks = remarks
    return expense


# --- Fuel Entries ---
async def list_trip_fuel(db: AsyncSession, trip_id: int):
    result = await db.execute(
        select(TripFuelEntry).where(TripFuelEntry.trip_id == trip_id).order_by(TripFuelEntry.fuel_date.desc())
    )
    return result.scalars().all()


async def add_trip_fuel(db: AsyncSession, trip_id: int, data: dict):
    trip = await get_trip(db, trip_id)
    if not trip:
        return None
    fuel = TripFuelEntry(trip_id=trip_id, vehicle_id=trip.vehicle_id, **data)
    db.add(fuel)
    await db.flush()

    # Update trip fuel totals
    total_fuel = await db.execute(
        select(func.sum(TripFuelEntry.total_amount)).where(TripFuelEntry.trip_id == trip_id)
    )
    trip.fuel_cost = total_fuel.scalar() or 0
    total_litres = await db.execute(
        select(func.sum(TripFuelEntry.quantity_litres)).where(TripFuelEntry.trip_id == trip_id)
    )
    trip.actual_fuel_litres = total_litres.scalar() or 0

    return fuel


async def get_trip_with_details(db: AsyncSession, trip: Trip) -> dict:
    """Build response dict with related data."""
    job_number = None
    if trip.job_id:
        result = await db.execute(select(Job.job_number).where(Job.id == trip.job_id))
        job_number = result.scalar_one_or_none()

    lr_count = (await db.execute(select(func.count(LR.id)).where(LR.trip_id == trip.id))).scalar() or 0
    expense_count = (await db.execute(select(func.count(TripExpense.id)).where(TripExpense.trip_id == trip.id))).scalar() or 0
    total_expenses = (await db.execute(select(func.sum(TripExpense.amount)).where(TripExpense.trip_id == trip.id))).scalar() or 0

    vehicle_data = None
    if trip.vehicle_id:
        v_res = await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))
        v = v_res.scalar_one_or_none()
        if v:
            vtype = v.vehicle_type
            vehicle_data = {
                "id": v.id,
                "registration_number": v.registration_number,
                "vehicle_type": vtype.value if hasattr(vtype, 'value') else str(vtype),
                "make": v.make,
                "model": v.model,
                "capacity_tons": float(v.capacity_tons) if v.capacity_tons is not None else None,
            }

    driver_data = None
    if trip.driver_id:
        d_res = await db.execute(select(Driver).where(Driver.id == trip.driver_id))
        d = d_res.scalar_one_or_none()
        if d:
            lic_res = await db.execute(
                select(DriverLicense.license_number)
                .where(DriverLicense.driver_id == d.id)
                .limit(1)
            )
            license_number = lic_res.scalar_one_or_none()
            driver_data = {
                "id": d.id,
                "full_name": d.full_name,
                "phone": d.phone,
                "license_number": license_number,
            }

    # Fetch status history
    sh_result = await db.execute(
        select(TripStatus).where(TripStatus.trip_id == trip.id).order_by(TripStatus.created_at)
    )
    status_history_data = [
        {
            "from_status": sh.from_status,
            "to_status": sh.to_status,
            "location_name": sh.location_name,
            "remarks": sh.remarks,
            "created_at": sh.created_at.isoformat() if sh.created_at else None,
        }
        for sh in sh_result.scalars().all()
    ]

    # Fetch route via_points for journey timeline
    route_data = None
    if trip.route_id:
        from app.models.postgres.route import Route
        import json as _json
        r_res = await db.execute(select(Route).where(Route.id == trip.route_id))
        r_obj = r_res.scalar_one_or_none()
        if r_obj:
            via_raw = r_obj.via_points or "[]"
            try:
                via_list = _json.loads(via_raw) if isinstance(via_raw, str) else (via_raw or [])
            except Exception:
                via_list = []
            route_data = {
                "id": r_obj.id,
                "route_name": r_obj.route_name,
                "distance_km": float(r_obj.distance_km) if r_obj.distance_km else None,
                "estimated_hours": float(r_obj.estimated_hours) if r_obj.estimated_hours else None,
                "via_points": via_list,
            }

    # Fetch LR details (lr_number + eway bill + attached documents)
    from app.models.postgres.lr import LRDocument
    lr_objs_result = await db.execute(
        select(LR).where(LR.trip_id == trip.id, LR.is_deleted == False).order_by(LR.created_at)
    )
    lrs_data = []
    for lr_obj in lr_objs_result.scalars().all():
        docs_result = await db.execute(
            select(LRDocument).where(LRDocument.lr_id == lr_obj.id)
        )
        docs = docs_result.scalars().all()
        lrs_data.append({
            "id": lr_obj.id,
            "lr_number": lr_obj.lr_number,
            "eway_bill_number": lr_obj.eway_bill_number,
            "eway_bill_date": lr_obj.eway_bill_date.isoformat() if lr_obj.eway_bill_date else None,
            "status": lr_obj.status.value if hasattr(lr_obj.status, 'value') else str(lr_obj.status),
            "created_at": lr_obj.created_at.isoformat() if lr_obj.created_at else None,
            "pod_file_url": lr_obj.pod_file_url,
            "documents": [
                {
                    "document_type": d.document_type,
                    "file_url": d.file_url,
                    "document_number": d.document_number,
                }
                for d in docs if d.file_url
            ],
        })

    return {
        **{c.key: getattr(trip, c.key) for c in trip.__table__.columns},
        "job_number": job_number,
        "status": trip.status.value if hasattr(trip.status, 'value') else str(trip.status),
        "lr_count": lr_count,
        "expense_count": expense_count,
        "total_expenses": float(total_expenses) if total_expenses else 0,
        "total_distance": float(
            trip.actual_distance_km
            or trip.planned_distance_km
            or (route_data["distance_km"] if route_data and route_data.get("distance_km") else None)
            or (float(trip.end_odometer) - float(trip.start_odometer) if trip.end_odometer and trip.start_odometer else None)
            or 0
        ) or None,
        "vehicle": vehicle_data,
        "driver": driver_data,
        "status_history": status_history_data,
        "lrs": lrs_data,
        "route_detail": route_data,
    }
