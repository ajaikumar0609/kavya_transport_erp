# Production-grade Transactional Email Notification Service
# Sends business event emails via the Brevo REST API.
#
# Design rules:
#  - NEVER hardcode recipient emails — always fetch from DB
#  - NEVER send if user email is missing or blank
#  - NEVER block the main request — all public methods are fire-and-forget
#  - Catch + log Brevo API errors; retry max 2 times with 3-second back-off
#  - API key is read from settings (env var) — never exposed to frontend

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.mongodb.connection import get_collection
from app.models.postgres.user import User
from app.services import email_templates as tmpl

logger = logging.getLogger(__name__)

_BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"
_MAX_RETRIES = 2
_RETRY_DELAY_SECONDS = 3.0


# ══════════════════════════════════════════════════════════════════════════
#  Core Helpers
# ══════════════════════════════════════════════════════════════════════════

async def get_user_info(db: AsyncSession, user_id: int) -> tuple[str | None, str | None]:
    """
    Return (email, display_name) for a user.
    Returns (None, None) if user not found, inactive, or email is blank.
    """
    try:
        result = await db.execute(
            select(User.email, User.first_name, User.last_name)
            .where(User.id == user_id, User.is_active.is_(True))
        )
        row = result.one_or_none()
        if not row:
            logger.warning("[EmailService] User %s not found or inactive — skipping email", user_id)
            return None, None

        email, first_name, last_name = row
        if not email or not email.strip():
            logger.warning("[EmailService] User %s has no email address — skipping", user_id)
            return None, None

        display_name = first_name or ""
        if last_name:
            display_name = f"{display_name} {last_name}".strip()

        return email.strip(), display_name or "Team Member"
    except Exception as exc:
        logger.error("[EmailService] Failed to fetch user %s email: %s", user_id, exc)
        return None, None


async def send_email(to_address: str, subject: str, html_content: str) -> bool:
    """
    Low-level: POST to Brevo /smtp/email with retry.
    Returns True on success, False on final failure (non-fatal).
    Logs the email attempt in MongoDB regardless of outcome.
    """
    api_key = getattr(settings, "BREVO_API_KEY", None)
    if not api_key or api_key == "YOUR_BREVO_API_KEY_HERE":
        logger.warning("[EmailService] BREVO_API_KEY not configured — email to %s not sent", to_address)
        return False

    payload = {
        "sender": {
            "name": getattr(settings, "BREVO_EMAIL_SENDER_NAME", "Kavya Transports"),
            "email": getattr(settings, "BREVO_EMAIL_SENDER", "noreply@kavyatransports.com"),
        },
        "to": [{"email": to_address}],
        "subject": subject,
        "htmlContent": html_content,
    }
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    status = "failed"
    error_detail: str | None = None
    last_http_status: int | None = None

    for attempt in range(1, _MAX_RETRIES + 2):  # attempts 1,2,3 (max 2 retries)
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(_BREVO_EMAIL_URL, json=payload, headers=headers)
                last_http_status = resp.status_code

                if resp.status_code in (200, 201):
                    status = "sent"
                    logger.info("[EmailService] Email sent to %s (subject: %s)", to_address, subject)
                    break

                error_detail = resp.text[:300]
                logger.warning(
                    "[EmailService] Brevo returned %s on attempt %s/%s to %s: %s",
                    resp.status_code, attempt, _MAX_RETRIES + 1, to_address, error_detail,
                )

                # 4xx errors are not retryable (bad request, auth failure)
                if resp.status_code < 500:
                    break

        except httpx.TimeoutException as exc:
            error_detail = f"Timeout: {exc}"
            logger.warning("[EmailService] Timeout on attempt %s to %s", attempt, to_address)
        except Exception as exc:
            error_detail = str(exc)
            logger.error("[EmailService] Unexpected error on attempt %s to %s: %s", attempt, to_address, exc)
            break  # Non-HTTP errors are not retryable

        if attempt <= _MAX_RETRIES:
            await asyncio.sleep(_RETRY_DELAY_SECONDS)

    # ── Log to MongoDB (best-effort, never raises) ────────────────────────
    try:
        col = get_collection("email_logs")
        if col is not None:
            await col.insert_one({
                "to": to_address,
                "subject": subject,
                "status": status,
                "http_status": last_http_status,
                "error": error_detail,
                "sent_at": datetime.now(timezone.utc),
            })
    except Exception as log_exc:
        logger.debug("[EmailService] MongoDB email log failed (non-fatal): %s", log_exc)

    return status == "sent"


async def _send_to_user(db: AsyncSession, user_id: int, subject: str, html_content: str) -> None:
    """Fetch user email and send. Swallows all exceptions — for background use."""
    try:
        email, _ = await get_user_info(db, user_id)
        if email:
            await send_email(email, subject, html_content)
    except Exception as exc:
        logger.error("[EmailService] _send_to_user(%s) failed: %s", user_id, exc)


# ══════════════════════════════════════════════════════════════════════════
#  Fire-and-Forget Background Wrapper
# ══════════════════════════════════════════════════════════════════════════

def _fire_and_forget(coro) -> None:
    """Schedule a coroutine as a background task (non-blocking)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(coro)
        else:
            loop.run_until_complete(coro)
    except Exception as exc:
        logger.debug("[EmailService] fire_and_forget scheduling error: %s", exc)


# ══════════════════════════════════════════════════════════════════════════
#  Event-Specific Trigger Functions  (all fire-and-forget)
# ══════════════════════════════════════════════════════════════════════════

def notify_job_created(
    db: AsyncSession,
    *,
    triggered_by_user_id: int,
    job_number: str,
    origin: str = "",
    destination: str = "",
    client_name: str = "",
    pickup_date: str = "",
    material: str = "",
    quantity: str = "",
    created_by_name: str = "",
) -> None:
    """
    Fire-and-forget email to the user who created the job.
    Call AFTER db.commit() — does NOT use db for writing.
    """
    async def _task():
        try:
            email, user_name = await get_user_info(db, triggered_by_user_id)
            if not email:
                return
            subject, html = tmpl.render_job_created(
                user_name=user_name or "Team Member",
                job_number=job_number,
                origin=origin,
                destination=destination,
                client_name=client_name,
                pickup_date=pickup_date,
                material=material,
                quantity=quantity,
                created_by=created_by_name or user_name or "System",
            )
            await send_email(email, subject, html)
        except Exception as exc:
            logger.error("[EmailService] notify_job_created failed: %s", exc)

    _fire_and_forget(_task())


def notify_job_status_updated(
    db: AsyncSession,
    *,
    triggered_by_user_id: int,
    job_number: str,
    old_status: str,
    new_status: str,
    remarks: str = "",
    updated_by_name: str = "",
) -> None:
    """Fire-and-forget email on job status change."""
    async def _task():
        try:
            email, user_name = await get_user_info(db, triggered_by_user_id)
            if not email:
                return
            subject, html = tmpl.render_job_status_updated(
                user_name=user_name or "Team Member",
                job_number=job_number,
                old_status=old_status,
                new_status=new_status,
                remarks=remarks,
                updated_by=updated_by_name or user_name or "System",
            )
            await send_email(email, subject, html)
        except Exception as exc:
            logger.error("[EmailService] notify_job_status_updated failed: %s", exc)

    _fire_and_forget(_task())


def notify_trip_status_updated(
    db: AsyncSession,
    *,
    triggered_by_user_id: int,
    trip_number: str,
    old_status: str,
    new_status: str,
    vehicle_number: str = "",
    driver_name: str = "",
    origin: str = "",
    destination: str = "",
    remarks: str = "",
    updated_by_name: str = "",
) -> None:
    """Fire-and-forget email on trip status change."""
    async def _task():
        try:
            email, user_name = await get_user_info(db, triggered_by_user_id)
            if not email:
                return
            subject, html = tmpl.render_trip_status_updated(
                user_name=user_name or "Team Member",
                trip_number=trip_number,
                old_status=old_status,
                new_status=new_status,
                vehicle_number=vehicle_number,
                driver_name=driver_name,
                origin=origin,
                destination=destination,
                remarks=remarks,
                updated_by=updated_by_name or user_name or "System",
            )
            await send_email(email, subject, html)
        except Exception as exc:
            logger.error("[EmailService] notify_trip_status_updated failed: %s", exc)

    _fire_and_forget(_task())


def notify_invoice_created(
    db: AsyncSession,
    *,
    triggered_by_user_id: int,
    invoice_number: str,
    client_name: str = "",
    total_amount: str = "0.00",
    due_date: str = "",
    line_items_count: int = 0,
    created_by_name: str = "",
) -> None:
    """Fire-and-forget email to invoice creator on invoice generation."""
    async def _task():
        try:
            email, user_name = await get_user_info(db, triggered_by_user_id)
            if not email:
                return
            subject, html = tmpl.render_invoice_created(
                user_name=user_name or "Team Member",
                invoice_number=invoice_number,
                client_name=client_name,
                total_amount=total_amount,
                due_date=due_date,
                line_items_count=line_items_count,
                created_by=created_by_name or user_name or "System",
            )
            await send_email(email, subject, html)
        except Exception as exc:
            logger.error("[EmailService] notify_invoice_created failed: %s", exc)

    _fire_and_forget(_task())


def notify_invoice_paid(
    db: AsyncSession,
    *,
    triggered_by_user_id: int,
    invoice_number: str,
    client_name: str = "",
    total_amount: str = "0.00",
    payment_method: str = "bank_transfer",
    paid_at: str = "",
    proof_filename: str = "",
    marked_by_name: str = "",
) -> None:
    """Fire-and-forget email when invoice is manually marked paid."""
    async def _task():
        try:
            email, user_name = await get_user_info(db, triggered_by_user_id)
            if not email:
                return
            subject, html = tmpl.render_invoice_paid(
                user_name=user_name or "Team Member",
                invoice_number=invoice_number,
                client_name=client_name,
                total_amount=total_amount,
                payment_method=payment_method,
                paid_at=paid_at,
                marked_by=marked_by_name or user_name or "System",
                proof_filename=proof_filename,
            )
            await send_email(email, subject, html)
        except Exception as exc:
            logger.error("[EmailService] notify_invoice_paid failed: %s", exc)

    _fire_and_forget(_task())


def notify_report_generated(
    db: AsyncSession,
    *,
    triggered_by_user_id: int,
    report_title: str,
    report_type: str,
    period: str = "",
    download_url: str = "",
) -> None:
    """Fire-and-forget email when a report is ready for download."""
    async def _task():
        try:
            email, user_name = await get_user_info(db, triggered_by_user_id)
            if not email:
                return
            generated_at = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")
            subject, html = tmpl.render_report_generated(
                user_name=user_name or "Team Member",
                report_title=report_title,
                report_type=report_type,
                generated_at=generated_at,
                period=period,
                download_url=download_url,
            )
            await send_email(email, subject, html)
        except Exception as exc:
            logger.error("[EmailService] notify_report_generated failed: %s", exc)

    _fire_and_forget(_task())
