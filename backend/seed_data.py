"""Seed Data Script - Create initial database records for Kavya Transports.

Kavya Transports is a Tamil Nadu-based transport company.
Seeds realistic TN data: clients, vehicles (TN reg), drivers, routes,
jobs (3 pending, 5 active, 20 completed), trips, invoices, and payments.

Usage:
    cd backend
    python seed_data.py
"""
import asyncio
import sys
import os
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from app.db.postgres.connection import AsyncSessionLocal, async_engine
from app.models.postgres.base import Base
from app.models.postgres.user import User, Role, UserRole, RoleType, Branch, Tenant
from app.models.postgres.client import Client, ClientContact
from app.models.postgres.vehicle import Vehicle, VehicleType, VehicleStatus, OwnershipType
from app.models.postgres.driver import Driver, DriverLicense
from app.models.postgres.job import Job, JobStatusEnum
from app.models.postgres.lr import LR, LRItem, LRStatus, PaymentMode
from app.models.postgres.trip import Trip, TripStatusEnum
from app.models.postgres.route import Route, BankAccount
from app.models.postgres.finance import Vendor, Invoice, InvoiceItem, InvoiceStatus
from app.core.security import get_password_hash


async def create_tables():
    """Drop all tables with CASCADE and recreate."""
    async with async_engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        # Avoid assuming a hardcoded superuser role exists on local machines.
        await conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
        await conn.run_sync(Base.metadata.create_all)
    print("[OK] Database tables dropped and recreated")


async def seed_roles(db: AsyncSession):
    """Create default roles."""
    roles = [
        {"name": "admin", "display_name": "Administrator", "role_type": RoleType.ADMIN, "is_system": True},
        {"name": "manager", "display_name": "Manager", "role_type": RoleType.MANAGER, "is_system": True},
        {"name": "fleet_manager", "display_name": "Fleet Manager", "role_type": RoleType.FLEET_MANAGER, "is_system": True},
        {"name": "accountant", "display_name": "Accountant", "role_type": RoleType.ACCOUNTANT, "is_system": True},
        {"name": "auditor", "display_name": "Auditor", "role_type": RoleType.AUDITOR, "is_system": True},
        {"name": "finance_manager", "display_name": "Finance Manager", "role_type": RoleType.FINANCE_MANAGER, "is_system": True},
        {"name": "project_associate", "display_name": "Project Associate", "role_type": RoleType.PROJECT_ASSOCIATE, "is_system": True},
        {"name": "driver", "display_name": "Driver", "role_type": RoleType.DRIVER, "is_system": True},
        {"name": "pump_operator", "display_name": "Pump Operator", "role_type": RoleType.PUMP_OPERATOR, "is_system": True},
        {"name": "tyre_inspector", "display_name": "Tyre Inspector", "role_type": RoleType.TYRE_INSPECTOR, "is_system": True},
        {"name": "clerk", "display_name": "Clerk", "role_type": RoleType.CLERK, "is_system": True},
    ]
    created = []
    for role_data in roles:
        existing = await db.execute(select(Role).where(Role.name == role_data["name"]))
        if not existing.scalar_one_or_none():
            role = Role(**role_data)
            db.add(role)
            created.append(role_data["name"])
    await db.flush()
    print(f"[OK] Roles created: {created or 'already exist'}")


async def seed_admin_user(db: AsyncSession):
    """Create admin user."""
    result = await db.execute(select(User).where(User.email == "admin@kavyatransports.com"))
    if result.scalar_one_or_none():
        print("[OK] Admin user already exists")
        return

    user = User(
        email="admin@kavyatransports.com",
        phone="9876543210",
        password_hash=get_password_hash("admin123"),
        first_name="Kavya",
        last_name="Admin",
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()

    role_result = await db.execute(select(Role).where(Role.name == "admin"))
    admin_role = role_result.scalar_one_or_none()
    if admin_role:
        db.add(UserRole(user_id=user.id, role_id=admin_role.id))
        await db.flush()

    print(f"[OK] Admin user created: admin@kavyatransports.com / admin123")


async def seed_demo_users(db: AsyncSession):
    """Create demo users for each role."""
    demo_users = [
        {"email": "manager@kavyatransports.com", "first_name": "Senthil", "last_name": "Kumar", "phone": "9876510001", "role": "manager"},
        {"email": "fleet@kavyatransports.com", "first_name": "Murugan", "last_name": "Rajan", "phone": "9876510002", "role": "fleet_manager"},
        {"email": "accountant@kavyatransports.com", "first_name": "Lakshmi", "last_name": "Priya", "phone": "9876510003", "role": "accountant"},
        {"email": "auditor@kavyatransports.com", "first_name": "Priya", "last_name": "Audit", "phone": "9876510099", "role": "auditor"},
        {"email": "finance@kavyatransports.com", "first_name": "Deepa", "last_name": "Sundaram", "phone": "9876510007", "role": "finance_manager"},
        {"email": "pa@kavyatransports.com", "first_name": "Arun", "last_name": "Prakash", "phone": "9876510004", "role": "project_associate"},
        {"email": "driver@kavyatransports.com", "first_name": "Karthik", "last_name": "Vel", "phone": "9876510005", "role": "driver"},
        {"email": "pump@kavyatransports.com", "first_name": "Ravi", "last_name": "Kumar", "phone": "9876510006", "role": "pump_operator"},
        {"email": "tyre@kavyatransports.com", "first_name": "Selvam", "last_name": "Tyre", "phone": "9876510008", "role": "tyre_inspector"},
        {"email": "clerk@kavyatransports.com", "first_name": "Kavitha", "last_name": "Clerk", "phone": "9876510009", "role": "clerk"},
    ]

    created = []
    for user_data in demo_users:
        result = await db.execute(select(User).where(User.email == user_data["email"]))
        if result.scalar_one_or_none():
            continue

        user = User(
            email=user_data["email"],
            phone=user_data["phone"],
            password_hash=get_password_hash("demo123"),
            first_name=user_data["first_name"],
            last_name=user_data["last_name"],
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        await db.flush()

        role_result = await db.execute(select(Role).where(Role.name == user_data["role"]))
        role = role_result.scalar_one_or_none()
        if role:
            db.add(UserRole(user_id=user.id, role_id=role.id))
            await db.flush()

        created.append(f"{user_data['role']}:{user_data['email']}")

    print(f"[OK] Demo users created: {created or 'already exist'}")


async def seed_clients(db: AsyncSession):
    """Create sample clients — TN-based and interstate."""
    clients_data = [
        {
            "name": "Tamil Nadu Cements Corporation",
            "code": "TNCC01",
            "client_type": "premium",
            "email": "logistics@tncements.com",
            "phone": "04422345678",
            "address_line1": "12 Rajaji Salai, Parrys Corner",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600001",
            "gstin": "33AABCT1234K1ZP",
            "credit_limit": Decimal("5000000"),
            "credit_days": 30,
        },
        {
            "name": "Sakthi Sugars Ltd",
            "code": "SAKT01",
            "client_type": "premium",
            "email": "transport@sakthisugars.com",
            "phone": "04224567890",
            "address_line1": "78 Avinashi Road, Peelamedu",
            "city": "Coimbatore",
            "state": "Tamil Nadu",
            "pincode": "641004",
            "gstin": "33AABCS5678M1ZR",
            "credit_limit": Decimal("3000000"),
            "credit_days": 45,
        },
        {
            "name": "Chettinad Cement Corporation",
            "code": "CHET01",
            "client_type": "premium",
            "email": "dispatch@chettinadcement.com",
            "phone": "04524512345",
            "address_line1": "Karur Road, Puliyur",
            "city": "Karur",
            "state": "Tamil Nadu",
            "pincode": "639002",
            "gstin": "33AABCC9012N1ZT",
            "credit_limit": Decimal("4000000"),
            "credit_days": 30,
        },
        {
            "name": "Rane Holdings Ltd",
            "code": "RANE01",
            "client_type": "regular",
            "email": "logistics@raneholdings.com",
            "phone": "04428521000",
            "address_line1": "Maraimalai Nagar, GST Road",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "603209",
            "gstin": "33AABCR3456P1ZV",
            "credit_limit": Decimal("2000000"),
            "credit_days": 30,
        },
        {
            "name": "Bangalore Steel Industries",
            "code": "BSIL01",
            "client_type": "regular",
            "email": "materials@blrsteel.com",
            "phone": "08025551234",
            "address_line1": "Peenya Industrial Area, Phase II",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560058",
            "gstin": "29AABCB7890Q1ZX",
            "credit_limit": Decimal("1500000"),
            "credit_days": 30,
        },
        {
            "name": "Kerala Chemicals & Proteins",
            "code": "KCPL01",
            "client_type": "regular",
            "email": "purchase@keralachem.com",
            "phone": "04842365789",
            "address_line1": "CSEZ, Kakkanad",
            "city": "Kochi",
            "state": "Kerala",
            "pincode": "682037",
            "gstin": "32AABCK2345R1ZZ",
            "credit_limit": Decimal("1000000"),
            "credit_days": 45,
        },
    ]

    created = []
    for client_data in clients_data:
        existing = await db.execute(select(Client).where(Client.code == client_data["code"]))
        if not existing.scalar_one_or_none():
            client = Client(**client_data)
            db.add(client)
            await db.flush()

            contact = ClientContact(
                client_id=client.id,
                name=f"{client_data['name']} - Logistics",
                designation="Logistics Manager",
                phone=client_data["phone"],
                email=client_data["email"],
                is_primary=True,
            )
            db.add(contact)
            created.append(client_data["code"])

    await db.flush()
    print(f"[OK] Clients created: {created or 'already exist'}")


async def seed_vehicles(db: AsyncSession):
    """Create sample vehicles with TN registration numbers."""
    vehicles_data = [
        {
            "registration_number": "TN01AB1234",
            "vehicle_type": VehicleType.TRUCK,
            "make": "TATA",
            "model": "Prima 4928.S",
            "year_of_manufacture": 2022,
            "capacity_tons": Decimal("28"),
            "num_tyres": 14,
            "ownership_type": OwnershipType.OWNED,
            "status": VehicleStatus.AVAILABLE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("3.5"),
            "fitness_valid_until": date.today() + timedelta(days=180),
            "permit_valid_until": date.today() + timedelta(days=365),
            "insurance_valid_until": date.today() + timedelta(days=300),
            "puc_valid_until": date.today() + timedelta(days=150),
        },
        {
            "registration_number": "TN01CD5678",
            "vehicle_type": VehicleType.TRAILER,
            "make": "ASHOK LEYLAND",
            "model": "Captain 4019",
            "year_of_manufacture": 2021,
            "capacity_tons": Decimal("25"),
            "num_tyres": 14,
            "ownership_type": OwnershipType.OWNED,
            "status": VehicleStatus.AVAILABLE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("3.8"),
            "fitness_valid_until": date.today() + timedelta(days=200),
            "permit_valid_until": date.today() + timedelta(days=400),
            "insurance_valid_until": date.today() + timedelta(days=250),
            "puc_valid_until": date.today() + timedelta(days=120),
        },
        {
            "registration_number": "TN38EF9012",
            "vehicle_type": VehicleType.TANKER,
            "make": "BHARAT BENZ",
            "model": "3723C",
            "year_of_manufacture": 2023,
            "capacity_tons": Decimal("20"),
            "num_tyres": 12,
            "ownership_type": OwnershipType.LEASED,
            "owner_name": "Southern Logistics Pvt Ltd",
            "owner_phone": "9876543000",
            "status": VehicleStatus.AVAILABLE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("4.0"),
            "fitness_valid_until": date.today() + timedelta(days=350),
            "permit_valid_until": date.today() + timedelta(days=500),
            "insurance_valid_until": date.today() + timedelta(days=400),
            "puc_valid_until": date.today() + timedelta(days=180),
        },
        {
            "registration_number": "TN43GH3456",
            "vehicle_type": VehicleType.CONTAINER,
            "make": "EICHER",
            "model": "Pro 6042",
            "year_of_manufacture": 2020,
            "capacity_tons": Decimal("18"),
            "num_tyres": 10,
            "ownership_type": OwnershipType.ATTACHED,
            "owner_name": "Ganesh Transporters Madurai",
            "owner_phone": "9876544000",
            "status": VehicleStatus.MAINTENANCE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("4.2"),
            "fitness_valid_until": date.today() + timedelta(days=90),
            "permit_valid_until": date.today() + timedelta(days=200),
            "insurance_valid_until": date.today() + timedelta(days=150),
            "puc_valid_until": date.today() + timedelta(days=60),
        },
        {
            "registration_number": "TN01JK7890",
            "vehicle_type": VehicleType.LCV,
            "make": "MAHINDRA",
            "model": "Bolero Pickup Extra Long",
            "year_of_manufacture": 2023,
            "capacity_tons": Decimal("1.5"),
            "num_tyres": 4,
            "ownership_type": OwnershipType.OWNED,
            "status": VehicleStatus.AVAILABLE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("12.0"),
            "fitness_valid_until": date.today() + timedelta(days=400),
            "permit_valid_until": date.today() + timedelta(days=500),
            "insurance_valid_until": date.today() + timedelta(days=450),
            "puc_valid_until": date.today() + timedelta(days=200),
        },
        {
            "registration_number": "TN22LM4567",
            "vehicle_type": VehicleType.TRUCK,
            "make": "TATA",
            "model": "LPT 1613",
            "year_of_manufacture": 2021,
            "capacity_tons": Decimal("16"),
            "num_tyres": 10,
            "ownership_type": OwnershipType.OWNED,
            "status": VehicleStatus.AVAILABLE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("4.5"),
            "fitness_valid_until": date.today() + timedelta(days=270),
            "permit_valid_until": date.today() + timedelta(days=330),
            "insurance_valid_until": date.today() + timedelta(days=280),
            "puc_valid_until": date.today() + timedelta(days=170),
        },
        {
            "registration_number": "TN09NP8901",
            "vehicle_type": VehicleType.TRAILER,
            "make": "ASHOK LEYLAND",
            "model": "U-3518T",
            "year_of_manufacture": 2022,
            "capacity_tons": Decimal("35"),
            "num_tyres": 18,
            "ownership_type": OwnershipType.OWNED,
            "status": VehicleStatus.AVAILABLE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("3.2"),
            "fitness_valid_until": date.today() + timedelta(days=310),
            "permit_valid_until": date.today() + timedelta(days=420),
            "insurance_valid_until": date.today() + timedelta(days=350),
            "puc_valid_until": date.today() + timedelta(days=190),
        },
        {
            "registration_number": "TN07QR2345",
            "vehicle_type": VehicleType.TRUCK,
            "make": "BHARAT BENZ",
            "model": "1617R",
            "year_of_manufacture": 2023,
            "capacity_tons": Decimal("16"),
            "num_tyres": 10,
            "ownership_type": OwnershipType.OWNED,
            "status": VehicleStatus.AVAILABLE,
            "fuel_type": "diesel",
            "mileage_per_litre": Decimal("4.8"),
            "fitness_valid_until": date.today() + timedelta(days=400),
            "permit_valid_until": date.today() + timedelta(days=500),
            "insurance_valid_until": date.today() + timedelta(days=430),
            "puc_valid_until": date.today() + timedelta(days=210),
        },
    ]

    created = []
    for vehicle_data in vehicles_data:
        existing = await db.execute(select(Vehicle).where(Vehicle.registration_number == vehicle_data["registration_number"]))
        if not existing.scalar_one_or_none():
            vehicle = Vehicle(**vehicle_data)
            db.add(vehicle)
            created.append(vehicle_data["registration_number"])

    await db.flush()
    print(f"[OK] Vehicles created: {created or 'already exist'}")


async def seed_drivers(db: AsyncSession):
    """Create sample drivers based in Tamil Nadu."""
    from app.models.postgres.driver import DriverStatus, LicenseType

    drivers_data = [
        {
            "employee_code": "DRV001",
            "first_name": "Ramesh",
            "last_name": "Krishnan",
            "phone": "9876500001",
            "email": "ramesh.k@kavyatransports.com",
            "date_of_birth": date(1985, 5, 15),
            "date_of_joining": date(2020, 1, 10),
            "permanent_address": "12/3 Gandhi Nagar, Tambaram",
            "current_address": "12/3 Gandhi Nagar, Tambaram",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600045",
            "aadhaar_number": "234567890123",
            "pan_number": "ABCDK1234F",
            "status": DriverStatus.AVAILABLE,
            "salary_type": "monthly",
            "base_salary": Decimal("35000"),
            "per_km_rate": Decimal("3.5"),
        },
        {
            "employee_code": "DRV002",
            "first_name": "Suresh",
            "last_name": "Babu",
            "phone": "9876500002",
            "email": "suresh.b@kavyatransports.com",
            "date_of_birth": date(1990, 8, 22),
            "date_of_joining": date(2021, 3, 15),
            "permanent_address": "45 Kamaraj Salai, Madurai",
            "current_address": "45 Kamaraj Salai, Madurai",
            "city": "Madurai",
            "state": "Tamil Nadu",
            "pincode": "625001",
            "aadhaar_number": "345678901234",
            "pan_number": "BCDEF2345G",
            "status": DriverStatus.AVAILABLE,
            "salary_type": "monthly",
            "base_salary": Decimal("32000"),
            "per_km_rate": Decimal("3.0"),
        },
        {
            "employee_code": "DRV003",
            "first_name": "Mahesh",
            "last_name": "Vel",
            "phone": "9876500003",
            "email": "mahesh.v@kavyatransports.com",
            "date_of_birth": date(1988, 12, 10),
            "date_of_joining": date(2019, 6, 1),
            "permanent_address": "78 RS Puram, Coimbatore",
            "current_address": "78 RS Puram, Coimbatore",
            "city": "Coimbatore",
            "state": "Tamil Nadu",
            "pincode": "641002",
            "aadhaar_number": "456789012345",
            "pan_number": "CDEFG3456H",
            "status": DriverStatus.AVAILABLE,
            "salary_type": "monthly",
            "base_salary": Decimal("38000"),
            "per_km_rate": Decimal("4.0"),
        },
        {
            "employee_code": "DRV004",
            "first_name": "Arjun",
            "last_name": "Mani",
            "phone": "9876500004",
            "email": "arjun.m@kavyatransports.com",
            "date_of_birth": date(1992, 3, 18),
            "date_of_joining": date(2022, 2, 1),
            "permanent_address": "15 Sathyamangalam Road, Erode",
            "current_address": "15 Sathyamangalam Road, Erode",
            "city": "Erode",
            "state": "Tamil Nadu",
            "pincode": "638001",
            "aadhaar_number": "567890123456",
            "pan_number": "DEFGH4567I",
            "status": DriverStatus.AVAILABLE,
            "salary_type": "monthly",
            "base_salary": Decimal("30000"),
            "per_km_rate": Decimal("3.0"),
        },
        {
            "employee_code": "DRV005",
            "first_name": "Vijay",
            "last_name": "Kumar",
            "phone": "9876500005",
            "email": "vijay.k@kavyatransports.com",
            "date_of_birth": date(1987, 7, 25),
            "date_of_joining": date(2018, 11, 1),
            "permanent_address": "32 Beach Road, Tuticorin",
            "current_address": "32 Beach Road, Tuticorin",
            "city": "Tuticorin",
            "state": "Tamil Nadu",
            "pincode": "628001",
            "aadhaar_number": "678901234567",
            "pan_number": "EFGHI5678J",
            "status": DriverStatus.AVAILABLE,
            "salary_type": "monthly",
            "base_salary": Decimal("36000"),
            "per_km_rate": Decimal("3.5"),
        },
        {
            "employee_code": "DRV006",
            "first_name": "Prakash",
            "last_name": "Rajan",
            "phone": "9876500006",
            "email": "prakash.r@kavyatransports.com",
            "date_of_birth": date(1991, 1, 5),
            "date_of_joining": date(2022, 7, 1),
            "permanent_address": "67 Main Road, Salem",
            "current_address": "67 Main Road, Salem",
            "city": "Salem",
            "state": "Tamil Nadu",
            "pincode": "636001",
            "aadhaar_number": "789012345678",
            "pan_number": "FGHIJ6789K",
            "status": DriverStatus.AVAILABLE,
            "salary_type": "monthly",
            "base_salary": Decimal("31000"),
            "per_km_rate": Decimal("3.0"),
        },
    ]

    created = []
    for driver_data in drivers_data:
        existing = await db.execute(select(Driver).where(Driver.employee_code == driver_data["employee_code"]))
        if not existing.scalar_one_or_none():
            driver = Driver(**driver_data)
            db.add(driver)
            await db.flush()

            license_data = DriverLicense(
                driver_id=driver.id,
                license_number=f"TN01{driver_data['employee_code']}000",
                license_type=LicenseType.HMV,
                issue_date=date.today() - timedelta(days=365 * 3),
                expiry_date=date.today() + timedelta(days=365 * 2),
                issuing_authority="RTO Chennai",
            )
            db.add(license_data)
            created.append(driver_data["employee_code"])

    await db.flush()
    print(f"[OK] Drivers created: {created or 'already exist'}")


async def seed_routes(db: AsyncSession):
    """Create routes radiating from Tamil Nadu."""
    routes_data = [
        {
            "route_code": "CHN-CBE",
            "route_name": "Chennai to Coimbatore",
            "origin_city": "Chennai",
            "origin_state": "Tamil Nadu",
            "destination_city": "Coimbatore",
            "destination_state": "Tamil Nadu",
            "distance_km": Decimal("505"),
            "estimated_hours": Decimal("8"),
            "toll_gates": 6,
        },
        {
            "route_code": "CHN-MDU",
            "route_name": "Chennai to Madurai",
            "origin_city": "Chennai",
            "origin_state": "Tamil Nadu",
            "destination_city": "Madurai",
            "destination_state": "Tamil Nadu",
            "distance_km": Decimal("462"),
            "estimated_hours": Decimal("7"),
            "toll_gates": 5,
        },
        {
            "route_code": "CHN-BLR",
            "route_name": "Chennai to Bengaluru",
            "origin_city": "Chennai",
            "origin_state": "Tamil Nadu",
            "destination_city": "Bengaluru",
            "destination_state": "Karnataka",
            "distance_km": Decimal("346"),
            "estimated_hours": Decimal("6"),
            "toll_gates": 4,
        },
        {
            "route_code": "CHN-KOC",
            "route_name": "Chennai to Kochi",
            "origin_city": "Chennai",
            "origin_state": "Tamil Nadu",
            "destination_city": "Kochi",
            "destination_state": "Kerala",
            "distance_km": Decimal("690"),
            "estimated_hours": Decimal("11"),
            "toll_gates": 7,
        },
        {
            "route_code": "CBE-BLR",
            "route_name": "Coimbatore to Bengaluru",
            "origin_city": "Coimbatore",
            "origin_state": "Tamil Nadu",
            "destination_city": "Bengaluru",
            "destination_state": "Karnataka",
            "distance_km": Decimal("365"),
            "estimated_hours": Decimal("6"),
            "toll_gates": 4,
        },
        {
            "route_code": "CHN-TIR",
            "route_name": "Chennai to Tiruchirappalli",
            "origin_city": "Chennai",
            "origin_state": "Tamil Nadu",
            "destination_city": "Tiruchirappalli",
            "destination_state": "Tamil Nadu",
            "distance_km": Decimal("332"),
            "estimated_hours": Decimal("5"),
            "toll_gates": 4,
        },
        {
            "route_code": "MDU-TUT",
            "route_name": "Madurai to Tuticorin",
            "origin_city": "Madurai",
            "origin_state": "Tamil Nadu",
            "destination_city": "Tuticorin",
            "destination_state": "Tamil Nadu",
            "distance_km": Decimal("138"),
            "estimated_hours": Decimal("3"),
            "toll_gates": 2,
        },
        {
            "route_code": "CHN-HYD",
            "route_name": "Chennai to Hyderabad",
            "origin_city": "Chennai",
            "origin_state": "Tamil Nadu",
            "destination_city": "Hyderabad",
            "destination_state": "Telangana",
            "distance_km": Decimal("625"),
            "estimated_hours": Decimal("9"),
            "toll_gates": 6,
        },
    ]

    created = []
    for route_data in routes_data:
        existing = await db.execute(select(Route).where(Route.route_code == route_data["route_code"]))
        if not existing.scalar_one_or_none():
            route = Route(**route_data)
            db.add(route)
            created.append(route_data["route_code"])

    await db.flush()
    print(f"[OK] Routes created: {created or 'already exist'}")


async def seed_bank_accounts(db: AsyncSession):
    """Create bank accounts for Kavya Transports."""
    accounts_data = [
        {
            "account_name": "Kavya Transports Current Account",
            "account_number": "50200045678901",
            "bank_name": "Indian Bank",
            "branch_name": "Chennai T Nagar",
            "ifsc_code": "IDIB000T001",
            "account_type": "current",
            "current_balance": Decimal("750000"),
            "is_default": True,
        },
        {
            "account_name": "Kavya Transports Savings",
            "account_number": "60310098765432",
            "bank_name": "Indian Overseas Bank",
            "branch_name": "Madurai Main",
            "ifsc_code": "IOBA0001234",
            "account_type": "savings",
            "current_balance": Decimal("350000"),
            "is_default": False,
        },
    ]

    created = []
    for account_data in accounts_data:
        existing = await db.execute(select(BankAccount).where(BankAccount.account_number == account_data["account_number"]))
        if not existing.scalar_one_or_none():
            account = BankAccount(**account_data)
            db.add(account)
            created.append(account_data["account_number"][-4:])

    await db.flush()
    print(f"[OK] Bank accounts created: {created or 'already exist'}")


async def seed_vendors(db: AsyncSession):
    """Create sample vendors."""
    vendors_data = [
        {
            "name": "Indian Oil Corporation - TN",
            "code": "IOCL01",
            "vendor_type": "fuel",
            "phone": "18002425115",
            "email": "tn.bulk@iocl.com",
            "gstin": "33AAACI8577H1ZL",
        },
        {
            "name": "MRF Tyres Ltd",
            "code": "MRF001",
            "vendor_type": "tyre",
            "phone": "04424321000",
            "email": "sales@mrftyres.com",
            "gstin": "33AABCM2456K1ZP",
        },
        {
            "name": "TVS Auto Service - Madurai",
            "code": "TVSS01",
            "vendor_type": "maintenance",
            "phone": "04522345678",
            "email": "service@tvsauto.com",
            "gstin": "33AABCT7890L1ZQ",
        },
    ]

    created = []
    for vendor_data in vendors_data:
        existing = await db.execute(select(Vendor).where(Vendor.code == vendor_data["code"]))
        if not existing.scalar_one_or_none():
            vendor = Vendor(**vendor_data)
            db.add(vendor)
            created.append(vendor_data["code"])

    await db.flush()
    print(f"[OK] Vendors created: {created or 'already exist'}")


async def seed_jobs_trips_lrs(db: AsyncSession):
    """Create 28 jobs: 20 completed, 5 active (in_progress), 3 pending (draft/pending_approval).
    Each job gets one LR and one trip with realistic TN route data.
    """
    # Fetch all clients, vehicles, drivers
    clients = (await db.execute(select(Client))).scalars().all()
    vehicles = (await db.execute(select(Vehicle).where(Vehicle.status != VehicleStatus.MAINTENANCE))).scalars().all()
    drivers = (await db.execute(select(Driver))).scalars().all()

    if not clients or not vehicles or not drivers:
        print("[SKIP] Missing clients/vehicles/drivers — skipping jobs")
        return

    # Route definitions: (origin_city, origin_state, dest_city, dest_state, distance_km, material)
    tn_routes = [
        ("Chennai", "Tamil Nadu", "Coimbatore", "Tamil Nadu", 505, "Cement Bags"),
        ("Chennai", "Tamil Nadu", "Madurai", "Tamil Nadu", 462, "Steel Coils"),
        ("Chennai", "Tamil Nadu", "Bengaluru", "Karnataka", 346, "Auto Parts"),
        ("Chennai", "Tamil Nadu", "Kochi", "Kerala", 690, "Chemical Drums"),
        ("Coimbatore", "Tamil Nadu", "Bengaluru", "Karnataka", 365, "Textile Bales"),
        ("Chennai", "Tamil Nadu", "Tiruchirappalli", "Tamil Nadu", 332, "Polymer Granules"),
        ("Madurai", "Tamil Nadu", "Tuticorin", "Tamil Nadu", 138, "Cotton Bales"),
        ("Chennai", "Tamil Nadu", "Hyderabad", "Telangana", 625, "Machinery Parts"),
        ("Chennai", "Tamil Nadu", "Salem", "Tamil Nadu", 340, "Sugar Bags"),
        ("Coimbatore", "Tamil Nadu", "Chennai", "Tamil Nadu", 505, "Tea Chests"),
    ]

    job_counter = 0
    all_jobs = []

    # --- 20 COMPLETED JOBS ---
    for i in range(20):
        route = tn_routes[i % len(tn_routes)]
        client = clients[i % len(clients)]
        vehicle = vehicles[i % len(vehicles)]
        driver = drivers[i % len(drivers)]
        days_ago = 90 - (i * 4)  # Spread over the past ~3 months
        job_date = date.today() - timedelta(days=days_ago)
        job_counter += 1
        job_num = f"JOB-{job_date.strftime('%y%m%d')}-{job_counter:04d}"
        lr_num = f"LR-{job_date.strftime('%y%m%d')}-{job_counter:04d}"
        trip_num = f"TRP-{job_date.strftime('%y%m%d')}-{job_counter:04d}"

        rate = Decimal(str(15000 + route[4] * 20))

        job = Job(
            job_number=job_num, job_date=job_date, client_id=client.id,
            origin_address=f"Industrial Area, {route[0]}", origin_city=route[0], origin_state=route[1],
            destination_address=f"Warehouse Zone, {route[2]}", destination_city=route[2], destination_state=route[3],
            material_type=route[5], quantity=Decimal("1000"), quantity_unit="kgs",
            status=JobStatusEnum.COMPLETED, approved_by=1,
            rate_type="per_trip", agreed_rate=rate, total_amount=rate,
            completed_at=datetime.now() - timedelta(days=max(0, days_ago - 3)),
        )
        db.add(job)
        await db.flush()

        lr = LR(
            lr_number=lr_num, lr_date=job_date, job_id=job.id,
            consignor_name=client.name, consignor_address=f"{route[0]}, {route[1]}",
            consignor_gstin=client.gstin, consignor_phone=client.phone,
            consignee_name=f"{route[2]} Warehouse",
            consignee_address=f"Industrial Area, {route[2]}, {route[3]}",
            origin=route[0], destination=route[2],
            vehicle_id=vehicle.id, driver_id=driver.id,
            payment_mode=PaymentMode.TO_BE_BILLED,
            freight_amount=rate, total_freight=rate,
            status=LRStatus.POD_RECEIVED,
        )
        db.add(lr)
        await db.flush()

        lr_item = LRItem(
            lr_id=lr.id, item_number=1, description=route[5],
            packages=50, package_type="bags",
            quantity=Decimal("1000"), quantity_unit="kgs",
            actual_weight=Decimal("1000"), charged_weight=Decimal("1000"),
        )
        db.add(lr_item)

        trip = Trip(
            trip_number=trip_num, trip_date=job_date,
            job_id=job.id, vehicle_id=vehicle.id,
            vehicle_registration=vehicle.registration_number,
            driver_id=driver.id,
            driver_name=f"{driver.first_name} {driver.last_name}",
            driver_phone=driver.phone,
            origin=route[0], destination=route[2],
            planned_distance_km=Decimal(str(route[4])),
            actual_distance_km=Decimal(str(route[4] + random.randint(-10, 20))),
            status=TripStatusEnum.COMPLETED,
            budgeted_expense=Decimal(str(route[4] * 8)),
            total_expense=Decimal(str(route[4] * 8 + random.randint(200, 800))),
            revenue=rate,
            actual_start=datetime.now() - timedelta(days=days_ago),
            actual_end=datetime.now() - timedelta(days=max(0, days_ago - 2)),
        )
        db.add(trip)
        await db.flush()

        lr.trip_id = trip.id
        all_jobs.append(job_num)

    # --- 5 ACTIVE JOBS (in_progress) ---
    for i in range(5):
        route = tn_routes[i % len(tn_routes)]
        client = clients[i % len(clients)]
        vehicle = vehicles[i % len(vehicles)]
        driver = drivers[i % len(drivers)]
        job_date = date.today() - timedelta(days=i + 1)
        job_counter += 1
        job_num = f"JOB-{job_date.strftime('%y%m%d')}-{job_counter:04d}"
        lr_num = f"LR-{job_date.strftime('%y%m%d')}-{job_counter:04d}"
        trip_num = f"TRP-{job_date.strftime('%y%m%d')}-{job_counter:04d}"

        rate = Decimal(str(18000 + route[4] * 22))
        trip_statuses = [TripStatusEnum.STARTED, TripStatusEnum.IN_TRANSIT,
                         TripStatusEnum.LOADING, TripStatusEnum.IN_TRANSIT, TripStatusEnum.UNLOADING]

        job = Job(
            job_number=job_num, job_date=job_date, client_id=client.id,
            origin_address=f"Factory, {route[0]}", origin_city=route[0], origin_state=route[1],
            destination_address=f"Depot, {route[2]}", destination_city=route[2], destination_state=route[3],
            material_type=route[5], quantity=Decimal("800"), quantity_unit="kgs",
            status=JobStatusEnum.IN_PROGRESS, approved_by=1,
            rate_type="per_trip", agreed_rate=rate, total_amount=rate,
        )
        db.add(job)
        await db.flush()

        lr = LR(
            lr_number=lr_num, lr_date=job_date, job_id=job.id,
            consignor_name=client.name, consignor_address=f"{route[0]}, {route[1]}",
            consignor_gstin=client.gstin, consignor_phone=client.phone,
            consignee_name=f"{route[2]} Depot",
            consignee_address=f"Depot Area, {route[2]}, {route[3]}",
            origin=route[0], destination=route[2],
            vehicle_id=vehicle.id, driver_id=driver.id,
            payment_mode=PaymentMode.TO_BE_BILLED,
            freight_amount=rate, total_freight=rate,
            status=LRStatus.IN_TRANSIT,
        )
        db.add(lr)
        await db.flush()

        trip = Trip(
            trip_number=trip_num, trip_date=job_date,
            job_id=job.id, vehicle_id=vehicle.id,
            vehicle_registration=vehicle.registration_number,
            driver_id=driver.id,
            driver_name=f"{driver.first_name} {driver.last_name}",
            driver_phone=driver.phone,
            origin=route[0], destination=route[2],
            planned_distance_km=Decimal(str(route[4])),
            status=trip_statuses[i],
            budgeted_expense=Decimal(str(route[4] * 8)),
            revenue=rate,
            actual_start=datetime.now() - timedelta(hours=random.randint(4, 24)),
        )
        db.add(trip)
        await db.flush()

        lr.trip_id = trip.id
        all_jobs.append(job_num)

    # --- 3 PENDING JOBS (draft / pending_approval) ---
    pending_statuses = [JobStatusEnum.DRAFT, JobStatusEnum.DRAFT, JobStatusEnum.PENDING_APPROVAL]
    for i in range(3):
        route = tn_routes[(i + 5) % len(tn_routes)]
        client = clients[i % len(clients)]
        job_date = date.today()
        job_counter += 1
        job_num = f"JOB-{job_date.strftime('%y%m%d')}-{job_counter:04d}"

        rate = Decimal(str(16000 + route[4] * 18))

        job = Job(
            job_number=job_num, job_date=job_date, client_id=client.id,
            origin_address=f"Plant, {route[0]}", origin_city=route[0], origin_state=route[1],
            destination_address=f"Yard, {route[2]}", destination_city=route[2], destination_state=route[3],
            material_type=route[5], quantity=Decimal("1200"), quantity_unit="kgs",
            status=pending_statuses[i],
            rate_type="per_trip", agreed_rate=rate, total_amount=rate,
        )
        db.add(job)
        all_jobs.append(job_num)

    await db.flush()
    print(f"[OK] Jobs created: {len(all_jobs)} (20 completed, 5 active, 3 pending)")


async def seed_invoices(db: AsyncSession):
    """Create invoices for completed jobs."""
    completed_jobs = (await db.execute(
        select(Job).where(Job.status == JobStatusEnum.COMPLETED).limit(10)
    )).scalars().all()

    if not completed_jobs:
        print("[SKIP] No completed jobs for invoices")
        return

    created = 0
    for i, job in enumerate(completed_jobs):
        client = (await db.execute(select(Client).where(Client.id == job.client_id))).scalar_one()
        inv_date = job.job_date + timedelta(days=3)
        inv_num = f"INV-{inv_date.strftime('%y%m%d')}-{i+1:04d}"

        existing = await db.execute(select(Invoice).where(Invoice.invoice_number == inv_num))
        if existing.scalar_one_or_none():
            continue

        subtotal = job.total_amount or Decimal("25000")
        is_intra_state = client.state == "Tamil Nadu"

        if is_intra_state:
            cgst_rate = Decimal("9")
            sgst_rate = Decimal("9")
            igst_rate = Decimal("0")
            cgst_amt = subtotal * cgst_rate / 100
            sgst_amt = subtotal * sgst_rate / 100
            igst_amt = Decimal("0")
        else:
            cgst_rate = Decimal("0")
            sgst_rate = Decimal("0")
            igst_rate = Decimal("18")
            cgst_amt = Decimal("0")
            sgst_amt = Decimal("0")
            igst_amt = subtotal * igst_rate / 100

        total_tax = cgst_amt + sgst_amt + igst_amt
        total = subtotal + total_tax

        # Alternate between paid and pending invoices
        if i < 7:
            status = InvoiceStatus.PAID
            amount_paid = total
            amount_due = Decimal("0")
        else:
            status = InvoiceStatus.PENDING
            amount_paid = Decimal("0")
            amount_due = total

        invoice = Invoice(
            invoice_number=inv_num,
            invoice_date=inv_date,
            due_date=inv_date + timedelta(days=client.credit_days or 30),
            client_id=client.id,
            billing_name=client.name,
            billing_address=f"{client.address_line1}, {client.city}",
            billing_gstin=client.gstin,
            billing_state_code="33" if client.state == "Tamil Nadu" else "29",
            company_name="Kavya Transports",
            company_gstin="33AABCK1234M1ZP",
            company_state_code="33",
            subtotal=subtotal,
            taxable_amount=subtotal,
            cgst_rate=cgst_rate, cgst_amount=cgst_amt,
            sgst_rate=sgst_rate, sgst_amount=sgst_amt,
            igst_rate=igst_rate, igst_amount=igst_amt,
            total_tax=total_tax,
            total_amount=total,
            amount_paid=amount_paid,
            amount_due=amount_due,
            status=status,
        )
        db.add(invoice)
        await db.flush()

        inv_item = InvoiceItem(
            invoice_id=invoice.id,
            item_number=1,
            description=f"Transportation: {job.origin_city} → {job.destination_city} ({job.material_type})",
            hsn_sac_code="996511",
            quantity=Decimal("1"),
            unit="trip",
            rate=subtotal,
            amount=subtotal,
            tax_rate=Decimal("18"),
            tax_amount=total_tax,
            total=total,
        )
        db.add(inv_item)
        created += 1

    await db.flush()
    print(f"[OK] Invoices created: {created}")


async def seed_fuel_data(db: AsyncSession):
    """Create depot fuel tanks and sample fuel issues."""
    from app.models.postgres.fuel_pump import (
        DepotFuelTank, FuelIssue, FuelStockTransaction,
        FuelType, TransactionType,
    )

    # Check if already seeded
    existing = await db.execute(select(DepotFuelTank))
    if existing.scalar_one_or_none():
        print("[OK] Fuel data already exists")
        return

    # Get pump_operator user
    pump_user_result = await db.execute(select(User).where(User.email == "pump@kavyatransports.com"))
    pump_user = pump_user_result.scalar_one_or_none()
    pump_user_id = pump_user.id if pump_user else 1

    # Create depot tank
    tank = DepotFuelTank(
        name="Main Depot Tank",
        fuel_type=FuelType.DIESEL,
        capacity_litres=10000,
        current_stock_litres=7500,
        min_stock_alert=2000,
        location="Kavya Transports Depot, Chennai",
    )
    db.add(tank)
    await db.flush()

    # Initial refill transaction
    refill = FuelStockTransaction(
        tank_id=tank.id,
        transaction_type=TransactionType.TANKER_REFILL,
        quantity_litres=10000,
        rate_per_litre=Decimal("89.50"),
        total_amount=Decimal("895000.00"),
        stock_before=0,
        stock_after=10000,
        reference_number="TANKER-INIT-001",
        remarks="Initial depot fill",
        created_by=pump_user_id,
    )
    db.add(refill)

    # Get some vehicles
    vehicles_result = await db.execute(select(Vehicle).limit(5))
    vehicles = list(vehicles_result.scalars().all())

    # Get some drivers
    drivers_result = await db.execute(select(Driver).limit(3))
    drivers = list(drivers_result.scalars().all())

    # Create sample fuel issues over past 30 days
    issued_total = Decimal("0")
    for i in range(min(15, len(vehicles) * 3)):
        vehicle = vehicles[i % len(vehicles)]
        driver = drivers[i % len(drivers)] if drivers else None
        days_ago = random.randint(0, 30)
        qty = Decimal(str(random.randint(50, 200)))
        rate = Decimal("89.50")
        total = qty * rate
        issued_total += qty

        issue = FuelIssue(
            tank_id=tank.id,
            vehicle_id=vehicle.id,
            driver_id=driver.id if driver else None,
            fuel_type=FuelType.DIESEL,
            quantity_litres=qty,
            rate_per_litre=rate,
            total_amount=total,
            odometer_reading=Decimal(str(random.randint(50000, 200000))),
            issued_by=pump_user_id,
            issued_at=datetime.now() - timedelta(days=days_ago, hours=random.randint(6, 18)),
            receipt_number=f"FUEL-{1000 + i}",
            remarks=f"Routine fueling",
        )
        db.add(issue)

    # Update tank stock to reflect issues
    tank.current_stock_litres = Decimal("10000") - issued_total

    await db.flush()
    print(f"[OK] Fuel data: 1 tank, 15 fuel issues, 1 refill transaction")


async def main():
    """Run all seed functions."""
    print("\n--- Kavya Transports Database Seeding ---\n")

    await create_tables()

    async with AsyncSessionLocal() as db:
        try:
            # Core setup
            await seed_roles(db)
            await seed_admin_user(db)
            await seed_demo_users(db)
            await db.commit()

            # Master data
            await seed_clients(db)
            await seed_vehicles(db)
            await seed_drivers(db)
            await seed_routes(db)
            await seed_bank_accounts(db)
            await seed_vendors(db)
            await db.commit()

            # Business data
            await seed_jobs_trips_lrs(db)
            await seed_invoices(db)
            await seed_fuel_data(db)
            await db.commit()

            print("\n--- Seed Complete ---")
            print("  Admin:  admin@kavyatransports.com / admin123")
            print("  Demo:   manager|fleet|accountant|finance|pa|driver|pump@kavyatransports.com / demo123")
            print("  Data:   6 clients, 8 vehicles, 6 drivers, 8 routes")
            print("  Jobs:   20 completed + 5 active + 3 pending = 28 total")
            print("  Finance: 10 invoices (7 paid, 3 pending)")
            print("  Fuel:   1 depot tank, 15 fuel issues")

        except Exception as e:
            await db.rollback()
            print(f"\n[ERROR] Seeding failed: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(main())
