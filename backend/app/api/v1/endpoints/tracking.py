# Tracking & Monitoring Endpoints
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional
from pydantic import BaseModel
import httpx

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.schemas.base import APIResponse
from app.models.postgres.trip import Trip, TripStatusEnum
from app.models.postgres.vehicle import Vehicle
from app.services import tracking_service
from app.middleware.permissions import require_permission, require_any_permission, Permissions

router = APIRouter()


class GPSPingPayload(BaseModel):
    vehicle_id: Optional[int] = None
    registration_number: Optional[str] = None
    latitude: float
    longitude: float
    speed: float = 0
    heading: float = 0
    odometer: float = 0
    ignition_on: bool = True
    trip_id: Optional[int] = None


@router.get("/live", response_model=APIResponse)
async def get_live_tracking(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_any_permission([Permissions.TRACKING_LIVE, Permissions.TRACKING_VIEW])),
):
    """Get all active tracked trips/vehicles with their GPS coordinates."""
    result = await db.execute(
        select(Trip, Vehicle.current_latitude, Vehicle.current_longitude, Vehicle.odometer_reading)
        .outerjoin(Vehicle, Vehicle.id == Trip.vehicle_id)
        .where(
            Trip.is_deleted == False,
            Trip.status.in_([TripStatusEnum.STARTED, TripStatusEnum.IN_TRANSIT, TripStatusEnum.LOADING, TripStatusEnum.UNLOADING])
        ).order_by(Trip.actual_start.desc())
    )
    items = []
    for t, lat, lng, odo in result.all():
        is_moving = t.status in (TripStatusEnum.IN_TRANSIT, TripStatusEnum.STARTED)
        flat = float(lat) if lat else None
        flng = float(lng) if lng else None
        # Speed comes from the GPS provider (iALERT/device); default 0 if no live data
        speed = 0
        items.append({
            "trip_id": t.id,
            "trip_number": t.trip_number,
            "vehicle_id": t.vehicle_id,
            "vehicle_registration": t.vehicle_registration,
            "rc_number": t.vehicle_registration,
            "registration_number": t.vehicle_registration,
            "driver_name": t.driver_name,
            "origin": t.origin,
            "destination": t.destination,
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "latitude": flat,
            "longitude": flng,
            "lat": flat,
            "lng": flng,
            "speed_kmph": speed,
            "current_speed": speed,
            "speed": speed,
            "odometer": float(odo or 0),
            "ignition_on": t.status in (TripStatusEnum.IN_TRANSIT, TripStatusEnum.STARTED, TripStatusEnum.LOADING, TripStatusEnum.UNLOADING),
            "last_location": t.origin if not lat else f"{float(lat):.4f}, {float(lng):.4f}",
            "last_update": str(getattr(t, "updated_at", None)) if getattr(t, "updated_at", None) else None,
            "timestamp": str(getattr(t, "updated_at", None)) if getattr(t, "updated_at", None) else None,
        })

    # Also add vehicles with GPS coordinates that aren't on trips
    vehicle_ids_on_trip = [i["vehicle_id"] for i in items if i.get("vehicle_id")]
    all_vehicles = await db.execute(
        select(Vehicle).where(
            Vehicle.is_deleted == False,
            Vehicle.current_latitude != None,
            Vehicle.current_longitude != None,
        )
    )
    for v in all_vehicles.scalars().all():
        if v.id not in vehicle_ids_on_trip:
            items.append({
                "vehicle_id": v.id,
                "vehicle_registration": v.registration_number,
                "rc_number": v.registration_number,
                "registration_number": v.registration_number,
                "driver_name": None,
                "origin": None,
                "destination": None,
                "status": v.status.value if hasattr(v.status, "value") else str(v.status),
                "latitude": float(v.current_latitude),
                "longitude": float(v.current_longitude),
                "lat": float(v.current_latitude),
                "lng": float(v.current_longitude),
                "speed_kmph": 0,
                "current_speed": 0,
                "odometer": float(v.odometer_reading or 0),
                "ignition_on": False,
                "last_location": v.current_location or f"{float(v.current_latitude):.4f}, {float(v.current_longitude):.4f}",
                "last_update": str(v.updated_at) if hasattr(v, "updated_at") and v.updated_at else None,
                "timestamp": str(v.updated_at) if hasattr(v, "updated_at") and v.updated_at else None,
            })
    return APIResponse(success=True, data=items)


@router.post("/gps/ping", response_model=APIResponse)
async def record_gps_ping(
    payload: GPSPingPayload,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.GPS_PING_CREATE)),
):
    """Record a GPS ping from a vehicle/driver device. Updates Vehicle table and optionally MongoDB."""
    # Verify trip ownership for drivers
    if "driver" in [r.lower() for r in current_user.roles] and payload.trip_id:
        from app.models.postgres.driver import Driver
        driver_result = await db.execute(
            select(Driver).where(Driver.user_id == current_user.user_id)
        )
        driver = driver_result.scalar_one_or_none()
        if driver:
            trip_check = await db.execute(
                select(Trip).where(
                    Trip.id == payload.trip_id,
                    Trip.driver_id == driver.id,
                    Trip.status.in_([TripStatusEnum.STARTED, TripStatusEnum.IN_TRANSIT,
                                     TripStatusEnum.LOADING, TripStatusEnum.UNLOADING]),
                )
            )
            if not trip_check.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Cannot ping for this trip")
    # Find vehicle
    vehicle = None
    if payload.vehicle_id:
        vehicle = await db.get(Vehicle, payload.vehicle_id)
    elif payload.registration_number:
        result = await db.execute(
            select(Vehicle).where(Vehicle.registration_number == payload.registration_number)
        )
        vehicle = result.scalar_one_or_none()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Update vehicle GPS coordinates in PostgreSQL
    vehicle.current_latitude = payload.latitude
    vehicle.current_longitude = payload.longitude
    vehicle.current_location = f"{payload.latitude:.6f}, {payload.longitude:.6f}"
    if payload.odometer > 0:
        vehicle.odometer_reading = payload.odometer
    await db.commit()

    # Try to store in MongoDB for trail/telemetry (non-blocking)
    try:
        await tracking_service.record_gps_ping(
            vehicle_id=str(vehicle.id),
            lat=payload.latitude,
            lng=payload.longitude,
            speed=payload.speed,
            heading=payload.heading,
            odometer=payload.odometer,
            trip_id=str(payload.trip_id) if payload.trip_id else None,
        )
    except Exception:
        pass  # MongoDB may not be configured

    return APIResponse(success=True, data={
        "vehicle_id": vehicle.id,
        "registration_number": vehicle.registration_number,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "recorded": True,
    }, message="GPS ping recorded")


@router.get("/active-trips", response_model=APIResponse)
async def get_active_trips(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_any_permission([Permissions.TRACKING_VIEW, Permissions.TRIP_READ])),
):
    result = await db.execute(
        select(Trip).where(
            Trip.is_deleted == False,
            Trip.status.in_([TripStatusEnum.STARTED, TripStatusEnum.IN_TRANSIT, TripStatusEnum.LOADING, TripStatusEnum.UNLOADING])
        ).order_by(Trip.actual_start.desc())
    )
    trips = result.scalars().all()
    items = [{
        "id": t.id, "trip_number": t.trip_number,
        "vehicle_registration": t.vehicle_registration,
        "driver_name": t.driver_name, "driver_phone": t.driver_phone,
        "origin": t.origin, "destination": t.destination,
        "status": t.status.value if hasattr(t.status, "value") else str(t.status),
        "actual_start": str(t.actual_start) if t.actual_start else None,
    } for t in trips]
    return APIResponse(success=True, data=items)


@router.get("/trip/{trip_id}", response_model=APIResponse)
async def get_trip_tracking(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_any_permission([Permissions.TRACKING_VIEW, Permissions.TRIP_READ])),
):
    result = await db.execute(select(Trip).where(Trip.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return APIResponse(success=True, data={
        "trip_number": trip.trip_number,
        "vehicle_registration": trip.vehicle_registration,
        "driver_name": trip.driver_name,
        "origin": trip.origin, "destination": trip.destination,
        "status": trip.status.value if hasattr(trip.status, "value") else str(trip.status),
        "actual_start": str(trip.actual_start) if trip.actual_start else None,
        "actual_end": str(trip.actual_end) if trip.actual_end else None,
        "start_odometer": float(trip.start_odometer) if trip.start_odometer else None,
        "end_odometer": float(trip.end_odometer) if trip.end_odometer else None,
    })


@router.get("/vehicle/{vehicle_id}", response_model=APIResponse)
async def get_vehicle_tracking(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_any_permission([Permissions.TRACKING_VIEW, Permissions.VEHICLE_READ])),
):
    result = await db.execute(
        select(Trip).where(
            Trip.is_deleted == False,
            Trip.vehicle_id == vehicle_id,
            Trip.status.in_([TripStatusEnum.STARTED, TripStatusEnum.IN_TRANSIT, TripStatusEnum.LOADING, TripStatusEnum.UNLOADING])
        ).order_by(Trip.updated_at.desc())
    )
    trip = result.scalars().first()
    if not trip:
        raise HTTPException(status_code=404, detail="No active tracking found for vehicle")
    return APIResponse(success=True, data={
        "trip_id": trip.id,
        "trip_number": trip.trip_number,
        "vehicle_id": trip.vehicle_id,
        "vehicle_registration": trip.vehicle_registration,
        "driver_name": trip.driver_name,
        "status": trip.status.value if hasattr(trip.status, "value") else str(trip.status),
        "latitude": None,
        "longitude": None,
        "last_location": getattr(trip, "last_location", None),
        "last_update": str(getattr(trip, "updated_at", None)) if getattr(trip, "updated_at", None) else None,
    })


@router.get("/alerts", response_model=APIResponse)
async def list_tracking_alerts(
    severity: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    from datetime import date, timedelta, datetime
    today = date.today()
    items = []

    # Active trip alerts
    if severity in (None, "warning", "info"):
        expiring_soon = await db.execute(
            select(Trip).where(
                Trip.is_deleted == False,
                Trip.status.in_([TripStatusEnum.STARTED, TripStatusEnum.IN_TRANSIT])
            ).limit(10)
        )
        for t in expiring_soon.scalars().all():
            items.append({
                "id": f"trip-{t.id}",
                "type": "trip_status",
                "severity": "info",
                "title": f"Trip {t.trip_number} is active",
                "message": f"{t.origin} -> {t.destination}",
                "vehicle": t.vehicle_registration or "",
                "driver": t.driver_name or "",
                "location": t.origin or "",
                "created_at": str(t.updated_at) if hasattr(t, "updated_at") and t.updated_at else datetime.now().isoformat(),
                "acknowledged": False,
            })

    # Document expiry alerts
    if severity in (None, "critical", "warning"):
        exp = await db.execute(
            select(Vehicle).where(
                Vehicle.is_deleted == False,
                (Vehicle.fitness_valid_until <= today + timedelta(days=15)) |
                (Vehicle.insurance_valid_until <= today + timedelta(days=15)) |
                (Vehicle.puc_valid_until <= today + timedelta(days=15)) |
                (Vehicle.permit_valid_until <= today + timedelta(days=15))
            ).limit(20)
        )
        for v in exp.scalars().all():
            for doc_type, exp_date in [('Fitness', v.fitness_valid_until), ('Insurance', v.insurance_valid_until), ('PUC', v.puc_valid_until), ('Permit', v.permit_valid_until)]:
                if exp_date and exp_date <= today + timedelta(days=15):
                    is_expired = exp_date < today
                    sev = "critical" if is_expired else "warning"
                    if severity and severity != sev:
                        continue
                    items.append({
                        "id": f"doc-{v.id}-{doc_type.lower()}",
                        "type": "document_expiry",
                        "severity": sev,
                        "title": f"{doc_type} {'Expired' if is_expired else 'Expiring Soon'}",
                        "message": f"{v.registration_number} - {doc_type} {'expired on' if is_expired else 'expires'} {exp_date.isoformat()}",
                        "vehicle": v.registration_number,
                        "driver": "",
                        "location": "",
                        "created_at": datetime.now().isoformat(),
                        "acknowledged": False,
                    })

    # Maintenance due alerts
    if severity in (None, "critical", "warning"):
        from app.models.postgres.vehicle import VehicleMaintenance
        maint = await db.execute(
            select(VehicleMaintenance, Vehicle.registration_number)
            .join(Vehicle, Vehicle.id == VehicleMaintenance.vehicle_id)
            .where(VehicleMaintenance.next_service_date != None, VehicleMaintenance.next_service_date <= today + timedelta(days=7))
            .limit(10)
        )
        for svc, reg_no in maint.all():
            is_overdue = svc.next_service_date < today if svc.next_service_date else False
            sev = "critical" if is_overdue else "warning"
            if severity and severity != sev:
                continue
            items.append({
                "id": f"maint-{svc.id}",
                "type": "maintenance_due",
                "severity": sev,
                "title": f"Maintenance {'Overdue' if is_overdue else 'Due Soon'}",
                "message": f"{reg_no} - {svc.service_type or 'Service'} due {svc.next_service_date.isoformat() if svc.next_service_date else ''}",
                "vehicle": reg_no,
                "driver": "",
                "location": "",
                "created_at": datetime.now().isoformat(),
                "acknowledged": False,
            })

    return APIResponse(success=True, data=items)


@router.post("/alerts/{alert_id}/acknowledge", response_model=APIResponse)
async def acknowledge_tracking_alert(alert_id: str, current_user: TokenData = Depends(get_current_user)):
    return APIResponse(success=True, data={"id": alert_id, "acknowledged": True}, message="Alert acknowledged")


# ── GPS Position Endpoints ──────────────────────────────────────

@router.get("/gps/positions", response_model=APIResponse)
async def get_gps_positions(
    current_user: TokenData = Depends(get_current_user),
):
    """Get live GPS positions for all tracked vehicles (from MongoDB)."""
    result = await tracking_service.get_live_positions()
    return APIResponse(success=True, data=result, message="Live GPS positions fetched")


@router.get("/gps/path/{vehicle_id}", response_model=APIResponse)
async def get_vehicle_path(
    vehicle_id: str,
    hours: int = Query(24, ge=1, le=168, description="Hours of path history"),
    current_user: TokenData = Depends(get_current_user),
):
    """Get GPS path/trail for a vehicle over the given time window."""
    from datetime import datetime, timedelta
    to_time = datetime.utcnow()
    from_time = to_time - timedelta(hours=hours)
    result = await tracking_service.get_vehicle_path(vehicle_id, from_time, to_time)
    return APIResponse(success=True, data=result, message="Vehicle path fetched")


# ── Map Tile Proxy ─────────────────────────────────────────────

@router.get("/tiles/{z}/{x}/{y}")
async def proxy_map_tile(z: int, x: int, y: int):
    """Proxy OpenStreetMap tiles through the backend so mobile clients
    on restricted networks (e.g., Android emulator) can load map tiles."""
    url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                url,
                headers={
                    "User-Agent": "KavyaTransports-ERP/1.0 (transport.erp@kavya.in)",
                    "Accept": "image/png,image/*,*/*",
                },
                follow_redirects=True,
            )
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail="Tile unavailable")
            return Response(
                content=r.content,
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "X-Tile-Source": "openstreetmap",
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Tile server timeout")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tile proxy error: {str(e)}")


# ── iALERT GPS Admin Endpoints ──────────────────────────────────

@router.get("/ialert/status", response_model=APIResponse)
async def ialert_status(
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.TRACKING_LIVE)),
):
    """Check iALERT integration status and config (admin only)."""
    from app.core.config import settings
    return APIResponse(success=True, data={
        "enabled": settings.IALERT_ENABLED,
        "token_configured": bool(settings.IALERT_API_TOKEN),
        "api_url": settings.IALERT_API_URL,
        "poll_interval_seconds": settings.IALERT_POLL_INTERVAL_SECONDS,
    })


@router.post("/ialert/poll", response_model=APIResponse)
async def ialert_manual_poll(
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.TRACKING_LIVE)),
):
    """Manually trigger an iALERT poll cycle (admin/debug use)."""
    from app.core.config import settings
    if not settings.IALERT_ENABLED or not settings.IALERT_API_TOKEN:
        raise HTTPException(status_code=400, detail="iALERT not configured. Set IALERT_ENABLED=true and IALERT_API_TOKEN in .env")

    from app.services.ialert_gps_service import poll_and_ingest
    result = await poll_and_ingest()
    return APIResponse(success=True, data=result, message="iALERT poll completed")


# ── Unified Multi-Provider Tracking Endpoints ────────────────────

class ProviderActivatePayload(BaseModel):
    api_key: str
    endpoint: str


@router.get("/unified/vehicles", response_model=APIResponse)
async def get_unified_vehicles(
    status: Optional[str] = Query(None, description="Filter: moving|idle|stopped|offline|no-gps"),
    provider: Optional[str] = Query(None, description="Filter: ialert|tata_gps|third_party"),
    search: Optional[str] = Query(None, description="Search reg/driver"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_any_permission([Permissions.TRACKING_LIVE, Permissions.TRACKING_VIEW])),
):
    """Get ALL vehicles across ALL GPS providers in a single normalised list."""
    from datetime import datetime, timedelta, timezone
    from app.models.postgres.driver import Driver

    # Build query
    q = select(Vehicle).where(Vehicle.is_deleted == False)
    if provider:
        q = q.where(Vehicle.gps_provider == provider)
    if search:
        q = q.where(Vehicle.registration_number.ilike(f"%{search}%"))

    result = await db.execute(q.order_by(Vehicle.registration_number))
    vehicles = result.scalars().all()

    # Get active trips for trip info
    active_trips = await db.execute(
        select(Trip).where(
            Trip.is_deleted == False,
            Trip.status.in_([TripStatusEnum.STARTED, TripStatusEnum.IN_TRANSIT,
                             TripStatusEnum.LOADING, TripStatusEnum.UNLOADING])
        )
    )
    trip_by_vehicle = {}
    for t in active_trips.scalars().all():
        if t.vehicle_id:
            trip_by_vehicle[t.vehicle_id] = t

    # Get provider statuses (table may not exist yet if migration hasn't run)
    from app.services.gps.provider_registry import get_all_provider_statuses
    try:
        provider_statuses = await get_all_provider_statuses()
    except Exception:
        provider_statuses = []
    provider_status_map = {p["id"]: p for p in provider_statuses}

    now = datetime.now(timezone.utc)
    items = []

    for v in vehicles:
        # Determine GPS status
        has_gps = v.current_latitude is not None and v.current_longitude is not None
        gps_prov = (v.gps_provider or "none").lower()
        prov_info = provider_status_map.get(gps_prov, {})
        prov_is_active = prov_info.get("status") == "active" if prov_info else False

        # Determine vehicle tracking status
        last_gps = getattr(v, "last_gps_at", None) or v.updated_at
        if last_gps and last_gps.tzinfo is None:
            from datetime import timezone as tz
            last_gps = last_gps.replace(tzinfo=tz.utc)
        minutes_ago = (now - last_gps).total_seconds() / 60 if last_gps else 9999

        if not has_gps:
            veh_status = "no-gps" if gps_prov != "none" else "offline"
        elif minutes_ago > 120:
            veh_status = "offline"
        else:
            # Use real-time speed + ignition from GPS provider (KTT/iALERT)
            # Industry-standard thresholds: >2 km/h = moving, engine on = idle, else stopped
            spd = v.last_speed if v.last_speed is not None else 0.0
            ign = v.last_ignition_on if v.last_ignition_on is not None else False
            if spd > 2:
                veh_status = "moving"
            elif ign:
                veh_status = "idle"
            else:
                veh_status = "stopped"

        # Apply status filter
        if status and veh_status != status:
            continue

        trip = trip_by_vehicle.get(v.id)
        items.append({
            "id": v.id,
            "registration_number": v.registration_number,
            "make": v.make,
            "model": v.model,
            "vehicle_type": v.vehicle_type.value if hasattr(v.vehicle_type, "value") else str(v.vehicle_type),
            "gps_provider": gps_prov,
            "gps_provider_name": prov_info.get("name", gps_prov),
            "gps_provider_status": v.gps_provider_status or ("active" if prov_is_active else "pending"),
            "provider_live": prov_is_active and has_gps and minutes_ago < 10,
            "lat": float(v.current_latitude) if v.current_latitude else None,
            "lng": float(v.current_longitude) if v.current_longitude else None,
            "speed": float(v.last_speed or 0),
            "heading": 0,
            "odometer": float(v.odometer_reading or 0),
            "ignition_on": bool(v.last_ignition_on),
            "engine_on": bool(v.last_ignition_on),
            "fuel_level": None,
            "battery_voltage": None,
            "status": veh_status,
            "last_update": str(last_gps) if last_gps else None,
            "minutes_since_update": round(minutes_ago, 1) if minutes_ago < 9999 else None,
            # Trip info
            "trip_id": trip.id if trip else None,
            "trip_number": trip.trip_number if trip else None,
            "driver_name": trip.driver_name if trip else None,
            "route": f"{trip.origin} → {trip.destination}" if trip else None,
            "origin": trip.origin if trip else None,
            "destination": trip.destination if trip else None,
            "trip_status": trip.status.value if trip and hasattr(trip.status, "value") else None,
        })

    # Summary counts
    summary = {
        "total": len(items),
        "moving": sum(1 for i in items if i["status"] == "moving"),
        "stopped": sum(1 for i in items if i["status"] == "stopped"),
        "idle": sum(1 for i in items if i["status"] == "idle"),
        "offline": sum(1 for i in items if i["status"] == "offline"),
        "no_gps": sum(1 for i in items if i["status"] == "no-gps"),
    }

    return APIResponse(success=True, data={
        "vehicles": items,
        "providers": provider_statuses,
        "summary": summary,
    })


@router.get("/unified/providers", response_model=APIResponse)
async def get_provider_statuses(
    current_user: TokenData = Depends(get_current_user),
):
    """Get GPS provider status info (for the provider pills in the UI)."""
    from app.services.gps.provider_registry import get_all_provider_statuses
    try:
        providers = await get_all_provider_statuses()
    except Exception:
        providers = []
    return APIResponse(success=True, data=providers)


@router.post("/unified/providers/{provider_id}/activate", response_model=APIResponse)
async def activate_gps_provider(
    provider_id: str,
    payload: ProviderActivatePayload,
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.TRACKING_LIVE)),
):
    """Activate a GPS provider when its API key arrives."""
    valid_ids = ("ialert", "tata_gps", "third_party")
    if provider_id not in valid_ids:
        raise HTTPException(status_code=400, detail=f"Invalid provider_id. Must be one of: {valid_ids}")

    from app.services.gps.provider_registry import activate_provider
    result = await activate_provider(provider_id, payload.api_key, payload.endpoint)
    return APIResponse(success=True, data=result, message=f"Provider {provider_id} activated")


@router.post("/unified/poll", response_model=APIResponse)
async def unified_poll_all(
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.TRACKING_LIVE)),
):
    """Manually poll ALL active GPS providers (admin/debug)."""
    from app.services.gps.provider_registry import get_active_providers, mark_provider_error, mark_provider_success
    from app.services.gps.ingest import ingest_gps_points

    providers = await get_active_providers()
    results = {}

    for pid, provider in providers.items():
        try:
            points = await provider.fetch_all_positions()
            summary = await ingest_gps_points(points, pid)
            await mark_provider_success(pid, summary["updated"])
            results[pid] = summary
        except Exception as e:
            await mark_provider_error(pid, str(e))
            results[pid] = {"error": str(e)}

    return APIResponse(success=True, data=results, message="Unified poll completed")
