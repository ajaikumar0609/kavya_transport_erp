# Vehicle Management Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from typing import Optional
from datetime import datetime

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.middleware.permissions import require_permission, Permissions
from app.schemas.base import APIResponse, PaginationMeta
from app.schemas.vehicle import VehicleCreate, VehicleUpdate
from app.services import vehicle_service
from app.models.postgres.driver import Driver
from app.utils.tenant_guard import assert_tenant_access

router = APIRouter()


@router.get("", response_model=APIResponse)
async def list_vehicles(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, status: Optional[str] = None,
    vehicle_type: Optional[str] = None, ownership_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_READ)),
):
    vehicles, total = await vehicle_service.list_vehicles(db, page, limit, search, status, vehicle_type, ownership_type)
    pages = (total + limit - 1) // limit

    # Batch-fetch assigned driver names to avoid N+1 queries
    driver_ids = list({v.default_driver_id for v in vehicles if v.default_driver_id})
    driver_name_map: dict = {}
    if driver_ids:
        dr_result = await db.execute(
            select(Driver.id, Driver.first_name, Driver.last_name)
            .where(Driver.id.in_(driver_ids), Driver.is_deleted == False)
        )
        for row in dr_result.all():
            driver_name_map[row.id] = f"{row.first_name} {row.last_name or ''}".strip()

    items = []
    for v in vehicles:
        d = {c.key: getattr(v, c.key) for c in v.__table__.columns}
        d["expiry_alerts"] = vehicle_service.get_expiry_alerts(v)
        d["gps_enabled"] = bool(v.gps_device_id or v.current_latitude)
        d["total_km_run"] = float(v.odometer_reading or 0)
        d["assigned_driver"] = driver_name_map.get(v.default_driver_id) if v.default_driver_id else None
        items.append(d)
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.get("/summary", response_model=APIResponse)
async def fleet_summary(db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    summary = await vehicle_service.get_fleet_summary(db)
    return APIResponse(success=True, data=summary)


@router.get("/expiring", response_model=APIResponse)
async def expiring_vehicles(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    vehicles = await vehicle_service.get_vehicles_expiring_soon(db, days)
    items = []
    for v in vehicles:
        d = {c.key: getattr(v, c.key) for c in v.__table__.columns}
        d["expiry_alerts"] = vehicle_service.get_expiry_alerts(v)
        items.append(d)
    return APIResponse(success=True, data=items)


@router.get("/{vehicle_id}", response_model=APIResponse)
async def get_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_READ)),
):
    vehicle = await vehicle_service.get_vehicle(db, vehicle_id)
    assert_tenant_access(vehicle, current_user, not_found_detail="Vehicle not found")
    d = {c.key: getattr(vehicle, c.key) for c in vehicle.__table__.columns}
    d["expiry_alerts"] = vehicle_service.get_expiry_alerts(vehicle)
    return APIResponse(success=True, data=d)


@router.post("", response_model=APIResponse, status_code=201)
async def create_vehicle(
    data: VehicleCreate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_CREATE)),
):
    try:
        vehicle = await vehicle_service.create_vehicle(db, data.model_dump())
    except IntegrityError as exc:
        msg = str(exc).lower()
        if "registration_number" in msg or "vehicles_registration_number_key" in msg:
            raise HTTPException(status_code=400, detail="Vehicle registration number already exists")
        raise HTTPException(status_code=400, detail="Unable to create vehicle due to conflicting data")
    return APIResponse(success=True, data={"id": vehicle.id, "registration_number": vehicle.registration_number}, message="Vehicle created")


@router.put("/{vehicle_id}", response_model=APIResponse)
async def update_vehicle(
    vehicle_id: int, data: VehicleUpdate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_UPDATE)),
):
    existing = await vehicle_service.get_vehicle(db, vehicle_id)
    assert_tenant_access(existing, current_user, not_found_detail="Vehicle not found")
    try:
        vehicle = await vehicle_service.update_vehicle(db, vehicle_id, data.model_dump(exclude_unset=True))
    except IntegrityError as exc:
        msg = str(exc).lower()
        if "registration_number" in msg or "vehicles_registration_number_key" in msg:
            raise HTTPException(status_code=400, detail="Vehicle registration number already exists")
        raise HTTPException(status_code=400, detail="Unable to update vehicle due to conflicting data")
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return APIResponse(success=True, message="Vehicle updated")


@router.delete("/{vehicle_id}", response_model=APIResponse)
async def delete_vehicle(
    vehicle_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_DELETE)),
):
    existing = await vehicle_service.get_vehicle(db, vehicle_id)
    assert_tenant_access(existing, current_user, not_found_detail="Vehicle not found")
    success = await vehicle_service.delete_vehicle(db, vehicle_id)
    if not success:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return APIResponse(success=True, message="Vehicle deleted")


# ── Vehicle Document Endpoints ─────────────────────────────────────────────

_ALLOWED_DOC_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_MAX_DOC_SIZE = 10 * 1024 * 1024  # 10 MB


def _parse_date(value: Optional[str]):
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            pass
    return None


@router.get("/{vehicle_id}/documents", response_model=APIResponse)
async def get_vehicle_documents(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_READ)),
):
    """Return all documents stored for a vehicle."""
    from app.models.postgres.vehicle import VehicleDocument
    result = await db.execute(
        select(VehicleDocument).where(VehicleDocument.vehicle_id == vehicle_id)
    )
    docs = result.scalars().all()
    items = [
        {
            "id": d.id,
            "document_type": d.document_type,
            "document_number": d.document_number,
            "issue_date": str(d.issue_date) if d.issue_date else None,
            "expiry_date": str(d.expiry_date) if d.expiry_date else None,
            "file_url": d.file_url,
            "is_verified": d.is_verified,
            "remarks": d.remarks,
        }
        for d in docs
    ]
    return APIResponse(success=True, data=items)


@router.post("/{vehicle_id}/documents", response_model=APIResponse, status_code=201)
async def upload_vehicle_document(
    vehicle_id: int,
    file: UploadFile = File(...),
    document_type: str = Form(...),
    document_number: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    issue_date: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_UPDATE)),
):
    """Upload or replace a document for a vehicle (rc_book, insurance, pollution_certificate, fitness_certificate)."""
    from app.models.postgres.vehicle import VehicleDocument
    from app.services import s3_service

    vehicle = await vehicle_service.get_vehicle(db, vehicle_id)
    assert_tenant_access(vehicle, current_user, not_found_detail="Vehicle not found")

    from app.utils.upload_validator import validate_upload, ALLOWED_IMAGE_DOC_MIMES
    content, detected_mime, safe_name = await validate_upload(
        file, allowed_mimes=ALLOWED_IMAGE_DOC_MIMES, max_bytes=_MAX_DOC_SIZE,
    )

    folder = f"documents/vehicle/{vehicle_id}"
    upload_result = await s3_service.upload_file(content, safe_name, folder, detected_mime)

    doc_type = document_type.strip().lower()

    # Upsert: replace existing record of same type if present
    existing_result = await db.execute(
        select(VehicleDocument).where(
            VehicleDocument.vehicle_id == vehicle_id,
            VehicleDocument.document_type == doc_type,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.file_url = upload_result.get("url", "")
        if document_number:
            existing.document_number = document_number
        parsed_expiry = _parse_date(expiry_date)
        if parsed_expiry:
            existing.expiry_date = parsed_expiry
        parsed_issue = _parse_date(issue_date)
        if parsed_issue:
            existing.issue_date = parsed_issue
        existing.is_verified = False
        doc = existing
    else:
        doc = VehicleDocument(
            vehicle_id=vehicle_id,
            document_type=doc_type,
            document_number=document_number,
            expiry_date=_parse_date(expiry_date),
            issue_date=_parse_date(issue_date),
            file_url=upload_result.get("url", ""),
            is_verified=False,
        )
        db.add(doc)

    await db.commit()
    await db.refresh(doc)

    return APIResponse(
        success=True,
        data={"id": doc.id, "document_type": doc.document_type, "file_url": doc.file_url},
        message=f"{doc_type} uploaded successfully",
    )


# ── Vehicle Mileage Endpoints ──────────────────────────────────────────────

@router.get("/{vehicle_id}/fuel-logs", response_model=APIResponse)
async def get_vehicle_fuel_logs(
    vehicle_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_READ)),
):
    """Fleet manager: full-tank fill-up logs for a vehicle (Standard mileage view)."""
    from app.models.postgres.fuel_pump import VehicleFuelLog
    from app.models.postgres.driver import Driver as DriverModel

    vehicle = await vehicle_service.get_vehicle(db, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    result = await db.execute(
        select(VehicleFuelLog)
        .where(VehicleFuelLog.vehicle_id == vehicle_id)
        .order_by(VehicleFuelLog.fill_date.desc(), VehicleFuelLog.odometer_km.desc())
        .limit(limit)
    )
    logs = result.scalars().all()

    # Batch-fetch driver names
    driver_ids = list({log.driver_id for log in logs if log.driver_id})
    driver_name_map: dict = {}
    if driver_ids:
        dr_res = await db.execute(
            select(DriverModel.id, DriverModel.first_name, DriverModel.last_name)
            .where(DriverModel.id.in_(driver_ids))
        )
        for row in dr_res.all():
            driver_name_map[row.id] = f"{row.first_name or ''} {row.last_name or ''}".strip()

    items = []
    for log in logs:
        d = {c.key: getattr(log, c.key) for c in log.__table__.columns}
        for k, v in d.items():
            if hasattr(v, '__float__'):
                d[k] = float(v)
            elif isinstance(v, datetime):
                d[k] = v.isoformat()
        if log.mileage_rating:
            d['mileage_rating'] = log.mileage_rating.value if hasattr(log.mileage_rating, 'value') else str(log.mileage_rating)
        d['driver_name'] = driver_name_map.get(log.driver_id, 'Unknown')
        items.append(d)

    # Summary
    rated_logs = [l for l in logs if l.km_per_litre is not None]
    avg_kml = None
    if rated_logs:
        avg_kml = round(float(sum(l.km_per_litre for l in rated_logs)) / len(rated_logs), 2)
    total_litres = sum(float(l.litres_filled or 0) for l in logs)

    return APIResponse(success=True, data={
        "items": items,
        "summary": {
            "total_fills": len(logs),
            "avg_km_per_litre": avg_kml,
            "total_litres": round(total_litres, 1),
            "good_count": sum(1 for l in rated_logs if hasattr(l.mileage_rating, 'value') and l.mileage_rating.value == 'good'),
            "medium_count": sum(1 for l in rated_logs if hasattr(l.mileage_rating, 'value') and l.mileage_rating.value == 'medium'),
            "bad_count": sum(1 for l in rated_logs if hasattr(l.mileage_rating, 'value') and l.mileage_rating.value == 'bad'),
        },
    })


@router.get("/{vehicle_id}/trips-mileage", response_model=APIResponse)
async def get_vehicle_trips_mileage(
    vehicle_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.VEHICLE_READ)),
):
    """Fleet manager: per-trip mileage (km/L) calculated from odometer + fuel entries."""
    from app.models.postgres.trip import Trip, TripFuelEntry
    from app.models.postgres.driver import Driver as DriverModel
    from sqlalchemy import func

    vehicle = await vehicle_service.get_vehicle(db, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Fetch trips with at least start + end odometer readings
    trips_result = await db.execute(
        select(Trip)
        .where(
            Trip.vehicle_id == vehicle_id,
            Trip.is_deleted == False,
            Trip.start_odometer.isnot(None),
            Trip.end_odometer.isnot(None),
        )
        .order_by(Trip.trip_date.desc())
        .limit(limit)
    )
    trips = trips_result.scalars().all()

    # Batch-fetch driver names
    driver_ids = list({t.driver_id for t in trips if t.driver_id})
    driver_name_map: dict = {}
    if driver_ids:
        dr_res = await db.execute(
            select(DriverModel.id, DriverModel.first_name, DriverModel.last_name)
            .where(DriverModel.id.in_(driver_ids))
        )
        for row in dr_res.all():
            driver_name_map[row.id] = f"{row.first_name or ''} {row.last_name or ''}".strip()

    # Batch-fetch total fuel per trip
    trip_ids = [t.id for t in trips]
    fuel_map: dict = {}
    if trip_ids:
        fuel_result = await db.execute(
            select(TripFuelEntry.trip_id, func.sum(TripFuelEntry.quantity_litres).label("total_litres"))
            .where(TripFuelEntry.trip_id.in_(trip_ids))
            .group_by(TripFuelEntry.trip_id)
        )
        for row in fuel_result.all():
            fuel_map[row.trip_id] = float(row.total_litres or 0)

    items = []
    for t in trips:
        start_odo = float(t.start_odometer)
        end_odo = float(t.end_odometer)
        distance_km = round(end_odo - start_odo, 1)
        total_litres = fuel_map.get(t.id, 0.0)
        km_per_litre = round(distance_km / total_litres, 2) if total_litres > 0 and distance_km > 0 else None
        status_val = getattr(t.status, 'value', t.status) if t.status else 'unknown'
        items.append({
            "id": t.id,
            "trip_number": t.trip_number or "",
            "origin": t.origin or "",
            "destination": t.destination or "",
            "trip_date": str(t.trip_date) if t.trip_date else None,
            "driver_name": driver_name_map.get(t.driver_id, "Unknown"),
            "start_odometer": start_odo,
            "end_odometer": end_odo,
            "distance_km": distance_km,
            "total_fuel_litres": round(total_litres, 2),
            "km_per_litre": km_per_litre,
            "status": str(status_val),
        })

    # Overall summary
    trips_with_mileage = [i for i in items if i["km_per_litre"] is not None]
    avg_kml = round(
        sum(i["km_per_litre"] for i in trips_with_mileage) / len(trips_with_mileage), 2
    ) if trips_with_mileage else None

    return APIResponse(success=True, data={
        "items": items,
        "summary": {
            "total_trips": len(items),
            "trips_with_mileage": len(trips_with_mileage),
            "avg_km_per_litre": avg_kml,
            "total_distance_km": round(sum(i["distance_km"] for i in items), 1),
            "total_fuel_litres": round(sum(i["total_fuel_litres"] for i in items), 1),
        },
    })
