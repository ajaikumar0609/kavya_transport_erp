# Finance Service - Invoice, Payment, Ledger, Banking
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from datetime import datetime, date, timedelta
from decimal import Decimal
import logging

from app.models.postgres.finance import (
    Invoice, InvoiceItem, InvoiceStatus, InvoiceType,
    Payment, PaymentStatus, PaymentMethod,
    Ledger, LedgerType, GSTEntry, Vendor, Receivable, Payable,
)
from app.models.postgres.route import BankAccount, BankTransaction
from app.models.postgres.client import Client
from app.utils.generators import generate_invoice_number, generate_payment_number, generate_ledger_number


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


# ==================== INVOICES ====================
async def list_invoices(db: AsyncSession, page: int = 1, limit: int = 20, search: str = None, status: str = None, client_id: int = None, trip_id: int = None, has_payment_proof: bool = None):
    query = select(Invoice).where(Invoice.is_deleted == False)
    count_query = select(func.count(Invoice.id)).where(Invoice.is_deleted == False)

    if search:
        sf = or_(Invoice.invoice_number.ilike(f"%{search}%"), Invoice.billing_name.ilike(f"%{search}%"))
        query = query.where(sf)
        count_query = count_query.where(sf)
    if status:
        normalized_status = _coerce_enum(InvoiceStatus, status)
        query = query.where(Invoice.status == normalized_status)
        count_query = count_query.where(Invoice.status == normalized_status)
    if client_id:
        query = query.where(Invoice.client_id == client_id)
        count_query = count_query.where(Invoice.client_id == client_id)
    if trip_id:
        query = query.where(Invoice.trip_id == trip_id)
        count_query = count_query.where(Invoice.trip_id == trip_id)
    if has_payment_proof is True:
        query = query.where(Invoice.payment_proof_url.isnot(None))
        count_query = count_query.where(Invoice.payment_proof_url.isnot(None))

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Invoice.id.desc()))
    return result.scalars().all(), total


async def get_invoice(db: AsyncSession, invoice_id: int):
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.is_deleted == False))
    return result.scalar_one_or_none()


async def create_invoice(db: AsyncSession, data: dict, user_id: int = None) -> Invoice:
    data = dict(data)
    items_data = data.pop("items", [])
    data["invoice_number"] = generate_invoice_number()
    data["created_by"] = user_id
    data["invoice_type"] = _coerce_enum(InvoiceType, data.get("invoice_type", "tax_invoice"))
    data["status"] = _coerce_enum(InvoiceStatus, data.get("status", "draft"))

    # Get client details
    client_result = await db.execute(select(Client).where(Client.id == data["client_id"]))
    client = client_result.scalar_one_or_none()
    if client and not data.get("billing_name"):
        data["billing_name"] = client.name

    # Set company GSTIN from config (or leave None)
    data.setdefault("company_name", "Kavya Transports")

    invoice = Invoice(**data)
    db.add(invoice)
    await db.flush()

    # Add items and calculate totals
    subtotal = Decimal("0")
    for idx, item_data in enumerate(items_data, 1):
        qty = Decimal(str(item_data.get("quantity", 1)))
        rate = Decimal(str(item_data["rate"]))
        amount = qty * rate
        tax_rate = Decimal(str(item_data.get("tax_rate", 18)))
        tax_amount = amount * tax_rate / 100
        total = amount + tax_amount

        item = InvoiceItem(
            invoice_id=invoice.id, item_number=idx,
            description=item_data["description"],
            hsn_sac_code=item_data.get("hsn_sac_code"),
            trip_id=item_data.get("trip_id"),
            lr_id=item_data.get("lr_id"),
            quantity=qty, unit=item_data.get("unit"),
            rate=rate, amount=amount,
            tax_rate=tax_rate, tax_amount=tax_amount, total=total,
        )
        db.add(item)
        subtotal += amount

    # Calculate GST
    discount_pct = Decimal(str(data.get("discount_percent", 0)))
    discount_amount = subtotal * discount_pct / 100
    taxable = subtotal - discount_amount

    # Determine IGST vs CGST+SGST (interstate vs intrastate)
    billing_state = data.get("billing_state_code", "")
    company_state = data.get("company_state_code", "")
    gst_rate = Decimal("18")  # Default 18%

    if billing_state and company_state and billing_state != company_state:
        igst = taxable * gst_rate / 100
        invoice.igst_rate = gst_rate
        invoice.igst_amount = igst
        invoice.cgst_amount = 0
        invoice.sgst_amount = 0
        total_tax = igst
    else:
        half_rate = gst_rate / 2
        cgst = taxable * half_rate / 100
        sgst = taxable * half_rate / 100
        invoice.cgst_rate = half_rate
        invoice.cgst_amount = cgst
        invoice.sgst_rate = half_rate
        invoice.sgst_amount = sgst
        invoice.igst_amount = 0
        total_tax = cgst + sgst

    invoice.subtotal = subtotal
    invoice.discount_amount = discount_amount
    invoice.taxable_amount = taxable
    invoice.total_tax = total_tax
    invoice.total_amount = taxable + total_tax
    invoice.amount_due = invoice.total_amount

    await db.flush()
    return invoice


async def update_invoice(db: AsyncSession, invoice_id: int, data: dict):
    invoice = await get_invoice(db, invoice_id)
    if not invoice:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(invoice, k, v)
    return invoice


async def delete_invoice(db: AsyncSession, invoice_id: int) -> bool:
    invoice = await get_invoice(db, invoice_id)
    if not invoice:
        return False
    invoice.is_deleted = True
    return True


async def get_invoice_with_details(db: AsyncSession, invoice: Invoice) -> dict:
    client_name = None
    if invoice.client_id:
        result = await db.execute(select(Client.name).where(Client.id == invoice.client_id))
        client_name = result.scalar_one_or_none()

    items_result = await db.execute(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id).order_by(InvoiceItem.item_number))
    items = items_result.scalars().all()

    return {
        **{c.key: getattr(invoice, c.key) for c in invoice.__table__.columns},
        "client_name": client_name,
        "status": invoice.status.value if hasattr(invoice.status, 'value') else str(invoice.status),
        "invoice_type": invoice.invoice_type.value if hasattr(invoice.invoice_type, 'value') else str(invoice.invoice_type) if invoice.invoice_type else None,
        "items": [{c.key: getattr(item, c.key) for c in item.__table__.columns} for item in items],
    }


# ==================== PAYMENTS ====================
async def list_payments(db: AsyncSession, page: int = 1, limit: int = 20, payment_type: str = None, client_id: int = None):
    query = select(Payment).where(Payment.is_deleted == False)
    count_query = select(func.count(Payment.id)).where(Payment.is_deleted == False)

    if payment_type:
        query = query.where(Payment.payment_type == payment_type)
        count_query = count_query.where(Payment.payment_type == payment_type)
    if client_id:
        query = query.where(Payment.client_id == client_id)
        count_query = count_query.where(Payment.client_id == client_id)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Payment.id.desc()))
    return result.scalars().all(), total


async def create_payment(db: AsyncSession, data: dict, user_id: int = None) -> Payment:
    data["payment_number"] = generate_payment_number()
    data["created_by"] = user_id
    data["payment_method"] = _coerce_enum(PaymentMethod, data.get("payment_method"))

    # Calculate net amount
    amount = Decimal(str(data["amount"]))
    tds = Decimal(str(data.get("tds_amount", 0)))
    data["net_amount"] = amount - tds

    payment = Payment(**data)
    db.add(payment)
    await db.flush()

    # Update invoice if linked
    if payment.invoice_id:
        inv = await get_invoice(db, payment.invoice_id)
        if inv:
            inv.amount_paid = Decimal(str(inv.amount_paid or 0)) + amount
            inv.amount_due = Decimal(str(inv.total_amount or 0)) - Decimal(str(inv.amount_paid or 0))
            if inv.amount_due <= 0:
                inv.status = InvoiceStatus.PAID
                inv.amount_due = 0
            else:
                inv.status = InvoiceStatus.PARTIALLY_PAID

    # Create ledger entry
    ledger_data = {
        "entry_date": data["payment_date"],
        "account_name": "Accounts Receivable" if data["payment_type"] == "received" else "Accounts Payable",
        "client_id": data.get("client_id"),
        "vendor_id": data.get("vendor_id"),
        "invoice_id": data.get("invoice_id"),
        "payment_id": payment.id,
        "narration": data.get("remarks", f"Payment {payment.payment_number}"),
        "reference_type": "payment",
        "reference_number": payment.payment_number,
    }
    if data["payment_type"] == "received":
        ledger_data["ledger_type"] = "receivable"
        ledger_data["debit"] = float(amount)
        ledger_data["credit"] = 0
    else:
        ledger_data["ledger_type"] = "payable"
        ledger_data["debit"] = 0
        ledger_data["credit"] = float(amount)

    await create_ledger_entry(db, ledger_data, user_id)

    return payment


# ==================== LEDGER ====================
async def list_ledger(db: AsyncSession, page: int = 1, limit: int = 20, ledger_type: str = None, client_id: int = None, date_from: date = None, date_to: date = None):
    query = select(Ledger)
    count_query = select(func.count(Ledger.id))

    if ledger_type:
        query = query.where(Ledger.ledger_type == LedgerType(ledger_type))
        count_query = count_query.where(Ledger.ledger_type == LedgerType(ledger_type))
    if client_id:
        query = query.where(Ledger.client_id == client_id)
        count_query = count_query.where(Ledger.client_id == client_id)
    if date_from:
        query = query.where(Ledger.entry_date >= date_from)
        count_query = count_query.where(Ledger.entry_date >= date_from)
    if date_to:
        query = query.where(Ledger.entry_date <= date_to)
        count_query = count_query.where(Ledger.entry_date <= date_to)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Ledger.id.desc()))
    return result.scalars().all(), total


async def create_ledger_entry(db: AsyncSession, data: dict, user_id: int = None) -> Ledger:
    data["entry_number"] = generate_ledger_number()
    data["created_by"] = user_id
    data["ledger_type"] = _coerce_enum(LedgerType, data.get("ledger_type"))

    # Calculate running balance
    data["balance"] = float(data.get("debit", 0)) - float(data.get("credit", 0))

    entry = Ledger(**data)
    db.add(entry)
    await db.flush()
    return entry


async def post_expense_approval_entries(db: AsyncSession, expense, user_id: int = None):
    """
    On expense approval, create/update payable summary and create a payable ledger entry.
    Idempotent: skips if ledger entry for this expense already exists.
    """
    if not expense:
        return None

    ref_number = f"EXP-{expense.id}"
    existing_ledger = await db.execute(
        select(Ledger).where(
            Ledger.reference_type == "expense",
            Ledger.reference_number == ref_number,
        )
    )
    if existing_ledger.scalar_one_or_none():
        return None

    category_raw = str(getattr(getattr(expense, "category", None), "value", getattr(expense, "category", "misc")) or "misc")
    category = category_raw.lower()
    vendor_code = f"AUTO-{category.upper()}"
    vendor_name = f"{category.replace('_', ' ').title()} Expense Vendor"

    vendor_result = await db.execute(select(Vendor).where(Vendor.code == vendor_code, Vendor.is_deleted == False))
    vendor = vendor_result.scalar_one_or_none()
    if not vendor:
        vendor = Vendor(
            name=vendor_name,
            code=vendor_code,
            vendor_type=category,
            is_active=True,
            tenant_id=getattr(expense, "tenant_id", None),
            branch_id=getattr(expense, "branch_id", None),
        )
        db.add(vendor)
        await db.flush()

    today = date.today()
    amount = Decimal(str(getattr(expense, "amount", 0) or 0))

    payable_result = await db.execute(
        select(Payable).where(
            Payable.vendor_id == vendor.id,
            Payable.as_on_date == today,
        )
    )
    payable = payable_result.scalar_one_or_none()
    if not payable:
        payable = Payable(
            vendor_id=vendor.id,
            as_on_date=today,
            current=amount,
            total_outstanding=amount,
            tenant_id=getattr(expense, "tenant_id", None),
        )
        db.add(payable)
    else:
        payable.current = Decimal(str(payable.current or 0)) + amount
        payable.total_outstanding = Decimal(str(payable.total_outstanding or 0)) + amount

    await create_ledger_entry(
        db,
        {
            "entry_date": today,
            "ledger_type": "payable",
            "account_name": f"Expense Payable - {vendor.name}",
            "vendor_id": vendor.id,
            "trip_id": getattr(expense, "trip_id", None),
            "debit": 0,
            "credit": float(amount),
            "narration": f"Approved expense {ref_number}",
            "reference_type": "expense",
            "reference_number": ref_number,
            "tenant_id": getattr(expense, "tenant_id", None),
            "branch_id": getattr(expense, "branch_id", None),
        },
        user_id,
    )

    return True


# ==================== VENDORS ====================
async def list_vendors(db: AsyncSession, page: int = 1, limit: int = 20, search: str = None):
    query = select(Vendor).where(Vendor.is_deleted == False)
    count_query = select(func.count(Vendor.id)).where(Vendor.is_deleted == False)

    if search:
        sf = or_(Vendor.name.ilike(f"%{search}%"), Vendor.code.ilike(f"%{search}%"))
        query = query.where(sf)
        count_query = count_query.where(sf)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Vendor.id.desc()))
    return result.scalars().all(), total


async def create_vendor(db: AsyncSession, data: dict) -> Vendor:
    vendor = Vendor(**data)
    db.add(vendor)
    await db.flush()
    return vendor


# ==================== BANK ACCOUNTS ====================
async def list_bank_accounts(db: AsyncSession):
    result = await db.execute(select(BankAccount).where(BankAccount.is_deleted == False, BankAccount.is_active == True))
    return result.scalars().all()


async def create_bank_account(db: AsyncSession, data: dict) -> BankAccount:
    account = BankAccount(**data)
    db.add(account)
    await db.flush()
    return account


async def create_bank_transaction(db: AsyncSession, data: dict) -> BankTransaction:
    txn = BankTransaction(**data)
    db.add(txn)
    await db.flush()

    # Update balance
    account_result = await db.execute(select(BankAccount).where(BankAccount.id == data["account_id"]))
    account = account_result.scalar_one_or_none()
    if account:
        if data["transaction_type"] == "credit":
            account.current_balance = float(account.current_balance or 0) + float(data["amount"])
        else:
            account.current_balance = float(account.current_balance or 0) - float(data["amount"])
        txn.balance_after = account.current_balance

    # Auto-recalculate invoice status when payment received against invoice
    invoice_id = data.get("invoice_id")
    if invoice_id and data["transaction_type"] == "credit":
        await recalculate_invoice_on_payment(db, invoice_id)

    return txn


async def list_bank_transactions(db: AsyncSession, account_id: int = None, page: int = 1, limit: int = 20):
    query = select(BankTransaction)
    count_query = select(func.count(BankTransaction.id))

    if account_id:
        query = query.where(BankTransaction.account_id == account_id)
        count_query = count_query.where(BankTransaction.account_id == account_id)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(BankTransaction.id.desc()))
    return result.scalars().all(), total


# ==================== ROUTES ====================
async def list_routes(db: AsyncSession, page: int = 1, limit: int = 20, search: str = None):
    from app.models.postgres.route import Route
    query = select(Route).where(Route.is_deleted == False)
    count_query = select(func.count(Route.id)).where(Route.is_deleted == False)

    if search:
        sf = or_(Route.route_name.ilike(f"%{search}%"), Route.origin_city.ilike(f"%{search}%"), Route.destination_city.ilike(f"%{search}%"))
        query = query.where(sf)
        count_query = count_query.where(sf)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Route.id.desc()))
    return result.scalars().all(), total


async def get_route(db: AsyncSession, route_id: int):
    from app.models.postgres.route import Route
    result = await db.execute(select(Route).where(Route.id == route_id, Route.is_deleted == False))
    return result.scalar_one_or_none()


async def create_route(db: AsyncSession, data: dict):
    from app.models.postgres.route import Route
    from app.utils.generators import generate_route_code
    data["route_code"] = generate_route_code(data["origin_city"], data["destination_city"])
    route = Route(**data)
    db.add(route)
    await db.flush()
    return route


async def update_route(db: AsyncSession, route_id: int, data: dict):
    route = await get_route(db, route_id)
    if not route:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(route, k, v)
    return route


# ==================== INVOICE AUTO-RECALCULATION ====================
logger = logging.getLogger(__name__)


async def recalculate_invoice_on_payment(db: AsyncSession, invoice_id: int):
    """
    Recalculate invoice.amount_paid, amount_due, status based on all linked payments.
    Called after bank transaction creation or payment creation.
    """
    invoice = await get_invoice(db, invoice_id)
    if not invoice:
        return None

    # Sum all completed payments for this invoice
    payment_result = await db.execute(
        select(func.sum(Payment.amount)).where(
            Payment.invoice_id == invoice_id,
            Payment.status != PaymentStatus.REVERSED,
            Payment.is_deleted == False,
        )
    )
    total_paid = Decimal(str(payment_result.scalar() or 0))

    # Also sum direct bank credits against this invoice
    from app.models.postgres.route import BankTransaction
    bank_result = await db.execute(
        select(func.sum(BankTransaction.amount)).where(
            BankTransaction.invoice_id == invoice_id,
            BankTransaction.transaction_type == "credit",
        )
    )
    bank_paid = Decimal(str(bank_result.scalar() or 0))

    # Use whichever is greater (avoid double counting if payment + bank txn exist)
    effective_paid = max(total_paid, bank_paid)

    invoice.amount_paid = effective_paid
    invoice.amount_due = max(Decimal("0"), Decimal(str(invoice.total_amount or 0)) - effective_paid)
    invoice.last_payment_at = datetime.utcnow()

    if effective_paid <= 0:
        if invoice.status not in (InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED):
            invoice.status = InvoiceStatus.SENT
    elif effective_paid < Decimal(str(invoice.total_amount or 0)):
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    else:
        invoice.status = InvoiceStatus.PAID
        invoice.paid_at = datetime.utcnow()

        # Auto-complete job when invoice is fully paid
        if invoice.job_id:
            from app.models.postgres.job import Job, JobStatusEnum
            job = await db.get(Job, invoice.job_id)
            if job and job.status == JobStatusEnum.IN_PROGRESS:
                job.status = JobStatusEnum.COMPLETED
                job.completed_at = datetime.utcnow()

    await db.flush()
    return invoice


# ==================== INVOICE AUTO-GENERATION FROM TRIP ====================
async def auto_generate_invoice_from_trip(db: AsyncSession, trip) -> Invoice:
    """
    Auto-generate a DRAFT invoice when a trip is completed.
    Pre-fills all data from the trip, its LRs, and the job.
    """
    from app.models.postgres.job import Job
    from app.models.postgres.lr import LR
    from app.models.postgres.client import Client
    from app.core.config import settings

    if not trip.job_id:
        return None

    job = await db.get(Job, trip.job_id)
    if not job:
        return None

    # Get all LRs for this trip
    lr_result = await db.execute(select(LR).where(LR.trip_id == trip.id))
    lrs = lr_result.scalars().all()

    # Calculate freight from LRs or fallback to job rate
    freight_total = sum(float(lr.total_freight or 0) for lr in lrs)
    if freight_total == 0:
        freight_total = float(trip.revenue or 0) or float(job.agreed_rate or 0) or 0

    if freight_total <= 0:
        return None  # Nothing to invoice

    # Get client for GST determination
    client = await db.get(Client, job.client_id)
    if not client:
        return None

    # Determine GST type (transport services SAC 9965, rate 5%)
    raw_gstin = getattr(settings, 'EWAY_BILL_GSTIN', '') or ''
    # Validate GSTIN format (15 chars alphanumeric); treat placeholders as empty
    company_gstin = raw_gstin if len(raw_gstin) == 15 and raw_gstin.isalnum() else ''
    client_gstin = client.gstin or ''
    company_state = company_gstin[:2] if len(company_gstin) >= 2 else ''
    client_state = client_gstin[:2] if len(client_gstin) >= 2 else ''

    gst_rate = Decimal("5")  # Transport services standard rate
    subtotal = Decimal(str(freight_total))

    if company_state and client_state and company_state == client_state:
        # Intrastate: CGST + SGST
        half = subtotal * gst_rate / 200
        cgst = half
        sgst = half
        igst = Decimal("0")
    else:
        # Interstate or unknown: IGST
        igst = subtotal * gst_rate / 100
        cgst = Decimal("0")
        sgst = Decimal("0")

    tax_amount = igst + cgst + sgst
    total = subtotal + tax_amount

    # Payment terms
    payment_terms = getattr(client, 'payment_terms', None) or 30
    due_date_val = date.today() + timedelta(days=payment_terms)

    # Generate invoice number
    invoice_number = generate_invoice_number()

    invoice = Invoice(
        invoice_number=invoice_number,
        invoice_date=date.today(),
        due_date=due_date_val,
        invoice_type=InvoiceType.TAX_INVOICE,
        client_id=job.client_id,
        job_id=trip.job_id,
        trip_id=trip.id,
        auto_generated=True,
        billing_name=client.name,
        billing_address=getattr(client, 'address', None),
        billing_gstin=client_gstin,
        billing_state_code=client_state,
        company_name="Kavya Transports",
        company_gstin=company_gstin,
        company_state_code=company_state,
        subtotal=subtotal,
        taxable_amount=subtotal,
        cgst_rate=gst_rate / 2 if cgst > 0 else Decimal("0"),
        cgst_amount=cgst,
        sgst_rate=gst_rate / 2 if sgst > 0 else Decimal("0"),
        sgst_amount=sgst,
        igst_rate=gst_rate if igst > 0 else Decimal("0"),
        igst_amount=igst,
        total_tax=tax_amount,
        total_amount=total,
        amount_paid=Decimal("0"),
        amount_due=total,
        status=InvoiceStatus.DRAFT,
        tenant_id=getattr(trip, 'tenant_id', None),
        branch_id=getattr(trip, 'branch_id', None),
        created_by=getattr(trip, 'created_by', None),
    )
    db.add(invoice)
    await db.flush()

    # Add line items from LRs
    if lrs:
        for idx, lr in enumerate(lrs, 1):
            item = InvoiceItem(
                invoice_id=invoice.id,
                item_number=idx,
                description=f"Freight: {lr.origin or job.origin_city} → {lr.destination or job.destination_city}",
                hsn_sac_code="9965",
                lr_id=lr.id,
                trip_id=trip.id,
                quantity=Decimal("1"),
                unit="trip",
                rate=Decimal(str(lr.total_freight or 0)),
                amount=Decimal(str(lr.total_freight or 0)),
                tax_rate=gst_rate,
                tax_amount=Decimal(str(lr.total_freight or 0)) * gst_rate / 100,
                total=Decimal(str(lr.total_freight or 0)) * (1 + gst_rate / 100),
            )
            db.add(item)
    else:
        item = InvoiceItem(
            invoice_id=invoice.id,
            item_number=1,
            description=f"Freight: {job.origin_city} → {job.destination_city}",
            hsn_sac_code="9965",
            trip_id=trip.id,
            quantity=Decimal("1"),
            unit="trip",
            rate=subtotal,
            amount=subtotal,
            tax_rate=gst_rate,
            tax_amount=tax_amount,
            total=total,
        )
        db.add(item)

    await db.flush()
    logger.info(f"Auto-generated invoice {invoice_number} for trip {trip.trip_number}")
    return invoice
