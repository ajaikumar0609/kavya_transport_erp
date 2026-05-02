# Trip Model
# Transport ERP - PostgreSQL

from sqlalchemy import (
    Column, String, Integer, Boolean, ForeignKey, 
    DateTime, Text, Numeric, Date, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
import enum
from .base import Base, TimestampMixin, SoftDeleteMixin


class TripStatusEnum(enum.Enum):
    PLANNED = "PLANNED"
    VEHICLE_ASSIGNED = "VEHICLE_ASSIGNED"
    DRIVER_ASSIGNED = "DRIVER_ASSIGNED"
    READY = "READY"
    STARTED = "STARTED"
    LOADING = "LOADING"
    IN_TRANSIT = "IN_TRANSIT"
    UNLOADING = "UNLOADING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ExpenseCategory(enum.Enum):
    FUEL = "FUEL"
    TOLL = "TOLL"
    FOOD = "FOOD"
    PARKING = "PARKING"
    LOADING = "LOADING"
    UNLOADING = "UNLOADING"
    POLICE = "POLICE"
    RTO = "RTO"
    REPAIR = "REPAIR"
    TYRE = "TYRE"
    MISC = "MISC"
    ADVANCE = "ADVANCE"


class ExpenseStatusEnum(enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PAID = "PAID"


class Trip(Base, TimestampMixin, SoftDeleteMixin):
    """Trip model - represents a physical journey."""
    
    __tablename__ = "trips"
    
    # Trip Number
    trip_number = Column(String(30), unique=True, nullable=False, index=True)
    trip_date = Column(Date, nullable=False)
    
    # Job & LRs
    job_id = Column(Integer, ForeignKey('jobs.id'), nullable=False)
    
    # Vehicle
    vehicle_id = Column(Integer, ForeignKey('vehicles.id'), nullable=False)
    vehicle_registration = Column(String(20), nullable=True)  # Denormalized for quick access
    
    # Driver
    driver_id = Column(Integer, ForeignKey('drivers.id'), nullable=False)
    helper_id = Column(Integer, ForeignKey('drivers.id'), nullable=True)
    driver_name = Column(String(200), nullable=True)  # Denormalized
    driver_phone = Column(String(20), nullable=True)  # Denormalized
    
    # Route
    route_id = Column(Integer, ForeignKey('routes.id'), nullable=True)
    origin = Column(String(255), nullable=False)
    destination = Column(String(255), nullable=False)
    planned_distance_km = Column(Numeric(10, 2), nullable=True)
    actual_distance_km = Column(Numeric(10, 2), nullable=True)
    
    # Timing
    planned_start = Column(DateTime, nullable=True)
    planned_end = Column(DateTime, nullable=True)
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)
    
    loading_start = Column(DateTime, nullable=True)
    loading_end = Column(DateTime, nullable=True)
    unloading_start = Column(DateTime, nullable=True)
    unloading_end = Column(DateTime, nullable=True)
    
    # Odometer
    start_odometer = Column(Numeric(12, 2), nullable=True)
    end_odometer = Column(Numeric(12, 2), nullable=True)
    
    # Fuel
    estimated_fuel_litres = Column(Numeric(10, 2), nullable=True)
    actual_fuel_litres = Column(Numeric(10, 2), nullable=True)
    fuel_cost = Column(Numeric(12, 2), default=0)
    
    # Status
    status = Column(SQLEnum(TripStatusEnum, native_enum=False), default=TripStatusEnum.PLANNED)
    
    # Financial - Budget vs Actual
    budgeted_expense = Column(Numeric(12, 2), nullable=True)
    total_expense = Column(Numeric(12, 2), default=0)
    revenue = Column(Numeric(12, 2), default=0)
    profit_loss = Column(Numeric(12, 2), default=0)
    
    # Advance given to driver
    driver_advance = Column(Numeric(12, 2), default=0)
    advance_settled = Column(Boolean, default=False)
    
    # Driver pay (set by admin during trip allocation)
    driver_pay = Column(Numeric(12, 2), default=0)
    
    # Completion
    pod_collected = Column(Boolean, default=False)
    expenses_verified = Column(Boolean, default=False)
    verified_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    
    # Admin payment approval (admin approves after driver marks trip complete)
    payment_approved = Column(Boolean, default=False)
    payment_approved_at = Column(DateTime, nullable=True)
    payment_approved_by = Column(Integer, ForeignKey('users.id'), nullable=True)

    # Invoice
    is_invoiced = Column(Boolean, default=False)
    invoice_id = Column(Integer, ForeignKey('invoices.id'), nullable=True)
    
    # Remarks
    remarks = Column(Text, nullable=True)
    
    # Phase photos (driver app uploads)
    loaded_image_url = Column(String(500), nullable=True)
    reached_image_url = Column(String(500), nullable=True)
    unloaded_image_url = Column(String(500), nullable=True)
    pod_image_url = Column(String(500), nullable=True)

    # Driver advance payment (Finance Manager pays ₹1500 after loading)
    advance_paid = Column(Boolean, default=False)
    advance_paid_at = Column(DateTime, nullable=True)
    advance_paid_by_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    advance_paid_by_name = Column(String(200), nullable=True)
    advance_dismissed = Column(Boolean, default=False)

    # GPS Tracking (reference to MongoDB document)
    tracking_id = Column(String(50), nullable=True)  # MongoDB document ID

    # TMS Automation (EVT-06)
    pod_completed_at = Column(DateTime, nullable=True)
    
    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    job = relationship("Job", back_populates="trips")
    vehicle = relationship("Vehicle", back_populates="trips")
    driver = relationship("Driver", back_populates="trips", foreign_keys=[driver_id])
    helper = relationship("Driver", foreign_keys=[helper_id])
    route = relationship("Route")
    lrs = relationship("LR", back_populates="trip")
    expenses = relationship("TripExpense", back_populates="trip", cascade="all, delete-orphan")
    status_history = relationship("TripStatus", back_populates="trip", order_by="TripStatus.created_at")
    fuel_entries = relationship("TripFuelEntry", back_populates="trip", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Trip {self.trip_number}>"


class TripExpense(Base, TimestampMixin):
    """Trip expenses model."""
    
    __tablename__ = "trip_expenses"
    
    trip_id = Column(Integer, ForeignKey('trips.id', ondelete='CASCADE'), nullable=False)
    
    # Expense Details
    category = Column(SQLEnum(ExpenseCategory, native_enum=False), nullable=False)
    sub_category = Column(String(50), nullable=True)
    description = Column(String(255), nullable=True)
    
    # Amount
    amount = Column(Numeric(12, 2), nullable=False)
    
    # Payment
    payment_mode = Column(String(20), default='cash')  # cash, card, upi, fuel_card
    reference_number = Column(String(50), nullable=True)
    
    # Location
    location = Column(String(255), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    
    # Receipt
    receipt_url = Column(String(500), nullable=True)
    receipt_number = Column(String(50), nullable=True)
    
    # Verification
    is_verified = Column(Boolean, default=False)
    verified_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verification_remarks = Column(Text, nullable=True)
    
    # Expense approval status: PENDING -> APPROVED -> PAID (or REJECTED)
    expense_status = Column(SQLEnum(ExpenseStatusEnum, native_enum=False), default=ExpenseStatusEnum.PENDING)
    paid_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    payment_proof_url = Column(String(500), nullable=True)
    payment_proof_s3_key = Column(String(500), nullable=True)
    
    # Biometric verification (required for high-value expenses)
    biometric_verified = Column(Boolean, default=False)
    
    # Entry tracking
    entered_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    entry_source = Column(String(20), default='web')  # web, app, import
    
    expense_date = Column(DateTime, nullable=False)

    # TMS Automation (SCH-05)
    anomaly_flag = Column(Boolean, default=False)
    anomaly_reason = Column(String(255), nullable=True)
    
    # Relationships
    trip = relationship("Trip", back_populates="expenses")


class TripFuelEntry(Base, TimestampMixin):
    """Detailed fuel entries for trip."""
    
    __tablename__ = "trip_fuel_entries"
    
    trip_id = Column(Integer, ForeignKey('trips.id', ondelete='CASCADE'), nullable=False)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id'), nullable=False)
    
    # Fuel Details
    fuel_date = Column(DateTime, nullable=False)
    fuel_type = Column(String(20), default='diesel')
    quantity_litres = Column(Numeric(10, 2), nullable=False)
    rate_per_litre = Column(Numeric(8, 2), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    
    # Odometer
    odometer_reading = Column(Numeric(12, 2), nullable=True)
    
    # Filling Station
    pump_name = Column(String(200), nullable=True)
    pump_location = Column(String(255), nullable=True)
    bill_number = Column(String(50), nullable=True)
    bill_url = Column(String(500), nullable=True)
    
    # Payment
    payment_mode = Column(String(20), default='fuel_card')  # cash, fuel_card, credit
    fuel_card_number = Column(String(30), nullable=True)
    
    # Verification
    is_verified = Column(Boolean, default=False)
    
    # Relationships
    trip = relationship("Trip", back_populates="fuel_entries")


class TripStatus(Base, TimestampMixin):
    """Trip status change history."""
    
    __tablename__ = "trip_status_history"
    
    trip_id = Column(Integer, ForeignKey('trips.id', ondelete='CASCADE'), nullable=False)
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=False)
    changed_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Location when status changed
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    location_name = Column(String(255), nullable=True)
    
    remarks = Column(Text, nullable=True)
    
    # Relationships
    trip = relationship("Trip", back_populates="status_history")
    user = relationship("User")
