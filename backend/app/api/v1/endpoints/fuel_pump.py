# Fuel Pump Management Endpoints
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.middleware.permissions import require_permission, require_any_permission, Permissions
from app.schemas.base import APIResponse, PaginationMeta
from app.schemas.fuel_pump import (
    DepotFuelTankCreate, DepotFuelTankUpdate,
    FuelIssueCreate, FuelStockTransactionCreate,
    FuelTheftAlertResolve,
)
from app.services import fuel_pump_service, branch_service
from app.models.postgres.user import User
from sqlalchemy import select
from pydantic import BaseModel

router = APIRouter()


# ──────────────────── Branches (fuel mgmt) ─────

class _BranchCreate(BaseModel):
    name: str
    code: str
    city: str | None = None
    state: str | None = None
    address: str | None = None
    pincode: str | None = None
    phone: str | None = None


class _PumpCreate(BaseModel):
    name: str
    pump_number: str | None = None
    booth_number: str | None = None
    fuel_type: str | None = None
    tank_id: int | None = None
    secondary_tank_id: int | None = None
    branch_id: int | None = None


@router.get("/branches")
async def list_fuel_branches(
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_READ, Permissions.FUEL_STOCK_VIEW,
    ])),
    db: AsyncSession = Depends(get_db),
):
    branches = await branch_service.list_branches(
        db, tenant_id=current_user.tenant_id, is_active=True
    )
    def _s(b):
        return {
            "id": b.id, "name": b.name, "code": b.code,
            "city": b.city, "state": b.state, "is_active": b.is_active,
        }
    return APIResponse(success=True, data=[_s(b) for b in branches])


@router.post("/branches", status_code=201)
async def create_fuel_branch(
    data: _BranchCreate,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_CREATE, Permissions.FUEL_STOCK_EDIT,
    ])),
    db: AsyncSession = Depends(get_db),
):
    # Resolve tenant_id — fall back to DB in case of old JWT without tenant_id
    tenant_id = current_user.tenant_id
    if tenant_id is None:
        result = await db.execute(select(User).where(User.id == current_user.user_id))
        user_row = result.scalar_one_or_none()
        tenant_id = user_row.tenant_id if user_row else None
    if tenant_id is None:
        raise HTTPException(status_code=400, detail="User has no tenant assigned")
    branch = await branch_service.create_branch(db, {
        **data.model_dump(exclude_none=True),
        "tenant_id": tenant_id,
        "is_active": True,
    })
    return {
        "success": True,
        "data": {
            "id": branch.id, "name": branch.name, "code": branch.code,
            "city": branch.city, "state": branch.state, "is_active": branch.is_active,
        },
        "message": "Branch created",
    }


# ──────────────────── Tanks ────────────────────

@router.get("/tanks", response_model=APIResponse)
async def list_tanks(
    branch_id: Optional[int] = None,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_STOCK_VIEW, Permissions.FUEL_READ,
    ])),
    db: AsyncSession = Depends(get_db),
):
    # Pump operators are scoped to their branch; override any explicit branch_id param
    effective_branch_id = current_user.branch_id if current_user.branch_id is not None else branch_id
    tanks = await fuel_pump_service.get_tanks(db, current_user.tenant_id, branch_id=effective_branch_id)
    from app.schemas.fuel_pump import DepotFuelTankResponse
    return APIResponse(
        success=True,
        data=[DepotFuelTankResponse.model_validate(t).model_dump() for t in tanks],
    )


@router.post("/tanks", response_model=APIResponse)
async def create_tank(
    data: DepotFuelTankCreate,
    current_user: TokenData = Depends(require_permission(Permissions.FUEL_STOCK_EDIT)),
    db: AsyncSession = Depends(get_db),
):
    tank = await fuel_pump_service.create_tank(db, data, current_user.tenant_id)
    await db.commit()
    from app.schemas.fuel_pump import DepotFuelTankResponse
    return APIResponse(
        success=True,
        data=DepotFuelTankResponse.model_validate(tank).model_dump(),
        message="Tank created successfully",
    )


@router.get("/tanks/{tank_id}", response_model=APIResponse)
async def get_tank(
    tank_id: int,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_STOCK_VIEW, Permissions.FUEL_READ,
    ])),
    db: AsyncSession = Depends(get_db),
):
    tank = await fuel_pump_service.get_tank(db, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")
    from app.schemas.fuel_pump import DepotFuelTankResponse
    return APIResponse(success=True, data=DepotFuelTankResponse.model_validate(tank).model_dump())


@router.put("/tanks/{tank_id}", response_model=APIResponse)
async def update_tank(
    tank_id: int,
    data: DepotFuelTankUpdate,
    current_user: TokenData = Depends(require_permission(Permissions.FUEL_STOCK_EDIT)),
    db: AsyncSession = Depends(get_db),
):
    tank = await fuel_pump_service.update_tank(db, tank_id, data)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")
    await db.commit()
    from app.schemas.fuel_pump import DepotFuelTankResponse
    return APIResponse(
        success=True,
        data=DepotFuelTankResponse.model_validate(tank).model_dump(),
        message="Tank updated",
    )


@router.delete("/tanks/{tank_id}", response_model=APIResponse)
async def delete_tank(
    tank_id: int,
    current_user: TokenData = Depends(require_permission(Permissions.FUEL_STOCK_EDIT)),
    db: AsyncSession = Depends(get_db),
):
    ok = await fuel_pump_service.delete_tank(db, tank_id, current_user.user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tank not found")
    await db.commit()
    return APIResponse(success=True, message="Tank deleted")


# ──────────────────── Fuel Issues ────────────────────

@router.post("/issues", response_model=APIResponse)
async def issue_fuel(
    data: FuelIssueCreate,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_ISSUE, Permissions.FUEL_CREATE,
    ])),
    db: AsyncSession = Depends(get_db),
):
    try:
        issue, alert = await fuel_pump_service.issue_fuel(
            db, data, current_user.user_id,
            branch_id=current_user.branch_id,
            tenant_id=current_user.tenant_id,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from app.schemas.fuel_pump import FuelIssueResponse
    result = FuelIssueResponse.model_validate(issue).model_dump()
    if alert:
        result["theft_alert"] = {"id": alert.id, "severity": alert.severity, "description": alert.description}
    return APIResponse(success=True, data=result, message="Fuel issued successfully")


@router.get("/issues", response_model=APIResponse)
async def list_fuel_issues(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    vehicle_id: Optional[int] = None,
    driver_id: Optional[int] = None,
    tank_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    flagged_only: bool = False,
    registration: Optional[str] = None,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_READ, Permissions.FUEL_STOCK_VIEW,
    ])),
    db: AsyncSession = Depends(get_db),
):
    issues, total = await fuel_pump_service.get_fuel_issues(
        db, page, limit, vehicle_id, driver_id, tank_id,
        date_from, date_to, flagged_only, current_user.tenant_id,
        branch_id=current_user.branch_id,
        registration=registration,
    )
    from app.schemas.fuel_pump import FuelIssueResponse
    pages = (total + limit - 1) // limit if limit else 1
    return APIResponse(
        success=True,
        data=[FuelIssueResponse.model_validate(i).model_dump() for i in issues],
        pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages),
    )


@router.get("/issues/{issue_id}", response_model=APIResponse)
async def get_fuel_issue(
    issue_id: int,
    current_user: TokenData = Depends(require_permission(Permissions.FUEL_READ)),
    db: AsyncSession = Depends(get_db),
):
    issue = await fuel_pump_service.get_fuel_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Fuel issue not found")
    from app.schemas.fuel_pump import FuelIssueResponse
    return APIResponse(success=True, data=FuelIssueResponse.model_validate(issue).model_dump())


# ──────────────────── Stock Transactions ────────────────────

@router.post("/stock", response_model=APIResponse)
async def add_stock(
    data: FuelStockTransactionCreate,
    current_user: TokenData = Depends(require_permission(Permissions.FUEL_STOCK_EDIT)),
    db: AsyncSession = Depends(get_db),
):
    try:
        txn = await fuel_pump_service.add_stock_transaction(
            db, data, current_user.user_id,
            branch_id=current_user.branch_id,
            tenant_id=current_user.tenant_id,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    from app.schemas.fuel_pump import FuelStockTransactionResponse
    return APIResponse(
        success=True,
        data=FuelStockTransactionResponse.model_validate(txn).model_dump(),
        message="Stock transaction recorded",
    )


@router.get("/stock", response_model=APIResponse)
async def list_stock_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    tank_id: Optional[int] = None,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_STOCK_VIEW, Permissions.FUEL_READ,
    ])),
    db: AsyncSession = Depends(get_db),
):
    txns, total = await fuel_pump_service.get_stock_transactions(
        db, tank_id, page, limit, current_user.tenant_id,
    )
    from app.schemas.fuel_pump import FuelStockTransactionResponse
    pages = (total + limit - 1) // limit if limit else 1
    return APIResponse(
        success=True,
        data=[FuelStockTransactionResponse.model_validate(t).model_dump() for t in txns],
        pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages),
    )


# ──────────────────── Theft Alerts ────────────────────

@router.get("/alerts", response_model=APIResponse)
async def list_theft_alerts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    status: Optional[str] = None,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_REPORTS, Permissions.FUEL_READ, Permissions.ALERT_VIEW,
    ])),
    db: AsyncSession = Depends(get_db),
):
    alerts, total = await fuel_pump_service.get_theft_alerts(
        db, status, page, limit, current_user.tenant_id,
        branch_id=current_user.branch_id,
    )
    from app.schemas.fuel_pump import FuelTheftAlertResponse
    pages = (total + limit - 1) // limit if limit else 1
    return APIResponse(
        success=True,
        data=[FuelTheftAlertResponse.model_validate(a).model_dump() for a in alerts],
        pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages),
    )


@router.put("/alerts/{alert_id}", response_model=APIResponse)
async def resolve_alert(
    alert_id: int,
    data: FuelTheftAlertResolve,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_REPORTS, Permissions.ALERT_MANAGE,
    ])),
    db: AsyncSession = Depends(get_db),
):
    alert = await fuel_pump_service.resolve_theft_alert(db, alert_id, data, current_user.user_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.commit()
    from app.schemas.fuel_pump import FuelTheftAlertResponse
    return APIResponse(
        success=True,
        data=FuelTheftAlertResponse.model_validate(alert).model_dump(),
        message="Alert updated",
    )


# ──────────────────── Dashboard ────────────────────

@router.get("/verification", response_model=APIResponse)
async def get_fuel_verification(
    days: int = Query(30, ge=1, le=365),
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_READ, Permissions.FUEL_REPORTS,
    ])),
    db: AsyncSession = Depends(get_db),
):
    """Cross-verify depot fuel issues vs driver expense claims. Returns MATCHED/MISMATCH/PUMP_ONLY/DRIVER_ONLY."""
    records = await fuel_pump_service.get_fuel_verification(db, current_user.tenant_id, days)
    return APIResponse(success=True, data=records)


@router.get("/dashboard", response_model=APIResponse)
async def fuel_dashboard(
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_READ, Permissions.FUEL_STOCK_VIEW, Permissions.FUEL_REPORTS,
    ])),
    db: AsyncSession = Depends(get_db),
):
    stats = await fuel_pump_service.get_dashboard_stats(
        db, current_user.tenant_id, branch_id=current_user.branch_id
    )
    return APIResponse(success=True, data=stats.model_dump())


# ──────────────────── Pumps ────────────────────

@router.get("/pumps", response_model=APIResponse)
async def list_pumps(
    tank_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_READ, Permissions.FUEL_STOCK_VIEW,
    ])),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.models.postgres.fuel_pump import DepotFuelPump
    q = select(DepotFuelPump).where(
        DepotFuelPump.is_deleted == False,
        DepotFuelPump.tenant_id == current_user.tenant_id,
    )
    if tank_id is not None:
        from sqlalchemy import or_
        q = q.where(or_(DepotFuelPump.tank_id == tank_id, DepotFuelPump.secondary_tank_id == tank_id))
    if branch_id is not None:
        q = q.where(DepotFuelPump.branch_id == branch_id)
    result = await db.execute(q.order_by(DepotFuelPump.name))
    pumps = list(result.scalars().all())
    from app.schemas.fuel_pump import DepotFuelPumpResponse
    return APIResponse(
        success=True,
        data=[DepotFuelPumpResponse.model_validate(p).model_dump() for p in pumps],
    )


@router.post("/pumps", response_model=APIResponse, status_code=201)
async def create_pump(
    data: _PumpCreate,
    current_user: TokenData = Depends(require_permission(Permissions.FUEL_STOCK_EDIT)),
    db: AsyncSession = Depends(get_db),
):
    from app.models.postgres.fuel_pump import DepotFuelPump
    pump = DepotFuelPump(
        name=data.name,
        pump_number=data.pump_number,
        booth_number=data.booth_number,
        fuel_type=data.fuel_type,
        tank_id=data.tank_id,
        secondary_tank_id=data.secondary_tank_id,
        branch_id=data.branch_id,
        tenant_id=current_user.tenant_id,
        is_active=True,
    )
    db.add(pump)
    await db.flush()
    await db.commit()
    from app.schemas.fuel_pump import DepotFuelPumpResponse
    return APIResponse(
        success=True,
        data=DepotFuelPumpResponse.model_validate(pump).model_dump(),
        message="Pump created successfully",
    )


# ──────────────────── Shifts ────────────────────
# Lightweight in-memory shift tracker.  A persistent PumpShift model can be
# added in a future migration; for now the app gets a working API contract.

from datetime import datetime
from typing import Any, Dict

_shifts: Dict[int, Dict[str, Any]] = {}  # shift_id → shift data
_shift_counter = 0


def _next_shift_id() -> int:
    global _shift_counter
    _shift_counter += 1
    return _shift_counter


@router.get("/shifts/active", response_model=APIResponse)
async def get_active_shift(
    current_user: TokenData = Depends(get_current_user),
):
    """Return the currently open shift for this user, or null if none."""
    active = [
        s for s in _shifts.values()
        if s.get("status") == "open" and s.get("started_by") == current_user.user_id
    ]
    return APIResponse(success=True, data=active[0] if active else None)


@router.post("/shifts", response_model=APIResponse, status_code=201)
async def start_shift(
    payload: dict,
    current_user: TokenData = Depends(get_current_user),
):
    """Open a new pump shift."""
    # Check for already-open shift
    for s in _shifts.values():
        if s.get("status") == "open" and s.get("started_by") == current_user.user_id:
            raise HTTPException(status_code=400, detail="A shift is already open. Close it first.")

    shift_id = _next_shift_id()
    shift = {
        "id": shift_id,
        "shift_type": payload.get("shift_type", "day"),
        "started_at": payload.get("started_at", datetime.utcnow().isoformat()),
        "started_by": current_user.user_id,
        "tank_readings": payload.get("tank_readings", []),
        "notes": payload.get("notes", ""),
        "status": "open",
    }
    _shifts[shift_id] = shift
    return APIResponse(success=True, data=shift, message="Shift started")


@router.post("/shifts/{shift_id}/close", response_model=APIResponse)
async def close_shift(
    shift_id: int,
    payload: dict,
    current_user: TokenData = Depends(get_current_user),
):
    """Close an open pump shift."""
    shift = _shifts.get(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.get("started_by") != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not your shift")
    if shift.get("status") != "open":
        raise HTTPException(status_code=400, detail="Shift already closed")

    shift["status"] = "closed"
    shift["closed_at"] = payload.get("closed_at", datetime.utcnow().isoformat())
    shift["closing_readings"] = payload.get("tank_readings", [])
    return APIResponse(success=True, data=shift, message="Shift closed")


# ──────────────────── Top-Up Requests ────────────────────

from app.schemas.fuel_pump import FuelTopUpRequestCreate as _FuelTopUpRequestCreate

@router.post("/top-up-requests", response_model=APIResponse)
async def create_top_up_request(
    data: _FuelTopUpRequestCreate,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_STOCK_EDIT, Permissions.FUEL_CREATE,
    ])),
    db: AsyncSession = Depends(get_db),
):
    try:
        req = await fuel_pump_service.create_top_up_request(
            db, data, current_user.user_id,
            branch_id=current_user.branch_id,
            tenant_id=current_user.tenant_id,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    enriched = await fuel_pump_service.enrich_top_up_requests(db, [req])
    return APIResponse(success=True, data=enriched[0], message="Top-up request created")


@router.get("/top-up-requests", response_model=APIResponse)
async def list_top_up_requests(
    status: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_STOCK_EDIT, Permissions.FUEL_READ, Permissions.FUEL_STOCK_VIEW,
    ])),
    db: AsyncSession = Depends(get_db),
):
    requests = await fuel_pump_service.get_top_up_requests(
        db, status=status, tenant_id=current_user.tenant_id,
    )
    enriched = await fuel_pump_service.enrich_top_up_requests(db, requests)
    return APIResponse(success=True, data=enriched)


@router.patch("/top-up-requests/{request_id}/mark-paid", response_model=APIResponse)
async def mark_top_up_paid(
    request_id: int,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_STOCK_EDIT, Permissions.FUEL_APPROVE,
    ])),
    db: AsyncSession = Depends(get_db),
):
    try:
        req = await fuel_pump_service.mark_top_up_paid(
            db, request_id, current_user.user_id, tenant_id=current_user.tenant_id,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    enriched = await fuel_pump_service.enrich_top_up_requests(db, [req])
    return APIResponse(success=True, data=enriched[0], message="Marked as paid and stock updated")


@router.patch("/top-up-requests/{request_id}/reject", response_model=APIResponse)
async def reject_top_up_request(
    request_id: int,
    current_user: TokenData = Depends(require_any_permission([
        Permissions.FUEL_STOCK_EDIT, Permissions.FUEL_APPROVE,
    ])),
    db: AsyncSession = Depends(get_db),
):
    try:
        req = await fuel_pump_service.reject_top_up_request(
            db, request_id, current_user.user_id, tenant_id=current_user.tenant_id,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    enriched = await fuel_pump_service.enrich_top_up_requests(db, [req])
    return APIResponse(success=True, data=enriched[0], message="Request rejected")
