# Finance Endpoints - Invoice, Payment, Ledger, Vendor, Banking, Routes
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from typing import Optional
from datetime import date

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.middleware.permissions import require_permission, Permissions
from app.schemas.base import APIResponse, PaginationMeta
from app.schemas.finance import (
    InvoiceCreate, InvoiceUpdate, PaymentCreate,
    LedgerEntryCreate, VendorCreate,
    BankAccountCreate, BankTransactionCreate,
    RouteCreate, RouteUpdate,
)
from app.services import finance_service
from app.services import email_service
from app.models.postgres.client import Client
from app.models.postgres.finance import Vendor
from app.utils.tenant_guard import assert_tenant_access

router = APIRouter()


# --- Invoices ---
@router.get("/invoices", response_model=APIResponse)
async def list_invoices(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, status: Optional[str] = None,
    client_id: Optional[int] = None, trip_id: Optional[int] = None,
    has_payment_proof: Optional[bool] = None,
    db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_READ)),
):
    invoices, total = await finance_service.list_invoices(db, page, limit, search, status, client_id, trip_id, has_payment_proof)
    pages = (total + limit - 1) // limit
    items = []
    for inv in invoices:
        items.append(await finance_service.get_invoice_with_details(db, inv))
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.get("/invoices/{invoice_id}", response_model=APIResponse)
async def get_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_READ)),
):
    inv = await finance_service.get_invoice(db, invoice_id)
    assert_tenant_access(inv, current_user, not_found_detail="Invoice not found")
    return APIResponse(success=True, data=await finance_service.get_invoice_with_details(db, inv))


@router.post("/invoices", response_model=APIResponse, status_code=201)
async def create_invoice(
    data: InvoiceCreate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_CREATE)),
):
    inv = await finance_service.create_invoice(db, data.model_dump(), current_user.user_id)
    # Fire-and-forget email notification to invoice creator (non-blocking)
    email_service.notify_invoice_created(
        db,
        triggered_by_user_id=current_user.user_id,
        invoice_number=inv.invoice_number,
        total_amount=str(getattr(inv, "total_amount", "0.00")),
        due_date=str(getattr(inv, "due_date", "")) if getattr(inv, "due_date", None) else "",
    )
    return APIResponse(success=True, data={"id": inv.id, "invoice_number": inv.invoice_number}, message="Invoice created")


@router.put("/invoices/{invoice_id}", response_model=APIResponse)
async def update_invoice(
    invoice_id: int, data: InvoiceUpdate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_UPDATE)),
):
    existing = await finance_service.get_invoice(db, invoice_id)
    assert_tenant_access(existing, current_user, not_found_detail="Invoice not found")
    inv = await finance_service.update_invoice(db, invoice_id, data.model_dump(exclude_unset=True))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return APIResponse(success=True, message="Invoice updated")


@router.delete("/invoices/{invoice_id}", response_model=APIResponse)
async def delete_invoice(
    invoice_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_DELETE)),
):
    existing = await finance_service.get_invoice(db, invoice_id)
    assert_tenant_access(existing, current_user, not_found_detail="Invoice not found")
    success = await finance_service.delete_invoice(db, invoice_id)
    if not success:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return APIResponse(success=True, message="Invoice deleted")


@router.post("/invoices/{invoice_id}/send", response_model=APIResponse)
async def send_invoice(
    invoice_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_UPDATE)),
):
    inv = await finance_service.get_invoice(db, invoice_id)
    assert_tenant_access(inv, current_user, not_found_detail="Invoice not found")
    from app.models.postgres.finance import InvoiceStatus
    if inv.status not in (InvoiceStatus.DRAFT, InvoiceStatus.SENT):
        raise HTTPException(status_code=400, detail=f"Cannot send invoice with status '{inv.status.value}'")
    inv.status = InvoiceStatus.SENT
    await db.flush()
    return APIResponse(success=True, message="Invoice sent to client")


@router.post("/invoices/{invoice_id}/mark-paid", response_model=APIResponse)
async def mark_invoice_paid(
    invoice_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_UPDATE)),
):
    inv = await finance_service.get_invoice(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    from app.models.postgres.finance import InvoiceStatus
    from decimal import Decimal
    from datetime import datetime, date

    if inv.status == InvoiceStatus.PAID:
        raise HTTPException(status_code=400, detail="Invoice already marked as paid")

    amount_due = Decimal(str(inv.amount_due or 0))
    if amount_due <= 0:
        amount_due = Decimal(str(inv.total_amount or 0)) - Decimal(str(inv.amount_paid or 0))
    if amount_due <= 0:
        raise HTTPException(status_code=400, detail="Invoice has no outstanding amount")

    payment = await finance_service.create_payment(
        db,
        {
            "payment_date": date.today(),
            "payment_type": "received",
            "invoice_id": inv.id,
            "client_id": inv.client_id,
            "amount": float(amount_due),
            "payment_method": "bank_transfer",
            "transaction_ref": f"AUTO-{inv.invoice_number}",
            "remarks": f"Auto payment via mark-paid for {inv.invoice_number}",
        },
        current_user.user_id,
    )

    inv = await finance_service.get_invoice(db, invoice_id)
    inv.paid_at = datetime.utcnow()
    if Decimal(str(inv.amount_due or 0)) <= 0:
        inv.status = InvoiceStatus.PAID
        inv.amount_due = Decimal("0")

    await db.flush()
    return APIResponse(success=True, data={"payment_id": payment.id, "payment_number": payment.payment_number}, message="Invoice marked as paid")


@router.post("/invoices/generate-from-trip/{trip_id}", response_model=APIResponse, status_code=201)
async def generate_invoice_from_trip(
    trip_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.INVOICE_CREATE)),
):
    from app.models.postgres.trip import Trip
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    try:
        inv = await finance_service.auto_generate_invoice_from_trip(db, trip)
        if not inv:
            raise HTTPException(status_code=400, detail="Cannot generate invoice for this trip (no job/client/freight data)")
        await db.commit()
        return APIResponse(success=True, data={"id": inv.id, "invoice_number": inv.invoice_number}, message="Invoice generated from trip")
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# --- Payments ---
@router.get("/payments", response_model=APIResponse)
async def list_payments(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    payment_type: Optional[str] = None, client_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.PAYMENT_READ)),
):
    payments, total = await finance_service.list_payments(db, page, limit, payment_type, client_id)
    pages = (total + limit - 1) // limit
    items = [{c.key: getattr(p, c.key) for c in p.__table__.columns} for p in payments]
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.post("/payments", response_model=APIResponse, status_code=201)
async def create_payment(
    data: PaymentCreate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.PAYMENT_CREATE)),
):
    payload = data.model_dump()

    if payload.get("invoice_id"):
        inv = await finance_service.get_invoice(db, payload["invoice_id"])
        if not inv:
            raise HTTPException(status_code=400, detail=f"Invalid invoice_id: {payload['invoice_id']}")

        if not payload.get("client_id") and inv.client_id:
            payload["client_id"] = inv.client_id
        if payload.get("client_id") and inv.client_id and payload["client_id"] != inv.client_id:
            raise HTTPException(status_code=400, detail="client_id does not match invoice client")

    if payload.get("client_id"):
        client = await db.get(Client, payload["client_id"])
        if not client:
            raise HTTPException(status_code=400, detail=f"Invalid client_id: {payload['client_id']}")

    if payload.get("vendor_id"):
        vendor = await db.get(Vendor, payload["vendor_id"])
        if not vendor:
            raise HTTPException(status_code=400, detail=f"Invalid vendor_id: {payload['vendor_id']}")

    try:
        payment = await finance_service.create_payment(db, payload, current_user.user_id)
    except IntegrityError:
        raise HTTPException(status_code=400, detail="Invalid payment linkage. Verify invoice/client/vendor IDs.")

    return APIResponse(success=True, data={"id": payment.id, "payment_number": payment.payment_number}, message="Payment recorded")


# --- Ledger ---
@router.get("/ledger", response_model=APIResponse)
async def list_ledger(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    ledger_type: Optional[str] = None, client_id: Optional[int] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LEDGER_READ)),
):
    entries, total = await finance_service.list_ledger(db, page, limit, ledger_type, client_id, date_from, date_to)
    pages = (total + limit - 1) // limit
    items = [{c.key: getattr(e, c.key) for c in e.__table__.columns} for e in entries]
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.post("/ledger", response_model=APIResponse, status_code=201)
async def create_ledger(
    data: LedgerEntryCreate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    entry = await finance_service.create_ledger_entry(db, data.model_dump(), current_user.user_id)
    return APIResponse(success=True, data={"id": entry.id, "entry_number": entry.entry_number}, message="Ledger entry created")


# --- Vendors ---
@router.get("/vendors", response_model=APIResponse)
async def list_vendors(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user),
):
    vendors, total = await finance_service.list_vendors(db, page, limit, search)
    pages = (total + limit - 1) // limit
    items = [{c.key: getattr(v, c.key) for c in v.__table__.columns} for v in vendors]
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.post("/vendors", response_model=APIResponse, status_code=201)
async def create_vendor(data: VendorCreate, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    vendor = await finance_service.create_vendor(db, data.model_dump())
    return APIResponse(success=True, data={"id": vendor.id}, message="Vendor created")


# --- Bank Accounts ---
@router.get("/bank-accounts", response_model=APIResponse)
async def list_bank_accounts(db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    accounts = await finance_service.list_bank_accounts(db)
    items = [{c.key: getattr(a, c.key) for c in a.__table__.columns} for a in accounts]
    return APIResponse(success=True, data=items)


@router.post("/bank-accounts", response_model=APIResponse, status_code=201)
async def create_bank_account(data: BankAccountCreate, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    account = await finance_service.create_bank_account(db, data.model_dump())
    return APIResponse(success=True, data={"id": account.id}, message="Bank account created")


# --- Bank Transactions ---
@router.get("/bank-transactions", response_model=APIResponse)
async def list_bank_transactions(
    account_id: Optional[int] = None,
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user),
):
    txns, total = await finance_service.list_bank_transactions(db, account_id, page, limit)
    pages = (total + limit - 1) // limit
    items = [{c.key: getattr(t, c.key) for c in t.__table__.columns} for t in txns]
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.post("/bank-transactions", response_model=APIResponse, status_code=201)
async def create_bank_transaction(data: BankTransactionCreate, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    txn = await finance_service.create_bank_transaction(db, data.model_dump())
    return APIResponse(success=True, data={"id": txn.id}, message="Transaction recorded")


# --- Routes ---
@router.get("/routes", response_model=APIResponse)
async def list_routes(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user),
):
    routes, total = await finance_service.list_routes(db, page, limit, search)
    pages = (total + limit - 1) // limit
    items = [{c.key: getattr(r, c.key) for c in r.__table__.columns} for r in routes]
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.get("/routes/{route_id}", response_model=APIResponse)
async def get_route(route_id: int, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    route = await finance_service.get_route(db, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return APIResponse(success=True, data={c.key: getattr(route, c.key) for c in route.__table__.columns})


@router.post("/routes", response_model=APIResponse, status_code=201)
async def create_route(data: RouteCreate, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    route = await finance_service.create_route(db, data.model_dump())
    return APIResponse(success=True, data={"id": route.id, "route_code": route.route_code}, message="Route created")


@router.put("/routes/{route_id}", response_model=APIResponse)
async def update_route(route_id: int, data: RouteUpdate, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    route = await finance_service.update_route(db, route_id, data.model_dump(exclude_unset=True))
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return APIResponse(success=True, message="Route updated")
