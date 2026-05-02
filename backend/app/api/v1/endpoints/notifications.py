# Notification Endpoints — SMS, WhatsApp
# Push notifications (FCM/Firebase) have been removed.
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import TokenData, get_current_user
from app.schemas.base import APIResponse
from app.middleware.permissions import require_permission, Permissions
from app.services import sms_service, whatsapp_service

router = APIRouter()


class SMSRequest(BaseModel):
    phone: str
    message: str


class WhatsAppRequest(BaseModel):
    phone: str
    message: str


class WhatsAppTemplateRequest(BaseModel):
    phone: str
    template_id: str
    params: list[str] = []


@router.post("/sms", response_model=APIResponse)
async def send_sms(
    payload: SMSRequest,
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.ALERT_MANAGE)),
):
    """Send SMS via MSG91."""
    result = await sms_service.send_sms(payload.phone, payload.message)
    return APIResponse(success=True, data=result, message="SMS sent")


@router.post("/whatsapp", response_model=APIResponse)
async def send_whatsapp(
    payload: WhatsAppRequest,
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.ALERT_MANAGE)),
):
    """Send WhatsApp message via Gupshup."""
    result = await whatsapp_service.send_whatsapp_message(payload.phone, payload.message)
    return APIResponse(success=True, data=result, message="WhatsApp message sent")


@router.post("/whatsapp/template", response_model=APIResponse)
async def send_whatsapp_template(
    payload: WhatsAppTemplateRequest,
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.ALERT_MANAGE)),
):
    result = await whatsapp_service.send_whatsapp_template(
        payload.phone, payload.template_id, payload.params,
    )
    return APIResponse(success=True, data=result, message="WhatsApp template sent")
