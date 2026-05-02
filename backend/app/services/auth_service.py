# Auth Service - Login, Token Management
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.postgres.user import User, UserRole, Role, user_roles
from app.core.security import (
    verify_password,
    get_password_hash,
    create_tokens,
    decode_token,
    create_access_token,
    create_refresh_token,
)
from app.services.token_blacklist import (
    blacklist_token,
    is_token_blacklisted,
    force_logout_user,
)
from datetime import datetime, timezone
from fastapi import HTTPException, status as http_status

# Pre-computed bcrypt hash of an unknown password — used to equalize timing when
# the supplied identifier does not match any user, defeating user-enumeration
# attacks based on response latency. Cost factor matches our default (12).
_DUMMY_BCRYPT_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8Cz3p1c.hp/ZQ.wdIwXZQpvhcTrPSe"


async def authenticate_user(db: AsyncSession, email: str, password: str):
    """Authenticate user by email and password."""
    normalized_email = (email or "").strip().lower()
    normalized_password = (password or "").strip()
    result = await db.execute(
        select(User).where(func.lower(User.email) == normalized_email, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        # Equalize timing to prevent user-enumeration via response latency.
        verify_password(normalized_password, _DUMMY_BCRYPT_HASH)
        return None
    if not verify_password(normalized_password, user.password_hash):
        return None
    return user


async def authenticate_by_identifier(db: AsyncSession, identifier: str, password: str):
    """
    Authenticate by either email address or employee_id (e.g. KTD01).
    Returns the User ORM object on success, None otherwise.
    """
    cleaned = (identifier or "").strip()
    normalized_password = (password or "").strip()

    # Determine lookup strategy: if it looks like an email, use email lookup first;
    # otherwise look up by employee_id.
    user = None
    if "@" in cleaned:
        result = await db.execute(
            select(User).where(func.lower(User.email) == cleaned.lower(), User.is_active == True)
        )
        user = result.scalar_one_or_none()
    else:
        result = await db.execute(
            select(User).where(
                func.upper(User.employee_id) == cleaned.upper(),
                User.is_active == True,
            )
        )
        user = result.scalar_one_or_none()
        # Fall back to email lookup if still not found (edge case)
        if not user:
            result = await db.execute(
                select(User).where(func.lower(User.email) == cleaned.lower(), User.is_active == True)
            )
            user = result.scalar_one_or_none()

    if not user:
        # Equalize timing to prevent user-enumeration via response latency.
        verify_password(normalized_password, _DUMMY_BCRYPT_HASH)
        return None
    if not verify_password(normalized_password, user.password_hash):
        return None
    return user


async def authenticate_by_phone(db: AsyncSession, phone: str, password: str):
    """Authenticate staff user by phone number and password."""
    raw = (phone or "").strip()
    if raw.startswith("+91"):
        raw = raw[3:]
    elif raw.startswith("91") and len(raw) == 12:
        raw = raw[2:]
    cleaned_phone = raw
    normalized_password = (password or "").strip()

    result = await db.execute(
        select(User).where(User.phone == cleaned_phone, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        # Equalize timing to prevent user-enumeration via response latency.
        verify_password(normalized_password, _DUMMY_BCRYPT_HASH)
        return None
    if not verify_password(normalized_password, user.password_hash):
        return None
    return user


async def get_user_roles(db: AsyncSession, user_id: int) -> list[str]:
    """Get role names for a user.

    Queries BOTH the legacy ``user_roles`` association table (used by the
    original seed data) and the extended ``user_role_assignments`` table
    (written by the Add Employee form via the UserRole ORM model) so that
    roles are found regardless of which table they were written to.
    """
    from sqlalchemy import union

    q_legacy = (
        select(Role.name)
        .join(user_roles, user_roles.c.role_id == Role.id)
        .where(user_roles.c.user_id == user_id)
    )
    q_extended = (
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    combined = union(q_legacy, q_extended)
    result = await db.execute(combined)
    return [row[0] for row in result.all()]


async def get_user_by_id(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(
        select(User).where(User.email == email)
    )
    return result.scalar_one_or_none()


async def refresh_access_token(db: AsyncSession, refresh_token: str):
    """Rotate refresh token: validate the supplied token, blacklist its jti, and
    issue a brand-new access + refresh pair. Returns a dict on success, None on
    invalid/expired/revoked input.

    Reuse of an already-rotated refresh token is treated as a possible theft
    signal: the user is force-logged-out (all outstanding tokens invalidated).
    """
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        return None

    jti = payload.get("jti")
    user_id = int(payload["sub"])
    exp = payload.get("exp")

    # Replay detection: if jti is already revoked, the token is being reused.
    # Treat as theft and force-logout the user globally.
    if jti and is_token_blacklisted(jti):
        force_logout_user(user_id)
        return None

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        return None

    # Blacklist the consumed refresh token for its remaining lifetime.
    if jti and exp:
        try:
            expires_at = datetime.fromtimestamp(int(exp), tz=timezone.utc)
            blacklist_token(jti, expires_at)
        except Exception:
            # Failure to blacklist is logged inside blacklist_token; do not block rotation.
            pass

    roles = await get_user_roles(db, user_id)
    from app.middleware.permissions import get_user_permissions
    permissions = get_user_permissions(roles)
    new_access = create_access_token(
        user_id=user.id,
        email=user.email,
        roles=roles,
        permissions=permissions,
        tenant_id=user.tenant_id,
        branch_id=user.branch_id,
    )
    new_refresh = create_refresh_token(user_id=user.id, email=user.email)
    return {"access_token": new_access, "refresh_token": new_refresh}


async def change_password(db: AsyncSession, user_id: int, current_password: str, new_password: str) -> bool:
    user = await get_user_by_id(db, user_id)
    if not user:
        return False
    if not verify_password(current_password, user.password_hash):
        return False
    user.password_hash = get_password_hash(new_password)
    await db.flush()
    # Invalidate every outstanding access/refresh token for this user.
    # The forced_logout timestamp check in get_current_user rejects tokens
    # issued before this moment, so a stolen token is killed on password change.
    force_logout_user(user_id)
    return True
