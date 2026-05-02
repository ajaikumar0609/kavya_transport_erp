# Vehicle Model
# Transport ERP - PostgreSQL

from sqlalchemy import (
    Column, String, Integer, Boolean, Float, ForeignKey,
    DateTime, Text, Numeric, Date, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
import enum
from .base import Base, TimestampMixin, SoftDeleteMixin


class VehicleType(enum.Enum):
    FLATBED_TRUCK = "FLATBED_TRUCK"
    CONTAINER_TRUCK = "CONTAINER_TRUCK"
    TIPPER_TRUCK = "TIPPER_TRUCK"
    TANKER_GENERIC = "TANKER_GENERIC"
    REFRIGERATED_TRUCK = "REFRIGERATED_TRUCK"
    CAR_CARRIER = "CAR_CARRIER"
    TRACTOR_HEAD = "TRACTOR_HEAD"
    # Legacy values kept for backwards compatibility
    TRUCK = "TRUCK"
    TRAILER = "TRAILER"
    TANKER = "TANKER"
    CONTAINER = "CONTAINER"
    LCV = "LCV"
    MINI_TRUCK = "MINI_TRUCK"


class VehicleStatus(enum.Enum):
    AVAILABLE = "AVAILABLE"
    ON_TRIP = "ON_TRIP"
    MAINTENANCE = "MAINTENANCE"
    BREAKDOWN = "BREAKDOWN"
    INACTIVE = "INACTIVE"


class OwnershipType(enum.Enum):
    OWNED = "OWNED"
    LEASED = "LEASED"
    ATTACHED = "ATTACHED"
    MARKET = "MARKET"


class Vehicle(Base, TimestampMixin, SoftDeleteMixin):
    """Vehicle/Fleet model."""
    
    __tablename__ = "vehicles"
    
    # Basic Info
    registration_number = Column(String(20), unique=True, nullable=False, index=True)
    vehicle_type = Column(SQLEnum(VehicleType, native_enum=False), nullable=False)
    vehicle_size_class = Column(String(50), nullable=True)   # mini_pickup, lcv, mcv, hcv, trailer_articulated
    axle_wheel_type = Column(String(20), nullable=True)      # 4w, 6w, 10w, 12w, 14w, tr_6w, tr_10w
    make = Column(String(50), nullable=True)  # TATA, Ashok Leyland, etc.
    model = Column(String(100), nullable=True)
    year_of_manufacture = Column(Integer, nullable=True)
    chassis_number = Column(String(50), nullable=True)
    engine_number = Column(String(50), nullable=True)
    
    # Capacity
    capacity_tons = Column(Numeric(10, 2), nullable=True)
    capacity_volume = Column(Numeric(10, 2), nullable=True)  # cubic feet
    num_axles = Column(Integer, default=2)
    num_tyres = Column(Integer, nullable=True)
    
    # Ownership
    ownership_type = Column(SQLEnum(OwnershipType, native_enum=False), default=OwnershipType.OWNED)
    owner_name = Column(String(200), nullable=True)
    owner_phone = Column(String(20), nullable=True)
    
    # Status
    status = Column(SQLEnum(VehicleStatus, native_enum=False), default=VehicleStatus.AVAILABLE)
    current_location = Column(String(255), nullable=True)
    current_latitude = Column(Numeric(10, 8), nullable=True)
    current_longitude = Column(Numeric(11, 8), nullable=True)
    odometer_reading = Column(Numeric(12, 2), default=0)
    
    # Fuel
    fuel_type = Column(String(20), default='diesel')
    fuel_tank_capacity = Column(Numeric(10, 2), nullable=True)
    mileage_per_litre = Column(Numeric(6, 2), nullable=True)
    
    # GPS Device
    gps_device_id = Column(String(100), nullable=True)
    gps_provider = Column(String(50), nullable=True)
    gps_provider_status = Column(String(20), nullable=True)  # active/pending/error/disabled
    last_gps_at = Column(DateTime(timezone=True), nullable=True)
    last_speed = Column(Float, nullable=True)          # km/h from GPS provider
    last_ignition_on = Column(Boolean, nullable=True)  # ignition state from GPS provider
    
    # Fitness & Permits
    fitness_valid_until = Column(Date, nullable=True)
    permit_valid_until = Column(Date, nullable=True)
    insurance_valid_until = Column(Date, nullable=True)
    puc_valid_until = Column(Date, nullable=True)
    
    # Financial
    purchase_value = Column(Numeric(15, 2), nullable=True)
    current_value = Column(Numeric(15, 2), nullable=True)

    # TMS Automation (SCH-03)
    odometer_at_last_service = Column(Numeric(12, 2), nullable=True)
    last_service_date = Column(Date, nullable=True)

    # Default assigned driver (set by fleet manager)
    default_driver_id = Column(Integer, ForeignKey('drivers.id'), nullable=True)

    # Multi-tenant
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)
    
    # Relationships
    documents = relationship("VehicleDocument", back_populates="vehicle", cascade="all, delete-orphan")
    maintenance_records = relationship("VehicleMaintenance", back_populates="vehicle")
    trips = relationship("Trip", back_populates="vehicle")
    tyres = relationship("VehicleTyre", back_populates="vehicle")
    default_driver = relationship("Driver", foreign_keys=[default_driver_id])
    
    def __repr__(self):
        return f"<Vehicle {self.registration_number}>"


class VehicleDocument(Base, TimestampMixin):
    """Vehicle documents storage."""
    
    __tablename__ = "vehicle_documents"
    
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=False)
    document_type = Column(String(50), nullable=False)  # rc, insurance, permit, fitness, puc
    document_number = Column(String(100), nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    file_url = Column(String(500), nullable=True)
    remarks = Column(Text, nullable=True)
    is_verified = Column(Boolean, default=False)
    verified_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    vehicle = relationship("Vehicle", back_populates="documents")


class Workshop(Base, TimestampMixin, SoftDeleteMixin):
    """Workshop/garage for vehicle servicing."""
    
    __tablename__ = "workshops"
    
    name = Column(String(200), nullable=False)
    code = Column(String(30), unique=True, nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(10), nullable=True)
    contact_person = Column(String(200), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(200), nullable=True)
    specialization = Column(String(100), nullable=True)  # general, engine, electrical, tyre, body
    rating = Column(Numeric(2, 1), nullable=True)  # 0.0 - 5.0
    is_empanelled = Column(Boolean, default=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)
    
    # Relationships
    maintenance_records = relationship("VehicleMaintenance", back_populates="workshop")


class VehicleMaintenance(Base, TimestampMixin):
    """Vehicle maintenance records."""
    
    __tablename__ = "vehicle_maintenance"
    
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=False)
    maintenance_type = Column(String(50), nullable=False)  # scheduled, breakdown, accident
    service_type = Column(String(100), nullable=True)  # oil_change, tyre_change, etc.
    description = Column(Text, nullable=True)
    odometer_at_service = Column(Numeric(12, 2), nullable=True)
    service_date = Column(Date, nullable=False)
    next_service_date = Column(Date, nullable=True)
    next_service_km = Column(Numeric(12, 2), nullable=True)
    vendor_name = Column(String(200), nullable=True)
    workshop_id = Column(Integer, ForeignKey('workshops.id'), nullable=True)
    invoice_number = Column(String(50), nullable=True)
    work_order_number = Column(String(50), nullable=True)
    parts_description = Column(Text, nullable=True)
    parts_cost = Column(Numeric(12, 2), default=0)
    labor_cost = Column(Numeric(12, 2), default=0)
    total_cost = Column(Numeric(12, 2), default=0)
    status = Column(String(20), default='completed')  # pending, in_progress, completed
    
    # Relationships
    vehicle = relationship("Vehicle", back_populates="maintenance_records")
    workshop = relationship("Workshop", back_populates="maintenance_records")


class VehicleTyre(Base, TimestampMixin):
    """Tyre management for vehicles."""
    
    __tablename__ = "vehicle_tyres"
    
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=True)
    tyre_number = Column(String(50), nullable=False)  # Serial number
    manufacturer_serial = Column(String(100), nullable=True)  # Manufacturer's serial number
    position = Column(String(20), nullable=True)  # FL, FR, RL1, RR1, etc. (NULL = in stock)
    brand = Column(String(50), nullable=True)
    model = Column(String(100), nullable=True)
    size = Column(String(20), nullable=True)
    ply_rating = Column(String(10), nullable=True)
    purchase_date = Column(Date, nullable=True)
    purchase_cost = Column(Numeric(10, 2), nullable=True)
    km_at_fitment = Column(Numeric(12, 2), nullable=True)
    current_km = Column(Numeric(12, 2), nullable=True)
    condition = Column(String(20), default='good')  # new, good, average, worn, replaced
    is_active = Column(Boolean, default=True)
    
    # Retread tracking
    retread_count = Column(Integer, default=0)
    max_retreads = Column(Integer, default=2)  # Max retreads allowed for this tyre
    last_retread_date = Column(Date, nullable=True)
    total_retread_cost = Column(Numeric(10, 2), default=0)
    
    # TPMS sensor fields
    sensor_id = Column(String(50), nullable=True, index=True)  # BLE/GPRS sensor ID
    last_psi = Column(Numeric(5, 1), nullable=True)
    last_temperature_c = Column(Numeric(5, 1), nullable=True)
    tread_depth_mm = Column(Numeric(4, 1), nullable=True)       # current tread depth (updated per reading)
    initial_tread_depth_mm = Column(Numeric(4, 1), nullable=True)  # tread at time of fitment
    last_reading_at = Column(DateTime, nullable=True)
    
    # Relationships
    vehicle = relationship("Vehicle", back_populates="tyres")
    sensor_readings = relationship("TyreSensorReading", back_populates="tyre", cascade="all, delete-orphan")
    events = relationship("TyreLifecycleEvent", back_populates="tyre", cascade="all, delete-orphan")


class TyreLifecycleEvent(Base, TimestampMixin):
    """Tyre lifecycle events: retread, rotation, removal, scrap, etc."""
    
    __tablename__ = "tyre_lifecycle_events"
    
    vehicle_tyre_id = Column(Integer, ForeignKey('vehicle_tyres.id', ondelete='CASCADE'), nullable=False, index=True)
    event_type = Column(String(30), nullable=False)  # MOUNTED, REMOVED, RETREAD, ROTATED, SCRAPPED, PSI_CHECK, PUNCTURE
    odometer_km = Column(Numeric(12, 2), nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    vendor_name = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    performed_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Relationships
    tyre = relationship("VehicleTyre", back_populates="events")


class TyreSensorReading(Base):
    """Time-series TPMS sensor readings."""
    
    __tablename__ = "tyre_sensor_readings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_tyre_id = Column(Integer, ForeignKey('vehicle_tyres.id', ondelete='CASCADE'), nullable=False, index=True)
    psi = Column(Numeric(5, 1), nullable=False)
    temperature_c = Column(Numeric(5, 1), nullable=True)
    tread_depth_mm = Column(Numeric(4, 1), nullable=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    alert_triggered = Column(Boolean, default=False)
    alert_type = Column(String(30), nullable=True)  # underinflated, overinflated, high_temp, low_tread
    
    # Relationships
    tyre = relationship("VehicleTyre", back_populates="sensor_readings")


# ── Driver Field Readings ─────────────────────────────────

class TyreReadingCondition(enum.Enum):
    GOOD = "GOOD"
    AVERAGE = "AVERAGE"
    WORN = "WORN"
    DAMAGED = "DAMAGED"


class TyreReading(Base, TimestampMixin):
    """Driver-submitted field tyre readings (PSI, tread, condition, photo)."""

    __tablename__ = "tyre_readings"

    vehicle_tyre_id = Column(Integer, ForeignKey('vehicle_tyres.id', ondelete='SET NULL'), nullable=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=False, index=True)
    position = Column(String(20), nullable=False)
    psi = Column(Numeric(5, 1), nullable=False)
    tread_depth_mm = Column(Numeric(4, 1), nullable=True)
    condition = Column(SQLEnum(TyreReadingCondition, native_enum=False), nullable=False, default=TyreReadingCondition.GOOD)
    temperature_c = Column(Numeric(5, 1), nullable=True)
    notes = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)
    driver_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    odometer_at_reading = Column(Numeric(12, 2), nullable=True)

    # Relationships
    vehicle = relationship("Vehicle")
    tyre = relationship("VehicleTyre")


# ── Structured Tyre Alerts ────────────────────────────────

class TyreAlertType(enum.Enum):
    LOW_PSI = "LOW_PSI"
    CRITICAL_PSI = "CRITICAL_PSI"
    HIGH_TEMP = "HIGH_TEMP"
    LOW_TREAD = "LOW_TREAD"
    WORN = "WORN"
    DAMAGED = "DAMAGED"
    OVERDUE_INSPECTION = "OVERDUE_INSPECTION"
    ROTATION_DUE = "ROTATION_DUE"


class TyreAlertSeverity(enum.Enum):
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class TyreAlertStatus(enum.Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class TyreAlert(Base, TimestampMixin):
    """Structured tyre alerts (auto-generated from field readings or thresholds)."""

    __tablename__ = "tyre_alerts"

    vehicle_tyre_id = Column(Integer, ForeignKey('vehicle_tyres.id', ondelete='CASCADE'), nullable=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=False, index=True)
    position = Column(String(20), nullable=False)
    alert_type = Column(SQLEnum(TyreAlertType, native_enum=False), nullable=False)
    severity = Column(SQLEnum(TyreAlertSeverity, native_enum=False), nullable=False)
    current_value = Column(Numeric(8, 2), nullable=True)
    threshold_value = Column(Numeric(8, 2), nullable=True)
    status = Column(SQLEnum(TyreAlertStatus, native_enum=False), nullable=False, default=TyreAlertStatus.OPEN)
    acknowledged_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    source = Column(String(20), default='field')  # 'field' | 'sensor'

    # Relationships
    vehicle = relationship("Vehicle")


# ── Tyre Thresholds ───────────────────────────────────────

class TyreThreshold(Base, TimestampMixin):
    """Per-vehicle or fleet-wide tyre threshold configuration."""

    __tablename__ = "tyre_thresholds"

    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=True, index=True)
    min_psi = Column(Numeric(5, 1), default=80.0)
    critical_psi = Column(Numeric(5, 1), default=60.0)
    min_tread_mm = Column(Numeric(4, 1), default=3.0)
    worn_tread_mm = Column(Numeric(4, 1), default=1.6)
    inspection_interval_days = Column(Integer, default=7)
    rotation_interval_km = Column(Integer, default=20000)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)

    # Relationships
    vehicle = relationship("Vehicle")


# ── Tyre Simulation Sessions ──────────────────────────────

class RoadType(enum.Enum):
    HIGHWAY = "HIGHWAY"
    CITY = "CITY"
    OFFROAD = "OFFROAD"
    MIXED = "MIXED"


class TyreSimulationSession(Base, TimestampMixin):
    """Saved tyre wear simulation sessions."""

    __tablename__ = "tyre_simulation_sessions"

    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=False, index=True)
    simulated_km = Column(Integer, nullable=False)
    simulated_load_kg = Column(Integer, nullable=True)
    road_type = Column(SQLEnum(RoadType, native_enum=False), nullable=False, default=RoadType.HIGHWAY)
    climate = Column(String(20), default='NORMAL')
    result_json = Column(Text, nullable=True)  # JSON string of per-tyre results
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)

    # Relationships
    vehicle = relationship("Vehicle")
