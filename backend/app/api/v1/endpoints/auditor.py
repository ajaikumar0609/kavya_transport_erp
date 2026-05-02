# Auditor Module Endpoints
# Read-only analytics: LR profitability, fuel efficiency, trip delay/deviation,
# empty run detection, client risk scoring, tyre/maintenance audit, risk scores.

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import date, datetime, timedelta
from decimal import Decimal
import csv, io

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.middleware.permissions import require_permission, Permissions
from app.schemas.base import APIResponse

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _f(v) -> float:
    if v is None:
        return 0.0
    return float(Decimal(str(v))) if not isinstance(v, float) else v


def _resolve_range(from_raw: Optional[str], to_raw: Optional[str]):
    today = date.today()
    month_start = today.replace(day=1)
    try:
        from_date = date.fromisoformat(from_raw.strip()) if from_raw and from_raw.strip() else month_start
    except ValueError:
        from_date = month_start
    try:
        to_date = date.fromisoformat(to_raw.strip()) if to_raw and to_raw.strip() else today
    except ValueError:
        to_date = today
    if from_date > to_date:
        from_date, to_date = to_date, from_date
    return from_date, to_date


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. DASHBOARD — aggregated audit overview
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/dashboard", response_model=APIResponse)
async def auditor_dashboard(
    from_date_raw: Optional[str] = Query(None, alias="from_date"),
    to_date_raw: Optional[str] = Query(None, alias="to_date"),
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.REPORT_VIEW)),
):
    """Aggregated auditor overview — KPIs, risk scores, exception counts, trends."""
    from app.models.postgres.trip import Trip, TripExpense, TripFuelEntry, TripStatusEnum, ExpenseCategory
    from app.models.postgres.finance import Invoice, Payment, InvoiceStatus
    from app.models.postgres.vehicle import Vehicle, VehicleMaintenance
    from app.models.postgres.lr import LR
    from app.models.postgres.client import Client
    from sqlalchemy import cast, Float

    from_date, to_date = _resolve_range(from_date_raw, to_date_raw)
    today = date.today()

    # ── 1. Trip KPIs ──────────────────────────────────────────────────────────
    trip_rows = (await db.execute(
        select(
            Trip.id,
            Trip.planned_start, Trip.planned_end,
            Trip.actual_start, Trip.actual_end,
            Trip.planned_distance_km, Trip.actual_distance_km,
            Trip.revenue, Trip.total_expense, Trip.fuel_cost,
            Trip.status, Trip.driver_id,
        ).where(
            Trip.is_deleted.is_(False),
            Trip.trip_date >= from_date,
            Trip.trip_date <= to_date,
        )
    )).all()

    total_trips = len(trip_rows)
    delayed_trips = 0
    deviated_trips = 0
    empty_runs = 0
    total_revenue = 0.0
    total_trip_expense = 0.0
    delay_minutes_list = []

    for t in trip_rows:
        rev = _f(t.revenue)
        exp = _f(t.total_expense)
        total_revenue += rev
        total_trip_expense += exp

        # Delay: actual_end > planned_end
        if t.planned_end and t.actual_end:
            diff = (t.actual_end - t.planned_end).total_seconds() / 60
            if diff > 60:  # > 1 hour late
                delayed_trips += 1
                delay_minutes_list.append(diff)

        # Distance deviation > 15%
        if t.planned_distance_km and t.actual_distance_km:
            planned = _f(t.planned_distance_km)
            actual = _f(t.actual_distance_km)
            if planned > 0 and abs(actual - planned) / planned > 0.15:
                deviated_trips += 1

        # Empty run: completed trip with no revenue
        if t.status and str(t.status).upper() in ("COMPLETED", "CLOSED") and rev == 0:
            empty_runs += 1

    avg_delay_min = round(sum(delay_minutes_list) / len(delay_minutes_list), 1) if delay_minutes_list else 0

    # ── 2. Expense anomalies ───────────────────────────────────────────────────
    exp_rows = (await db.execute(
        select(
            TripExpense.id,
            TripExpense.anomaly_flag,
            TripExpense.receipt_url,
            TripExpense.amount,
        ).join(Trip, Trip.id == TripExpense.trip_id).where(
            Trip.is_deleted.is_(False),
            Trip.trip_date >= from_date,
            Trip.trip_date <= to_date,
        )
    )).all()

    total_expenses_count = len(exp_rows)
    flagged_expenses = sum(1 for e in exp_rows if e.anomaly_flag)
    no_receipt_expenses = sum(1 for e in exp_rows if not e.receipt_url)

    # ── 3. Outstanding receivables ────────────────────────────────────────────
    inv_rows = (await db.execute(
        select(
            Invoice.amount_due,
            Invoice.due_date,
            Invoice.status,
        ).where(
            Invoice.is_deleted.is_(False),
            Invoice.invoice_date >= from_date,
            Invoice.invoice_date <= to_date,
        )
    )).all()

    overdue_amount = sum(_f(r.amount_due) for r in inv_rows if r.due_date and r.due_date < today and _f(r.amount_due) > 0)
    disputed_count = sum(1 for r in inv_rows if str(r.status).upper() == "DISPUTED")

    # ── 4. Maintenance overdue ────────────────────────────────────────────────
    vehicles_due = (await db.execute(
        select(func.count(Vehicle.id)).where(
            Vehicle.is_deleted.is_(False),
            or_(
                Vehicle.fitness_valid_until < today,
                Vehicle.permit_valid_until < today,
                Vehicle.insurance_valid_until < today,
                Vehicle.puc_valid_until < today,
            )
        )
    )).scalar() or 0

    service_overdue = (await db.execute(
        select(func.count(VehicleMaintenance.id)).where(
            VehicleMaintenance.next_service_date < today,
            VehicleMaintenance.status != "completed",
        )
    )).scalar() or 0

    # ── 5. Composite risk score (0-100) ───────────────────────────────────────
    # Weighted signals — higher = more risk
    risk_signals = []
    if total_trips > 0:
        risk_signals.append(min(30, (delayed_trips / total_trips) * 60))
        risk_signals.append(min(20, (empty_runs / total_trips) * 40))
    if total_expenses_count > 0:
        risk_signals.append(min(20, (flagged_expenses / total_expenses_count) * 60))
        risk_signals.append(min(15, (no_receipt_expenses / total_expenses_count) * 30))
    if overdue_amount > 0 and total_revenue > 0:
        risk_signals.append(min(15, (overdue_amount / (total_revenue or 1)) * 30))
    risk_score = round(min(100, sum(risk_signals)), 1)
    risk_level = "LOW" if risk_score < 30 else "MEDIUM" if risk_score < 60 else "HIGH"

    # ── 6. Monthly trend (last 6 months) ─────────────────────────────────────
    six_months_ago = today.replace(day=1) - timedelta(days=150)
    trend_rows = (await db.execute(
        select(
            func.date_trunc("month", Trip.trip_date).label("month"),
            func.count(Trip.id).label("trips"),
            func.coalesce(func.sum(Trip.revenue), 0).label("revenue"),
            func.coalesce(func.sum(Trip.total_expense), 0).label("expenses"),
        ).where(
            Trip.is_deleted.is_(False),
            Trip.trip_date >= six_months_ago,
        ).group_by("month").order_by("month")
    )).all()

    monthly_trend = [
        {
            "month": str(r.month)[:7] if r.month else "",
            "trips": int(r.trips or 0),
            "revenue": _f(r.revenue),
            "expenses": _f(r.expenses),
            "profit": _f(r.revenue) - _f(r.expenses),
        }
        for r in trend_rows
    ]

    return APIResponse(
        success=True,
        data={
            "period": {"from": str(from_date), "to": str(to_date)},
            "risk_score": risk_score,
            "risk_level": risk_level,
            "kpis": {
                "total_trips": total_trips,
                "total_revenue": total_revenue,
                "total_expense": total_trip_expense,
                "net_profit": total_revenue - total_trip_expense,
                "profit_margin_pct": round((total_revenue - total_trip_expense) / total_revenue * 100, 2) if total_revenue > 0 else 0,
            },
            "exceptions": {
                "delayed_trips": delayed_trips,
                "deviated_trips": deviated_trips,
                "empty_runs": empty_runs,
                "avg_delay_minutes": avg_delay_min,
                "flagged_expenses": flagged_expenses,
                "no_receipt_expenses": no_receipt_expenses,
                "overdue_invoices_amount": overdue_amount,
                "disputed_invoices": disputed_count,
                "vehicles_docs_overdue": int(vehicles_due),
                "service_overdue": int(service_overdue),
            },
            "monthly_trend": monthly_trend,
        },
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. TRIP AUDIT — delay, distance deviation, empty runs
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/trips", response_model=APIResponse)
async def audit_trips(
    from_date_raw: Optional[str] = Query(None, alias="from_date"),
    to_date_raw: Optional[str] = Query(None, alias="to_date"),
    flag: Optional[str] = Query(None, description="delayed | deviated | empty_run | all"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.TRIP_READ)),
):
    """Trip-level audit: delay analysis, distance deviation, empty run detection."""
    from app.models.postgres.trip import Trip, TripStatusEnum
    from app.models.postgres.vehicle import Vehicle
    from app.models.postgres.driver import Driver

    from_date, to_date = _resolve_range(from_date_raw, to_date_raw)

    rows = (await db.execute(
        select(
            Trip.id, Trip.trip_number, Trip.trip_date,
            Trip.origin, Trip.destination,
            Trip.planned_start, Trip.planned_end,
            Trip.actual_start, Trip.actual_end,
            Trip.planned_distance_km, Trip.actual_distance_km,
            Trip.revenue, Trip.total_expense, Trip.fuel_cost,
            Trip.driver_name, Trip.vehicle_registration,
            Trip.status,
        ).where(
            Trip.is_deleted.is_(False),
            Trip.trip_date >= from_date,
            Trip.trip_date <= to_date,
        ).order_by(Trip.trip_date.desc())
    )).all()

    results = []
    for t in rows:
        planned_km = _f(t.planned_distance_km)
        actual_km = _f(t.actual_distance_km)
        rev = _f(t.revenue)
        status_str = str(t.status).upper() if t.status else ""

        # Delay
        delay_min = 0
        is_delayed = False
        if t.planned_end and t.actual_end:
            delay_min = round((t.actual_end - t.planned_end).total_seconds() / 60, 0)
            is_delayed = delay_min > 60

        # Distance deviation
        deviation_pct = 0.0
        is_deviated = False
        if planned_km > 0 and actual_km > 0:
            deviation_pct = round((actual_km - planned_km) / planned_km * 100, 2)
            is_deviated = abs(deviation_pct) > 15

        # Empty run
        is_empty = status_str in ("COMPLETED", "CLOSED") and rev == 0

        # Apply filter
        if flag == "delayed" and not is_delayed:
            continue
        if flag == "deviated" and not is_deviated:
            continue
        if flag == "empty_run" and not is_empty:
            continue

        results.append({
            "id": t.id,
            "trip_number": t.trip_number,
            "trip_date": str(t.trip_date),
            "origin": t.origin,
            "destination": t.destination,
            "driver": t.driver_name,
            "vehicle": t.vehicle_registration,
            "status": status_str,
            "planned_km": planned_km,
            "actual_km": actual_km,
            "distance_deviation_pct": deviation_pct,
            "is_deviated": is_deviated,
            "planned_end": t.planned_end.isoformat() if t.planned_end else None,
            "actual_end": t.actual_end.isoformat() if t.actual_end else None,
            "delay_minutes": int(delay_min),
            "is_delayed": is_delayed,
            "revenue": rev,
            "total_expense": _f(t.total_expense),
            "fuel_cost": _f(t.fuel_cost),
            "profit": rev - _f(t.total_expense),
            "is_empty_run": is_empty,
        })

    total = len(results)
    offset = (page - 1) * per_page
    paginated = results[offset: offset + per_page]

    return APIResponse(
        success=True,
        data={
            "items": paginated,
            "total": total,
            "page": page,
            "per_page": per_page,
            "summary": {
                "total_trips": total,
                "delayed": sum(1 for r in results if r["is_delayed"]),
                "deviated": sum(1 for r in results if r["is_deviated"]),
                "empty_runs": sum(1 for r in results if r["is_empty_run"]),
            },
        },
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. LR PROFITABILITY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/lr-profitability", response_model=APIResponse)
async def lr_profitability(
    from_date_raw: Optional[str] = Query(None, alias="from_date"),
    to_date_raw: Optional[str] = Query(None, alias="to_date"),
    sort_by: str = Query("profit", description="profit | revenue | margin"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.REPORT_VIEW)),
):
    """Per-LR profitability: freight income vs trip costs attributed to each LR."""
    from app.models.postgres.lr import LR, LRItem
    from app.models.postgres.trip import Trip

    from_date, to_date = _resolve_range(from_date_raw, to_date_raw)

    rows = (await db.execute(
        select(
            LR.id, LR.lr_number, LR.lr_date,
            LR.origin, LR.destination,
            LR.consignor_name, LR.consignee_name,
            LR.freight_amount, LR.loading_charges, LR.unloading_charges,
            LR.detention_charges, LR.other_charges, LR.total_freight,
            LR.status,
            Trip.total_expense, Trip.fuel_cost, Trip.driver_pay,
            Trip.trip_number, Trip.vehicle_registration,
        )
        .outerjoin(Trip, Trip.id == LR.trip_id)
        .where(
            LR.is_deleted.is_(False),
            LR.lr_date >= from_date,
            LR.lr_date <= to_date,
        )
        .order_by(LR.lr_date.desc())
    )).all()

    items = []
    for r in rows:
        revenue = _f(r.total_freight)
        # Attribute proportional trip costs (if multiple LRs on same trip, use freight ratio)
        trip_exp = _f(r.total_expense)
        trip_fuel = _f(r.fuel_cost)
        trip_driver = _f(r.driver_pay)
        direct_costs = trip_exp  # simplified: full trip cost attributed to this LR
        profit = revenue - direct_costs
        margin = round(profit / revenue * 100, 2) if revenue > 0 else 0.0

        items.append({
            "id": r.id,
            "lr_number": r.lr_number,
            "lr_date": str(r.lr_date),
            "origin": r.origin,
            "destination": r.destination,
            "consignor": r.consignor_name,
            "consignee": r.consignee_name,
            "trip_number": r.trip_number,
            "vehicle": r.vehicle_registration,
            "status": str(r.status) if r.status else "",
            "freight_amount": _f(r.freight_amount),
            "loading_charges": _f(r.loading_charges),
            "unloading_charges": _f(r.unloading_charges),
            "detention_charges": _f(r.detention_charges),
            "other_charges": _f(r.other_charges),
            "total_revenue": revenue,
            "trip_expense": trip_exp,
            "fuel_cost": trip_fuel,
            "driver_pay": trip_driver,
            "profit": profit,
            "margin_pct": margin,
            "is_loss": profit < 0,
        })

    # Sort
    reverse = sort_by in ("profit", "revenue", "margin")
    key_map = {"profit": "profit", "revenue": "total_revenue", "margin": "margin_pct"}
    key = key_map.get(sort_by, "profit")
    items.sort(key=lambda x: x[key], reverse=reverse)

    total = len(items)
    offset = (page - 1) * per_page
    paginated = items[offset: offset + per_page]

    total_revenue = sum(i["total_revenue"] for i in items)
    total_profit = sum(i["profit"] for i in items)

    return APIResponse(
        success=True,
        data={
            "items": paginated,
            "total": total,
            "page": page,
            "per_page": per_page,
            "summary": {
                "total_lrs": total,
                "total_revenue": total_revenue,
                "total_profit": total_profit,
                "avg_margin_pct": round(total_profit / total_revenue * 100, 2) if total_revenue > 0 else 0,
                "loss_making_lrs": sum(1 for i in items if i["is_loss"]),
            },
        },
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. FUEL EFFICIENCY (mileage audit)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/fuel-efficiency", response_model=APIResponse)
async def fuel_efficiency(
    from_date_raw: Optional[str] = Query(None, alias="from_date"),
    to_date_raw: Optional[str] = Query(None, alias="to_date"),
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.REPORT_VIEW)),
):
    """Per-vehicle and per-trip fuel efficiency: actual vs benchmark mileage."""
    from app.models.postgres.trip import Trip
    from app.models.postgres.vehicle import Vehicle

    from_date, to_date = _resolve_range(from_date_raw, to_date_raw)

    rows = (await db.execute(
        select(
            Trip.id, Trip.trip_number, Trip.trip_date,
            Trip.vehicle_registration,
            Trip.start_odometer, Trip.end_odometer,
            Trip.actual_fuel_litres, Trip.estimated_fuel_litres,
            Trip.fuel_cost,
            Vehicle.mileage_per_litre.label("benchmark_mileage"),
            Vehicle.registration_number,
        )
        .outerjoin(Vehicle, Vehicle.id == Trip.vehicle_id)
        .where(
            Trip.is_deleted.is_(False),
            Trip.trip_date >= from_date,
            Trip.trip_date <= to_date,
            Trip.actual_fuel_litres.isnot(None),
            Trip.actual_fuel_litres > 0,
        )
        .order_by(Trip.trip_date.desc())
    )).all()

    trip_items = []
    vehicle_map: dict = {}

    for r in rows:
        start_odo = _f(r.start_odometer)
        end_odo = _f(r.end_odometer)
        actual_litres = _f(r.actual_fuel_litres)
        est_litres = _f(r.estimated_fuel_litres)
        benchmark = _f(r.benchmark_mileage)

        km_run = end_odo - start_odo if end_odo > start_odo else 0
        actual_mileage = round(km_run / actual_litres, 2) if actual_litres > 0 and km_run > 0 else 0
        efficiency_pct = round((actual_mileage / benchmark * 100) - 100, 2) if benchmark > 0 and actual_mileage > 0 else 0
        fuel_variance = actual_litres - est_litres if est_litres > 0 else 0

        vrn = r.vehicle_registration or r.registration_number or "Unknown"

        item = {
            "trip_id": r.id,
            "trip_number": r.trip_number,
            "trip_date": str(r.trip_date),
            "vehicle": vrn,
            "km_run": round(km_run, 2),
            "actual_litres": round(actual_litres, 2),
            "estimated_litres": round(est_litres, 2),
            "fuel_variance_litres": round(fuel_variance, 2),
            "actual_mileage_kmpl": actual_mileage,
            "benchmark_mileage_kmpl": benchmark,
            "efficiency_pct": efficiency_pct,
            "fuel_cost": _f(r.fuel_cost),
            "is_inefficient": efficiency_pct < -15 if benchmark > 0 else False,
        }
        trip_items.append(item)

        # Aggregate per vehicle
        if vrn not in vehicle_map:
            vehicle_map[vrn] = {"vehicle": vrn, "trips": 0, "total_km": 0, "total_litres": 0, "total_cost": 0}
        vehicle_map[vrn]["trips"] += 1
        vehicle_map[vrn]["total_km"] += km_run
        vehicle_map[vrn]["total_litres"] += actual_litres
        vehicle_map[vrn]["total_cost"] += _f(r.fuel_cost)

    vehicle_summary = []
    for v in vehicle_map.values():
        avg_mileage = round(v["total_km"] / v["total_litres"], 2) if v["total_litres"] > 0 else 0
        vehicle_summary.append({**v, "avg_mileage_kmpl": avg_mileage})
    vehicle_summary.sort(key=lambda x: x["avg_mileage_kmpl"])

    inefficient_trips = sum(1 for t in trip_items if t["is_inefficient"])

    return APIResponse(
        success=True,
        data={
            "trips": trip_items,
            "vehicle_summary": vehicle_summary,
            "summary": {
                "total_trips_analyzed": len(trip_items),
                "inefficient_trips": inefficient_trips,
                "avg_mileage_kmpl": round(
                    sum(t["actual_mileage_kmpl"] for t in trip_items if t["actual_mileage_kmpl"] > 0)
                    / max(1, sum(1 for t in trip_items if t["actual_mileage_kmpl"] > 0)), 2
                ),
            },
        },
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. EXPENSE AUDIT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/expenses", response_model=APIResponse)
async def audit_expenses(
    from_date_raw: Optional[str] = Query(None, alias="from_date"),
    to_date_raw: Optional[str] = Query(None, alias="to_date"),
    flag: Optional[str] = Query(None, description="anomaly | no_receipt | all"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.EXPENSE_READ)),
):
    """Expense audit: anomaly-flagged, no-receipt, high-variance expenses."""
    from app.models.postgres.trip import Trip, TripExpense

    from_date, to_date = _resolve_range(from_date_raw, to_date_raw)

    rows = (await db.execute(
        select(
            TripExpense.id,
            TripExpense.category,
            TripExpense.amount,
            TripExpense.expense_date,
            TripExpense.receipt_url,
            TripExpense.anomaly_flag,
            TripExpense.anomaly_reason,
            TripExpense.expense_status,
            TripExpense.description,
            TripExpense.payment_mode,
            Trip.trip_number,
            Trip.driver_name,
            Trip.vehicle_registration,
        )
        .join(Trip, Trip.id == TripExpense.trip_id)
        .where(
            Trip.is_deleted.is_(False),
            func.date(TripExpense.expense_date) >= from_date,
            func.date(TripExpense.expense_date) <= to_date,
        )
        .order_by(TripExpense.expense_date.desc())
    )).all()

    # Category averages for variance
    cat_totals: dict = {}
    cat_counts: dict = {}
    for r in rows:
        cat = str(r.category) if r.category else "other"
        cat_totals[cat] = cat_totals.get(cat, 0) + _f(r.amount)
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    cat_avg = {k: cat_totals[k] / cat_counts[k] for k in cat_totals}

    items = []
    for r in rows:
        cat = str(r.category) if r.category else "other"
        amt = _f(r.amount)
        avg = cat_avg.get(cat, amt)
        variance_pct = round((amt - avg) / avg * 100, 2) if avg > 0 else 0
        is_high_variance = variance_pct > 50
        has_receipt = bool(r.receipt_url)
        is_anomaly = bool(r.anomaly_flag)

        if flag == "anomaly" and not is_anomaly:
            continue
        if flag == "no_receipt" and has_receipt:
            continue

        items.append({
            "id": r.id,
            "trip_number": r.trip_number,
            "driver": r.driver_name,
            "vehicle": r.vehicle_registration,
            "category": cat,
            "amount": amt,
            "category_avg": round(avg, 2),
            "variance_pct": variance_pct,
            "is_high_variance": is_high_variance,
            "has_receipt": has_receipt,
            "receipt_url": r.receipt_url,
            "is_anomaly": is_anomaly,
            "anomaly_reason": r.anomaly_reason,
            "status": str(r.expense_status) if r.expense_status else "",
            "payment_mode": r.payment_mode or "",
            "description": r.description or "",
            "expense_date": r.expense_date.isoformat() if r.expense_date else None,
        })

    total = len(items)
    offset = (page - 1) * per_page
    paginated = items[offset: offset + per_page]

    return APIResponse(
        success=True,
        data={
            "items": paginated,
            "total": total,
            "page": page,
            "per_page": per_page,
            "summary": {
                "total": total,
                "anomaly_flagged": sum(1 for i in items if i["is_anomaly"]),
                "no_receipt": sum(1 for i in items if not i["has_receipt"]),
                "high_variance": sum(1 for i in items if i["is_high_variance"]),
                "total_amount": sum(i["amount"] for i in items),
            },
        },
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. CLIENT RISK SCORING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/client-risk", response_model=APIResponse)
async def client_risk(
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.CLIENT_READ)),
):
    """Client risk scoring based on payment behaviour, overdue aging, and disputes."""
    from app.models.postgres.client import Client
    from app.models.postgres.finance import Invoice, InvoiceStatus

    today = date.today()

    clients = (await db.execute(
        select(Client.id, Client.name, Client.code, Client.credit_limit, Client.credit_days, Client.outstanding_amount)
        .where(Client.is_deleted.is_(False))
        .order_by(Client.name)
    )).all()

    results = []
    for c in clients:
        inv_rows = (await db.execute(
            select(
                Invoice.amount_due,
                Invoice.due_date,
                Invoice.status,
                Invoice.total_amount,
            ).where(
                Invoice.is_deleted.is_(False),
                Invoice.client_id == c.id,
                Invoice.amount_due > 0,
            )
        )).all()

        if not inv_rows:
            continue

        total_due = sum(_f(r.amount_due) for r in inv_rows)
        total_invoiced = sum(_f(r.total_amount) for r in inv_rows)
        overdue_30 = sum(_f(r.amount_due) for r in inv_rows if r.due_date and (today - r.due_date).days > 30)
        overdue_60 = sum(_f(r.amount_due) for r in inv_rows if r.due_date and (today - r.due_date).days > 60)
        overdue_90 = sum(_f(r.amount_due) for r in inv_rows if r.due_date and (today - r.due_date).days > 90)
        disputes = sum(1 for r in inv_rows if str(r.status).upper() == "DISPUTED")
        credit_limit = _f(c.credit_limit) or 1
        credit_utilization = min(100, round(total_due / credit_limit * 100, 1))

        # Risk score (0–100)
        score = 0.0
        score += min(30, (overdue_30 / max(1, total_due)) * 60)
        score += min(20, (overdue_60 / max(1, total_due)) * 40)
        score += min(20, (overdue_90 / max(1, total_due)) * 40)
        score += min(15, credit_utilization * 0.15)
        score += min(15, disputes * 5)
        score = round(min(100, score), 1)
        risk_level = "LOW" if score < 30 else "MEDIUM" if score < 60 else "HIGH"

        results.append({
            "client_id": c.id,
            "client_name": c.name,
            "client_code": c.code,
            "credit_limit": credit_limit,
            "credit_days": c.credit_days,
            "total_outstanding": total_due,
            "total_invoiced": total_invoiced,
            "overdue_30d": overdue_30,
            "overdue_60d": overdue_60,
            "overdue_90d": overdue_90,
            "disputes": disputes,
            "credit_utilization_pct": credit_utilization,
            "risk_score": score,
            "risk_level": risk_level,
        })

    results.sort(key=lambda x: x["risk_score"], reverse=True)

    return APIResponse(
        success=True,
        data={
            "clients": results,
            "summary": {
                "total_clients": len(results),
                "high_risk": sum(1 for r in results if r["risk_level"] == "HIGH"),
                "medium_risk": sum(1 for r in results if r["risk_level"] == "MEDIUM"),
                "low_risk": sum(1 for r in results if r["risk_level"] == "LOW"),
                "total_outstanding": sum(r["total_outstanding"] for r in results),
            },
        },
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. TYRE & MAINTENANCE AUDIT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/maintenance", response_model=APIResponse)
async def audit_maintenance(
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.VEHICLE_READ)),
):
    """Tyre health and maintenance audit across the fleet."""
    from app.models.postgres.vehicle import Vehicle, VehicleMaintenance, VehicleTyre

    today = date.today()

    vehicles = (await db.execute(
        select(
            Vehicle.id, Vehicle.registration_number, Vehicle.make, Vehicle.model,
            Vehicle.fitness_valid_until, Vehicle.permit_valid_until,
            Vehicle.insurance_valid_until, Vehicle.puc_valid_until,
            Vehicle.last_service_date, Vehicle.odometer_reading,
        ).where(Vehicle.is_deleted.is_(False)).order_by(Vehicle.registration_number)
    )).all()

    fleet_items = []
    for v in vehicles:
        # Compliance flags
        doc_alerts = []
        for label, expiry in [
            ("Fitness", v.fitness_valid_until),
            ("Permit", v.permit_valid_until),
            ("Insurance", v.insurance_valid_until),
            ("PUC", v.puc_valid_until),
        ]:
            if expiry:
                days_left = (expiry - today).days
                if days_left < 0:
                    doc_alerts.append({"doc": label, "status": "EXPIRED", "days": abs(days_left)})
                elif days_left <= 30:
                    doc_alerts.append({"doc": label, "status": "EXPIRING", "days": days_left})

        # Pending maintenance
        pending_services = (await db.execute(
            select(func.count(VehicleMaintenance.id)).where(
                VehicleMaintenance.vehicle_id == v.id,
                VehicleMaintenance.next_service_date < today,
                VehicleMaintenance.status != "completed",
            )
        )).scalar() or 0

        # Tyre health
        tyres = (await db.execute(
            select(
                VehicleTyre.tyre_number, VehicleTyre.position,
                VehicleTyre.condition, VehicleTyre.tread_depth_mm,
                VehicleTyre.retread_count, VehicleTyre.max_retreads,
                VehicleTyre.current_km,
            ).where(
                VehicleTyre.vehicle_id == v.id,
                VehicleTyre.is_active.is_(True),
            )
        )).all()

        tyre_alerts = []
        for tyre in tyres:
            if tyre.condition in ("worn", "replaced"):
                tyre_alerts.append({"tyre": tyre.tyre_number, "pos": tyre.position, "issue": tyre.condition.upper()})
            if tyre.tread_depth_mm is not None and _f(tyre.tread_depth_mm) < 2.0:
                tyre_alerts.append({"tyre": tyre.tyre_number, "pos": tyre.position, "issue": "LOW_TREAD"})
            if tyre.retread_count and tyre.max_retreads and tyre.retread_count >= tyre.max_retreads:
                tyre_alerts.append({"tyre": tyre.tyre_number, "pos": tyre.position, "issue": "MAX_RETREADS"})

        fleet_items.append({
            "vehicle_id": v.id,
            "registration": v.registration_number,
            "make": v.make or "",
            "model": v.model or "",
            "doc_alerts": doc_alerts,
            "doc_alert_count": len(doc_alerts),
            "pending_services": int(pending_services),
            "tyre_count": len(tyres),
            "tyre_alerts": tyre_alerts,
            "tyre_alert_count": len(tyre_alerts),
            "total_alerts": len(doc_alerts) + int(pending_services) + len(tyre_alerts),
            "last_service": str(v.last_service_date) if v.last_service_date else None,
        })

    fleet_items.sort(key=lambda x: x["total_alerts"], reverse=True)

    return APIResponse(
        success=True,
        data={
            "vehicles": fleet_items,
            "summary": {
                "total_vehicles": len(fleet_items),
                "vehicles_with_doc_alerts": sum(1 for v in fleet_items if v["doc_alert_count"] > 0),
                "vehicles_with_overdue_service": sum(1 for v in fleet_items if v["pending_services"] > 0),
                "vehicles_with_tyre_alerts": sum(1 for v in fleet_items if v["tyre_alert_count"] > 0),
                "total_tyre_alerts": sum(v["tyre_alert_count"] for v in fleet_items),
            },
        },
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. EXPORT (CSV)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/export/{report_type}")
async def export_audit_report(
    report_type: str,
    from_date_raw: Optional[str] = Query(None, alias="from_date"),
    to_date_raw: Optional[str] = Query(None, alias="to_date"),
    db: AsyncSession = Depends(get_db),
    _perm: TokenData = Depends(require_permission(Permissions.REPORT_VIEW)),
):
    """Export any auditor report as CSV. report_type: trips | lr | fuel | expenses | clients | maintenance"""
    from_date, to_date = _resolve_range(from_date_raw, to_date_raw)

    async def _get_data():
        if report_type == "trips":
            from app.models.postgres.trip import Trip
            rows = (await db.execute(
                select(Trip.trip_number, Trip.trip_date, Trip.origin, Trip.destination,
                       Trip.driver_name, Trip.vehicle_registration, Trip.status,
                       Trip.planned_distance_km, Trip.actual_distance_km,
                       Trip.planned_end, Trip.actual_end,
                       Trip.revenue, Trip.total_expense, Trip.fuel_cost)
                .where(Trip.is_deleted.is_(False), Trip.trip_date >= from_date, Trip.trip_date <= to_date)
                .order_by(Trip.trip_date.desc())
            )).all()
            headers = ["Trip No", "Date", "From", "To", "Driver", "Vehicle", "Status",
                       "Planned KM", "Actual KM", "Planned End", "Actual End",
                       "Revenue", "Expense", "Fuel Cost"]
            data = [list(r) for r in rows]

        elif report_type == "expenses":
            from app.models.postgres.trip import Trip, TripExpense
            rows = (await db.execute(
                select(Trip.trip_number, Trip.driver_name, TripExpense.category,
                       TripExpense.amount, TripExpense.expense_date,
                       TripExpense.payment_mode, TripExpense.anomaly_flag,
                       TripExpense.receipt_url, TripExpense.description)
                .join(Trip, Trip.id == TripExpense.trip_id)
                .where(Trip.is_deleted.is_(False),
                       func.date(TripExpense.expense_date) >= from_date,
                       func.date(TripExpense.expense_date) <= to_date)
                .order_by(TripExpense.expense_date.desc())
            )).all()
            headers = ["Trip No", "Driver", "Category", "Amount", "Date", "Mode", "Anomaly", "Receipt", "Description"]
            data = [list(r) for r in rows]

        elif report_type == "lr":
            from app.models.postgres.lr import LR
            rows = (await db.execute(
                select(LR.lr_number, LR.lr_date, LR.origin, LR.destination,
                       LR.consignor_name, LR.consignee_name,
                       LR.freight_amount, LR.total_freight, LR.status)
                .where(LR.is_deleted.is_(False), LR.lr_date >= from_date, LR.lr_date <= to_date)
                .order_by(LR.lr_date.desc())
            )).all()
            headers = ["LR No", "Date", "From", "To", "Consignor", "Consignee", "Freight", "Total Freight", "Status"]
            data = [list(r) for r in rows]

        elif report_type == "clients":
            from app.models.postgres.client import Client
            rows = (await db.execute(
                select(Client.name, Client.code, Client.credit_limit, Client.credit_days, Client.outstanding_amount)
                .where(Client.is_deleted.is_(False))
                .order_by(Client.name)
            )).all()
            headers = ["Client Name", "Code", "Credit Limit", "Credit Days", "Outstanding"]
            data = [list(r) for r in rows]

        else:
            headers = ["No Data"]
            data = []

        return headers, data

    headers, data = await _get_data()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in data:
        writer.writerow([str(v) if v is not None else "" for v in row])

    output.seek(0)
    filename = f"audit_{report_type}_{from_date}_{to_date}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
