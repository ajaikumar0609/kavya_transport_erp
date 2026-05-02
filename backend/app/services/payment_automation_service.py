# Payment Automation Service — payment links, reconciliation
# Transport ERP (Razorpay removed)

import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.postgres.finance_automation import (
    PaymentLink, PaymentLinkStatus,
)

logger = logging.getLogger(__name__)

async def create_payment_link_for_invoice(
    db: AsyncSession, invoice_id: int, user_id: int = None
) -> "PaymentLink | None":
    """
    Payment link creation — Razorpay removed.
    Links are now created manually via finance endpoints.
    """
    return None


async def process_razorpay_webhook(db: AsyncSession, event: str, payload: dict) -> dict:
    """Razorpay webhook removed. Returns unprocessed."""
    return {"processed": False, "event": event}


def verify_razorpay_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify Razorpay webhook signature using HMAC-SHA256."""
    import hmac
    import hashlib
    from app.core.config import settings

    secret = getattr(settings, "RAZORPAY_WEBHOOK_SECRET", None) or getattr(settings, "RAZORPAY_KEY_SECRET", None)
    if not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def list_payment_links(
    db: AsyncSession, invoice_id: int = None, status: str = None,
    page: int = 1, limit: int = 20,
) -> tuple:
    """List payment links with optional filters."""
    query = select(PaymentLink).where(PaymentLink.is_deleted == False)
    count_query = select(func.count(PaymentLink.id)).where(PaymentLink.is_deleted == False)

    if invoice_id:
        query = query.where(PaymentLink.invoice_id == invoice_id)
        count_query = count_query.where(PaymentLink.invoice_id == invoice_id)
    if status:
        query = query.where(PaymentLink.status == PaymentLinkStatus[status.upper()])
        count_query = count_query.where(PaymentLink.status == PaymentLinkStatus[status.upper()])

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(PaymentLink.id.desc()))
    return result.scalars().all(), total


async def resend_payment_link(db: AsyncSession, link_id: int) -> PaymentLink | None:
    """Group 2.3 — Resend payment link (increment send_count)."""
    link = await db.get(PaymentLink, link_id)
    if not link or link.status in (PaymentLinkStatus.PAID, PaymentLinkStatus.CANCELLED):
        return None

    link.send_count = (link.send_count or 0) + 1
    link.last_sent_at = datetime.utcnow()
    link.status = PaymentLinkStatus.SENT
    await db.flush()

    # In production: re-send link via WhatsApp/Email
    logger.info(f"Resent payment link {link.link_id} (count: {link.send_count})")
    return link
