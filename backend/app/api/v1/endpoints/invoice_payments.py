# Invoice Payment Proof — Manual Payment Flow
# POST /finance/invoices/{id}/mark-paid   — upload proof, mark invoice paid
# GET  /finance/invoices/{id}/payment-proof — fetch proof metadata + URL
# POST /finance/invoices/{id}/auditor-review — auditor sets APPROVED / FLAGGED

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenData, get_current_user
from app.db.postgres.connection import get_db
from app.middleware.permissions import Permissions, require_permission
from app.models.postgres.finance import Invoice, InvoicePaymentStatus, InvoiceStatus
from app.schemas.base import APIResponse
from app.services.audit_logger import log_audit
from app.services import email_service
from app.utils.upload_validator import validate_upload, safe_original_name

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_PROOF_MIMES = {
    "application/pdf":   ".pdf",
    "image/jpeg":        ".jpg",
    "image/png":         ".png",
    "image/webp":        ".webp",
    "image/heic":        ".heic",
    "image/heif":        ".heif",
}
_MAX_PROOF_SIZE = 10 * 1024 * 1024  # 10 MB
_UPLOAD_DIR = "uploads/payment_proofs"

_MANUAL_METHODS = {"bank_transfer", "cheque", "cash", "upi", "neft", "rtgs", "other"}
_AUDITOR_STATUSES = {"APPROVED", "FLAGGED"}


async def _get_invoice_or_404(db: AsyncSession, invoice_id: int) -> Invoice:
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return inv


def _save_proof_file(file_bytes: bytes, safe_filename: str) -> str:
    """Save proof file to local disk (fallback). Returns relative URL."""
    os.makedirs(_UPLOAD_DIR, exist_ok=True)
    fpath = os.path.join(_UPLOAD_DIR, safe_filename)
    with open(fpath, "wb") as f:
        f.write(file_bytes)
    return f"/{fpath}"


# ━━━ POST /finance/invoices/{invoice_id}/mark-paid ━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/invoices/{invoice_id}/mark-paid", response_model=APIResponse)
async def mark_invoice_paid(
    request: Request,
    invoice_id: int,
    proof_file: UploadFile = File(...),
    note: str = Form(""),
    payment_method: str = Form("bank_transfer"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.PAYMENT_PROOF_UPLOAD)),
):
    """
    Mark an invoice as manually paid and attach payment proof.

    Accepts multipart/form-data:
    - proof_file: image (JPEG/PNG/WEBP/HEIC) or PDF — max 10 MB
    - note: payment reference note, e.g. "UTR: 4039201832"
    - payment_method: bank_transfer | cheque | cash | upi | neft | rtgs | other
    """
    # ── Validate payment_method ──────────────────────────────────────────────
    payment_method = payment_method.lower().strip()
    if payment_method not in _MANUAL_METHODS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid payment_method. Must be one of: {', '.join(sorted(_MANUAL_METHODS))}",
        )

    # ── Validate file (magic-byte sniffing — never trust client-supplied MIME) ──
    file_bytes, detected_mime, safe_filename = await validate_upload(
        proof_file,
        allowed_mimes=_ALLOWED_PROOF_MIMES,
        max_bytes=_MAX_PROOF_SIZE,
    )
    display_name = safe_original_name(proof_file.filename)

    # ── Load invoice ─────────────────────────────────────────────────────────
    inv = await _get_invoice_or_404(db, invoice_id)
    if inv.payment_status == InvoicePaymentStatus.PAID:
        raise HTTPException(status_code=409, detail="Invoice is already marked as paid.")

    # ── Save file ────────────────────────────────────────────────────────────
    try:
        from app.services.storage_service import upload_file  # type: ignore
        # Pass the validated bytes + safe filename rather than the raw UploadFile
        # so storage_service cannot accidentally trust the original filename.
        file_url = await upload_file(
            proof_file, folder="payment_proofs", override_filename=safe_filename,
        )
    except (ImportError, TypeError, Exception):
        file_url = _save_proof_file(file_bytes, safe_filename)

    # ── Update invoice ───────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    prev_state = {
        "payment_status": inv.payment_status.value if inv.payment_status else None,
        "status": inv.status.value if inv.status else None,
    }

    inv.payment_proof_url = file_url
    inv.payment_proof_filename = display_name
    inv.payment_proof_note = note.strip() or None
    inv.payment_method_manual = payment_method
    inv.marked_paid_by_user_id = current_user.user_id
    inv.marked_paid_at = now
    inv.payment_status = InvoicePaymentStatus.PAID
    inv.paid_at = now
    if inv.status not in (InvoiceStatus.CANCELLED, InvoiceStatus.DISPUTED):
        inv.status = InvoiceStatus.PAID
    # Amount tracking
    inv.amount_paid = inv.total_amount
    inv.amount_due = 0

    await db.commit()
    await db.refresh(inv)

    # ── Audit log ────────────────────────────────────────────────────────────
    await log_audit(
        db,
        actor_id=current_user.user_id,
        actor_role=getattr(current_user, "role", None),
        action="invoice.mark_paid_manual",
        entity_type="invoice",
        entity_id=str(invoice_id),
        previous_state=prev_state,
        new_state={
            "payment_status": "PAID",
            "payment_method_manual": payment_method,
            "proof_filename": display_name,
            "detected_mime": detected_mime,
            "note": note.strip() or None,
        },
        ip_address=request.client.host if request.client else None,
    )

    logger.info(
        "[InvoicePayment] Invoice #%s marked paid manually by user %s via %s",
        invoice_id, current_user.user_id, payment_method,
    )

    # Fire-and-forget email notification to the user who marked it paid (non-blocking)
    email_service.notify_invoice_paid(
        db,
        triggered_by_user_id=current_user.user_id,
        invoice_number=inv.invoice_number,
        total_amount=str(inv.total_amount or "0.00"),
        payment_method=payment_method,
        paid_at=now.strftime("%d %b %Y, %I:%M %p UTC"),
        proof_filename=display_name,
    )

    return APIResponse(
        success=True,
        data={
            "invoice_id": invoice_id,
            "invoice_number": inv.invoice_number,
            "payment_status": "PAID",
            "payment_proof_url": file_url,
            "payment_proof_filename": display_name,
            "payment_proof_note": inv.payment_proof_note,
            "payment_method_manual": payment_method,
            "marked_paid_at": now.isoformat(),
            "marked_paid_by_user_id": current_user.user_id,
        },
        message="Invoice marked as paid. Proof saved for auditor review.",
    )


# ━━━ GET /finance/invoices/{invoice_id}/payment-proof ━━━━━━━━━━━━━━━━━━━━━━

@router.get("/invoices/{invoice_id}/payment-proof", response_model=APIResponse)
async def get_payment_proof(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.PAYMENT_PROOF_READ)),
):
    """
    Return payment proof metadata and file URL for an invoice.
    Accessible by: accountant, finance_manager, auditor.
    """
    inv = await _get_invoice_or_404(db, invoice_id)

    if not inv.payment_proof_url:
        return APIResponse(
            success=True,
            data=None,
            message="No payment proof uploaded for this invoice.",
        )

    return APIResponse(
        success=True,
        data={
            "invoice_id": invoice_id,
            "invoice_number": inv.invoice_number,
            "payment_status": inv.payment_status.value if inv.payment_status else None,
            "payment_proof_url": inv.payment_proof_url,
            "payment_proof_filename": inv.payment_proof_filename,
            "payment_proof_note": inv.payment_proof_note,
            "payment_method_manual": inv.payment_method_manual,
            "marked_paid_at": inv.marked_paid_at.isoformat() if inv.marked_paid_at else None,
            "marked_paid_by_user_id": inv.marked_paid_by_user_id,
            "auditor_review_status": inv.auditor_review_status,
            "auditor_reviewed_at": inv.auditor_reviewed_at.isoformat() if inv.auditor_reviewed_at else None,
            "auditor_reviewed_by": inv.auditor_reviewed_by,
        },
        message="Payment proof retrieved.",
    )


# ━━━ POST /finance/invoices/{invoice_id}/auditor-review ━━━━━━━━━━━━━━━━━━━━

@router.post("/invoices/{invoice_id}/auditor-review", response_model=APIResponse)
async def submit_auditor_review(
    request: Request,
    invoice_id: int,
    status: str = Form(...),           # APPROVED | FLAGGED
    note: str = Form(""),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.PAYMENT_PROOF_REVIEW)),
):
    """
    Auditor marks proof as APPROVED or FLAGGED.
    Only callable by users with payment:proof:review permission (auditor role).
    """
    status = status.upper().strip()
    if status not in _AUDITOR_STATUSES:
        raise HTTPException(
            status_code=422,
            detail="status must be APPROVED or FLAGGED.",
        )

    inv = await _get_invoice_or_404(db, invoice_id)

    if not inv.payment_proof_url:
        raise HTTPException(
            status_code=400,
            detail="No payment proof has been uploaded for this invoice.",
        )

    now = datetime.now(timezone.utc)
    inv.auditor_review_status = status
    inv.auditor_reviewed_by = current_user.user_id
    inv.auditor_reviewed_at = now
    await db.commit()

    await log_audit(
        db,
        actor_id=current_user.user_id,
        actor_role=getattr(current_user, "role", None),
        action="invoice.auditor_review",
        entity_type="invoice",
        entity_id=str(invoice_id),
        new_state={"auditor_review_status": status, "note": note.strip() or None},
        ip_address=request.client.host if request.client else None,
    )

    logger.info(
        "[AuditorReview] Invoice #%s marked %s by user %s",
        invoice_id, status, current_user.user_id,
    )

    return APIResponse(
        success=True,
        data={
            "invoice_id": invoice_id,
            "auditor_review_status": status,
            "auditor_reviewed_at": now.isoformat(),
            "auditor_reviewed_by": current_user.user_id,
        },
        message=f"Invoice proof {status.lower()}.",
    )
