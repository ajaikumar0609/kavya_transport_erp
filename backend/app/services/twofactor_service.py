# 2Factor.in SMS OTP Service
# Sends OTPs via the 2Factor.in GET API.
# API KEY is stored in settings — never hard-coded or exposed to clients.
#
# Endpoint: GET https://2factor.in/API/V1/{API_KEY}/SMS/{PHONE_NUMBER}/{OTP}
#   PHONE_NUMBER — 10-digit Indian mobile number, no country code
#   OTP          — 6-digit OTP generated server-side

import asyncio
import logging
from urllib.parse import quote
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_2FACTOR_BASE_URL = "https://2factor.in/API/V1"
_RETRY_DELAY_SECONDS = 5
_TIMEOUT_SECONDS = 10


def _build_url(phone: str, otp: str) -> str:
    """Build the 2Factor API URL for sending an OTP SMS."""
    api_key = settings.TWOFACTOR_API_KEY
    template = (settings.TWOFACTOR_TEMPLATE_NAME or "").strip()
    base = f"{_2FACTOR_BASE_URL}/{api_key}/SMS/{phone}/{otp}"
    return f"{base}/{quote(template)}" if template else base


async def _do_send(phone: str, otp: str) -> tuple[bool, str]:
    """Perform a single HTTP GET request to the 2Factor API."""
    url = _build_url(phone, otp)
    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        resp = await client.get(url)
    try:
        data = resp.json()
    except Exception:
        data = {"Status": "Error", "Details": resp.text[:200]}

    logger.info(f"[2Factor] response status={resp.status_code} body={data}")

    status_str = (data.get("Status") or "").lower()
    if status_str == "success":
        return True, data.get("Details", "OTP sent via 2Factor")

    error_msg = data.get("Details") or data.get("Message") or f"HTTP {resp.status_code}"
    logger.warning(f"[2Factor] send failed: {error_msg}")
    return False, error_msg


async def send_otp_2factor(phone: str, otp: str) -> tuple[bool, str]:
    """
    Send an OTP via 2Factor.in SMS API.

    Args:
        phone: 10-digit Indian mobile number (no country code, no spaces).
        otp:   6-digit OTP string generated server-side.

    Returns:
        (success: bool, message: str)
        Retries once after RETRY_DELAY_SECONDS on failure before giving up.
    """
    if not settings.TWOFACTOR_ENABLED:
        logger.info("[2Factor] disabled via config — skipping send")
        return False, "2Factor disabled"

    # Normalise phone: strip +91 / 91 prefix, keep only 10 digits
    normalised = (phone or "").strip().lstrip("+")
    if normalised.startswith("91") and len(normalised) == 12:
        normalised = normalised[2:]
    if len(normalised) != 10 or not normalised.isdigit():
        logger.error(f"[2Factor] invalid phone number: {phone!r}")
        return False, "Invalid phone number format"

    # First attempt
    try:
        ok, msg = await _do_send(normalised, otp)
        if ok:
            return True, msg
    except Exception as exc:
        logger.warning(f"[2Factor] first attempt exception: {exc}")
        msg = str(exc)

    # Retry once after delay
    logger.info(f"[2Factor] retrying after {_RETRY_DELAY_SECONDS}s …")
    await asyncio.sleep(_RETRY_DELAY_SECONDS)
    try:
        ok, msg = await _do_send(normalised, otp)
        return ok, msg
    except Exception as exc:
        logger.error(f"[2Factor] retry also failed: {exc}")
        return False, str(exc)
