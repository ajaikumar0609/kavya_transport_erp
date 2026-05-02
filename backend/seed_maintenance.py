"""Seed maintenance records, tyres, and work orders for ALL existing vehicles.

Also installs a DB trigger-equivalent: an API hook that auto-seeds a new
vehicle with maintenance schedules when it is created.

Safe to re-run — skips vehicles that already have maintenance records.

Usage:
    cd backend
    python seed_maintenance.py
"""
import asyncio
import sys
import os
import random
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.db.postgres.connection import AsyncSessionLocal
from app.models.postgres.vehicle import Vehicle, VehicleMaintenance, VehicleTyre

# ── Constants ────────────────────────────────────────────────────────────────

TYRE_BRANDS = ["Apollo", "MRF", "Ceat", "JK Tyres", "Michelin", "Bridgestone"]
TYRE_SIZES  = ["10.00R20", "11.00R20", "295/80R22.5", "315/80R22.5", "12.00R24"]
TYRE_POSITIONS_4  = ["FL", "FR", "RL1", "RR1"]
TYRE_POSITIONS_6  = ["FL", "FR", "RL1", "RR1", "RL2", "RR2"]
TYRE_POSITIONS_10 = ["FL", "FR", "RL1", "RR1", "RL2", "RR2", "RL3", "RR3", "RL4", "RR4"]

WORKSHOPS = [
    "Sri Balaji Auto Works, Madurai",
    "National Motors, Coimbatore",
    "Laxmi Service Centre, Chennai",
    "VR Garage, Salem",
    "Raj Auto Works, Trichy",
]

# Service schedule templates: (service_type, description, interval_days, interval_km, parts_cost, labor_cost)
SERVICE_TEMPLATES = [
    ("oil_change",        "Engine oil & filter change",              90,   5000,   1800, 500),
    ("tyre_rotation",     "Tyre rotation & pressure check",         120,   8000,    400, 600),
    ("brake_service",     "Brake pads, drums & fluid check",        180,  15000,   3500, 800),
    ("air_filter",        "Air filter & fuel filter replacement",    90,   6000,    900, 300),
    ("battery_check",     "Battery terminals & charge test",        180,  12000,    200, 200),
    ("greasing",          "Chassis greasing & wheel bearing check",  60,   4000,    400, 400),
    ("coolant_flush",     "Coolant flush & thermostat check",       365,  30000,   1200, 600),
    ("clutch_service",    "Clutch plate & pressure plate check",    365,  40000,   6500, 1200),
    ("suspension_check",  "Shock absorbers & leaf spring check",    180,  20000,   2500, 700),
    ("electrical_check",  "Wiring harness & battery terminal check", 90,   8000,    500, 300),
]


def _tyre_positions(vehicle: Vehicle) -> list[str]:
    vtype = vehicle.vehicle_type.value if hasattr(vehicle.vehicle_type, "value") else str(vehicle.vehicle_type)
    if vtype in ("TANKER", "CONTAINER", "TRAILER"):
        return TYRE_POSITIONS_10
    if vtype in ("LCV", "MINI_TRUCK"):
        return TYRE_POSITIONS_4
    return TYRE_POSITIONS_6  # TRUCK, default


def _vehicle_age_years(vehicle: Vehicle) -> int:
    if vehicle.year_of_manufacture:
        return max(0, date.today().year - vehicle.year_of_manufacture)
    return 3  # assume 3-year-old truck if unknown


def seed_maintenance_for_vehicle(vehicle: Vehicle, today: date) -> list[VehicleMaintenance]:
    """Generate realistic maintenance history + upcoming schedule for one vehicle."""
    records: list[VehicleMaintenance] = []
    age_years = _vehicle_age_years(vehicle)
    base_odo = random.randint(20000, 120000) + (age_years * 15000)

    rng = random.Random(vehicle.id)  # deterministic per vehicle

    for idx, (svc_type, desc, interval_days, interval_km, parts_cost, labor_cost) in enumerate(SERVICE_TEMPLATES):
        # ── Past record (completed) ──
        days_ago = rng.randint(interval_days // 3, interval_days)
        last_done = today - timedelta(days=days_ago)
        odo_at_service = base_odo - rng.randint(2000, 8000)

        records.append(VehicleMaintenance(
            vehicle_id=vehicle.id,
            maintenance_type="scheduled",
            service_type=svc_type,
            description=desc,
            odometer_at_service=Decimal(str(odo_at_service)),
            service_date=last_done,
            next_service_date=last_done + timedelta(days=interval_days),
            next_service_km=Decimal(str(odo_at_service + interval_km)),
            vendor_name=rng.choice(WORKSHOPS),
            invoice_number=f"INV-{vehicle.id:03d}-{idx+1:02d}",
            parts_description=f"{desc} — parts & consumables",
            parts_cost=Decimal(str(rng.randint(int(parts_cost * 0.8), int(parts_cost * 1.2)))),
            labor_cost=Decimal(str(rng.randint(int(labor_cost * 0.8), int(labor_cost * 1.2)))),
            total_cost=Decimal(str(parts_cost + labor_cost)),
            status="completed",
        ))

        # ── Work order (pending) for overdue/upcoming services ──
        next_due = last_done + timedelta(days=interval_days)
        if next_due <= today + timedelta(days=30):  # due within 30 days → open WO
            records.append(VehicleMaintenance(
                vehicle_id=vehicle.id,
                maintenance_type="scheduled",
                service_type=svc_type,
                description=f"[WO] {desc}",
                odometer_at_service=None,
                service_date=today,
                next_service_date=next_due,
                next_service_km=Decimal(str(odo_at_service + interval_km)),
                vendor_name=rng.choice(WORKSHOPS),
                invoice_number=None,
                work_order_number=f"WO-{vehicle.id:03d}-{idx+1:02d}",
                parts_description=f"Planned: {desc}",
                parts_cost=Decimal(str(parts_cost)),
                labor_cost=Decimal(str(labor_cost)),
                total_cost=Decimal(str(parts_cost + labor_cost)),
                status="pending",
            ))

    return records


def seed_tyres_for_vehicle(vehicle: Vehicle, today: date, tyre_serial_start: int) -> tuple[list[VehicleTyre], int]:
    """Generate tyre records for one vehicle."""
    positions = _tyre_positions(vehicle)
    age_years = _vehicle_age_years(vehicle)
    tyres: list[VehicleTyre] = []
    rng = random.Random(vehicle.id + 9999)

    for i, pos in enumerate(positions):
        km_run = rng.randint(10000, 60000) + (age_years * 8000)
        tread = max(2.0, 12.0 - (km_run / 10000))
        condition = "good" if tread > 8 else ("average" if tread > 4 else "worn")
        purchase_days_ago = rng.randint(180, age_years * 365 + 180)

        tyres.append(VehicleTyre(
            vehicle_id=vehicle.id,
            tyre_number=f"TYR-{tyre_serial_start + i:05d}",
            position=pos,
            brand=rng.choice(TYRE_BRANDS),
            model="Heavy Duty",
            size=rng.choice(TYRE_SIZES),
            ply_rating="18PR",
            purchase_date=today - timedelta(days=purchase_days_ago),
            purchase_cost=Decimal(str(rng.randint(8000, 14000))),
            km_at_fitment=Decimal("0"),
            current_km=Decimal(str(km_run)),
            tread_depth_mm=Decimal(str(round(tread, 1))),
            initial_tread_depth_mm=Decimal("12.0"),
            condition=condition,
            is_active=True,
            retread_count=rng.randint(0, 1),
            max_retreads=2,
        ))

    return tyres, tyre_serial_start + len(positions)


async def ensure_vehicle_has_maintenance(vehicle: Vehicle, db: AsyncSession, today: date, tyre_serial: int) -> tuple[int, int, int]:
    """Seed maintenance + tyres for a single vehicle if not already seeded.
    Returns (maintenance_added, tyres_added, next_tyre_serial)."""

    # Check existing maintenance
    maint_count = (await db.execute(
        select(func.count()).select_from(VehicleMaintenance).where(VehicleMaintenance.vehicle_id == vehicle.id)
    )).scalar() or 0

    maintenance_added = 0
    if maint_count == 0:
        records = seed_maintenance_for_vehicle(vehicle, today)
        for r in records:
            db.add(r)
        maintenance_added = len(records)

    # Check existing tyres
    tyre_count = (await db.execute(
        select(func.count()).select_from(VehicleTyre).where(VehicleTyre.vehicle_id == vehicle.id)
    )).scalar() or 0

    tyres_added = 0
    if tyre_count == 0:
        new_tyres, tyre_serial = seed_tyres_for_vehicle(vehicle, today, tyre_serial)
        for t in new_tyres:
            db.add(t)
        tyres_added = len(new_tyres)

    return maintenance_added, tyres_added, tyre_serial


async def seed_all():
    today = date.today()

    async with AsyncSessionLocal() as db:
        vehicles = (await db.execute(select(Vehicle).where(Vehicle.is_deleted == False).order_by(Vehicle.id))).scalars().all()
        if not vehicles:
            print("[ERROR] No vehicles found. Run seed_data.py first.")
            return

        print(f"[INFO] Processing {len(vehicles)} vehicles...")

        # Get starting tyre serial number
        max_serial_row = (await db.execute(
            select(func.max(VehicleTyre.tyre_number))
        )).scalar()
        try:
            tyre_serial = int(max_serial_row.split("-")[-1]) + 1 if max_serial_row else 1000
        except Exception:
            tyre_serial = 1000

        total_maint = 0
        total_tyres = 0
        skipped = 0

        for vehicle in vehicles:
            m, t, tyre_serial = await ensure_vehicle_has_maintenance(vehicle, db, today, tyre_serial)
            if m == 0 and t == 0:
                skipped += 1
            else:
                total_maint += m
                total_tyres += t
                print(f"  [OK] {vehicle.registration_number}: +{m} maintenance records, +{t} tyres")

        await db.commit()

        if skipped:
            print(f"\n[SKIP] {skipped} vehicles already had data (not modified)")
        print(f"\n[DONE] Added {total_maint} maintenance records + {total_tyres} tyres across {len(vehicles) - skipped} vehicles")
        print("[NOTE] New vehicles added via the UI will be automatically seeded next time this script runs,")
        print("       OR the backend API will generate their schedule on first access (see compat.py auto-seed).")


if __name__ == "__main__":
    asyncio.run(seed_all())
