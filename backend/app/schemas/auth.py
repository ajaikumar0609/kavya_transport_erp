# Auth Schemas
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class LoginRequest(BaseModel):
    """Accepts either an email address or an employee ID (e.g. KTD01) as identifier."""
    identifier: str = Field(..., min_length=2, description="Employee ID (e.g. KTD01) or admin email")
    password: str = Field(..., min_length=4)


class OtpVerifyRequest(BaseModel):
    session_id: str
    otp: str = Field(..., min_length=6, max_length=6)


class OtpInitResponse(BaseModel):
    otp_required: bool = True
    session_id: str
    phone_masked: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserInfo"


class UserInfo(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    roles: List[str] = []
    permissions: List[str] = []
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    branch_id: Optional[int] = None
    tenant_id: Optional[int] = None
    redirect_to: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    joining_date: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_type: Optional[str] = None
    upi_id: Optional[str] = None
    salary_amount: Optional[str] = None
    pay_type: Optional[str] = None
    aadhaar_file_url: Optional[str] = None
    aadhaar_file_name: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class UpdatePhotoRequest(BaseModel):
    avatar_url: str = Field(..., min_length=1)


# ── Market Driver OTP ──────────────────────────────────────────────────────────

class OtpSendRequest(BaseModel):
    """Staff OTP login — phone or identifier + password required to prevent enumeration."""
    phone: Optional[str] = Field(None, description="10-digit Indian mobile number (SMS channel)")
    identifier: Optional[str] = Field(None, description="Email or Employee ID (email channel)")
    password: str = Field(..., min_length=4)
    channel: str = Field("sms", description="Delivery channel: 'sms' or 'email'")


class MarketDriverOtpSendRequest(BaseModel):
    """Client sends phone number; server calls MSG91 and returns session_id."""
    phone: str = Field(..., description="10-digit Indian mobile number (without +91)")


class MarketDriverOtpSendResponse(BaseModel):
    session_id: str
    phone_masked: str
    message: str = "OTP sent"


class MarketDriverOtpVerifyRequest(BaseModel):
    """Client sends session_id, the MSG91 access-token, and the 6-digit OTP code."""
    session_id: str
    access_token: str  # token returned by backend send-otp (from MSG91 initiate)
    otp_code: str       # 6-digit OTP entered by the user


class MarketDriverOtpResendRequest(BaseModel):
    session_id: str  # the session_id from the initial send call


TokenResponse.model_rebuild()
