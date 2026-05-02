# Finance Manager API Endpoints
# Salary, advances, expenses, payouts, schedules, vendor payments
from fastapi import APIRouter, Depends, Query, HTTPException, Body, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional
from datetime import date, datetime, timedelta

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.schemas.base import APIResponse, PaginationMeta
from app.models.postgres.payment import PaymentContact, Payout, PaymentSchedule, ExpenseSubmission
from app.models.postgres.trip import Trip, TripExpense, TripStatusEnum, ExpenseStatusEnum, TripFuelEntry
from app.models.postgres.vehicle import Vehicle
from app.models.postgres.user import User
from app.services import payment_service

router = APIRouter()


def _allowed(user: TokenData) -> bool:
    roles = {str(r).lower() for r in (user.roles or [])}
    return bool(roles & {"admin", "finance_manager", "accountant"})


def _require_finance(user: TokenData):
    if not _allowed(user):
        raise HTTPException(status_code=403, detail="Finance Manager access required.")


# ─── Dashboard ──────────────────────────────────────────────────────────────────


@router.get("/dashboard/summary", response_model=APIResponse)
async def finance_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    today = date.today()
    month_start = today.replace(day=1)

    # Pending expense submissions
    pending_r = await db.execute(
        select(func.count(), func.coalesce(func.sum(ExpenseSubmission.amount_paise), 0))
        .select_from(ExpenseSubmission)
        .where(ExpenseSubmission.status == "pending")
    )
    pending_row = pending_r.one()
    pending_count = pending_row[0] or 0
    pending_amount = pending_row[1] or 0

    # Salary payouts this month
    salary_r = await db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(Payout.amount_paise), 0),
        ).select_from(Payout).where(
            Payout.payout_type == "salary",
            Payout.created_at >= month_start,
            Payout.status == "processed",
        )
    )
    salary_row = salary_r.one()

    # Unpaid salary count
    total_staff_r = await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True, User.is_deleted == False)
    )
    total_staff = total_staff_r.scalar() or 0

    # Payables due this week
    week_end = today + timedelta(days=7)
    due_r = await db.execute(
        select(func.count(), func.coalesce(func.sum(PaymentSchedule.amount_paise), 0))
        .select_from(PaymentSchedule)
        .where(
            PaymentSchedule.is_active == True,
            PaymentSchedule.next_due_date <= week_end,
        )
    )
    due_row = due_r.one()

    # Overdue
    overdue_r = await db.execute(
        select(func.count()).select_from(PaymentSchedule).where(
            PaymentSchedule.is_active == True,
            PaymentSchedule.next_due_date < today,
        )
    )
    overdue_count = overdue_r.scalar() or 0

    # Razorpay balance
    try:
        from app.services import razorpay_payout_service as rpx
        balance = await rpx.get_balance()
    except Exception:
        balance = 0

    return APIResponse(success=True, data={
        "expenses": {
            "pending_count": pending_count,
            "pending_amount_paise": pending_amount,
        },
        "salary": {
            "total_staff": total_staff,
            "paid_count": salary_row[0] or 0,
            "paid_paise": salary_row[1] or 0,
        },
        "payables": {
            "overdue_count": overdue_count,
            "due_this_week_count": due_row[0] or 0,
            "due_this_week_paise": due_row[1] or 0,
        },
        "razorpay_balance_paise": balance,
        "month": today.strftime("%B %Y"),
    })


@router.get("/payment-history", response_model=APIResponse)
async def payment_history(
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return a unified chronological list of all payments processed by the finance team."""
    _require_finance(current_user)
    from app.models.postgres.fuel_pump import FuelTopUpRequest
    from app.models.postgres.driver_requests import DriverAdvanceRequest, AdvanceStatusEnum
    from app.models.postgres.driver import Driver
    from app.services import fuel_pump_service

    items = []

    # ── 1. Fuel refill payments ──────────────────────────────────────────────
    fuel_r = await db.execute(
        select(FuelTopUpRequest)
        .where(FuelTopUpRequest.status == "paid", FuelTopUpRequest.paid_at.isnot(None))
        .order_by(FuelTopUpRequest.paid_at.desc())
        .limit(limit)
    )
    fuels = fuel_r.scalars().all()
    enriched_fuels = await fuel_pump_service.enrich_top_up_requests(db, list(fuels))
    for f in enriched_fuels:
        items.append({
            "type": "FUEL_REFILL",
            "title": f"Fuel Refill — {f.get('tank_name', 'Tank')}",
            "subtitle": f.get("branch_name") or "",
            "amount_rupees": float(f["total_amount"]) if f.get("total_amount") else 0.0,
            "detail": f"{float(f.get('quantity_litres', 0)):.0f} L",
            "date": f.get("paid_at") or f.get("created_at"),
        })

    # ── 2. Trip expense payments ─────────────────────────────────────────────
    exp_r = await db.execute(
        select(TripExpense)
        .where(TripExpense.expense_status == ExpenseStatusEnum.PAID, TripExpense.paid_at.isnot(None))
        .order_by(TripExpense.paid_at.desc())
        .limit(limit)
    )
    expenses = exp_r.scalars().all()
    trip_ids_exp = list({e.trip_id for e in expenses if e.trip_id})
    trips_map_exp: dict = {}
    if trip_ids_exp:
        tr_r = await db.execute(select(Trip).where(Trip.id.in_(trip_ids_exp)))
        trips_map_exp = {t.id: t for t in tr_r.scalars().all()}
    for e in expenses:
        trip = trips_map_exp.get(e.trip_id)
        trip_number = trip.trip_number if trip else str(e.trip_id)
        driver_name = (trip.driver_name or "Driver") if trip else "Driver"
        exp_type = getattr(e.category, "value", str(e.category or "EXPENSE"))
        exp_label = exp_type.replace("_", " ").title()
        items.append({
            "type": "TRIP_EXPENSE",
            "title": f"{exp_label} — {driver_name}",
            "subtitle": trip_number,
            "amount_rupees": float(e.amount) / 100 if e.amount else 0.0,
            "detail": trip_number,
            "date": e.paid_at.isoformat() if e.paid_at else None,
            "payment_proof_url": e.payment_proof_url,
        })

    # ── 3. Trip advance payments ─────────────────────────────────────────────
    adv_trips_r = await db.execute(
        select(Trip)
        .where(Trip.advance_paid.is_(True), Trip.advance_paid_at.isnot(None))
        .order_by(Trip.advance_paid_at.desc())
        .limit(limit)
    )
    adv_trips = adv_trips_r.scalars().all()
    for t in adv_trips:
        route = (f"{t.origin} → {t.destination}") if (t.origin and t.destination) else ""
        items.append({
            "type": "TRIP_ADVANCE",
            "title": f"Trip Advance — {t.driver_name or 'Driver'}",
            "subtitle": t.trip_number or route,
            "amount_rupees": 1500.0,
            "detail": route,
            "date": t.advance_paid_at.isoformat() if t.advance_paid_at else None,
        })

    # ── 4. Driver advance requests approved ──────────────────────────────────
    drv_adv_r = await db.execute(
        select(DriverAdvanceRequest)
        .where(
            DriverAdvanceRequest.status == AdvanceStatusEnum.APPROVED,
            DriverAdvanceRequest.reviewed_at.isnot(None),
        )
        .order_by(DriverAdvanceRequest.reviewed_at.desc())
        .limit(limit)
    )
    drv_advs = drv_adv_r.scalars().all()
    driver_ids = list({d.driver_id for d in drv_advs})
    drivers_map: dict = {}
    if driver_ids:
        dr_r = await db.execute(select(Driver).where(Driver.id.in_(driver_ids)))
        drivers_map = {d.id: d for d in dr_r.scalars().all()}
    for d in drv_advs:
        drv = drivers_map.get(d.driver_id)
        driver_name = (
            f"{drv.first_name or ''} {drv.last_name or ''}".strip() if drv else "Driver"
        )
        items.append({
            "type": "DRIVER_ADVANCE",
            "title": f"Advance Approved — {driver_name}",
            "subtitle": "Driver advance request",
            "amount_rupees": float(d.amount) if d.amount else 0.0,
            "detail": f"₹{float(d.amount):.0f}" if d.amount else "",
            "date": d.reviewed_at.isoformat() if d.reviewed_at else None,
        })

    # Sort combined list by date descending
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    items = items[:limit]

    return APIResponse(success=True, data=items, message=f"{len(items)} payment(s) in history")


# ─── Salary Payments ───────────────────────────────────────────────────────────


@router.get("/salary-summary", response_model=APIResponse)
async def salary_summary(
    month: str = Query(default=None, description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    if not month:
        month = date.today().strftime("%Y-%m")

    from app.models.postgres.user import Role, user_roles as user_roles_table, RoleType
    from sqlalchemy import not_, exists

    # Subquery: user_ids who have a DRIVER role
    driver_role_sq = (
        select(user_roles_table.c.user_id)
        .join(Role, Role.id == user_roles_table.c.role_id)
        .where(Role.role_type == RoleType.DRIVER)
        .subquery()
    )

    # All active, non-driver users
    users_r = await db.execute(
        select(User).where(
            User.is_active == True,
            User.is_deleted == False,
            not_(User.id.in_(select(driver_role_sq.c.user_id))),
        )
    )
    users = users_r.scalars().all()

    # All salary payouts for this month
    payouts_r = await db.execute(
        select(Payout).where(
            Payout.payout_type == "salary",
            Payout.reference_id.like(f"%_{month}"),
        )
    )
    payouts = {p.reference_id: p for p in payouts_r.scalars().all()}

    # Deadline: must pay within first 10 days of the month
    today = date.today()
    current_month = today.strftime("%Y-%m")
    deadline_day = 10
    is_current_month = month == current_month
    is_overdue = is_current_month and today.day > deadline_day
    days_remaining = max(0, deadline_day - today.day) if is_current_month else None

    staff_list = []
    for u in users:
        ref_key = f"{u.id}_{month}"
        payout = payouts.get(ref_key)
        salary_paise = int((getattr(u, "salary_amount", 0) or 0) * 100)
        staff_list.append({
            "employee_id": u.id,
            "name": f"{u.first_name} {u.last_name or ''}".strip(),
            "designation": getattr(u, "designation", "Staff"),
            "bank_last4": (u.account_number or "")[-4:] if u.account_number else None,
            "bank_name": u.bank_name,
            "bank_ifsc": u.ifsc_code,
            "upi_id": u.upi_id,
            "salary_paise": salary_paise,
            "has_bank_account": bool(u.account_number or u.upi_id),
            "status": payout.status if payout else "unpaid",
            "payout_id": payout.id if payout else None,
            "utr": payout.utr if payout else None,
            "paid_at": payout.processed_at.isoformat() if payout and payout.processed_at else None,
        })

    total_due = sum(s["salary_paise"] for s in staff_list)
    paid_count = sum(1 for s in staff_list if s["status"] == "processed")
    paid_paise = sum(s["salary_paise"] for s in staff_list if s["status"] == "processed")

    return APIResponse(success=True, data={
        "month": month,
        "staff": staff_list,
        "total_due_paise": total_due,
        "paid_count": paid_count,
        "unpaid_count": len(staff_list) - paid_count,
        "paid_paise": paid_paise,
        "remaining_paise": total_due - paid_paise,
        "deadline_day": deadline_day,
        "is_overdue": is_overdue,
        "days_remaining": days_remaining,
    })


@router.post("/payments/salary", response_model=APIResponse)
async def pay_salary(
    employee_id: int = Body(...),
    month: str = Body(...),
    amount_paise: int = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)

    user_r = await db.execute(select(User).where(User.id == employee_id))
    user = user_r.scalar_one_or_none()
    name = f"{user.first_name} {user.last_name or ''}".strip() if user else "Unknown"

    payout = await payment_service.initiate_salary_payment(
        db, employee_id, amount_paise, month, current_user.id, name,
    )
    return APIResponse(success=True, data={"payout_id": payout.id, "status": payout.status})


@router.post("/payments/salary/bulk", response_model=APIResponse)
async def pay_salary_bulk(
    payments: list = Body(...),
    month: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    results = []
    for item in payments:
        try:
            user_r = await db.execute(select(User).where(User.id == item["employee_id"]))
            user = user_r.scalar_one_or_none()
            name = f"{user.first_name} {user.last_name or ''}".strip() if user else ""
            payout = await payment_service.initiate_salary_payment(
                db, item["employee_id"], item["amount_paise"], month, current_user.id, name,
            )
            results.append({"employee_id": item["employee_id"], "status": "initiated", "payout_id": payout.id})
        except Exception as e:
            results.append({"employee_id": item["employee_id"], "status": "failed", "error": str(e)[:200]})
    initiated = sum(1 for r in results if r["status"] == "initiated")
    return APIResponse(success=True, data={"initiated": initiated, "failed": len(results) - initiated, "results": results})


# ─── Driver List ──────────────────────────────────────────────────────────────


@router.get("/drivers", response_model=APIResponse)
async def list_finance_drivers(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """List all active drivers with bank/UPI info for finance manager."""
    _require_finance(current_user)
    from app.models.postgres.driver import Driver

    result = await db.execute(
        select(Driver).where(Driver.is_deleted == False).order_by(Driver.first_name)
    )
    drivers = result.scalars().all()

    driver_list = [
        {
            "driver_id": d.id,
            "employee_code": d.employee_code,
            "name": d.full_name,
            "designation": d.designation or "Driver",
            "phone": d.phone,
            "bank_account": d.bank_account_number,
            "bank_last4": (d.bank_account_number or "")[-4:] if d.bank_account_number else None,
            "bank_name": d.bank_name,
            "bank_ifsc": d.bank_ifsc,
            "upi_id": d.upi_id,
            "has_payment_info": bool(d.bank_account_number or d.upi_id),
        }
        for d in drivers
    ]
    return APIResponse(success=True, data={"drivers": driver_list})


# ─── Driver Completed Trips ────────────────────────────────────────────────────


@router.get("/driver-completed-trips", response_model=APIResponse)
async def driver_completed_trips(
    driver_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return all completed trips for a driver, with payout status per trip."""
    _require_finance(current_user)
    from app.models.postgres.driver import Driver

    trips_r = await db.execute(
        select(Trip)
        .where(
            Trip.driver_id == driver_id,
            Trip.status == TripStatusEnum.COMPLETED,
            Trip.is_deleted == False,
        )
        .order_by(Trip.trip_date.desc())
    )
    trips = trips_r.scalars().all()

    # Fetch all trip-pay payouts for this driver in one shot
    payouts_r = await db.execute(
        select(Payout).where(
            Payout.payout_type == "driver_trip_pay",
            Payout.reference_id.like(f"driver_trip_{driver_id}_%"),
        )
    )
    payouts = {p.reference_id: p for p in payouts_r.scalars().all()}

    # Fetch total paid expenses per trip in one query
    trip_ids = [t.id for t in trips]
    expenses_map: dict[int, int] = {}
    if trip_ids:
        exp_r = await db.execute(
            select(TripExpense.trip_id, func.coalesce(func.sum(TripExpense.amount), 0))
            .where(TripExpense.trip_id.in_(trip_ids))
            .group_by(TripExpense.trip_id)
        )
        for tid, total in exp_r.all():
            expenses_map[tid] = int(float(total) * 100)

    trip_list = []
    for t in trips:
        ref_key = f"driver_trip_{driver_id}_{t.id}"
        payout = payouts.get(ref_key)
        driver_pay_paise = int(float(t.driver_pay or 0) * 100)
        driver_advance_paise = int(float(t.driver_advance or 0) * 100)
        trip_expenses_paise = expenses_map.get(t.id, 0)
        net_to_pay_paise = max(0, driver_pay_paise - driver_advance_paise)
        trip_list.append({
            "trip_id": t.id,
            "trip_number": t.trip_number,
            "trip_date": t.trip_date.isoformat() if t.trip_date else None,
            "origin": t.origin,
            "destination": t.destination,
            "driver_pay_paise": driver_pay_paise,
            "driver_advance_paise": driver_advance_paise,
            "trip_expenses_paise": trip_expenses_paise,
            "net_to_pay_paise": net_to_pay_paise,
            "is_paid": payout is not None and payout.status == "processed",
            "payout_id": payout.id if payout else None,
            "utr": payout.utr if payout else None,
            "paid_at": payout.processed_at.isoformat() if payout and payout.processed_at else None,
        })

    return APIResponse(success=True, data={"driver_id": driver_id, "trips": trip_list})


# ─── Driver Trip Pay ──────────────────────────────────────────────────────────


@router.post("/payments/driver-trip-pay", response_model=APIResponse)
async def pay_driver_trip(
    driver_id: int = Body(...),
    trip_id: int = Body(...),
    amount_paise: int = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Record a trip-based payment to a driver (per-trip, custom amount)."""
    _require_finance(current_user)
    from app.models.postgres.driver import Driver

    dr_r = await db.execute(select(Driver).where(Driver.id == driver_id))
    dr = dr_r.scalar_one_or_none()
    if not dr:
        raise HTTPException(status_code=404, detail="Driver not found")

    trip_r = await db.execute(select(Trip).where(Trip.id == trip_id))
    trip = trip_r.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    ref_key = f"driver_trip_{driver_id}_{trip_id}"
    existing_r = await db.execute(
        select(Payout).where(Payout.reference_id == ref_key, Payout.status == "processed")
    )
    if existing_r.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Payment already recorded for this trip")

    payout = Payout(
        payout_type="driver_trip_pay",
        reference_id=ref_key,
        recipient_name=dr.full_name,
        recipient_bank_last4=(dr.bank_account_number or "")[-4:] if dr.bank_account_number else None,
        amount_paise=amount_paise,
        status="processed",
        initiated_by=current_user.id,
        processed_at=datetime.utcnow(),
        narration=f"Trip pay: {trip.trip_number} ({trip.origin} → {trip.destination})",
    )
    db.add(payout)
    await db.commit()
    await db.refresh(payout)
    return APIResponse(success=True, data={"payout_id": payout.id, "status": payout.status})


# ─── Driver Salary ────────────────────────────────────────────────────────────


@router.get("/driver-salary-summary", response_model=APIResponse)
async def driver_salary_summary(
    month: str = Query(default=None, description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """List all active drivers with their salary status for the given month."""
    _require_finance(current_user)
    if not month:
        month = date.today().strftime("%Y-%m")

    from app.models.postgres.driver import Driver

    drivers_r = await db.execute(
        select(Driver).where(Driver.is_deleted == False)
    )
    drivers = drivers_r.scalars().all()

    # Payouts for drivers this month
    payouts_r = await db.execute(
        select(Payout).where(
            Payout.payout_type == "driver_salary",
            Payout.reference_id.like(f"%_{month}"),
        )
    )
    payouts = {p.reference_id: p for p in payouts_r.scalars().all()}

    today = date.today()
    current_month = today.strftime("%Y-%m")
    is_current_month = month == current_month
    deadline_day = 10
    is_overdue = is_current_month and today.day > deadline_day
    days_remaining = max(0, deadline_day - today.day) if is_current_month else None

    driver_list = []
    for d in drivers:
        ref_key = f"driver_{d.id}_{month}"
        payout = payouts.get(ref_key)
        salary_paise = int((float(d.base_salary or 0)) * 100)
        driver_list.append({
            "driver_id": d.id,
            "employee_code": d.employee_code,
            "name": d.full_name,
            "designation": d.designation or "Driver",
            "phone": d.phone,
            "bank_account": d.bank_account_number,
            "bank_last4": (d.bank_account_number or "")[-4:] if d.bank_account_number else None,
            "bank_name": d.bank_name,
            "bank_ifsc": d.bank_ifsc,
            "upi_id": d.upi_id,
            "salary_paise": salary_paise,
            "has_payment_info": bool(d.bank_account_number or d.upi_id),
            "status": payout.status if payout else "unpaid",
            "payout_id": payout.id if payout else None,
            "utr": payout.utr if payout else None,
            "paid_at": payout.processed_at.isoformat() if payout and payout.processed_at else None,
        })

    total_due = sum(s["salary_paise"] for s in driver_list)
    paid_count = sum(1 for s in driver_list if s["status"] == "processed")
    paid_paise = sum(s["salary_paise"] for s in driver_list if s["status"] == "processed")

    return APIResponse(success=True, data={
        "month": month,
        "drivers": driver_list,
        "total_due_paise": total_due,
        "paid_count": paid_count,
        "unpaid_count": len(driver_list) - paid_count,
        "paid_paise": paid_paise,
        "remaining_paise": total_due - paid_paise,
        "is_overdue": is_overdue,
        "days_remaining": days_remaining,
    })


@router.post("/payments/driver-salary", response_model=APIResponse)
async def pay_driver_salary(
    driver_id: int = Body(...),
    month: str = Body(...),
    amount_paise: int = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    from app.models.postgres.driver import Driver

    dr_r = await db.execute(select(Driver).where(Driver.id == driver_id))
    dr = dr_r.scalar_one_or_none()
    if not dr:
        raise HTTPException(status_code=404, detail="Driver not found")

    ref_key = f"driver_{driver_id}_{month}"
    # Check if already paid
    existing_r = await db.execute(
        select(Payout).where(Payout.reference_id == ref_key)
    )
    existing = existing_r.scalar_one_or_none()
    if existing and existing.status == "processed":
        raise HTTPException(status_code=400, detail="Salary already paid for this month")

    payout = Payout(
        payout_type="driver_salary",
        reference_id=ref_key,
        recipient_name=dr.full_name,
        recipient_bank_last4=(dr.bank_account_number or "")[-4:] if dr.bank_account_number else None,
        amount_paise=amount_paise,
        status="processed",
        initiated_by=current_user.id,
        processed_at=datetime.utcnow(),
        narration=f"Driver salary for {month}",
    )
    db.add(payout)
    await db.commit()
    await db.refresh(payout)
    return APIResponse(success=True, data={"payout_id": payout.id, "status": payout.status})


# ─── Driver Advances ───────────────────────────────────────────────────────────


@router.post("/payments/advance", response_model=APIResponse)
async def issue_advance(
    driver_id: int = Body(...),
    trip_id: Optional[int] = Body(None),
    amount_paise: int = Body(150000),  # ₹1,500 default
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    from app.models.postgres.driver import Driver
    dr_r = await db.execute(select(Driver).where(Driver.id == driver_id))
    dr = dr_r.scalar_one_or_none()
    name = dr.name if dr else "Driver"

    payout = await payment_service.initiate_driver_advance(
        db, driver_id, amount_paise, trip_id, current_user.id, name,
    )
    return APIResponse(success=True, data={"payout_id": payout.id, "status": payout.status})


@router.get("/drivers/{driver_id}/advances", response_model=APIResponse)
async def driver_advances(
    driver_id: int,
    month: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    q = select(Payout).where(
        Payout.payout_type == "advance",
        or_(
            Payout.reference_id == str(driver_id),
            Payout.reference_id.like(f"%_{driver_id}_%"),
        ),
    ).order_by(Payout.created_at.desc())

    result = await db.execute(q)
    payouts = result.scalars().all()
    items = []
    for p in payouts:
        items.append({
            "id": p.id,
            "amount_paise": p.amount_paise,
            "trip_ref": p.reference_id,
            "status": p.status,
            "utr": p.utr,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "processed_at": p.processed_at.isoformat() if p.processed_at else None,
        })
    total = sum(i["amount_paise"] for i in items if items)
    return APIResponse(success=True, data={"advances": items, "total_advanced_paise": total})


# ─── Expense Submissions ───────────────────────────────────────────────────────


@router.get("/expense-queue", response_model=APIResponse)
async def expense_queue(
    status: Optional[str] = Query("pending"),
    category: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    q = select(ExpenseSubmission)
    if status:
        q = q.where(ExpenseSubmission.status == status)
    if category:
        q = q.where(ExpenseSubmission.category == category)
    q = q.order_by(ExpenseSubmission.submitted_at.desc())

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar() or 0

    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    items = []
    for sub in result.scalars().all():
        # Get submitter name
        user_r = await db.execute(select(User).where(User.id == sub.submitted_by))
        user = user_r.scalar_one_or_none()
        items.append({
            "id": sub.id,
            "submitted_by": sub.submitted_by,
            "submitter_name": f"{user.first_name} {user.last_name or ''}".strip() if user else "Unknown",
            "category": sub.category,
            "amount_paise": sub.amount_paise,
            "payment_method": sub.payment_method,
            "upi_ref_number": sub.upi_ref_number,
            "receipt_image_s3": sub.receipt_image_s3,
            "description": sub.description,
            "status": sub.status,
            "trip_id": sub.trip_id,
            "vehicle_id": sub.vehicle_id,
            "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
            "rejection_reason": sub.rejection_reason,
        })

    pages = (total + limit - 1) // limit
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.post("/expense-submissions", response_model=APIResponse)
async def submit_expense(
    category: str = Body(...),
    amount_paise: int = Body(...),
    payment_method: str = Body("gpay"),
    upi_ref: Optional[str] = Body(None),
    trip_id: Optional[int] = Body(None),
    vehicle_id: Optional[int] = Body(None),
    description: Optional[str] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    # Threshold validation
    if category == "spare_part" and amount_paise < 300000:
        raise HTTPException(status_code=400, detail="Spare part expense below ₹3,000 threshold — not claimable.")
    if category == "loading" and amount_paise < 400000:
        raise HTTPException(status_code=400, detail="Loading expense below ₹4,000 threshold — not claimable.")

    # Auto-approve small toll/parking with receipt
    auto = False
    if category in ("toll", "parking") and amount_paise < 50000:
        auto = True

    sub = ExpenseSubmission(
        submitted_by=current_user.id,
        trip_id=trip_id,
        vehicle_id=vehicle_id,
        category=category,
        amount_paise=amount_paise,
        payment_method=payment_method,
        upi_ref_number=upi_ref,
        description=description,
        status="auto_approved" if auto else "pending",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return APIResponse(success=True, data={"id": sub.id, "status": sub.status})


@router.patch("/expense-submissions/{sub_id}/approve", response_model=APIResponse)
async def approve_expense(
    sub_id: int,
    reimburse_now: bool = Body(False),
    notes: Optional[str] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    result = await db.execute(select(ExpenseSubmission).where(ExpenseSubmission.id == sub_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Expense submission not found.")

    sub.status = "approved"
    sub.approved_by = current_user.id
    sub.approved_at = datetime.utcnow()

    payout_data = None
    if reimburse_now:
        payout = await payment_service.initiate_expense_reimbursement(db, sub_id, current_user.id)
        payout_data = {"payout_id": payout.id, "status": payout.status}

    await db.commit()
    return APIResponse(success=True, data={"id": sub.id, "status": sub.status, "payout": payout_data})


@router.patch("/expense-submissions/{sub_id}/reject", response_model=APIResponse)
async def reject_expense(
    sub_id: int,
    reason: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    result = await db.execute(select(ExpenseSubmission).where(ExpenseSubmission.id == sub_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Expense submission not found.")

    sub.status = "rejected"
    sub.rejection_reason = reason
    sub.approved_by = current_user.id
    sub.approved_at = datetime.utcnow()
    await db.commit()
    return APIResponse(success=True, data={"id": sub.id, "status": "rejected"})


# ─── Trip Expense Queue ────────────────────────────────────────────────────────


@router.get("/trip-expense-queue", response_model=APIResponse)
async def trip_expense_queue(
    status: Optional[str] = Query("PENDING"),
    trip_id: Optional[int] = None,
    category: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """List trip expenses from completed trips for finance review and payment."""
    _require_finance(current_user)

    q = (
        select(TripExpense, Trip)
        .join(Trip, TripExpense.trip_id == Trip.id)
        .where(Trip.is_deleted == False)
    )

    # Only show from completed/closed trips unless filtering all
    if status and status.upper() != "ALL":
        try:
            q = q.where(TripExpense.expense_status == ExpenseStatusEnum(status.upper()))
        except ValueError:
            pass
        # For PENDING, only show from completed trips
        if status.upper() == "PENDING":
            q = q.where(Trip.status == TripStatusEnum.COMPLETED)
    
    if trip_id:
        q = q.where(TripExpense.trip_id == trip_id)
    if category:
        q = q.where(TripExpense.category.ilike(f"%{category}%"))

    q = q.order_by(TripExpense.created_at.desc())

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar() or 0

    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    rows = result.all()

    # Fetch paid_by user names in one go
    paid_by_ids = {e.paid_by for e, _ in rows if e.paid_by}
    paid_by_names: dict[int, str] = {}
    if paid_by_ids:
        users_r = await db.execute(select(User).where(User.id.in_(paid_by_ids)))
        for u in users_r.scalars().all():
            paid_by_names[u.id] = f"{u.first_name} {u.last_name or ''}".strip()

    items = []
    for expense, trip in rows:
        items.append({
            "id": expense.id,
            "trip_id": expense.trip_id,
            "trip_number": trip.trip_number,
            "origin": trip.origin,
            "destination": trip.destination,
            "vehicle_registration": trip.vehicle_registration,
            "driver_name": trip.driver_name,
            "category": expense.category.value if expense.category else None,
            "sub_category": expense.sub_category,
            "description": expense.description,
            "amount": float(expense.amount),
            "payment_mode": expense.payment_mode,
            "reference_number": expense.reference_number,
            "receipt_url": expense.receipt_url,
            "expense_status": expense.expense_status.value if expense.expense_status else "PENDING",
            "is_verified": expense.is_verified,
            "entry_source": expense.entry_source,
            "expense_date": expense.expense_date.isoformat() if expense.expense_date else None,
            "created_at": expense.created_at.isoformat() if expense.created_at else None,
            "paid_at": expense.paid_at.isoformat() if expense.paid_at else None,
            "paid_by_name": paid_by_names.get(expense.paid_by) if expense.paid_by else None,
            "payment_proof_url": expense.payment_proof_url,
        })

    pages = (total + limit - 1) // limit
    return APIResponse(
        success=True,
        data=items,
        pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages),
    )


@router.post("/trip-expenses/{expense_id}/upload-proof", response_model=APIResponse)
async def upload_payment_proof(
    expense_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Upload a payment proof photo for a trip expense. Returns the URL to use when marking as paid."""
    _require_finance(current_user)
    from app.services.s3_service import upload_file as s3_upload
    result = await db.execute(select(TripExpense).where(TripExpense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Trip expense not found.")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    content_type = file.content_type or "image/jpeg"
    result_data = await s3_upload(
        file_bytes=file_bytes,
        filename=file.filename or f"proof_{expense_id}.jpg",
        folder="payment_proofs",
        content_type=content_type,
    )
    return APIResponse(success=True, data={
        "proof_url": result_data["url"],
        "proof_s3_key": result_data["s3_key"],
    })


@router.patch("/trip-expenses/{expense_id}/pay", response_model=APIResponse)
async def pay_trip_expense(
    expense_id: int,
    notes: Optional[str] = Body(None),
    proof_url: Optional[str] = Body(None),
    proof_s3_key: Optional[str] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Mark a trip expense as PAID and notify the driver."""
    _require_finance(current_user)
    result = await db.execute(select(TripExpense).where(TripExpense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Trip expense not found.")
    if expense.expense_status == ExpenseStatusEnum.PAID:
        raise HTTPException(status_code=400, detail="Expense already marked as paid.")

    # Resolve Finance Manager display name
    fm_user_r = await db.execute(select(User).where(User.id == current_user.user_id))
    fm_user = fm_user_r.scalar_one_or_none()
    fm_name = f"{fm_user.first_name} {fm_user.last_name or ''}".strip() if fm_user else "Finance Manager"

    paid_at = datetime.utcnow()
    expense.expense_status = ExpenseStatusEnum.PAID
    expense.is_verified = True
    expense.paid_by = current_user.user_id
    expense.paid_at = paid_at
    if proof_url:
        expense.payment_proof_url = proof_url
    if proof_s3_key:
        expense.payment_proof_s3_key = proof_s3_key
    if notes:
        expense.description = (expense.description or "") + f" [Finance: {notes}]"
    await db.commit()

    # Fetch trip + driver for notification
    from app.models.postgres.driver import Driver as DriverModel
    from app.services.notification_service import notification_service
    trip_r = await db.execute(select(Trip).where(Trip.id == expense.trip_id))
    trip = trip_r.scalar_one_or_none()
    if trip:
        trip_number = trip.trip_number
        # Notify the driver (target by driver user_id if available, else fall back to role)
        driver_r = await db.execute(
            select(DriverModel).where(DriverModel.id == trip.driver_id)
        )
        driver = driver_r.scalar_one_or_none()
        target_user_ids = [driver.user_id] if driver and driver.user_id else None
        await notification_service.send(
            db,
            event_type="EXPENSE_PAID",
            title="Expenses Paid",
            body=f"Your Expenses for the Trip {trip_number} has been paid Successfully by the Finance Manager",
            target_roles=["DRIVER"] if not target_user_ids else [],
            target_user_ids=target_user_ids,
            data={"trip_id": str(trip.id)},
            urgency="normal",
            triggered_by=current_user.user_id,
        )
    else:
        trip_number = str(expense.trip_id)

    return APIResponse(success=True, data={
        "id": expense.id,
        "status": "PAID",
        "paid_by_name": fm_name,
        "paid_at": paid_at.isoformat(),
        "trip_number": trip_number,
        "payment_proof_url": expense.payment_proof_url,
    })


@router.patch("/trip-expenses/{expense_id}/reject", response_model=APIResponse)
async def reject_trip_expense(
    expense_id: int,
    reason: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Reject a trip expense."""
    _require_finance(current_user)
    result = await db.execute(select(TripExpense).where(TripExpense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Trip expense not found.")

    expense.expense_status = ExpenseStatusEnum.REJECTED
    expense.description = (expense.description or "") + f" [Rejected: {reason}]"
    await db.commit()
    return APIResponse(success=True, data={"id": expense.id, "status": "REJECTED"})


# ─── Trip Fuel Entries ─────────────────────────────────────────────────────────


@router.get("/fuel-entries", response_model=APIResponse)
async def list_fuel_entries(
    is_verified: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    q = (
        select(TripFuelEntry, Trip, Vehicle)
        .join(Trip, Trip.id == TripFuelEntry.trip_id)
        .outerjoin(Vehicle, Vehicle.id == TripFuelEntry.vehicle_id)
        .order_by(TripFuelEntry.fuel_date.desc())
    )
    if is_verified is not None:
        q = q.where(TripFuelEntry.is_verified == is_verified)
    rows = (await db.execute(q.limit(200))).all()
    items = []
    for fuel, trip, vehicle in rows:
        items.append({
            "id": fuel.id,
            "trip_id": fuel.trip_id,
            "trip_number": trip.trip_number,
            "driver_name": trip.driver_name or "N/A",
            "vehicle_registration": vehicle.registration_number if vehicle else f"Vehicle #{fuel.vehicle_id}",
            "fuel_date": fuel.fuel_date.isoformat() if fuel.fuel_date else None,
            "fuel_type": fuel.fuel_type or "diesel",
            "quantity_litres": float(fuel.quantity_litres or 0),
            "rate_per_litre": float(fuel.rate_per_litre or 0),
            "total_amount": float(fuel.total_amount or 0),
            "pump_name": fuel.pump_name or "N/A",
            "payment_mode": fuel.payment_mode or "cash",
            "is_verified": fuel.is_verified or False,
        })
    return APIResponse(success=True, data=items)


@router.patch("/fuel-entries/{entry_id}/mark-paid", response_model=APIResponse)
async def mark_fuel_entry_paid(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    result = await db.execute(select(TripFuelEntry).where(TripFuelEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Fuel entry not found.")
    if entry.is_verified:
        raise HTTPException(status_code=400, detail="Fuel entry already marked as paid.")
    entry.is_verified = True
    await db.commit()
    return APIResponse(success=True, data={"id": entry.id, "status": "PAID"})


# ─── Payment Contacts ──────────────────────────────────────────────────────────


@router.get("/payment-contacts", response_model=APIResponse)
async def list_payment_contacts(
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    q = select(PaymentContact).where(PaymentContact.is_active == True)
    if entity_type:
        q = q.where(PaymentContact.contact_type == entity_type)
    if entity_id:
        q = q.where(PaymentContact.entity_id == entity_id)
    result = await db.execute(q.order_by(PaymentContact.created_at.desc()))
    items = []
    for c in result.scalars().all():
        items.append({
            "id": c.id,
            "contact_type": c.contact_type,
            "entity_id": c.entity_id,
            "entity_name": c.entity_name,
            "bank_name": c.bank_name,
            "bank_last4": c.bank_account_number[-4:] if c.bank_account_number else None,
            "ifsc": c.bank_ifsc,
            "upi_id": c.upi_id,
            "is_verified": c.is_verified,
            "preferred_method": c.preferred_method,
            "razorpay_contact_id": c.razorpay_contact_id,
            "razorpay_fund_account_id": c.razorpay_fund_account_id,
        })
    return APIResponse(success=True, data=items)


@router.post("/payment-contacts", response_model=APIResponse)
async def create_payment_contact(
    entity_type: str = Body(...),
    entity_id: int = Body(...),
    entity_name: str = Body(...),
    bank_account_number: Optional[str] = Body(None),
    bank_ifsc: Optional[str] = Body(None),
    bank_name: Optional[str] = Body(None),
    account_holder_name: Optional[str] = Body(None),
    upi_id: Optional[str] = Body(None),
    phone: Optional[str] = Body(None),
    email: Optional[str] = Body(None),
    preferred_method: str = Body("imps"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)

    # Validate
    from app.services import razorpay_payout_service as rpx
    if bank_ifsc and not rpx.validate_ifsc(bank_ifsc):
        raise HTTPException(status_code=400, detail="Invalid IFSC code format.")
    if upi_id and not rpx.validate_upi(upi_id):
        raise HTTPException(status_code=400, detail="Invalid UPI ID format.")

    contact = PaymentContact(
        contact_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        bank_account_number=bank_account_number,
        bank_ifsc=bank_ifsc,
        bank_name=bank_name,
        account_holder_name=account_holder_name or entity_name,
        upi_id=upi_id,
        phone=phone,
        email=email,
        preferred_method=preferred_method,
    )

    # Register with Razorpay
    try:
        rp_contact = await rpx.create_contact(
            name=entity_name,
            contact_type="employee" if entity_type in ("driver", "staff") else "vendor",
            email=email,
            phone=phone,
            reference_id=f"{entity_type}_{entity_id}",
        )
        contact.razorpay_contact_id = rp_contact.get("id")

        if bank_account_number and bank_ifsc:
            fa = await rpx.add_bank_account(
                razorpay_contact_id=contact.razorpay_contact_id,
                account_number=bank_account_number,
                ifsc=bank_ifsc,
                account_holder_name=account_holder_name or entity_name,
            )
            contact.razorpay_fund_account_id = fa.get("id")
            contact.is_verified = True
        elif upi_id:
            fa = await rpx.add_upi(
                razorpay_contact_id=contact.razorpay_contact_id,
                upi_id=upi_id,
                account_holder_name=account_holder_name or entity_name,
            )
            contact.razorpay_fund_account_id = fa.get("id")
            contact.is_verified = True
    except Exception as e:
        # Save contact even if Razorpay registration fails
        contact.is_verified = False

    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return APIResponse(success=True, data={"id": contact.id, "is_verified": contact.is_verified})


# ─── Payment Schedules ─────────────────────────────────────────────────────────


@router.get("/payment-schedules", response_model=APIResponse)
async def list_schedules(
    schedule_type: Optional[str] = None,
    due_within_days: int = Query(30),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    q = select(PaymentSchedule).where(PaymentSchedule.is_active == True)
    if schedule_type:
        q = q.where(PaymentSchedule.schedule_type == schedule_type)

    cutoff = date.today() + timedelta(days=due_within_days)
    q = q.where(or_(
        PaymentSchedule.next_due_date <= cutoff,
        PaymentSchedule.next_due_date.is_(None),
    ))
    q = q.order_by(PaymentSchedule.next_due_date.asc())

    result = await db.execute(q)
    items = []
    today = date.today()
    for s in result.scalars().all():
        days_until = (s.next_due_date - today).days if s.next_due_date else None
        urgency = "overdue" if days_until is not None and days_until < 0 else (
            "urgent" if days_until is not None and days_until <= 7 else "normal"
        )
        items.append({
            "id": s.id,
            "schedule_type": s.schedule_type,
            "description": s.description,
            "payee_name": s.payee_name,
            "amount_paise": s.amount_paise,
            "frequency": s.frequency,
            "next_due_date": s.next_due_date.isoformat() if s.next_due_date else None,
            "days_until_due": days_until,
            "urgency": urgency,
            "vehicle_id": s.vehicle_id,
            "last_paid_at": s.last_paid_at.isoformat() if s.last_paid_at else None,
        })

    return APIResponse(success=True, data=items)


@router.post("/payment-schedules", response_model=APIResponse)
async def create_schedule(
    schedule_type: str = Body(...),
    amount_paise: int = Body(...),
    frequency: str = Body(...),
    description: Optional[str] = Body(None),
    payee_name: Optional[str] = Body(None),
    due_day: Optional[int] = Body(None),
    due_date: Optional[str] = Body(None),
    vehicle_id: Optional[int] = Body(None),
    driver_id: Optional[int] = Body(None),
    employee_id: Optional[int] = Body(None),
    contact_id: Optional[int] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    s = PaymentSchedule(
        schedule_type=schedule_type,
        amount_paise=amount_paise,
        frequency=frequency,
        description=description,
        payee_name=payee_name,
        due_day=due_day,
        due_date=date.fromisoformat(due_date) if due_date else None,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        employee_id=employee_id,
        contact_id=contact_id,
        next_due_date=date.fromisoformat(due_date) if due_date else None,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return APIResponse(success=True, data={"id": s.id})


@router.delete("/payment-schedules/{schedule_id}", response_model=APIResponse)
async def deactivate_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    result = await db.execute(select(PaymentSchedule).where(PaymentSchedule.id == schedule_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    s.is_active = False
    await db.commit()
    return APIResponse(success=True, data={"id": s.id, "is_active": False})


# ─── Vendor Payments ────────────────────────────────────────────────────────────


@router.post("/payments/vendor", response_model=APIResponse)
async def pay_vendor(
    vendor_name: str = Body(...),
    amount_paise: int = Body(...),
    payment_type: str = Body(...),
    description: str = Body(""),
    vehicle_id: Optional[int] = Body(None),
    contact_id: Optional[int] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    payout = await payment_service.initiate_vendor_payment(
        db, vendor_name, amount_paise, payment_type, description, vehicle_id, current_user.id, contact_id,
    )
    return APIResponse(success=True, data={"payout_id": payout.id, "status": payout.status})


# ─── Payout History ────────────────────────────────────────────────────────────


@router.get("/payouts", response_model=APIResponse)
@router.get("/payouts/", response_model=APIResponse)
async def list_payouts(
    payout_type: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    q = select(Payout)
    if payout_type:
        q = q.where(Payout.payout_type == payout_type)
    if status:
        q = q.where(Payout.status == status)
    q = q.order_by(Payout.created_at.desc())

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar() or 0

    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    items = []
    for p in result.scalars().all():
        items.append({
            "id": p.id,
            "payout_type": p.payout_type,
            "recipient_name": p.recipient_name,
            "amount_paise": p.amount_paise,
            "payment_method": p.payment_method,
            "status": p.status,
            "utr": p.utr,
            "narration": p.narration,
            "reference_type": p.reference_type,
            "reference_id": p.reference_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "processed_at": p.processed_at.isoformat() if p.processed_at else None,
            "failure_reason": p.failure_reason,
            "razorpay_payout_id": p.razorpay_payout_id,
        })

    pages = (total + limit - 1) // limit
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


# ─── Razorpay Balance ──────────────────────────────────────────────────────────


@router.get("/razorpay/balance", response_model=APIResponse)
async def razorpay_balance(
    current_user: TokenData = Depends(get_current_user),
):
    _require_finance(current_user)
    try:
        from app.services import razorpay_payout_service as rpx
        balance = await rpx.get_balance()
        return APIResponse(success=True, data={"balance_paise": balance})
    except Exception as e:
        return APIResponse(success=True, data={"balance_paise": 0, "error": str(e)[:200]})


# ─── Webhook ────────────────────────────────────────────────────────────────────


@router.post("/webhooks/razorpay-payout")
async def razorpay_payout_webhook(
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle Razorpay payout webhook events. No auth — verify signature instead."""
    event = body.get("event", "")
    if not event.startswith("payout."):
        return {"status": "ignored"}

    result = await payment_service.handle_webhook(db, event, body)
    return result


# ─── Trip Driver Advance ────────────────────────────────────────────────────────

DRIVER_ADVANCE_AMOUNT = 1500  # Fixed ₹1500 advance


@router.get("/driver-advance-requests", response_model=APIResponse)
async def list_driver_advance_requests(
    status: Optional[str] = Query("PENDING"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Finance Manager: list advance requests submitted by drivers via the app."""
    _require_finance(current_user)
    from app.models.postgres.driver_requests import DriverAdvanceRequest, AdvanceStatusEnum
    from app.models.postgres.driver import Driver

    q = (
        select(DriverAdvanceRequest, Driver)
        .join(Driver, Driver.id == DriverAdvanceRequest.driver_id)
        .order_by(DriverAdvanceRequest.created_at.desc())
        .limit(limit)
    )
    if status and status.upper() != "ALL":
        try:
            q = q.where(DriverAdvanceRequest.status == AdvanceStatusEnum(status.upper()))
        except ValueError:
            pass

    result = await db.execute(q)
    rows = result.all()

    data = []
    for adv, driver in rows:
        trip_number = None
        origin = None
        destination = None
        if adv.trip_id:
            trip_r = await db.execute(select(Trip).where(Trip.id == adv.trip_id))
            trip = trip_r.scalar_one_or_none()
            if trip:
                trip_number = trip.trip_number
                origin = trip.origin
                destination = trip.destination

        data.append({
            "id": adv.id,
            "driver_id": adv.driver_id,
            "driver_name": f"{driver.first_name or ''} {driver.last_name or ''}".strip() or "Driver",
            "driver_phone": driver.phone,
            "trip_id": adv.trip_id,
            "trip_number": trip_number,
            "origin": origin,
            "destination": destination,
            "amount": float(adv.amount),
            "status": adv.status.value,
            "review_note": adv.review_note,
            "created_at": adv.created_at.isoformat() if adv.created_at else None,
        })

    pending = sum(1 for d in data if d["status"] == "PENDING")
    return APIResponse(
        success=True,
        data=data,
        message=f"{pending} pending advance request(s)",
    )


@router.post("/driver-advance-requests/{advance_id}/approve", response_model=APIResponse)
async def approve_driver_advance_request(
    advance_id: int,
    note: Optional[str] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Finance Manager approves a driver advance request."""
    _require_finance(current_user)
    from app.models.postgres.driver_requests import DriverAdvanceRequest, AdvanceStatusEnum
    from app.models.postgres.driver import Driver
    from app.services.notification_service import notification_service

    result = await db.execute(
        select(DriverAdvanceRequest).where(DriverAdvanceRequest.id == advance_id)
    )
    adv = result.scalar_one_or_none()
    if not adv:
        raise HTTPException(status_code=404, detail="Advance request not found")
    if adv.status != AdvanceStatusEnum.PENDING:
        raise HTTPException(status_code=400, detail="Advance request already processed")

    adv.status = AdvanceStatusEnum.APPROVED
    adv.reviewed_by = current_user.user_id
    adv.reviewed_at = datetime.utcnow()
    adv.review_note = note
    await db.commit()
    await db.refresh(adv)

    # Notify driver
    dr_r = await db.execute(select(Driver).where(Driver.id == adv.driver_id))
    dr = dr_r.scalar_one_or_none()
    if dr and dr.user_id:
        try:
            await notification_service.send(
                db,
                event_type="ADVANCE_REQUEST_APPROVED",
                title="Advance Request Approved",
                body=f"Your advance request of ₹{int(adv.amount)} has been approved by the Finance Manager.",
                target_user_ids=[dr.user_id],
                data={"advance_id": str(adv.id), "amount": str(adv.amount)},
                urgency="normal",
                triggered_by=current_user.user_id,
            )
        except Exception:
            pass

    return APIResponse(success=True, data={"id": adv.id, "status": "APPROVED"})


@router.post("/driver-advance-requests/{advance_id}/reject", response_model=APIResponse)
async def reject_driver_advance_request(
    advance_id: int,
    note: Optional[str] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Finance Manager rejects a driver advance request."""
    _require_finance(current_user)
    from app.models.postgres.driver_requests import DriverAdvanceRequest, AdvanceStatusEnum
    from app.models.postgres.driver import Driver
    from app.services.notification_service import notification_service

    result = await db.execute(
        select(DriverAdvanceRequest).where(DriverAdvanceRequest.id == advance_id)
    )
    adv = result.scalar_one_or_none()
    if not adv:
        raise HTTPException(status_code=404, detail="Advance request not found")
    if adv.status != AdvanceStatusEnum.PENDING:
        raise HTTPException(status_code=400, detail="Advance request already processed")

    adv.status = AdvanceStatusEnum.REJECTED
    adv.reviewed_by = current_user.user_id
    adv.reviewed_at = datetime.utcnow()
    adv.review_note = note
    await db.commit()
    await db.refresh(adv)

    # Notify driver
    dr_r = await db.execute(select(Driver).where(Driver.id == adv.driver_id))
    dr = dr_r.scalar_one_or_none()
    if dr and dr.user_id:
        try:
            await notification_service.send(
                db,
                event_type="ADVANCE_REQUEST_REJECTED",
                title="Advance Request Rejected",
                body=f"Your advance request of ₹{int(adv.amount)} has been rejected by the Finance Manager.",
                target_user_ids=[dr.user_id],
                data={"advance_id": str(adv.id), "amount": str(adv.amount)},
                urgency="normal",
                triggered_by=current_user.user_id,
            )
        except Exception:
            pass

    return APIResponse(success=True, data={"id": adv.id, "status": "REJECTED"})


@router.get("/pending-advance-trips", response_model=APIResponse)
async def pending_advance_trips(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """List trips where driver has uploaded a loading photo but advance has not been paid yet."""
    _require_finance(current_user)
    from app.models.postgres.trip import Trip, TripStatusEnum
    from app.models.postgres.driver import Driver

    q = (
        select(Trip)
        .where(
            Trip.loaded_image_url.isnot(None),
            Trip.advance_paid == False,
            Trip.advance_dismissed == False,
            Trip.is_deleted == False,
            Trip.status.notin_([TripStatusEnum.CANCELLED]),
        )
        .order_by(Trip.id.desc())
    )
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(q.offset(offset).limit(limit))
    trips = result.scalars().all()

    items = []
    for t in trips:
        status_val = getattr(t.status, 'value', str(t.status))
        # Resolve driver name
        driver_name = t.driver_name or "Unknown"
        if t.driver_id:
            dr_res = await db.execute(select(Driver).where(Driver.id == t.driver_id))
            dr = dr_res.scalar_one_or_none()
            if dr:
                driver_name = f"{dr.first_name or ''} {dr.last_name or ''}".strip() or driver_name
        items.append({
            "id": t.id,
            "trip_number": t.trip_number,
            "origin": t.origin,
            "destination": t.destination,
            "trip_date": str(t.trip_date) if t.trip_date else None,
            "status": status_val,
            "driver_name": driver_name,
            "driver_id": t.driver_id,
            "vehicle_registration": t.vehicle_registration,
            "loaded_image_url": t.loaded_image_url,
            "advance_amount": DRIVER_ADVANCE_AMOUNT,
        })

    pages = (total + limit - 1) // limit
    return APIResponse(
        success=True,
        data=items,
        pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages),
        message=f"{total} trip(s) awaiting advance payment",
    )


@router.post("/trips/{trip_id}/pay-advance", response_model=APIResponse)
async def pay_trip_advance(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Finance Manager pays the fixed ₹1500 advance to the driver after loading photo is uploaded."""
    _require_finance(current_user)
    from app.models.postgres.trip import Trip
    from app.models.postgres.driver import Driver
    from app.models.postgres.user import User
    from app.services.notification_service import notification_service
    from datetime import datetime

    # Fetch trip
    trip_res = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.is_deleted == False)
    )
    trip = trip_res.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if not trip.loaded_image_url:
        raise HTTPException(status_code=400, detail="Driver has not uploaded the loading photo yet")

    if trip.advance_paid:
        raise HTTPException(status_code=400, detail="Advance has already been paid for this trip")

    # Resolve Finance Manager's full name
    fm_res = await db.execute(select(User).where(User.id == current_user.user_id))
    fm_user = fm_res.scalar_one_or_none()
    fm_name = (
        f"{fm_user.first_name or ''} {fm_user.last_name or ''}".strip()
        if fm_user else "Finance Manager"
    )

    # Mark advance as paid
    trip.advance_paid = True
    trip.advance_paid_at = datetime.utcnow()
    trip.advance_paid_by_id = current_user.user_id
    trip.advance_paid_by_name = fm_name
    trip.driver_advance = DRIVER_ADVANCE_AMOUNT
    await db.commit()
    await db.refresh(trip)

    trip_number = trip.trip_number
    notif_body = (
        f"Advance of Rupees {DRIVER_ADVANCE_AMOUNT} has been paid for trip {trip_number} "
        f"by the finance manager {fm_name}"
    )

    # Resolve driver's user_id for direct notification
    driver_user_ids = []
    if trip.driver_id:
        dr_res = await db.execute(select(Driver).where(Driver.id == trip.driver_id))
        dr = dr_res.scalar_one_or_none()
        if dr and dr.user_id:
            driver_user_ids = [dr.user_id]

    try:
        await notification_service.send(
            db,
            event_type="DRIVER_ADVANCE_PAID",
            title="Advance Payment Done",
            body=notif_body,
            target_roles=["FLEET_MANAGER"],
            target_user_ids=driver_user_ids,
            data={"trip_id": str(trip_id), "amount": str(DRIVER_ADVANCE_AMOUNT)},
            urgency="high",
            triggered_by=current_user.user_id,
        )
    except Exception:
        pass

    return APIResponse(
        success=True,
        data={
            "trip_id": trip_id,
            "trip_number": trip_number,
            "advance_amount": DRIVER_ADVANCE_AMOUNT,
            "paid_by": fm_name,
            "paid_at": trip.advance_paid_at.isoformat() if trip.advance_paid_at else None,
        },
        message=f"Advance of ₹{DRIVER_ADVANCE_AMOUNT} paid successfully",
    )


@router.post("/trips/{trip_id}/reject-advance", response_model=APIResponse)
async def reject_trip_advance(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Finance Manager dismisses/rejects a pending advance payment for a trip."""
    _require_finance(current_user)
    from app.models.postgres.trip import Trip

    trip_res = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.is_deleted == False)
    )
    trip = trip_res.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.advance_paid:
        raise HTTPException(status_code=400, detail="Advance has already been paid")
    if trip.advance_dismissed:
        raise HTTPException(status_code=400, detail="Advance already dismissed")

    trip.advance_dismissed = True
    await db.commit()

    return APIResponse(
        success=True,
        data={"trip_id": trip_id},
        message="Advance payment dismissed",
    )
