# Job Management Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from datetime import date

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.middleware.permissions import require_permission, Permissions
from app.schemas.base import APIResponse, PaginationMeta
from app.schemas.job import JobCreate, JobUpdate, JobStatusChange
from app.services import job_service, trip_service
from app.services.notification_service import notification_service
from app.services import email_service
from app.models.postgres.client import Client
from app.models.postgres.route import Route
from app.models.postgres.trip import Trip
from app.utils.tenant_guard import assert_tenant_access

router = APIRouter()


@router.get("", response_model=APIResponse)
async def list_jobs(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, status: Optional[str] = None,
    client_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_READ)),
):
    jobs, total = await job_service.list_jobs(db, page, limit, search, status, client_id)
    pages = (total + limit - 1) // limit
    items = []
    for job in jobs:
        items.append(await job_service.get_job_with_client_name(db, job))
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.get("/{job_id}", response_model=APIResponse)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_READ)),
):
    job = await job_service.get_job(db, job_id)
    assert_tenant_access(job, current_user, not_found_detail="Job not found")
    data = await job_service.get_job_with_client_name(db, job)
    return APIResponse(success=True, data=data)


@router.post("", response_model=APIResponse, status_code=201)
async def create_job(
    data: JobCreate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_CREATE)),
):
    # RUL-01: Credit limit enforcement (soft flag — warns but doesn't block)
    credit_warning = None
    try:
        from app.services.tms_automation_service import rul_01_check_credit_limit
        from decimal import Decimal
        freight = Decimal(str(data.agreed_rate or 0))
        if data.client_id and freight > 0:
            credit_result = await rul_01_check_credit_limit(db, data.client_id, freight)
            if credit_result.get("soft_flag"):
                credit_warning = credit_result.get("message")
    except Exception:
        pass

    # RUL-04: Auto-suggest vehicle type from cargo weight
    suggested_vehicle = None
    try:
        from app.services.tms_automation_service import rul_04_suggest_vehicle_type
        if data.quantity and data.quantity > 0:
            suggested_vehicle = rul_04_suggest_vehicle_type(data.quantity)
    except Exception:
        pass

    job = await job_service.create_job(db, data.model_dump(), current_user.user_id)

    # Persist TMS automation fields
    if credit_warning or suggested_vehicle:
        try:
            if credit_warning:
                job.requires_credit_approval = True
            if suggested_vehicle:
                job.suggested_vehicle_type = suggested_vehicle
            await db.commit()
            await db.refresh(job)
        except Exception:
            pass

    route_str = f"{job.origin_city or ''} → {job.destination_city or ''}"
    await notification_service.send(
        db,
        event_type="JOB_CREATED",
        title="New job assigned",
        body=f"Job {job.job_number} – ready for LR · {route_str}",
        target_roles=["PROJECT_ASSOCIATE"],
        data={"job_id": str(job.id), "route": f"/pa/jobs/{job.id}"},
        urgency="normal",
        triggered_by=current_user.user_id,
    )

    # Fire-and-forget email notification to creator (non-blocking)
    email_service.notify_job_created(
        db,
        triggered_by_user_id=current_user.user_id,
        job_number=job.job_number,
        origin=job.origin_city or "",
        destination=job.destination_city or "",
        client_name="",  # fetched lazily inside template if needed
        pickup_date=str(job.pickup_date) if getattr(job, "pickup_date", None) else "",
        material=getattr(job, "material", None) or "",
        quantity=str(getattr(job, "quantity", None) or ""),
    )

    response_data = {"id": job.id, "job_number": job.job_number}
    if credit_warning:
        response_data["credit_warning"] = credit_warning
    if suggested_vehicle:
        response_data["suggested_vehicle_type"] = suggested_vehicle

    return APIResponse(success=True, data=response_data, message="Job created")


@router.put("/{job_id}", response_model=APIResponse)
async def update_job(
    job_id: int, data: JobUpdate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_UPDATE)),
):
    existing = await job_service.get_job(db, job_id)
    assert_tenant_access(existing, current_user, not_found_detail="Job not found")
    job = await job_service.update_job(db, job_id, data.model_dump(exclude_unset=True))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return APIResponse(success=True, message="Job updated")


@router.delete("/{job_id}", response_model=APIResponse)
async def delete_job(
    job_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_DELETE)),
):
    existing = await job_service.get_job(db, job_id)
    assert_tenant_access(existing, current_user, not_found_detail="Job not found")
    success = await job_service.delete_job(db, job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found")
    return APIResponse(success=True, message="Job deleted")


@router.post("/{job_id}/submit-for-approval", response_model=APIResponse)
async def submit_for_approval(
    job_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_UPDATE)),
):
    """Submit a draft job for approval."""
    job = await job_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job, error = await job_service.change_job_status(db, job_id, "pending_approval", current_user.user_id, "Submitted for approval")
    if error:
        raise HTTPException(status_code=400, detail=error)
    return APIResponse(success=True, message="Job submitted for approval")


@router.post("/{job_id}/status", response_model=APIResponse)
async def change_status(
    job_id: int, data: JobStatusChange, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_UPDATE)),
):
    existing = await job_service.get_job(db, job_id)
    old_status = getattr(existing, "status", "") or ""
    job, error = await job_service.change_job_status(db, job_id, data.status, current_user.user_id, data.remarks)
    if error:
        raise HTTPException(status_code=400, detail=error)
    # Fire-and-forget email notification (non-blocking)
    email_service.notify_job_status_updated(
        db,
        triggered_by_user_id=current_user.user_id,
        job_number=getattr(job, "job_number", str(job_id)),
        old_status=str(old_status),
        new_status=data.status,
        remarks=data.remarks or "",
    )
    return APIResponse(success=True, message=f"Job status changed to {data.status}")


@router.put("/{job_id}/assign", response_model=APIResponse)
async def assign_job(
    job_id: int,
    payload: dict | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.JOB_UPDATE)),
):
    job = await job_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Handle vehicle/driver status updates
    vehicle_id = (payload or {}).get("vehicle_id")
    driver_id = (payload or {}).get("driver_id")

    if not vehicle_id or not driver_id:
        raise HTTPException(status_code=400, detail="Both vehicle and driver are required for assignment")

    if vehicle_id:
        from app.models.postgres.vehicle import Vehicle, VehicleStatus
        v_result = await db.execute(select(Vehicle).where(Vehicle.id == int(vehicle_id)))
        vehicle = v_result.scalar_one_or_none()
        if vehicle:
            vehicle.status = VehicleStatus.ON_TRIP

    if driver_id:
        from app.models.postgres.driver import Driver, DriverStatus
        d_result = await db.execute(select(Driver).where(Driver.id == int(driver_id)))
        driver = d_result.scalar_one_or_none()
        if driver:
            driver.status = DriverStatus.ON_TRIP

    async def ensure_trip_for_assignment() -> int | None:

        existing_trip_result = await db.execute(
            select(Trip).where(Trip.job_id == job.id, Trip.is_deleted == False).order_by(Trip.id.desc())
        )
        existing_trip = existing_trip_result.scalar_one_or_none()
        if existing_trip:
            return existing_trip.id

        trip_payload = {
            "trip_date": date.today(),
            "job_id": job.id,
            "vehicle_id": int(vehicle_id),
            "driver_id": int(driver_id),
            "route_id": job.route_id,
            "origin": job.origin_city or job.origin_address,
            "destination": job.destination_city or job.destination_address,
            "planned_distance_km": float(job.estimated_distance_km) if job.estimated_distance_km is not None else None,
            "planned_start": job.pickup_date,
            "planned_end": job.expected_delivery_date,
            "driver_advance": 0,
            "revenue": float(job.agreed_rate) if job.agreed_rate is not None else 0,
            "remarks": "Auto-created from job assignment",
        }
        trip = await trip_service.create_trip(db, trip_payload, current_user.user_id)
        return trip.id

    current = job.status.value if hasattr(job.status, "value") else str(job.status)
    current = str(current).strip().lower()
    # Auto-approve if needed to reach in_progress
    if current == "draft":
        _, err = await job_service.change_job_status(db, job_id, "pending_approval", current_user.user_id, "Auto-submitted during assignment")
        if err:
            raise HTTPException(status_code=400, detail=err)
        _, err = await job_service.change_job_status(db, job_id, "approved", current_user.user_id, "Auto-approved during assignment")
        if err:
            raise HTTPException(status_code=400, detail=err)
    elif current == "pending_approval":
        _, err = await job_service.change_job_status(db, job_id, "approved", current_user.user_id, "Auto-approved during assignment")
        if err:
            raise HTTPException(status_code=400, detail=err)
    elif current == "in_progress":
        trip_id = await ensure_trip_for_assignment()
        data = {"id": job.id}
        if trip_id:
            data["trip_id"] = trip_id
        return APIResponse(success=True, data=data, message="Job already assigned")

    job, err = await job_service.change_job_status(db, job_id, "in_progress", current_user.user_id, "Assigned for execution")
    if err:
        raise HTTPException(status_code=400, detail=err)

    trip_id = await ensure_trip_for_assignment()
    data = {"id": job.id}
    if trip_id:
        data["trip_id"] = trip_id

    return APIResponse(success=True, data=data, message="Job assigned")


# ── Lookup endpoints ─────────────────────────────────────
@router.get("/lookup/clients", response_model=APIResponse)
async def lookup_clients(
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    query = select(
        Client.id, Client.name, Client.code,
        Client.address_line1, Client.city, Client.state, Client.pincode,
        Client.gstin, Client.credit_limit, Client.credit_days, Client.outstanding_amount,
    ).where(Client.is_deleted == False)
    if search:
        query = query.where(Client.name.ilike(f"%{search}%"))
    query = query.order_by(Client.name).limit(50)
    result = await db.execute(query)
    items = [
        {
            "id": r.id, "name": r.name, "code": r.code,
            "address_line1": r.address_line1 or "",
            "city": r.city or "", "state": r.state or "", "pincode": r.pincode or "",
            "gstin": r.gstin or "",
            "credit_limit": float(r.credit_limit or 0),
            "credit_days": r.credit_days or 30,
            "outstanding": float(r.outstanding_amount or 0),
        }
        for r in result.all()
    ]
    return APIResponse(success=True, data=items)


@router.get("/lookup/routes", response_model=APIResponse)
async def lookup_routes(
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    query = select(Route).limit(50)
    if search:
        query = query.where(Route.name.ilike(f"%{search}%"))
    result = await db.execute(query)
    items = [{c.key: getattr(r, c.key) for c in r.__table__.columns} for r in result.scalars().all()]
    return APIResponse(success=True, data=items)


@router.get("/lookup/vehicle-types", response_model=APIResponse)
async def lookup_vehicle_types(current_user: TokenData = Depends(get_current_user)):
    types = [
        {"value": "open_body", "label": "Open Body", "capacity_tons": 10},
        {"value": "closed_body", "label": "Closed Body / Container", "capacity_tons": 18},
        {"value": "flatbed", "label": "Flatbed", "capacity_tons": 25},
        {"value": "tanker", "label": "Tanker", "capacity_tons": 20},
        {"value": "tipper", "label": "Tipper", "capacity_tons": 16},
        {"value": "trailer", "label": "Trailer", "capacity_tons": 30},
        {"value": "refrigerated", "label": "Refrigerated", "capacity_tons": 15},
        {"value": "other", "label": "Other", "capacity_tons": 0},
    ]
    return APIResponse(success=True, data=types)


@router.get("/lookup/states", response_model=APIResponse)
async def lookup_states(current_user: TokenData = Depends(get_current_user)):
    states = [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
        "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
        "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
        "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
        "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
        "Uttar Pradesh", "Uttarakhand", "West Bengal",
        "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
        "Chandigarh", "Dadra and Nagar Haveli", "Lakshadweep",
        "Andaman and Nicobar Islands",
    ]
    return APIResponse(success=True, data=states)


@router.get("/next-job-number", response_model=APIResponse)
async def next_job_number(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    from app.utils.generators import generate_job_number
    return APIResponse(success=True, data={"job_number": generate_job_number()})
