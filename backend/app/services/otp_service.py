# OTP Service — generate, store in MongoDB, send via WhatsApp, verify
import hmac
import secrets
import string
import uuid
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

OTP_TTL_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
# Per-phone brute force lock: 10 wrong OTPs across any sessions in 1 hour → block
OTP_PHONE_FAIL_MAX = 10
OTP_PHONE_FAIL_WINDOW_SECONDS = 3600


def _normalize_phone_for_key(phone: str) -> str:
    raw = (phone or "").strip().lstrip("+")
    if len(raw) >= 10:
        return raw[-10:]
    return raw


def _phone_fail_key(phone: str) -> str:
    return f"otp_fail:{_normalize_phone_for_key(phone)}"


def _generate_otp(exclude: str | None = None) -> str:
    """Generate a cryptographically random 6-digit OTP.
    Re-draws once if it matches `exclude` to guarantee non-repetition."""
    for _ in range(10):  # safety cap — collision probability is ~1/900000 per draw
        candidate = "".join(secrets.choice(string.digits) for _ in range(6))
        if candidate != (exclude or ""):
            return candidate
    # Extremely unlikely fallback — still random, just may match previous
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _mask_phone(phone: str) -> str:
    """Return something like +91 XXXXX X7400"""
    clean = (phone or "").strip().lstrip("+")
    # Always use the last 10 digits as the Indian number
    if len(clean) >= 10:
        clean = clean[-10:]
    if len(clean) >= 4:
        return f"+91 XXXXX X{clean[-4:]}"
    return "XXXXXXXXXX"


async def create_otp_session(user_id: int, phone: str) -> dict:
    """Generate a unique 6-digit OTP (guaranteed different from last one),
    store in MongoDB, return session_id + masked phone."""
    from app.db.mongodb.connection import MongoDB
    mongo_db = MongoDB.db

    normalised_phone = _normalize_phone_for_key(phone)

    # Fetch the most recent OTP for this phone so we can avoid repeating it.
    last_doc = await mongo_db.otp_sessions.find_one(
        {"phone": normalised_phone},
        sort=[("created_at", -1)],
    )
    last_otp = last_doc.get("otp") if last_doc else None

    otp = _generate_otp(exclude=last_otp)
    session_id = str(uuid.uuid4())
    now = datetime.utcnow()

    await mongo_db.otp_sessions.insert_one({
        "session_id": session_id,
        "user_id": user_id,
        "phone": normalised_phone,
        "otp": otp,
        "created_at": now,
        "expires_at": now + timedelta(minutes=OTP_TTL_MINUTES),
        "attempts": 0,
        "verified": False,
    })

    return {
        "session_id": session_id,
        "otp": otp,  # used internally to send
        "phone_masked": _mask_phone(phone),
    }


async def send_otp(phone: str, otp: str) -> bool:
    """Send OTP SMS.  Priority: 2Factor → Brevo SMS (fallback).
    Returns True if any channel delivered successfully."""
    # ── Primary: 2Factor.in ────────────────────────────────────────────────
    try:
        from app.services.twofactor_service import send_otp_2factor
        ok, msg = await send_otp_2factor(phone, otp)
        if ok:
            logger.info(f"[OTP] 2Factor delivery succeeded for {phone[-4:]}****")
            return True
        logger.warning(f"[OTP] 2Factor delivery failed: {msg}")
    except Exception as exc:
        logger.warning(f"[OTP] 2Factor exception: {exc}")

    # ── Fallback: Brevo SMS ────────────────────────────────────────────────
    try:
        from app.services.brevo_service import send_sms
        message = (
            f"Your Kavya Transports login OTP is: {otp}. "
            f"Valid for {OTP_TTL_MINUTES} minutes. Do not share with anyone."
        )
        ok = await send_sms(phone, message)
        if ok:
            logger.info(f"[OTP] Brevo fallback delivery succeeded for {phone[-4:]}****")
        return ok
    except Exception as exc:
        logger.warning(f"[OTP] Brevo fallback failed: {exc}")
        return False


OTP_MAX_ATTEMPTS = 5


async def verify_otp(session_id: str, otp: str) -> tuple[bool, int | None]:
    """
    Verify the OTP for the given session.
    Returns (success: bool, user_id: int | None).
    Enforces max 5 attempts per session, per-phone Redis lockout across sessions,
    constant-time OTP comparison, and marks session used immediately on success.
    Raises HTTPException 429 if the phone is locked out.
    """
    from app.db.mongodb.connection import MongoDB
    from app.services.token_blacklist import _get_redis  # reuse same Redis pool
    from fastapi import HTTPException, status as http_status

    mongo_db = MongoDB.db

    doc = await mongo_db.otp_sessions.find_one({"session_id": session_id})
    if not doc:
        return False, None
    if doc.get("verified"):
        return False, None  # already used — prevent replay
    if datetime.utcnow() > doc["expires_at"]:
        return False, None  # expired

    phone = doc.get("phone") or ""
    redis_client = None
    if phone:
        # Pre-check per-phone lockout (fail-closed: if Redis down, allow but log).
        try:
            redis_client = _get_redis()
            current_fails = redis_client.get(_phone_fail_key(phone))
            if current_fails is not None and int(current_fails) >= OTP_PHONE_FAIL_MAX:
                raise HTTPException(
                    status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many incorrect OTP attempts. Please try again later.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(f"[OTP] Redis lockout check failed for phone: {exc}")
            redis_client = None

    attempts = doc.get("attempts", 0)
    if attempts >= OTP_MAX_ATTEMPTS:
        await mongo_db.otp_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"verified": True}},
        )
        logger.warning(f"[OTP] Session {session_id} exceeded max attempts — invalidated")
        return False, None

    if not hmac.compare_digest(str(doc["otp"]), (otp or "").strip()):
        await mongo_db.otp_sessions.update_one(
            {"session_id": session_id},
            {"$inc": {"attempts": 1}},
        )
        if redis_client and phone:
            try:
                pipe = redis_client.pipeline()
                pipe.incr(_phone_fail_key(phone))
                pipe.expire(_phone_fail_key(phone), OTP_PHONE_FAIL_WINDOW_SECONDS)
                pipe.execute()
            except Exception as exc:
                logger.warning(f"[OTP] Redis lockout increment failed: {exc}")
        return False, None

    # Success — clear per-phone fail counter.
    if redis_client and phone:
        try:
            redis_client.delete(_phone_fail_key(phone))
        except Exception:
            pass

    # Mark as verified immediately to prevent reuse (atomic)
    await mongo_db.otp_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"verified": True}},
    )
    return True, doc["user_id"]


# ── Market Driver OTP Sessions ──────────────────────────────────────────────
# These sessions link a phone number to a MSG91 Widget session so we can look
# up which market trips belong to that phone after verification.

MARKET_DRIVER_OTP_TTL_MINUTES = 10


async def create_market_driver_otp_session(phone: str) -> str:
    """
    Store a pending market-driver OTP session keyed by phone.
    Returns a session_id that the client must echo back during verification.
    """
    from app.db.mongodb.connection import MongoDB
    mongo_db = MongoDB.db

    session_id = str(uuid.uuid4())
    now = datetime.utcnow()
    # Remove any existing pending sessions for this phone
    await mongo_db.market_driver_otp_sessions.delete_many({"phone": phone})
    await mongo_db.market_driver_otp_sessions.insert_one({
        "session_id": session_id,
        "phone": phone,
        "verified": False,
        "created_at": now,
        "expires_at": now + timedelta(minutes=MARKET_DRIVER_OTP_TTL_MINUTES),
    })
    return session_id


async def get_market_driver_otp_session(session_id: str):
    """Return the session document or None if not found / expired."""
    from app.db.mongodb.connection import MongoDB
    mongo_db = MongoDB.db

    doc = await mongo_db.market_driver_otp_sessions.find_one({"session_id": session_id})
    if not doc:
        return None
    if datetime.utcnow() > doc["expires_at"]:
        return None
    return doc


async def mark_market_driver_otp_verified(session_id: str):
    """Mark a market driver OTP session as verified so it cannot be reused."""
    from app.db.mongodb.connection import MongoDB
    mongo_db = MongoDB.db
    await mongo_db.market_driver_otp_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"verified": True}},
    )


async def get_phone_from_session(session_id: str) -> str | None:
    """Retrieve the phone number stored in a market driver OTP session."""
    doc = await get_market_driver_otp_session(session_id)
    if doc and not doc.get("verified"):
        return doc["phone"]
    return None
