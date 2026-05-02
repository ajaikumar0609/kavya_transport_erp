# Finance Models - Invoice, Payment, Ledger, GST
# Transport ERP - PostgreSQL

from sqlalchemy import (
    Column, String, Integer, Boolean, ForeignKey, 
    DateTime, Text, Numeric, Date, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
import enum
from .base import Base, TimestampMixin, SoftDeleteMixin


class InvoiceStatus(enum.Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    SENT = "SENT"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    CANCELLED = "CANCELLED"
    DISPUTED = "DISPUTED"


class InvoicePaymentStatus(enum.Enum):
    """Simple payment-tracking enum separate from the workflow status."""
    UNPAID = "UNPAID"
    PARTIAL = "PARTIAL"
    PAID = "PAID"


class InvoiceType(enum.Enum):
    TAX_INVOICE = "TAX_INVOICE"
    PROFORMA = "PROFORMA"
    CREDIT_NOTE = "CREDIT_NOTE"
    DEBIT_NOTE = "DEBIT_NOTE"


class PaymentStatus(enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REVERSED = "REVERSED"


class PaymentMethod(enum.Enum):
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"
    CHEQUE = "CHEQUE"
    UPI = "UPI"
    CARD = "CARD"
    NEFT = "NEFT"
    RTGS = "RTGS"
    ADJUST = "ADJUST"
    RAZORPAY = "RAZORPAY"


class LedgerType(enum.Enum):
    RECEIVABLE = "RECEIVABLE"
    PAYABLE = "PAYABLE"
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"


class Invoice(Base, TimestampMixin, SoftDeleteMixin):
    """Invoice model for billing."""
    
    __tablename__ = "invoices"
    
    # Invoice Details
    invoice_number = Column(String(30), unique=True, nullable=False, index=True)
    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    invoice_type = Column(SQLEnum(InvoiceType, native_enum=False), default=InvoiceType.TAX_INVOICE)
    
    # Client
    client_id = Column(Integer, ForeignKey('clients.id'), nullable=False)
    
    # Trip / Job link (for auto-generated invoices)
    job_id = Column(Integer, ForeignKey('jobs.id'), nullable=True)
    trip_id = Column(Integer, ForeignKey('trips.id'), nullable=True)
    auto_generated = Column(Boolean, default=False)
    
    # Billing Address
    billing_name = Column(String(200), nullable=False)
    billing_address = Column(Text, nullable=True)
    billing_gstin = Column(String(20), nullable=True)
    billing_state_code = Column(String(5), nullable=True)
    
    # Our Company Details (for invoice)
    company_name = Column(String(200), nullable=True)
    company_gstin = Column(String(20), nullable=True)
    company_state_code = Column(String(5), nullable=True)
    
    # Amounts
    subtotal = Column(Numeric(15, 2), default=0)
    discount_percent = Column(Numeric(5, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    taxable_amount = Column(Numeric(15, 2), default=0)
    
    # GST
    cgst_rate = Column(Numeric(5, 2), default=0)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_rate = Column(Numeric(5, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_rate = Column(Numeric(5, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    total_tax = Column(Numeric(12, 2), default=0)
    
    # Total
    total_amount = Column(Numeric(15, 2), default=0)
    amount_in_words = Column(String(500), nullable=True)
    
    # Payment
    amount_paid = Column(Numeric(15, 2), default=0)
    amount_due = Column(Numeric(15, 2), default=0)

    # Payment status (UNPAID / PARTIAL / PAID — simpler than workflow status)
    payment_status = Column(
        SQLEnum(InvoicePaymentStatus, native_enum=False),
        default=InvoicePaymentStatus.UNPAID,
        nullable=True,
    )

    # Status
    status = Column(SQLEnum(InvoiceStatus, native_enum=False), default=InvoiceStatus.DRAFT)
    
    # Payment tracking
    paid_at = Column(DateTime, nullable=True)
    last_payment_at = Column(DateTime, nullable=True)
    
    # Reference
    reference_number = Column(String(50), nullable=True)  # Client PO number
    
    # Remarks
    terms_conditions = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    
    # File
    pdf_url = Column(String(500), nullable=True)

    # ── Manual Payment Proof (used when Razorpay payment link is not sent) ──────
    payment_proof_url = Column(String(500), nullable=True)
    payment_proof_filename = Column(String(255), nullable=True)
    payment_proof_note = Column(Text, nullable=True)      # e.g. "UTR: 4039201832"
    payment_method_manual = Column(String(50), nullable=True)  # bank_transfer / cheque / cash / other
    marked_paid_by_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    marked_paid_at = Column(DateTime, nullable=True)

    # ── Auditor Review ────────────────────────────────────────────────────────────
    # auditor_review_status: PENDING | APPROVED | FLAGGED (NULL = not yet submitted)
    auditor_review_status = Column(String(20), nullable=True)
    auditor_reviewed_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    auditor_reviewed_at = Column(DateTime, nullable=True)

    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    client = relationship("Client", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")
    gst_entries = relationship("GSTEntry", back_populates="invoice")
    
    def __repr__(self):
        return f"<Invoice {self.invoice_number}>"


class InvoiceItem(Base, TimestampMixin):
    """Invoice line items."""
    
    __tablename__ = "invoice_items"
    
    invoice_id = Column(Integer, ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False)
    
    # Item Details
    item_number = Column(Integer, nullable=False)
    description = Column(String(500), nullable=False)
    hsn_sac_code = Column(String(20), nullable=True)
    
    # Linked Trip/LR
    trip_id = Column(Integer, ForeignKey('trips.id'), nullable=True)
    lr_id = Column(Integer, ForeignKey('lrs.id'), nullable=True)
    
    # Quantity & Rate
    quantity = Column(Numeric(12, 3), default=1)
    unit = Column(String(20), nullable=True)
    rate = Column(Numeric(12, 2), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    
    # Tax
    tax_rate = Column(Numeric(5, 2), default=18)
    tax_amount = Column(Numeric(12, 2), default=0)
    total = Column(Numeric(15, 2), default=0)
    
    # Relationships
    invoice = relationship("Invoice", back_populates="items")


class Payment(Base, TimestampMixin, SoftDeleteMixin):
    """Payment records."""
    
    __tablename__ = "payments"
    
    # Payment Details
    payment_number = Column(String(30), unique=True, nullable=False, index=True)
    payment_date = Column(Date, nullable=False)
    
    # Type - Received from client or Paid to vendor
    payment_type = Column(String(20), nullable=False)  # received, paid
    
    # Linked entities
    invoice_id = Column(Integer, ForeignKey('invoices.id'), nullable=True)
    client_id = Column(Integer, ForeignKey('clients.id'), nullable=True)
    vendor_id = Column(Integer, ForeignKey('vendors.id'), nullable=True)
    # Driver payment fields
    trip_id = Column(Integer, ForeignKey('trips.id'), nullable=True)
    driver_id = Column(Integer, ForeignKey('drivers.id'), nullable=True)
    source_ref = Column(String(100), nullable=True)  # e.g. "trip_pay:TRP-001" or "expense:42"
    razorpay_order_id = Column(String(100), nullable=True)
    razorpay_payment_id = Column(String(100), nullable=True)
    
    # Amount
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(5), default='INR')
    
    # Payment Method
    payment_method = Column(SQLEnum(PaymentMethod, native_enum=False), nullable=False)
    
    # Bank Details
    bank_name = Column(String(100), nullable=True)
    cheque_number = Column(String(30), nullable=True)
    cheque_date = Column(Date, nullable=True)
    transaction_ref = Column(String(100), nullable=True)

    # UPI transaction ID (entered by accountant after app confirms payment)
    upi_txn_id = Column(String(100), nullable=True)
    
    # Status
    status = Column(SQLEnum(PaymentStatus, native_enum=False), default=PaymentStatus.COMPLETED)
    
    # TDS
    tds_rate = Column(Numeric(5, 2), default=0)
    tds_amount = Column(Numeric(12, 2), default=0)
    net_amount = Column(Numeric(15, 2), nullable=True)
    
    # Remarks
    remarks = Column(Text, nullable=True)
    
    # Receipt
    receipt_url = Column(String(500), nullable=True)
    
    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    invoice = relationship("Invoice", back_populates="payments")
    ledger_entries = relationship("Ledger", back_populates="payment")

    def __repr__(self):
        return f"<Payment {self.payment_number}>"


class Ledger(Base, TimestampMixin):
    """General ledger / Account book entries."""
    
    __tablename__ = "ledger"
    
    # Entry Details
    entry_number = Column(String(30), unique=True, nullable=False, index=True)
    entry_date = Column(Date, nullable=False)
    ledger_type = Column(SQLEnum(LedgerType, native_enum=False), nullable=False)
    
    # Account
    account_name = Column(String(200), nullable=False)
    account_code = Column(String(30), nullable=True)
    
    # Linked entities
    client_id = Column(Integer, ForeignKey('clients.id'), nullable=True)
    vendor_id = Column(Integer, ForeignKey('vendors.id'), nullable=True)
    invoice_id = Column(Integer, ForeignKey('invoices.id'), nullable=True)
    payment_id = Column(Integer, ForeignKey('payments.id'), nullable=True)
    trip_id = Column(Integer, ForeignKey('trips.id'), nullable=True)
    
    # Transaction
    debit = Column(Numeric(15, 2), default=0)
    credit = Column(Numeric(15, 2), default=0)
    balance = Column(Numeric(15, 2), default=0)
    
    # Description
    narration = Column(Text, nullable=True)
    
    # Reference
    reference_type = Column(String(50), nullable=True)  # invoice, payment, expense, etc.
    reference_number = Column(String(50), nullable=True)
    
    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    payment = relationship("Payment", back_populates="ledger_entries")
    
    def __repr__(self):
        return f"<Ledger {self.entry_number}>"


class GSTEntry(Base, TimestampMixin):
    """GST transaction records for compliance."""
    
    __tablename__ = "gst_entries"
    
    # Period
    financial_year = Column(String(10), nullable=False)  # 2024-25
    tax_period = Column(String(10), nullable=False)  # 202401 (YYYYMM)
    
    # Transaction
    transaction_type = Column(String(20), nullable=False)  # sale, purchase
    
    # Linked Invoice
    invoice_id = Column(Integer, ForeignKey('invoices.id'), nullable=True)
    invoice_number = Column(String(30), nullable=False)
    invoice_date = Column(Date, nullable=False)
    
    # Party Details
    party_gstin = Column(String(20), nullable=True)
    party_name = Column(String(200), nullable=False)
    place_of_supply = Column(String(5), nullable=True)  # State code
    
    # Values
    taxable_value = Column(Numeric(15, 2), default=0)
    cgst_rate = Column(Numeric(5, 2), default=0)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_rate = Column(Numeric(5, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_rate = Column(Numeric(5, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    cess_amount = Column(Numeric(12, 2), default=0)
    total_value = Column(Numeric(15, 2), default=0)
    
    # GSTR filing
    gstr_return_type = Column(String(10), nullable=True)  # 1, 3B
    filing_status = Column(String(20), default='pending')  # pending, filed, reconciled
    filed_at = Column(DateTime, nullable=True)
    
    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    
    # Relationships
    invoice = relationship("Invoice", back_populates="gst_entries")
    
    def __repr__(self):
        return f"<GSTEntry {self.invoice_number}>"


class Vendor(Base, TimestampMixin, SoftDeleteMixin):
    """Vendor/Supplier model for payables."""
    
    __tablename__ = "vendors"
    
    # Basic Info
    name = Column(String(200), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    vendor_type = Column(String(50), nullable=True)  # fuel, tyre, maintenance, broker
    
    # Contact
    email = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    
    # Address
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(10), nullable=True)
    
    # Tax
    gstin = Column(String(20), nullable=True)
    pan = Column(String(15), nullable=True)
    
    # Bank
    bank_account = Column(String(30), nullable=True)
    bank_name = Column(String(100), nullable=True)
    bank_ifsc = Column(String(15), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)


class Receivable(Base, TimestampMixin):
    """Accounts Receivable summary."""
    
    __tablename__ = "receivables"
    
    client_id = Column(Integer, ForeignKey('clients.id'), nullable=False)
    as_on_date = Column(Date, nullable=False)
    
    # Aging
    current = Column(Numeric(15, 2), default=0)  # 0-30 days
    days_30_60 = Column(Numeric(15, 2), default=0)
    days_60_90 = Column(Numeric(15, 2), default=0)
    days_90_plus = Column(Numeric(15, 2), default=0)
    total_outstanding = Column(Numeric(15, 2), default=0)
    
    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)


class Payable(Base, TimestampMixin):
    """Accounts Payable summary."""
    
    __tablename__ = "payables"
    
    vendor_id = Column(Integer, ForeignKey('vendors.id'), nullable=False)
    as_on_date = Column(Date, nullable=False)
    
    # Aging
    current = Column(Numeric(15, 2), default=0)
    days_30_60 = Column(Numeric(15, 2), default=0)
    days_60_90 = Column(Numeric(15, 2), default=0)
    days_90_plus = Column(Numeric(15, 2), default=0)
    total_outstanding = Column(Numeric(15, 2), default=0)
    
    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
