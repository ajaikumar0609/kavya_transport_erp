# User & Role Schemas
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: Optional[str] = Field(None, min_length=6)  # auto-generated when omitted
    first_name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role_names: List[str] = []
    branch_id: Optional[int] = None
    is_active: bool = True
    # Employee profile fields
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    joining_date: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    # Bank / salary fields
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
    pan_file_url: Optional[str] = None
    pan_file_name: Optional[str] = None
    passbook_file_url: Optional[str] = None
    passbook_file_name: Optional[str] = None
    # Driving License fields
    dl_file_url: Optional[str] = None
    dl_file_name: Optional[str] = None
    dl_number: Optional[str] = None
    dl_issue_date: Optional[str] = None
    dl_expiry_date: Optional[str] = None
    # Photo
    avatar_url: Optional[str] = None


class UserUpdateSelf(BaseModel):
    """Fields a regular user may update on their own profile.

    Privileged fields (role_names, is_active, salary_amount, branch_id, password)
    live on UserUpdateAdmin and are stripped if a non-admin caller submits them.
    """
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    # Personal profile fields
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    # KYC / bank documents — user may upload their own
    aadhaar_file_url: Optional[str] = None
    aadhaar_file_name: Optional[str] = None
    pan_file_url: Optional[str] = None
    pan_file_name: Optional[str] = None
    passbook_file_url: Optional[str] = None
    passbook_file_name: Optional[str] = None
    dl_file_url: Optional[str] = None
    dl_file_name: Optional[str] = None
    dl_number: Optional[str] = None
    dl_issue_date: Optional[str] = None
    dl_expiry_date: Optional[str] = None
    # Bank info — user may set/correct their own (immutable in practice via
    # business policy but technically self-serviceable).
    bank_account_holder: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_type: Optional[str] = None
    upi_id: Optional[str] = None


class UserUpdate(UserUpdateSelf):
    """Full update schema — ONLY admin/super_admin may pass these fields.

    Kept under the original name `UserUpdate` so the existing endpoint signature
    stays stable; the endpoint logic guards which fields are accepted per caller role.
    """
    password: Optional[str] = Field(None, min_length=6)
    role_names: Optional[List[str]] = None
    branch_id: Optional[int] = None
    is_active: Optional[bool] = None
    joining_date: Optional[str] = None
    salary_amount: Optional[str] = None
    pay_type: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    employee_id: Optional[str] = None
    roles: List[str] = []
    branch_id: Optional[int] = None
    is_active: bool = True
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None
    aadhaar_file_url: Optional[str] = None
    aadhaar_file_name: Optional[str] = None
    pan_file_url: Optional[str] = None
    pan_file_name: Optional[str] = None
    passbook_file_url: Optional[str] = None
    passbook_file_name: Optional[str] = None
    dl_file_url: Optional[str] = None
    dl_file_name: Optional[str] = None
    dl_number: Optional[str] = None
    dl_issue_date: Optional[str] = None
    dl_expiry_date: Optional[str] = None

    class Config:
        from_attributes = True
