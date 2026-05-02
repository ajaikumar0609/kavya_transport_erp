# Auth Endpoints - Login, Refresh, Profile
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.db.postgres.connection import get_db
from app.core.config import settings
from app.core.security import TokenData, get_current_user, create_tokens, decode_token, bearer_scheme
from app.schemas.auth import LoginRequest, OtpSendRequest, OtpVerifyRequest, TokenResponse, UserInfo, RefreshRequest, LogoutRequest, ChangePasswordRequest, UpdatePhotoRequest, MarketDriverOtpSendRequest, MarketDriverOtpVerifyRequest, MarketDriverOtpResendRequest
from app.schemas.base import APIResponse
from app.services.auth_service import authenticate_by_identifier, authenticate_by_phone, authenticate_user, get_user_roles, refresh_access_token, change_password, get_user_by_id
from app.middleware.permissions import get_user_permissions
from app.services.token_blacklist import blacklist_token
from app.utils.rate_limit import (
    otp_send_limiter,
    otp_send_ip_limiter,
    otp_verify_limiter,
    login_limiter,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Role → default landing page mapping
ROLE_REDIRECT_MAP = {
    "admin": "/dashboard",
    "manager": "/dashboard",
    "fleet_manager": "/fleet/dashboard",
    "accountant": "/accountant/dashboard",
    "finance_manager": "/fm/dashboard",
    "auditor": "/auditor/dashboard",
    "clerk": "/clerk/dashboard",
    "project_associate": "/dashboard",
    "driver": "/driver/trips",
    "pump_operator": "/pump/dashboard",
    "tyre_inspector": "/tyre/dashboard",
}


def _get_redirect(roles: list[str]) -> str:
    """Return the landing page for the user's primary role."""
    for role in roles:
        if role.lower() in ROLE_REDIRECT_MAP:
            return ROLE_REDIRECT_MAP[role.lower()]
    return "/dashboard"


@router.post("/login", response_model=APIResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await login_limiter.check(request.client.host if request.client else "unknown")
    user = await authenticate_by_identifier(db, data.identifier, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    roles = await get_user_roles(db, user.id)
    tokens = create_tokens(
        user_id=user.id, email=user.email, roles=roles,
        tenant_id=user.tenant_id, branch_id=user.branch_id,
    )
    user.last_login = datetime.utcnow()
    all_perms = get_user_permissions(roles)
    user_info = UserInfo(
        id=user.id, email=user.email, first_name=user.first_name,
        last_name=user.last_name, phone=user.phone, roles=roles, permissions=all_perms,
        avatar_url=user.avatar_url, is_active=user.is_active, created_at=user.created_at,
        branch_id=user.branch_id, tenant_id=user.tenant_id,
        redirect_to=_get_redirect(roles),
        date_of_birth=str(user.date_of_birth) if user.date_of_birth else None,
        gender=user.gender,
        address=user.address,
        joining_date=str(user.joining_date) if user.joining_date else None,
        emergency_contact_name=user.emergency_contact_name,
        emergency_contact_phone=user.emergency_contact_phone,
        # Sensitive financial/ID fields intentionally excluded from login response.
        # Fetch them via GET /api/v1/users/me when needed.
        bank_account_holder=None,
        bank_name=None,
        account_number=None,
        ifsc_code=None,
        account_type=None,
        upi_id=None,
        salary_amount=None,
        pay_type=user.pay_type,
        aadhaar_file_url=None,
        aadhaar_file_name=None,
    )
    return APIResponse(success=True, data={
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "token_type": "bearer",
        "user": user_info.model_dump(),
    }, message="Login successful")


@router.post("/send-otp", response_model=APIResponse)
async def send_otp_for_login(data: OtpSendRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Step 1 of OTP login. Supports two channels:
      channel='sms'   — phone (10-digit) + password → OTP via MSG91/Brevo SMS
      channel='email' — identifier (email or employee ID) + password → OTP via Brevo email
    Rate-limited per phone/identifier and per IP.
    Password is verified first to prevent enumeration.
    """
    import asyncio
    from app.services.otp_service import create_otp_session, send_otp as _send_otp
    from app.services.brevo_service import send_email_otp
    from app.services.msg91_service import send_otp_msg91
    from app.db.mongodb.connection import MongoDB

    channel = (data.channel or "sms").lower()
    client_ip = request.client.host if request.client else "unknown"

    # ── Email channel ────────────────────────────────────────────────────────
    if channel == "email":
        if not data.identifier:
            raise HTTPException(status_code=400, detail="Provide your email address or Employee ID")
        identifier = data.identifier.strip()

        await otp_send_limiter.check(f"identifier:{identifier}")
        await otp_send_ip_limiter.check(f"ip:{client_ip}")

        user = await authenticate_by_identifier(db, identifier, data.password)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.email:
            raise HTTPException(status_code=400, detail="No email address on file — use SMS OTP instead")

        # Use phone for session storage (fallback to "email" placeholder if no phone)
        phone_for_session = user.phone.lstrip("+91").lstrip("91")[-10:] if user.phone else "0000000000"
        session = await create_otp_session(user.id, phone_for_session)
        otp = session["otp"]

        email_ok = await send_email_otp(user.email, otp)
        delivery = "email" if email_ok else "none"

        # Mask email: abc***@example.com
        parts = user.email.split("@")
        email_masked = parts[0][:3] + "***@" + parts[1] if len(parts) == 2 else user.email[:3] + "***"

        if delivery == "none":
            logger.warning(f"[OTP] Email delivery failed for user {user.id}")
            if settings.ENVIRONMENT != "production":
                logger.warning(f"[OTP-DEV] OTP for session {session['session_id']}: {otp}")

        return APIResponse(
            success=True,
            data={
                "session_id": session["session_id"],
                "email_masked": email_masked,
                "delivery": delivery,
            },
            message=f"OTP sent to {email_masked}" if delivery == "email" else "OTP generated — check server logs",
        )

    # ── SMS channel (default) ─────────────────────────────────────────────────
    if not data.phone:
        raise HTTPException(status_code=400, detail="Provide your registered mobile number")

    phone = data.phone.strip()
    if phone.startswith("+91"):
        phone = phone[3:]
    elif phone.startswith("91") and len(phone) == 12:
        phone = phone[2:]
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number")

    await otp_send_limiter.check(f"phone:{phone}")
    await otp_send_ip_limiter.check(f"ip:{client_ip}")

    user = await authenticate_by_phone(db, phone, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid phone number or password")

    session = await create_otp_session(user.id, phone)
    otp = session["otp"]

    # ── SMS delivery priority: 2Factor → MSG91 → Brevo SMS → email ──
    sms_ok = False

    # 1. Try 2Factor.in (primary)
    if settings.TWOFACTOR_ENABLED:
        try:
            from app.services.twofactor_service import send_otp_2factor
            tf_ok, tf_msg = await send_otp_2factor(phone, otp)
            sms_ok = tf_ok
            if not sms_ok:
                logger.warning(f"[OTP] 2Factor send failed: {tf_msg}")
        except Exception as exc:
            logger.warning(f"[OTP] 2Factor exception: {exc}")

    # 2. Fall back to MSG91 if 2Factor failed
    if not sms_ok and settings.MSG91_ENABLED:
        try:
            msg91_ok, _ = await send_otp_msg91(phone, otp)
            sms_ok = msg91_ok
        except Exception as exc:
            logger.warning(f"[OTP] MSG91 send failed: {exc}")

    email_ok = False
    if not sms_ok:
        # 3. Final fallback: Brevo SMS + email in parallel
        async def _noop() -> bool:
            return False

        brevo_sms_ok, email_result = await asyncio.gather(
            _send_otp(phone, otp),
            send_email_otp(user.email, otp) if user.email else _noop(),
            return_exceptions=True,
        )
        sms_ok = brevo_sms_ok is True
        email_ok = email_result is True

    if sms_ok:
        delivery = "SMS"
    elif email_ok:
        delivery = "email"
    else:
        delivery = "none"
        logger.warning(f"[OTP] All delivery channels failed for user {user.id}")

    response_data: dict = {
        "session_id": session["session_id"],
        "phone_masked": session["phone_masked"],
        "delivery": delivery,
    }

    if delivery == "none" and settings.ENVIRONMENT != "production":
        logger.warning(f"[OTP-DEV] OTP for session {session['session_id']}: {otp}")

    msg = {
        "SMS": "OTP sent to your registered number",
        "email": f"OTP sent to your registered email ({user.email[:3]}***)",
        "none": "OTP generated — check server logs (delivery unavailable)",
    }[delivery]

    return APIResponse(success=True, data=response_data, message=msg)


@router.post("/verify-otp", response_model=APIResponse)
async def verify_otp(data: OtpVerifyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    # Per-session limits brute force of 6-digit OTP for a given session.
    # Per-IP guards against parallel attacks across many sessions.
    await otp_verify_limiter.check(f"session:{data.session_id}")
    await otp_verify_limiter.check(f"ip:{client_ip}")
    from app.services.otp_service import verify_otp as _verify
    from app.services.msg91_service import verify_otp_msg91
    from app.db.mongodb.connection import MongoDB

    # Check if this session used MSG91 Widget — if so, verify via MSG91
    session_doc = await MongoDB.db.otp_sessions.find_one({"session_id": data.session_id})
    msg91_token = session_doc.get("msg91_access_token") if session_doc else None

    if msg91_token:
        # MSG91 Widget verification
        msg91_valid, _ = await verify_otp_msg91(msg91_token, data.otp)
        if not msg91_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired OTP — request a new one",
            )
        # Mark session as used
        await MongoDB.db.otp_sessions.update_one(
            {"session_id": data.session_id},
            {"$set": {"verified": True}},
        )
        user_id = session_doc.get("user_id")
        success = bool(user_id)
    else:
        success, user_id = await _verify(data.session_id, data.otp)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP — request a new one",
        )

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account inactive")

    roles = await get_user_roles(db, user.id)
    tokens = create_tokens(
        user_id=user.id, email=user.email, roles=roles,
        tenant_id=user.tenant_id, branch_id=user.branch_id,
    )
    user.last_login = datetime.utcnow()
    all_perms = get_user_permissions(roles)
    user_info = UserInfo(
        id=user.id, email=user.email, first_name=user.first_name,
        last_name=user.last_name, phone=user.phone, roles=roles, permissions=all_perms,
        avatar_url=user.avatar_url, is_active=user.is_active, created_at=user.created_at,
        branch_id=user.branch_id, tenant_id=user.tenant_id,
        redirect_to=_get_redirect(roles),
    )
    return APIResponse(success=True, data={
        "otp_required": False,
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "token_type": "bearer",
        "user": user_info.model_dump(),
    }, message="Login successful")


@router.post("/refresh", response_model=APIResponse)
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    result = await refresh_access_token(db, data.refresh_token)
    if not result:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")
    return APIResponse(success=True, data={
        "access_token": result["access_token"],
        "refresh_token": result["refresh_token"],
        "token_type": "bearer",
    })


@router.get("/me", response_model=APIResponse)
async def get_profile(current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user = await get_user_by_id(db, current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    roles = await get_user_roles(db, user.id)
    all_perms = get_user_permissions(roles)
    return APIResponse(success=True, data=UserInfo(
        id=user.id, email=user.email, first_name=user.first_name,
        last_name=user.last_name, phone=user.phone, roles=roles, permissions=all_perms,
        avatar_url=user.avatar_url, is_active=user.is_active, created_at=user.created_at,
        branch_id=user.branch_id, tenant_id=user.tenant_id,
        redirect_to=_get_redirect(roles),
        date_of_birth=str(user.date_of_birth) if user.date_of_birth else None,
        gender=user.gender,
        address=user.address,
        joining_date=str(user.joining_date) if user.joining_date else None,
        emergency_contact_name=user.emergency_contact_name,
        emergency_contact_phone=user.emergency_contact_phone,
        bank_account_holder=user.bank_account_holder,
        bank_name=user.bank_name,
        account_number=user.account_number,
        ifsc_code=user.ifsc_code,
        account_type=user.account_type,
        upi_id=user.upi_id,
        salary_amount=user.salary_amount,
        pay_type=user.pay_type,
        aadhaar_file_url=user.aadhaar_file_url,
        aadhaar_file_name=user.aadhaar_file_name,
    ).model_dump())


@router.put("/me/photo", response_model=APIResponse)
async def update_my_photo(
    payload: UpdatePhotoRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(db, current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    avatar_url = (payload.avatar_url or "").strip()
    if not avatar_url:
        raise HTTPException(status_code=400, detail="Photo is required")

    user.avatar_url = avatar_url
    return APIResponse(success=True, message="Profile photo updated successfully")


@router.post("/change-password", response_model=APIResponse)
async def api_change_password(data: ChangePasswordRequest, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    success = await change_password(db, current_user.user_id, data.current_password, data.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    return APIResponse(success=True, message="Password changed successfully")


@router.post("/logout", response_model=APIResponse)
async def logout(
    payload_body: LogoutRequest | None = None,
    current_user: TokenData = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    if credentials:
        token = credentials.credentials
        payload = decode_token(token)
    else:
        payload = None
    if payload:
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
            blacklist_token(jti, expires_at)
    # Also blacklist the refresh token if provided to prevent reuse after logout.
    if payload_body and payload_body.refresh_token:
        rt_payload = decode_token(payload_body.refresh_token)
        if rt_payload and rt_payload.get("type") == "refresh":
            rt_jti = rt_payload.get("jti")
            rt_exp = rt_payload.get("exp")
            if rt_jti and rt_exp:
                expires_at = datetime.fromtimestamp(rt_exp, tz=timezone.utc)
                blacklist_token(rt_jti, expires_at)
    # Audit log
    from app.services.audit_logger import log_audit
    await log_audit(
        db, actor_id=current_user.user_id, actor_role=",".join(current_user.roles),
        action="auth.logout", entity_type="user", entity_id=str(current_user.user_id),
    )
    await db.commit()
    return APIResponse(success=True, message="Logged out successfully")


# ── Market Driver OTP Login (phone-based, no password) ─────────────────────────

def _mask_phone_local(phone: str) -> str:
    """Return something like +91 XXXXX X7400"""
    clean = phone.strip().lstrip("+")
    if len(clean) >= 10:
        digits = clean[-10:]
        return f"+91 XXXXX X{digits[-4:]}"
    return "XXXXXXXXXX"


@router.post("/market-driver/send-otp", response_model=APIResponse)
async def market_driver_send_otp(data: MarketDriverOtpSendRequest):
    """
    Step 1: Market driver enters their phone number.
    We call MSG91 Widget to initiate OTP delivery and store a session.
    """
    from app.services.msg91_service import send_otp_msg91
    from app.services.otp_service import create_market_driver_otp_session

    # Normalise phone to 10 digits for storage/lookup
    phone = data.phone.strip().lstrip("+").lstrip("91")
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit Indian mobile number")

    # Send OTP via MSG91
    success, msg91_token = await send_otp_msg91("91" + phone)
    if not success:
        raise HTTPException(status_code=503, detail=f"Could not send OTP: {msg91_token}")

    # Store session in MongoDB
    session_id = await create_market_driver_otp_session(phone)

    return APIResponse(success=True, data={
        "session_id": session_id,
        "phone_masked": _mask_phone_local(phone),
        # msg91_token is the Widget access-token the client needs to return during verify
        "msg91_token": msg91_token,
    }, message="OTP sent to your registered number")


@router.post("/market-driver/resend-otp", response_model=APIResponse)
async def market_driver_resend_otp(data: MarketDriverOtpResendRequest):
    """
    Resend OTP: look up the session to get the phone, then re-initiate with MSG91.
    """
    from app.services.msg91_service import send_otp_msg91
    from app.services.otp_service import get_phone_from_session, create_market_driver_otp_session

    phone = await get_phone_from_session(data.session_id)
    if not phone:
        raise HTTPException(status_code=404, detail="Session not found or expired — please start again")

    success, msg91_token = await send_otp_msg91("91" + phone)
    if not success:
        raise HTTPException(status_code=503, detail=f"Could not resend OTP: {msg91_token}")

    # Create a fresh session for the same phone
    new_session_id = await create_market_driver_otp_session(phone)

    return APIResponse(success=True, data={
        "session_id": new_session_id,
        "phone_masked": _mask_phone_local(phone),
        "msg91_token": msg91_token,
    }, message="OTP resent")


@router.post("/market-driver/verify-otp", response_model=APIResponse)
async def market_driver_verify_otp(data: MarketDriverOtpVerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    Step 2: Client sends back session_id + MSG91 access_token.
    We verify the token with MSG91, look up market trips for the driver's phone,
    and issue a JWT with role 'market_driver'.
    """
    from app.services.msg91_service import verify_otp_msg91
    from app.services.otp_service import get_market_driver_otp_session, mark_market_driver_otp_verified
    from sqlalchemy import text

    # 1. Retrieve our local session
    session = await get_market_driver_otp_session(data.session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired — request a new OTP")
    if session.get("verified"):
        raise HTTPException(status_code=401, detail="OTP already used")

    # 2. Verify the MSG91 access-token (the actual OTP check)
    is_valid, msg = await verify_otp_msg91(data.access_token, data.otp_code)
    if not is_valid:
        raise HTTPException(status_code=401, detail=msg or "Invalid or expired OTP")

    # 3. Mark session consumed
    await mark_market_driver_otp_verified(data.session_id)

    phone = session["phone"]  # 10-digit, no country code

    # 4. Look up market trips for this driver phone to verify they have active trips
    result = await db.execute(
        text("SELECT id, driver_name FROM market_trips WHERE driver_phone = :phone LIMIT 1"),
        {"phone": phone},
    )
    trip_row = result.fetchone()

    # 5. Issue a JWT for the market driver.
    #    We use a synthetic user_id = 0 and embed the phone in the email field
    #    so routes can use it for filtering.  Role = 'market_driver'.
    from app.core.security import create_access_token, create_refresh_token, Token
    from app.core.config import settings
    from datetime import timedelta

    driver_name = trip_row[1] if trip_row else "Driver"
    access_token = create_access_token(
        user_id=0,  # synthetic — market drivers are not Users table rows
        email=f"mktdriver:{phone}",  # encode phone in email field for routing
        roles=["market_driver"],
        permissions=["market_trips:read", "market_trips:update_status"],
        expires_delta=timedelta(days=7),
    )
    refresh_tok = create_refresh_token(
        user_id=0,
        email=f"mktdriver:{phone}",
        expires_delta=timedelta(days=30),
    )

    return APIResponse(success=True, data={
        "access_token": access_token,
        "refresh_token": refresh_tok,
        "token_type": "bearer",
        "user": {
            "id": 0,
            "phone": phone,
            "name": driver_name,
            "roles": ["market_driver"],
            "redirect_to": "/market-driver/trips",
        },
    }, message="Login successful")
