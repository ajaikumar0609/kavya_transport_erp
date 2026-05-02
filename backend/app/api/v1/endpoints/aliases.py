from datetime import datetime
from datetime import time as time_cls

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenData, get_current_user
from app.db.mongodb.connection import MongoDB
from app.db.postgres.connection import get_db
from app.middleware.permissions import Permissions, require_permission
from app.models.postgres.trip import Trip, TripExpense, TripFuelEntry, TripStatusEnum
from app.models.postgres.user import EmployeeAttendance, User, Role, user_roles
from app.models.postgres.driver import Driver
from app.models.postgres.vehicle import Vehicle, VehicleMaintenance
from app.schemas.base import APIResponse
from app.schemas.trip import TripExpenseCreate
from app.services import dashboard_service, driver_service, eway_service, finance_service, trip_service
from app.services.notification_service import notification_service

router = APIRouter()


@router.get('/routes', response_model=APIResponse)
async def alias_routes(
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.JOB_READ)),
):
    routes, total = await finance_service.list_routes(db, page=page, limit=limit, search=search)
    items = [{c.key: getattr(r, c.key) for c in r.__table__.columns} for r in routes]
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.get('/ewb', response_model=APIResponse)
async def alias_ewb(
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.EWAY_READ)),
):
    bills, total = await eway_service.list_eway_bills(db, page=page, limit=limit, search=search, status=status)
    items = [await eway_service.get_eway_with_details(db, bill) for bill in bills]
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.get('/expenses', response_model=APIResponse)
async def alias_expenses(
    page: int = 1,
    limit: int = 20,
    trip_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.EXPENSE_READ)),
):
    offset = max(page - 1, 0) * limit
    query = select(TripExpense)
    count_query = select(func.count(TripExpense.id))

    if trip_id is not None:
        query = query.where(TripExpense.trip_id == trip_id)
        count_query = count_query.where(TripExpense.trip_id == trip_id)

    # Driver/employee views should only show their own expenses.
    if 'admin' not in [r.lower() for r in (current_user.roles or [])]:
        query = query.where(TripExpense.entered_by == current_user.user_id)
        count_query = count_query.where(TripExpense.entered_by == current_user.user_id)

    total = (await db.execute(count_query)).scalar() or 0
    rows = (
        await db.execute(
            query.order_by(TripExpense.expense_date.desc()).offset(offset).limit(limit)
        )
    ).scalars().all()
    items = [{
        'id': e.id,
        'trip_id': e.trip_id,
        'category': e.category.value if hasattr(e.category, 'value') else str(e.category),
        'amount': float(e.amount),
        'payment_mode': e.payment_mode,
        'description': e.description,
        'expense_date': e.expense_date.isoformat() if e.expense_date else None,
        'is_verified': bool(e.is_verified),
        'status': (e.expense_status.value.lower() if hasattr(e.expense_status, 'value') else str(e.expense_status or 'pending').lower()),
    } for e in rows]
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.post('/expenses', response_model=APIResponse, status_code=201)
async def alias_add_expense(
    data: TripExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.EXPENSE_CREATE)),
):
    """Add expense. Auto-resolves the driver's active trip."""
    # Resolve driver_id from current user
    result = await db.execute(select(Driver.id).where(Driver.user_id == current_user.user_id))
    driver_id = result.scalar_one_or_none()

    # Find an active trip for this driver
    active_statuses = [
        TripStatusEnum.STARTED,
        TripStatusEnum.LOADING,
        TripStatusEnum.IN_TRANSIT,
        TripStatusEnum.UNLOADING,
    ]
    trip_query = select(Trip.id).where(Trip.status.in_(active_statuses))
    if driver_id:
        trip_query = trip_query.where(Trip.driver_id == driver_id)
    trip_query = trip_query.order_by(Trip.updated_at.desc()).limit(1)
    trip_row = (await db.execute(trip_query)).scalar_one_or_none()

    if not trip_row:
        # Fallback: most recent non-cancelled trip for this driver
        fallback_query = (
            select(Trip.id)
            .where(Trip.status != TripStatusEnum.CANCELLED)
        )
        if driver_id:
            fallback_query = fallback_query.where(Trip.driver_id == driver_id)
        fallback_query = fallback_query.order_by(Trip.updated_at.desc()).limit(1)
        trip_row = (await db.execute(fallback_query)).scalar_one_or_none()

    if not trip_row:
        raise HTTPException(status_code=400, detail="No active trip found for this driver")

    # Biometric threshold enforcement (hardcoded ₹500 – system_config table may not exist)
    threshold = 500.0
    if data.amount >= threshold and not data.biometric_verified:
        raise HTTPException(
            status_code=400,
            detail=f"Biometric verification required for expenses >= ₹{threshold}",
        )

    expense_data = data.model_dump()
    expense = await trip_service.add_trip_expense(db, trip_row, expense_data, current_user.user_id)
    return APIResponse(success=True, data={"id": expense.id}, message="Expense added")


@router.patch('/expenses/{expense_id}/status', response_model=APIResponse)
async def alias_update_expense_status(
    expense_id: int,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.EXPENSE_APPROVE)),
):
    """Update expense status: approved / rejected / paid. Used by admin + accountant Flutter screens."""
    from app.models.postgres.trip import ExpenseStatusEnum

    expense = await db.get(TripExpense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    new_status = (payload.get('status') or '').strip().lower()
    valid = {'approved', 'rejected', 'paid'}
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")

    roles = {str(r).lower() for r in (current_user.roles or [])}
    is_admin_or_accountant = 'admin' in roles or 'accountant' in roles
    if not is_admin_or_accountant:
        raise HTTPException(status_code=403, detail="Only admin/accountant can change expense status")

    if new_status == 'approved':
        expense.is_verified = True
        expense.verified_by = current_user.user_id
        expense.verified_at = datetime.utcnow()
        expense.expense_status = ExpenseStatusEnum.APPROVED
    elif new_status == 'rejected':
        expense.is_verified = False
        expense.verified_by = current_user.user_id
        expense.verified_at = datetime.utcnow()
        expense.verification_remarks = payload.get('reason', 'Rejected')
        expense.expense_status = ExpenseStatusEnum.REJECTED
    elif new_status == 'paid':
        if expense.expense_status != ExpenseStatusEnum.APPROVED:
            raise HTTPException(status_code=400, detail="Only approved expenses can be marked as paid")
        expense.paid_by = current_user.user_id
        expense.paid_at = datetime.utcnow()
        expense.expense_status = ExpenseStatusEnum.PAID

    await db.commit()
    return APIResponse(success=True, message=f"Expense {new_status}")


@router.get('/fuel', response_model=APIResponse)
async def alias_fuel(
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.FUEL_READ)),
):
    offset = max(page - 1, 0) * limit
    total = (await db.execute(select(TripFuelEntry.id))).all()
    rows = (await db.execute(select(TripFuelEntry).order_by(TripFuelEntry.fuel_date.desc()).offset(offset).limit(limit))).scalars().all()
    items = [{
        'id': f.id,
        'trip_id': f.trip_id,
        'vehicle_id': f.vehicle_id,
        'date': f.fuel_date.isoformat() if f.fuel_date else None,
        'fuel_date': f.fuel_date.isoformat() if f.fuel_date else None,
        'vehicle': f.pump_name or f'Vehicle #{f.vehicle_id}',
        'driver': 'N/A',
        'litres': float(f.quantity_litres or 0),
        'quantity_litres': float(f.quantity_litres or 0),
        'cost_per_litre': float(f.rate_per_litre or 0),
        'rate_per_litre': float(f.rate_per_litre or 0),
        'total_cost': float(f.total_amount or 0),
        'total_amount': float(f.total_amount or 0),
        'odometer': 0,
        'mileage': 0,
        'station': f.pump_name or 'N/A',
        'pump_name': f.pump_name,
        'payment_mode': f.payment_mode or 'cash',
    } for f in rows]
    return APIResponse(success=True, data={'items': items, 'total': len(total), 'page': page, 'limit': limit}, message='ok')


@router.get('/attendance', response_model=APIResponse)
async def alias_attendance(
    page: int = 1,
    limit: int = 20,
    date: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    query = (
        select(EmployeeAttendance, User)
        .join(User, User.id == EmployeeAttendance.user_id)
    )

    requested_date = None
    if date:
        try:
            requested_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if requested_date:
        query = query.where(EmployeeAttendance.date == requested_date)

    # Admin can view all attendance; everyone else sees only their own.
    if 'admin' not in [r.lower() for r in current_user.roles]:
        query = query.where(EmployeeAttendance.user_id == current_user.user_id)

    total_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_query)).scalar() or 0

    offset = max(page - 1, 0) * limit
    rows = (await db.execute(
        query
        .order_by(EmployeeAttendance.date.desc(), EmployeeAttendance.check_in_time.desc())
        .offset(offset)
        .limit(limit)
    )).all()

    user_ids = [att.user_id for att, _user in rows]
    role_map: dict[int, list[str]] = {}
    if user_ids:
        role_rows = (await db.execute(
            select(user_roles.c.user_id, Role.name)
            .join(Role, Role.id == user_roles.c.role_id)
            .where(user_roles.c.user_id.in_(user_ids))
        )).all()
        for user_id, role_name in role_rows:
            role_map.setdefault(int(user_id), []).append(str(role_name))

    items = []
    for att, user in rows:
        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
        items.append({
            "id": att.id,
            "user_id": att.user_id,
            "employee_name": full_name,
            "employee_email": user.email,
            "employee_role": ", ".join(role_map.get(att.user_id, [])).replace('_', ' '),
            "date": att.date.isoformat() if att.date else None,
            "status": att.status,
            "check_in_time": att.check_in_time.isoformat() if att.check_in_time else None,
            "remarks": att.remarks,
            "check_in_photo_url": att.check_in_photo_url,
        })

    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.post('/attendance/check-in', response_model=APIResponse)
async def attendance_check_in(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    allowed_roles = {'driver', 'manager', 'fleet_manager', 'accountant', 'project_associate', 'pump_operator', 'clerk'}
    current_roles = {r.lower() for r in (current_user.roles or [])}
    if not current_roles.intersection(allowed_roles):
        raise HTTPException(status_code=403, detail='Attendance check-in is not enabled for this role')

    photo_data_url = payload.get('photo_data_url')
    remarks = payload.get('remarks')
    lat = payload.get('lat')
    lng = payload.get('lng')

    if not photo_data_url or not isinstance(photo_data_url, str):
        raise HTTPException(status_code=400, detail='Photo is required for attendance check-in')
    if not photo_data_url.startswith('data:image/'):
        raise HTTPException(status_code=400, detail='Invalid photo format')

    now = datetime.now()
    today = now.date()

    existing = (await db.execute(
        select(EmployeeAttendance)
        .where(EmployeeAttendance.user_id == current_user.user_id, EmployeeAttendance.date == today)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail='Attendance already marked for today')

    cutoff = time_cls(8, 30)
    status_value = 'late' if now.time() > cutoff else 'present'

    # Append location to remarks if provided
    location_note = f'Location: {lat:.6f}, {lng:.6f}' if (lat is not None and lng is not None) else None
    final_remarks = ', '.join(filter(None, [remarks, location_note])) or None

    entry = EmployeeAttendance(
        user_id=current_user.user_id,
        date=today,
        status=status_value,
        check_in_time=now,
        remarks=final_remarks,
        check_in_photo_url=photo_data_url,
    )
    db.add(entry)
    await db.flush()
    # Commit attendance now so it is persisted regardless of notification outcome
    await db.commit()

    # Notify fleet managers if the check-in is from a driver (non-fatal)
    if 'driver' in current_roles:
        try:
            driver_result = await db.execute(
                select(Driver).where(Driver.user_id == current_user.user_id)
            )
            driver_obj = driver_result.scalar_one_or_none()
            driver_name = (
                f"{driver_obj.first_name} {driver_obj.last_name or ''}".strip()
                if driver_obj else current_user.email or 'Driver'
            )
            date_label = today.strftime('%d %b %Y')
            await notification_service.send(
                db,
                event_type='DRIVER_ATTENDANCE',
                title='Driver Attendance',
                body=f'{driver_name} is present for {date_label}',
                target_roles=['FLEET_MANAGER'],
                data={'driver_id': str(driver_obj.id) if driver_obj else ''},
                urgency='normal',
                triggered_by=current_user.user_id,
            )
        except Exception as _notify_exc:
            import logging as _log
            _log.getLogger(__name__).warning(f"Attendance notification failed: {_notify_exc}")

    message = 'Attendance marked successfully'
    if status_value == 'late':
        message = 'Attendance marked as late (after 08:30 AM)'

    return APIResponse(
        success=True,
        data={
            'id': entry.id,
            'date': today.isoformat(),
            'status': status_value,
            'check_in_time': now.isoformat(),
        },
        message=message,
    )


@router.get('/checklists', response_model=APIResponse)
async def alias_checklists(
    page: int = 1,
    limit: int = 20,
    _user: TokenData = Depends(require_permission(Permissions.TRIP_READ)),
):
    if MongoDB.db is None:
        return APIResponse(success=True, data={'items': [], 'total': 0, 'page': page, 'limit': limit}, message='ok')

    skip = max(page - 1, 0) * limit
    cursor = MongoDB.db.driver_checklist_logs.find({}).sort('submitted_at', -1).skip(skip).limit(limit)
    items = []
    async for row in cursor:
        row['_id'] = str(row.get('_id'))
        items.append(row)

    total = await MongoDB.db.driver_checklist_logs.count_documents({})
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.get('/invoices', response_model=APIResponse)
async def alias_invoices(
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    status: str | None = None,
    client_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.INVOICE_READ)),
):
    invoices, total = await finance_service.list_invoices(db, page=page, limit=limit, search=search, status=status, client_id=client_id)
    items = [await finance_service.get_invoice_with_details(db, inv) for inv in invoices]
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.get('/banking', response_model=APIResponse)
async def alias_banking(
    page: int = 1,
    limit: int = 20,
    account_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.PAYMENT_READ)),
):
    txns, total = await finance_service.list_bank_transactions(db, account_id=account_id, page=page, limit=limit)
    items = [{c.key: getattr(t, c.key) for c in t.__table__.columns} for t in txns]
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.get('/ledger', response_model=APIResponse)
async def alias_ledger(
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.LEDGER_READ)),
):
    entries, total = await finance_service.list_ledger(db, page=page, limit=limit)
    items = [{c.key: getattr(e, c.key) for c in e.__table__.columns} for e in entries]
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


# --- Service / Maintenance CRUD ---

@router.get('/service', response_model=APIResponse)
async def alias_service_list(
    page: int = 1,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.MAINTENANCE_READ)),
):
    offset = max(page - 1, 0) * limit
    total_q = await db.execute(select(func.count(VehicleMaintenance.id)))
    total = total_q.scalar() or 0
    rows = (await db.execute(
        select(VehicleMaintenance, Vehicle.registration_number)
        .outerjoin(Vehicle, Vehicle.id == VehicleMaintenance.vehicle_id)
        .order_by(VehicleMaintenance.service_date.desc())
        .offset(offset).limit(limit)
    )).all()
    items = []
    for maint, reg_num in rows:
        items.append({
            'id': maint.id,
            'vehicle_id': maint.vehicle_id,
            'vehicle_number': reg_num,
            'service_type': maint.service_type or maint.maintenance_type,
            'service_date': str(maint.service_date) if maint.service_date else None,
            'odometer': float(maint.odometer_at_service) if maint.odometer_at_service else 0,
            'workshop': maint.vendor_name or '',
            'job_card_number': maint.invoice_number,
            'labour_cost': float(maint.labor_cost) if maint.labor_cost else 0,
            'total_cost': float(maint.total_cost) if maint.total_cost else 0,
            'next_service_km': float(maint.next_service_km) if maint.next_service_km else 0,
            'next_service_date': str(maint.next_service_date) if maint.next_service_date else None,
            'notes': maint.description,
            'status': (maint.status or 'completed').upper(),
        })
    return APIResponse(success=True, data={'items': items, 'total': total, 'page': page, 'limit': limit}, message='ok')


@router.post('/service', response_model=APIResponse, status_code=201)
async def alias_service_create(
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.MAINTENANCE_CREATE)),
):
    maint = VehicleMaintenance(
        vehicle_id=data.get('vehicle_id'),
        maintenance_type=data.get('service_type', 'SCHEDULED').lower(),
        service_type=data.get('service_type', 'SCHEDULED'),
        description=data.get('notes'),
        odometer_at_service=data.get('odometer'),
        service_date=data.get('service_date'),
        next_service_date=data.get('next_service_date') or None,
        next_service_km=data.get('next_service_km') or None,
        vendor_name=data.get('workshop'),
        invoice_number=data.get('job_card_number'),
        labor_cost=data.get('labour_cost', 0),
        total_cost=data.get('total_cost', 0),
        status='completed',
    )
    db.add(maint)
    await db.flush()
    return APIResponse(success=True, data={'id': maint.id}, message='Service record created')


@router.put('/service/{item_id}', response_model=APIResponse)
async def alias_service_update(
    item_id: int,
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.MAINTENANCE_CREATE)),
):
    result = await db.execute(select(VehicleMaintenance).where(VehicleMaintenance.id == item_id))
    maint = result.scalar_one_or_none()
    if not maint:
        raise HTTPException(status_code=404, detail='Service record not found')
    if 'vehicle_id' in data: maint.vehicle_id = data['vehicle_id']
    if 'service_type' in data:
        maint.service_type = data['service_type']
        maint.maintenance_type = data['service_type'].lower()
    if 'notes' in data: maint.description = data['notes']
    if 'odometer' in data: maint.odometer_at_service = data['odometer']
    if 'service_date' in data: maint.service_date = data['service_date']
    if 'next_service_date' in data: maint.next_service_date = data['next_service_date'] or None
    if 'next_service_km' in data: maint.next_service_km = data['next_service_km'] or None
    if 'workshop' in data: maint.vendor_name = data['workshop']
    if 'job_card_number' in data: maint.invoice_number = data['job_card_number']
    if 'labour_cost' in data: maint.labor_cost = data['labour_cost']
    if 'total_cost' in data: maint.total_cost = data['total_cost']
    await db.flush()
    return APIResponse(success=True, data={'id': maint.id}, message='Service record updated')


@router.delete('/service/{item_id}', response_model=APIResponse)
async def alias_service_delete(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _user: TokenData = Depends(require_permission(Permissions.MAINTENANCE_CREATE)),
):
    result = await db.execute(select(VehicleMaintenance).where(VehicleMaintenance.id == item_id))
    maint = result.scalar_one_or_none()
    if not maint:
        raise HTTPException(status_code=404, detail='Service record not found')
    await db.delete(maint)
    await db.flush()
    return APIResponse(success=True, message='Service record deleted')


@router.get('/notifications', response_model=APIResponse)
async def alias_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.ALERT_VIEW)),
):
    alerts = await dashboard_service.get_notifications(db, current_user.user_id)
    return APIResponse(success=True, data=alerts, message='ok')


@router.get('/notifications/unread-count', response_model=APIResponse)
async def alias_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.ALERT_VIEW)),
):
    alerts = await dashboard_service.get_notifications(db, current_user.user_id)
    unread = sum(1 for alert in alerts if not bool(alert.get('read')))
    return APIResponse(success=True, data={'count': unread}, message='ok')
