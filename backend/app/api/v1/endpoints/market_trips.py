# Market Trip Management Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.schemas.base import APIResponse, PaginationMeta
from app.schemas.market_trip import MarketTripCreate, MarketTripUpdate, MarketTripAssign, MarketTripSettle
from app.services import market_trip_service

router = APIRouter()


@router.get("", response_model=APIResponse)
async def list_market_trips(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, status: Optional[str] = None,
    supplier_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    trips, total = await market_trip_service.list_market_trips(db, page, limit, search, status, supplier_id)
    pages = (total + limit - 1) // limit
    from app.services.s3_service import presign_stored_url
    items = []
    for t in trips:
        row = {c.key: getattr(t, c.key) for c in t.__table__.columns}
        row["margin"] = t.margin
        row["margin_pct"] = round(t.margin_pct, 2)
        if row.get("pod_file_url"):
            try:
                pod_url = row["pod_file_url"]
                if pod_url.startswith("/uploads/") or pod_url.startswith("/api/"):
                    pod_url = "https://api.kavyatransports.com" + pod_url
                row["pod_file_url"] = await presign_stored_url(pod_url, expires_in=7200) or pod_url
            except Exception:
                pass
        items.append(row)
    return APIResponse(
        success=True, data=items,
        pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages),
    )


@router.get("/{trip_id}", response_model=APIResponse)
async def get_market_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    trip = await market_trip_service.get_market_trip(db, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Market trip not found")
    data = {c.key: getattr(trip, c.key) for c in trip.__table__.columns}
    data["margin"] = trip.margin
    data["margin_pct"] = round(trip.margin_pct, 2)
    if data.get("pod_file_url"):
        try:
            from app.services.s3_service import presign_stored_url
            pod_url = data["pod_file_url"]
            if pod_url.startswith("/uploads/") or pod_url.startswith("/api/"):
                pod_url = "https://api.kavyatransports.com" + pod_url
            data["pod_file_url"] = await presign_stored_url(pod_url, expires_in=7200) or pod_url
        except Exception:
            pass
    return APIResponse(success=True, data=data)


@router.post("", response_model=APIResponse, status_code=201)
async def create_market_trip(
    data: MarketTripCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    trip_data = data.model_dump(exclude_unset=True)
    trip_data["created_by"] = current_user.user_id
    trip = await market_trip_service.create_market_trip(db, trip_data)
    return APIResponse(success=True, data={"id": trip.id}, message="Market trip created")


@router.put("/{trip_id}", response_model=APIResponse)
async def update_market_trip(
    trip_id: int, data: MarketTripUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    trip = await market_trip_service.update_market_trip(db, trip_id, data.model_dump(exclude_unset=True))
    if not trip:
        raise HTTPException(status_code=404, detail="Market trip not found")
    return APIResponse(success=True, message="Market trip updated")


@router.put("/{trip_id}/assign", response_model=APIResponse)
async def assign_vehicle(
    trip_id: int, data: MarketTripAssign,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    try:
        trip = await market_trip_service.assign_vehicle(db, trip_id, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not trip:
        raise HTTPException(status_code=404, detail="Market trip not found")
    return APIResponse(success=True, message="Vehicle assigned to market trip")


@router.put("/{trip_id}/start", response_model=APIResponse)
async def start_transit(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    try:
        trip = await market_trip_service.start_transit(db, trip_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not trip:
        raise HTTPException(status_code=404, detail="Market trip not found")
    return APIResponse(success=True, message="Market trip in transit")


@router.put("/{trip_id}/deliver", response_model=APIResponse)
async def deliver(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    try:
        trip = await market_trip_service.complete_delivery(db, trip_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not trip:
        raise HTTPException(status_code=404, detail="Market trip not found")
    return APIResponse(success=True, message="Market trip delivered")


@router.post("/{trip_id}/settle", response_model=APIResponse)
async def settle(
    trip_id: int, data: MarketTripSettle,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    try:
        trip = await market_trip_service.settle(db, trip_id, data.settlement_reference, data.settlement_remarks)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not trip:
        raise HTTPException(status_code=404, detail="Market trip not found")
    return APIResponse(success=True, message="Market trip settled")


@router.put("/{trip_id}/cancel", response_model=APIResponse)
async def cancel(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    try:
        trip = await market_trip_service.cancel_market_trip(db, trip_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not trip:
        raise HTTPException(status_code=404, detail="Market trip not found")
    return APIResponse(success=True, message="Market trip cancelled")


@router.get("/{trip_id}/pnl", response_model=APIResponse)
async def get_pnl(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    pnl = await market_trip_service.get_pnl(db, trip_id)
    if not pnl:
        raise HTTPException(status_code=404, detail="Market trip not found")
    return APIResponse(success=True, data=pnl)


# ── Market Driver Self-Service Endpoints ───────────────────────────────────────
# These endpoints are called by the market driver app after phone OTP login.
# The JWT encodes role='market_driver' and email='mktdriver:{phone}'.

def _require_market_driver(current_user: TokenData) -> str:
    """Extract and return driver phone from token, or raise 403."""
    if "market_driver" not in current_user.roles:
        raise HTTPException(status_code=403, detail="Market driver access only")
    # email field encodes: 'mktdriver:9876543210'
    if not current_user.email.startswith("mktdriver:"):
        raise HTTPException(status_code=403, detail="Malformed market driver token")
    return current_user.email.replace("mktdriver:", "")


@router.get("/my-trips", response_model=APIResponse)
async def my_trips(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Returns all market trips assigned to the authenticated market driver
    (matched by driver_phone in the token).
    """
    from sqlalchemy import select
    from app.models.postgres.market_trip import MarketTrip

    phone = _require_market_driver(current_user)

    result = await db.execute(
        select(MarketTrip)
        .where(MarketTrip.driver_phone == phone)
        .order_by(MarketTrip.created_at.desc())
        .limit(50)
    )
    trips = result.scalars().all()
    items = []
    for t in trips:
        row = {}
        for c in t.__table__.columns:
            val = getattr(t, c.key)
            row[c.key] = val.value if hasattr(val, "value") else val
        row["margin"] = t.margin
        items.append(row)
    return APIResponse(success=True, data=items)


@router.put("/{trip_id}/driver-status", response_model=APIResponse)
async def driver_update_status(
    trip_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Market driver updates their trip status.
    Allowed transitions: pending→in_transit, in_transit→delivered.
    Only the driver phone on the trip can call this.
    """
    from sqlalchemy import select
    from app.models.postgres.market_trip import MarketTrip

    phone = _require_market_driver(current_user)

    result = await db.execute(select(MarketTrip).where(MarketTrip.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.driver_phone != phone:
        raise HTTPException(status_code=403, detail="This trip is not assigned to you")

    from app.models.postgres.market_trip import MarketTripStatus

    new_status_str = payload.get("status", "").strip().upper()
    allowed_transitions: dict[MarketTripStatus, MarketTripStatus] = {
        MarketTripStatus.PENDING: MarketTripStatus.IN_TRANSIT,
        MarketTripStatus.ASSIGNED: MarketTripStatus.IN_TRANSIT,
        MarketTripStatus.IN_TRANSIT: MarketTripStatus.DELIVERED,
    }
    try:
        new_status_enum = MarketTripStatus(new_status_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status value: '{new_status_str}'")

    if allowed_transitions.get(trip.status) != new_status_enum:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{trip.status.value}' to '{new_status_str}'",
        )

    from datetime import datetime, timezone
    trip.status = new_status_enum
    if new_status_enum == MarketTripStatus.IN_TRANSIT:
        trip.assigned_at = datetime.now(timezone.utc)
    elif new_status_enum == MarketTripStatus.DELIVERED:
        trip.delivered_at = datetime.now(timezone.utc)

    await db.commit()
    return APIResponse(success=True, message=f"Trip status updated to '{new_status_enum.value}'")


@router.post("/{trip_id}/pod", response_model=APIResponse)
async def upload_pod(
    trip_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Upload Proof-of-Delivery (POD) for a market trip.
    Accessible by admin, manager, fleet_manager, and market driver.
    """
    import asyncio
    import time
    from pathlib import Path
    from datetime import datetime
    from sqlalchemy import select
    from app.models.postgres.market_trip import MarketTrip

    result = await db.execute(select(MarketTrip).where(MarketTrip.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Validate file size (max 10 MB)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    # Save to disk (trip_documents, same as LR PODs)
    ext = Path(file.filename or "pod.jpg").suffix or ".jpg"
    safe_ext = ext.lower() if ext.lower() in {".jpg", ".jpeg", ".png", ".pdf"} else ".jpg"
    filename = f"mkt_{trip_id}_pod_{int(time.time())}{safe_ext}"
    save_dir = Path(__file__).resolve().parents[4] / "uploads" / "trip_documents"
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / filename

    await asyncio.to_thread(save_path.write_bytes, content)

    url = f"/uploads/trip_documents/{filename}"
    trip.pod_file_url = url
    trip.pod_uploaded = True
    trip.pod_uploaded_at = datetime.utcnow()

    # Also mark all LRs for the same job as pod_uploaded so LR list shows "Uploaded"
    if trip.job_id:
        from app.models.postgres.lr import LR
        lr_result = await db.execute(select(LR).where(LR.job_id == trip.job_id))
        for lr in lr_result.scalars().all():
            lr.pod_uploaded = True
            if not lr.pod_file_url:
                lr.pod_file_url = url

    await db.commit()

    return APIResponse(success=True, data={"url": url}, message="POD uploaded")