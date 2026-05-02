# LR (Lorry Receipt) Schemas
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


class LRItemCreate(BaseModel):
    description: str
    hsn_code: Optional[str] = None
    packages: int = 1
    package_type: Optional[str] = None
    quantity: Optional[float] = None
    quantity_unit: Optional[str] = None
    actual_weight: Optional[float] = None
    charged_weight: Optional[float] = None
    rate: Optional[float] = None
    amount: Optional[float] = None


class LRItemResponse(BaseModel):
    id: int
    item_number: int
    description: str
    hsn_code: Optional[str] = None
    packages: int = 1
    package_type: Optional[str] = None
    quantity: Optional[float] = None
    quantity_unit: Optional[str] = None
    actual_weight: Optional[float] = None
    charged_weight: Optional[float] = None
    rate: Optional[float] = None
    amount: Optional[float] = None

    class Config:
        from_attributes = True


class LRCreate(BaseModel):
    lr_date: date
    job_id: int
    consignor_name: str
    consignor_address: Optional[str] = None
    consignor_gstin: Optional[str] = None
    consignor_phone: Optional[str] = None
    consignee_name: str
    consignee_address: Optional[str] = None
    consignee_gstin: Optional[str] = None
    consignee_phone: Optional[str] = None
    origin: str
    destination: str
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    eway_bill_number: Optional[str] = None
    eway_bill_date: Optional[date] = None
    eway_bill_valid_until: Optional[datetime] = None
    payment_mode: str = "to_be_billed"
    freight_amount: float = 0
    loading_charges: float = 0
    unloading_charges: float = 0
    detention_charges: float = 0
    other_charges: float = 0
    insurance_company: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    insurance_amount: Optional[float] = None
    declared_value: Optional[float] = None
    remarks: Optional[str] = None
    special_instructions: Optional[str] = None
    items: List[LRItemCreate] = []


class LRUpdate(BaseModel):
    consignor_name: Optional[str] = None
    consignor_address: Optional[str] = None
    consignor_gstin: Optional[str] = None
    consignee_name: Optional[str] = None
    consignee_address: Optional[str] = None
    consignee_gstin: Optional[str] = None
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    transport_type: Optional[str] = None
    eway_bill_number: Optional[str] = None
    payment_mode: Optional[str] = None
    freight_amount: Optional[float] = None
    loading_charges: Optional[float] = None
    unloading_charges: Optional[float] = None
    remarks: Optional[str] = None


class LRResponse(BaseModel):
    id: int
    lr_number: str
    lr_date: date
    job_id: int
    job_number: Optional[str] = None
    consignor_name: str
    consignor_gstin: Optional[str] = None
    consignee_name: str
    consignee_gstin: Optional[str] = None
    origin: str
    destination: str
    vehicle_id: Optional[int] = None
    vehicle_registration: Optional[str] = None
    driver_id: Optional[int] = None
    driver_name: Optional[str] = None
    trip_id: Optional[int] = None
    eway_bill_number: Optional[str] = None
    payment_mode: Optional[str] = None
    freight_amount: float = 0
    total_freight: float = 0
    declared_value: Optional[float] = None
    status: str = "draft"
    delivered_at: Optional[datetime] = None
    pod_uploaded: bool = False
    pod_file_url: Optional[str] = None
    items: List[LRItemResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LRStatusChange(BaseModel):
    status: str
    remarks: Optional[str] = None
    received_by: Optional[str] = None
