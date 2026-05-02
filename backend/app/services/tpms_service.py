# TPMS (Tyre Pressure Monitoring System) Service
from datetime import datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.postgres.vehicle import (
    Vehicle, VehicleTyre, TyreSensorReading, VehicleMaintenance, VehicleStatus,
)

# Thresholds
PSI_LOW = 80.0
PSI_CRITICAL = 65.0
PSI_HIGH = 120.0
TEMP_WARNING = 70.0
TEMP_CRITICAL = 85.0
TREAD_LOW_MM = 3.0
TREAD_CRITICAL_MM = 1.6


def _check_alerts(psi: float, temp: float | None, tread: float | None):
    """Return list of alert types triggered."""
    alerts = []
    if psi < PSI_CRITICAL:
        alerts.append("underinflated_critical")
    elif psi < PSI_LOW:
        alerts.append("underinflated")
    if psi > PSI_HIGH:
        alerts.append("overinflated")
    if temp is not None:
        if temp >= TEMP_CRITICAL:
            alerts.append("high_temp_critical")
        elif temp >= TEMP_WARNING:
            alerts.append("high_temp")
    if tread is not None:
        if tread <= TREAD_CRITICAL_MM:
            alerts.append("low_tread_critical")
        elif tread <= TREAD_LOW_MM:
            alerts.append("low_tread")
    return alerts


async def ingest_reading(
    db: AsyncSession,
    sensor_id: str,
    psi: float,
    temperature_c: float | None = None,
    tread_depth_mm: float | None = None,
):
    """Ingest a single TPMS reading by sensor_id, check thresholds, store."""
    result = await db.execute(
        select(VehicleTyre).where(VehicleTyre.sensor_id == sensor_id, VehicleTyre.is_active == True)
    )
    tyre = result.scalar_one_or_none()
    if not tyre:
        return None

    now = datetime.utcnow()
    alerts = _check_alerts(psi, temperature_c, tread_depth_mm)
    alert_type = alerts[0] if alerts else None

    reading = TyreSensorReading(
        vehicle_tyre_id=tyre.id,
        psi=psi,
        temperature_c=temperature_c,
        tread_depth_mm=tread_depth_mm,
        timestamp=now,
        alert_triggered=bool(alerts),
        alert_type=alert_type,
    )
    db.add(reading)

    # Update live values on tyre
    tyre.last_psi = psi
    tyre.last_temperature_c = temperature_c
    if tread_depth_mm is not None:
        tyre.tread_depth_mm = tread_depth_mm
    tyre.last_reading_at = now

    # Auto-update condition based on tread
    if tread_depth_mm is not None:
        if tread_depth_mm <= TREAD_CRITICAL_MM:
            tyre.condition = "worn"
        elif tread_depth_mm <= TREAD_LOW_MM:
            tyre.condition = "average"

    await db.commit()
    await db.refresh(reading)
    return {
        "reading_id": reading.id,
        "vehicle_tyre_id": tyre.id,
        "vehicle_id": tyre.vehicle_id,
        "position": tyre.position,
        "psi": float(psi),
        "temperature_c": float(temperature_c) if temperature_c else None,
        "tread_depth_mm": float(tread_depth_mm) if tread_depth_mm else None,
        "alerts": alerts,
    }


async def get_tyre_dashboard(db: AsyncSession, vehicle_id: int):
    """Live PSI/temp per wheel for a vehicle."""
    result = await db.execute(
        select(VehicleTyre)
        .where(VehicleTyre.vehicle_id == vehicle_id, VehicleTyre.is_active == True)
        .order_by(VehicleTyre.position)
    )
    tyres = result.scalars().all()

    vehicle_res = await db.execute(
        select(Vehicle.registration_number, Vehicle.num_tyres).where(Vehicle.id == vehicle_id)
    )
    vehicle = vehicle_res.first()

    wheels = []
    for t in tyres:
        status = "ok"
        if t.last_psi is not None:
            psi = float(t.last_psi)
            if psi < PSI_CRITICAL or psi > PSI_HIGH:
                status = "critical"
            elif psi < PSI_LOW:
                status = "warning"
        if t.last_temperature_c is not None:
            temp = float(t.last_temperature_c)
            if temp >= TEMP_CRITICAL:
                status = "critical"
            elif temp >= TEMP_WARNING and status != "critical":
                status = "warning"

        wheels.append({
            "tyre_id": t.id,
            "position": t.position,
            "brand": t.brand,
            "size": t.size,
            "psi": float(t.last_psi) if t.last_psi else None,
            "temperature_c": float(t.last_temperature_c) if t.last_temperature_c else None,
            "tread_depth_mm": float(t.tread_depth_mm) if t.tread_depth_mm else None,
            "condition": t.condition,
            "sensor_id": t.sensor_id,
            "last_reading_at": t.last_reading_at.isoformat() if t.last_reading_at else None,
            "status": status,
        })

    return {
        "vehicle_id": vehicle_id,
        "registration_number": vehicle[0] if vehicle else None,
        "num_tyres": vehicle[1] if vehicle else None,
        "wheels": wheels,
    }


async def get_fleet_tyre_health(db: AsyncSession, tenant_id: int | None = None):
    """Fleet-wide tyre health summary."""
    query = (
        select(VehicleTyre)
        .join(Vehicle, Vehicle.id == VehicleTyre.vehicle_id)
        .where(VehicleTyre.is_active == True, Vehicle.is_deleted == False)
    )
    if tenant_id:
        query = query.where(Vehicle.tenant_id == tenant_id)

    result = await db.execute(query)
    tyres = result.scalars().all()

    total = len(tyres)
    ok = warning = critical = no_sensor = 0
    for t in tyres:
        if not t.sensor_id:
            no_sensor += 1
            continue
        if t.last_psi is None:
            no_sensor += 1
            continue
        psi = float(t.last_psi)
        if psi < PSI_CRITICAL or psi > PSI_HIGH:
            critical += 1
        elif psi < PSI_LOW:
            warning += 1
        else:
            ok += 1

    return {
        "total_tyres": total,
        "ok": ok,
        "warning": warning,
        "critical": critical,
        "no_sensor": no_sensor,
    }


async def get_tpms_alerts(
    db: AsyncSession,
    tenant_id: int | None = None,
    hours: int = 24,
    limit: int = 50,
):
    """Recent TPMS alerts."""
    since = datetime.utcnow() - timedelta(hours=hours)
    query = (
        select(TyreSensorReading, VehicleTyre.position, VehicleTyre.vehicle_id, Vehicle.registration_number)
        .join(VehicleTyre, VehicleTyre.id == TyreSensorReading.vehicle_tyre_id)
        .join(Vehicle, Vehicle.id == VehicleTyre.vehicle_id)
        .where(
            TyreSensorReading.alert_triggered == True,
            TyreSensorReading.timestamp >= since,
        )
        .order_by(TyreSensorReading.timestamp.desc())
        .limit(limit)
    )
    if tenant_id:
        query = query.where(Vehicle.tenant_id == tenant_id)

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "reading_id": r[0].id,
            "vehicle_id": r[2],
            "registration_number": r[3],
            "position": r[1],
            "psi": float(r[0].psi),
            "temperature_c": float(r[0].temperature_c) if r[0].temperature_c else None,
            "alert_type": r[0].alert_type,
            "timestamp": r[0].timestamp.isoformat(),
        }
        for r in rows
    ]


async def get_reading_history(
    db: AsyncSession,
    tyre_id: int,
    hours: int = 168,  # 7 days default
):
    """Historical readings for a tyre (for charts)."""
    since = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(TyreSensorReading)
        .where(
            TyreSensorReading.vehicle_tyre_id == tyre_id,
            TyreSensorReading.timestamp >= since,
        )
        .order_by(TyreSensorReading.timestamp.asc())
    )
    readings = result.scalars().all()
    return [
        {
            "id": r.id,
            "psi": float(r.psi),
            "temperature_c": float(r.temperature_c) if r.temperature_c else None,
            "tread_depth_mm": float(r.tread_depth_mm) if r.tread_depth_mm else None,
            "timestamp": r.timestamp.isoformat(),
            "alert_triggered": r.alert_triggered,
            "alert_type": r.alert_type,
        }
        for r in readings
    ]


# ── Predictive Maintenance ────────────────────────────

async def predict_next_service(db: AsyncSession, vehicle_id: int):
    """Predict next service based on odometer + history.

    When odometer is unavailable (0), falls back to the soonest next_service_date
    across all maintenance records — date-only, no km calculations.
    """
    v_result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id)
    )
    vehicle = v_result.scalar_one_or_none()
    if not vehicle:
        return None

    # Get last 5 completed maintenance records ordered by service_date
    m_result = await db.execute(
        select(VehicleMaintenance)
        .where(VehicleMaintenance.vehicle_id == vehicle_id, VehicleMaintenance.status == "completed")
        .order_by(VehicleMaintenance.service_date.desc())
        .limit(5)
    )
    records = m_result.scalars().all()

    current_odo = float(vehicle.odometer_reading or 0)
    has_odometer = current_odo > 0
    today = datetime.utcnow().date()
    predictions = []

    if not has_odometer:
        # ── No odometer data: use the soonest next_service_date from all records ──
        all_due_result = await db.execute(
            select(VehicleMaintenance)
            .where(
                VehicleMaintenance.vehicle_id == vehicle_id,
                VehicleMaintenance.next_service_date.isnot(None),
            )
            .order_by(VehicleMaintenance.next_service_date.asc())
            .limit(1)
        )
        soonest = all_due_result.scalar_one_or_none()
        last = records[0] if records else None
        predicted_date = soonest.next_service_date if soonest else None
        days_until = (predicted_date - today).days if predicted_date else None
        urgency = "normal"
        if days_until is not None:
            if days_until <= 0:
                urgency = "critical"
            elif days_until <= 30:
                urgency = "soon"
        predictions.append({
            "type": "general_service",
            "last_service_date": last.service_date.isoformat() if last and last.service_date else None,
            "last_service_km": None,
            "avg_interval_km": None,
            "avg_interval_days": None,
            "km_since_last": None,
            "predicted_date": predicted_date.isoformat() if predicted_date else None,
            "km_remaining": None,
            "urgency": urgency,
            "note": "Odometer not available — date-based prediction only",
        })
    elif len(records) >= 2:
        # ── Has odometer: calculate from history ──
        intervals_km = []
        intervals_days = []
        for i in range(len(records) - 1):
            if records[i].odometer_at_service and records[i + 1].odometer_at_service:
                km_diff = float(records[i].odometer_at_service) - float(records[i + 1].odometer_at_service)
                if km_diff > 0:
                    intervals_km.append(km_diff)
            if records[i].service_date and records[i + 1].service_date:
                day_diff = (records[i].service_date - records[i + 1].service_date).days
                if day_diff > 0:
                    intervals_days.append(day_diff)

        avg_km = sum(intervals_km) / len(intervals_km) if intervals_km else 10000
        avg_days = sum(intervals_days) / len(intervals_days) if intervals_days else 90

        last = records[0]
        last_odo = float(last.odometer_at_service or 0)
        km_since = current_odo - last_odo
        km_remaining = max(0, avg_km - km_since) if km_since >= 0 else None

        # By km
        predicted_date_by_km = None
        if km_since > 0 and km_remaining is not None and last.service_date:
            days_since = (today - last.service_date).days
            if days_since > 0:
                km_per_day = km_since / days_since
                if km_per_day > 0:
                    days_to_next = km_remaining / km_per_day
                    predicted_date_by_km = today + timedelta(days=int(days_to_next))

        # By time (use next_service_date from DB if available, else avg_days)
        predicted_date_by_time = None
        if last.next_service_date:
            predicted_date_by_time = last.next_service_date
        elif last.service_date:
            predicted_date_by_time = last.service_date + timedelta(days=int(avg_days))

        # Use earlier of the two
        predicted = None
        if predicted_date_by_km and predicted_date_by_time:
            predicted = min(predicted_date_by_km, predicted_date_by_time)
        elif predicted_date_by_km:
            predicted = predicted_date_by_km
        elif predicted_date_by_time:
            predicted = predicted_date_by_time

        urgency = "normal"
        if predicted:
            days_until = (predicted - today).days
            if days_until <= 0:
                urgency = "critical"
            elif days_until <= 7:
                urgency = "critical"
            elif days_until <= 30:
                urgency = "soon"

        predictions.append({
            "type": "general_service",
            "last_service_date": last.service_date.isoformat() if last.service_date else None,
            "last_service_km": last_odo,
            "avg_interval_km": round(avg_km),
            "avg_interval_days": round(avg_days),
            "km_since_last": round(km_since) if km_since >= 0 else None,
            "predicted_date": predicted.isoformat() if predicted else None,
            "km_remaining": round(km_remaining) if km_remaining is not None else None,
            "urgency": urgency,
        })
    else:
        # Not enough history — use next_service fields from last record
        if records:
            last = records[0]
            km_rem = float(last.next_service_km or 0) - current_odo if last.next_service_km and has_odometer else None
            predictions.append({
                "type": "general_service",
                "last_service_date": last.service_date.isoformat() if last.service_date else None,
                "last_service_km": float(last.odometer_at_service or 0) if has_odometer else None,
                "predicted_date": last.next_service_date.isoformat() if last.next_service_date else None,
                "km_remaining": km_rem if km_rem and km_rem >= 0 else None,
                "urgency": "normal",
                "note": "Insufficient history for prediction, using scheduled date",
            })

    return {
        "vehicle_id": vehicle_id,
        "registration_number": vehicle.registration_number,
        "current_odometer": current_odo,
        "predictions": predictions,
    }


async def get_fleet_maintenance_predictions(db: AsyncSession, tenant_id: int | None = None):
    """Get predicted maintenance needs across fleet."""
    query = select(Vehicle).where(Vehicle.is_deleted == False, Vehicle.status != VehicleStatus.INACTIVE)
    if tenant_id:
        query = query.where(Vehicle.tenant_id == tenant_id)
    result = await db.execute(query)
    vehicles = result.scalars().all()


    upcoming = []
    for v in vehicles:
        pred = await predict_next_service(db, v.id)
        if pred and pred["predictions"]:
            for p in pred["predictions"]:
                if p.get("predicted_date"):
                    upcoming.append({
                        "vehicle_id": v.id,
                        "registration_number": v.registration_number,
                        **p,
                    })

    # Sort by predicted_date
    upcoming.sort(key=lambda x: x.get("predicted_date", "9999-12-31"))
    return upcoming


async def predict_tyre_replacement(db: AsyncSession, vehicle_id: int):
    """Predict tyre replacement dates based on tread wear rate from TPMS readings."""
    result = await db.execute(
        select(VehicleTyre)
        .where(VehicleTyre.vehicle_id == vehicle_id, VehicleTyre.is_active == True)
    )
    tyres = result.scalars().all()

    predictions = []
    for tyre in tyres:
        # Need at least 2 tread readings to calculate wear rate
        readings_result = await db.execute(
            select(TyreSensorReading)
            .where(
                TyreSensorReading.vehicle_tyre_id == tyre.id,
                TyreSensorReading.tread_depth_mm.isnot(None),
            )
            .order_by(TyreSensorReading.timestamp.asc())
        )
        readings = readings_result.scalars().all()

        current_tread = float(tyre.tread_depth_mm) if tyre.tread_depth_mm else None
        wear_rate_mm_per_day = None
        predicted_replacement = None
        days_remaining = None

        if len(readings) >= 2:
            first = readings[0]
            last = readings[-1]
            first_tread = float(first.tread_depth_mm)
            last_tread = float(last.tread_depth_mm)
            days_between = (last.timestamp - first.timestamp).total_seconds() / 86400

            if days_between > 0 and first_tread > last_tread:
                wear_rate_mm_per_day = (first_tread - last_tread) / days_between
                tread_remaining = (last_tread - TREAD_CRITICAL_MM)
                if wear_rate_mm_per_day > 0 and tread_remaining > 0:
                    days_remaining = int(tread_remaining / wear_rate_mm_per_day)
                    predicted_replacement = (datetime.utcnow() + timedelta(days=days_remaining)).date()

        urgency = "normal"
        if days_remaining is not None:
            if days_remaining <= 14:
                urgency = "critical"
            elif days_remaining <= 60:
                urgency = "soon"

        predictions.append({
            "tyre_id": tyre.id,
            "position": tyre.position,
            "brand": tyre.brand,
            "current_tread_mm": current_tread,
            "wear_rate_mm_per_day": round(wear_rate_mm_per_day, 4) if wear_rate_mm_per_day else None,
            "days_to_replacement": days_remaining,
            "predicted_replacement_date": predicted_replacement.isoformat() if predicted_replacement else None,
            "urgency": urgency,
            "retread_count": tyre.retread_count or 0,
            "retread_eligible": (tyre.retread_count or 0) < (tyre.max_retreads or 2),
            "readings_count": len(readings),
        })

    return {
        "vehicle_id": vehicle_id,
        "tyres": predictions,
    }
