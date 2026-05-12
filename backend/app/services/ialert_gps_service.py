"""
Ashok Leyland iALERT — Data as a Service (DaaS) GPS Integration
================================================================
Polls the iALERT REST API (ialertelite) for real-time GPS telemetry.

API Spec (v1.1.1):
  URL:    https://ialertelite.ashokleyland.com/ialert/daas/api/getdata?token=<TOKEN>
  Auth:   JWT token as query parameter (IP-whitelisted)
  Format: JSON object or array of vehicle packets

Packet fields:
  vehicleregnumber  — e.g. "TN-72-CE-8913" (with dashes)
  latitude / longitude / altitude
  speed (km/h)  /  heading (degrees)
  datetime — "yyyy-MM-dd HH:mm:ss.S" IST
  odometer (km)
  ignition — 0 (OFF) / 1 (ON)
  batlevel — battery voltage

This service:
  1. Polls the iALERT API at configurable intervals
  2. Normalises field names and registration numbers
  3. Auto-upserts unknown vehicles into the vehicles table (INSERT … ON CONFLICT)
  4. Updates current GPS coords on the Vehicle row
  5. Upserts each position into the gps_locations table (INSERT … ON CONFLICT)
  6. Stores telemetry points in MongoDB (vehicle_telemetry + trip_tracking)
  7. Broadcasts position updates via WebSocket to subscribed clients
"""

import re
import logging
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.mongodb.connection import MongoDB
from app.models.postgres.vehicle import Vehicle
from app.models.postgres.trip import Trip, TripStatusEnum

# ── Roster of known iALERT vehicles (reg → VIN) ─────────────────
# Used to populate chassis_number on auto-upsert.
IALERT_VEHICLE_ROSTER: dict[str, str] = {
    "TN72CE8913": "MB1A5PCD0RELN5126",
    "TN72CE8939": "MB1A5PCDXREJN9162",
    "TN72CE9420": "MB1A5PCD5REGP3679",
    "TN72CE9435": "MB1A5PCDXREGP3676",
    "TN72CE9469": "MB1A5PCD3REGP3678",
    "TN72CE9474": "MB1A5PCD8REJN9161",
    "TN72CF2624": "MB1A5PCD1REDP7039",
    "TN72CF2638": "MB1A5PCDXREDP7038",
    "TN72CJ3255": "MB1CWKHD3SPJG3979",
    "TN72CJ3259": "MB1CWKHD8SPKG1390",
    "TN72CJ3282": "MB1CWKHD1SPJG3981",
    "TN72CJ3793": "MB1CWKHD5SPHG6922",
    "TN72CJ5960": "MB1CWKHD8SPGH1187",
    "TN72CJ5979": "MB1CWKHD2SPGH1184",
    "TN72CJ5996": "MB1CWKHD2SPHG6926",
    "TN72CJ9158": "MB1CWCHD4SPHG7775",
    "TN72CJ9198": "MB1CWCHD3SPDH2812",
    "TN72CJ9443": "MB1CWCHD1SPDH2811",
    "TN72CJ9482": "MB1CWCHD5SPDH2813",
    "TN92L5088":  "MB1A5PCD8RECP9545",
}


def _make_session():
    """Create a fresh NullPool engine+session for use inside celery forked workers."""
    engine = create_async_engine(settings.POSTGRES_URL, poolclass=NullPool)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


logger = logging.getLogger(__name__)

# ── Registration number normalisation ────────────────────────────
# iALERT may return "TN-72-CE-8913"; our DB stores "TN72CE8913".
_RE_NON_ALNUM = re.compile(r"[^A-Z0-9]", re.IGNORECASE)


def normalise_reg_number(raw: str) -> str:
    """Strip dashes/spaces and uppercase: 'TN-72-CE-8913' → 'TN72CE8913'."""
    return _RE_NON_ALNUM.sub("", raw).upper()


# ── iALERT API client ────────────────────────────────────────────

async def fetch_ialert_positions() -> list[dict]:
    """
    Call the Ashok Leyland iALERT DaaS API and return a list of
    normalised vehicle position dicts.

    Returns [] on any retriable error (network, timeout, auth).
    Raises on invalid config so the problem is surfaced at startup.
    """
    api_url = settings.IALERT_API_URL
    token = settings.IALERT_API_TOKEN

    if not token:
        logger.warning("[iALERT] IALERT_API_TOKEN not configured — skipping poll")
        return []

    url = f"{api_url}?token={token}"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        logger.error("[iALERT] API timeout after 20s")
        return []
    except httpx.HTTPStatusError as exc:
        logger.error("[iALERT] HTTP %s — %s", exc.response.status_code, exc.response.text[:300])
        return []
    except Exception as exc:
        logger.error("[iALERT] Unexpected error: %s", exc)
        return []

    # API may return a single object or a list
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        logger.error("[iALERT] Unexpected response format: %s", type(data))
        return []

    results = []
    for pkt in data:
        try:
            results.append(_parse_ialert_packet(pkt))
        except Exception as exc:
            logger.warning("[iALERT] Skipping malformed packet %s: %s", pkt, exc)
    return results


def _parse_ialert_packet(pkt: dict) -> dict:
    """
    Normalise a raw iALERT JSON packet into our internal format.

    Raw packet example:
    {
      "altitude": 440.5,
      "datetime": "2019-06-17 15:53:16.0",
      "odometer": 16732,
      "heading": 116,
      "vehicleregnumber": "TS07UF9587",
      "latitude": 12.234606742858887,
      "batlevel": 24.34,
      "ignition": 0,
      "speed": 0,
      "longitude": 78.195106506347660
    }
    """
    raw_reg = str(pkt.get("vehicleregnumber", ""))
    reg = normalise_reg_number(raw_reg)
    if not reg:
        raise ValueError("Missing vehicleregnumber")

    # Parse datetime (IST) — may have trailing ".0"
    dt_raw = pkt.get("datetime") or pkt.get("timestamplocal") or ""
    dt_raw = dt_raw.rstrip(".0") if dt_raw.endswith(".0") else dt_raw
    try:
        timestamp = datetime.strptime(dt_raw, "%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        timestamp = datetime.utcnow()

    return {
        "registration_number": reg,
        "registration_number_raw": raw_reg,
        "latitude": _safe_float(pkt.get("latitude")),
        "longitude": _safe_float(pkt.get("longitude")),
        "altitude": _safe_float(pkt.get("altitude")),
        "speed": _safe_float(pkt.get("speed") or pkt.get("gpsspeed")),
        "heading": _safe_float(pkt.get("heading")),
        "odometer": _safe_float(pkt.get("odometer") or pkt.get("odometerreading")),
        "ignition_on": int(pkt.get("ignition", pkt.get("ignitionstatus", 0))) == 1,
        "battery_voltage": _safe_float(pkt.get("batlevel") or pkt.get("vehiclebatterypotential")),
        "timestamp": timestamp,
        "source": "ialert",
    }


def _safe_float(val) -> float:
    try:
        return float(val) if val is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


# ── Ingest pipeline ──────────────────────────────────────────────

async def ingest_ialert_positions(positions: list[dict]) -> dict:
    """
    Process parsed iALERT positions:
      1. Auto-upsert any vehicle not yet in the DB (INSERT … ON CONFLICT DO UPDATE)
      2. Update Vehicle current GPS coords in PostgreSQL
      3. Upsert position into gps_locations table (INSERT … ON CONFLICT DO UPDATE)
      4. Store telemetry in MongoDB
      5. Broadcast via WebSocket

    Returns summary dict with counts.
    """
    if not positions:
        return {"updated": 0, "skipped": 0, "errors": 0}

    updated = 0
    skipped = 0
    errors = 0

    AsyncSessionLocal = _make_session()
    async with AsyncSessionLocal() as db:

        # ── 1. Auto-upsert all vehicles from this poll into the vehicles table ──
        for pos in positions:
            reg = pos["registration_number"]
            vin = IALERT_VEHICLE_ROSTER.get(reg, "")
            await db.execute(
                text("""
                    INSERT INTO vehicles (
                        registration_number, vehicle_type, make,
                        ownership_type, status, fuel_type,
                        gps_provider, gps_provider_status,
                        gps_device_id, chassis_number, owner_name,
                        created_at, updated_at, is_deleted
                    ) VALUES (
                        :reg, 'TRUCK', 'ASHOK LEYLAND',
                        'OWNED', 'AVAILABLE', 'diesel',
                        'ialert', 'active',
                        :vin, :vin, 'Kavya Transports',
                        NOW(), NOW(), false
                    )
                    ON CONFLICT (registration_number) DO UPDATE SET
                        make              = EXCLUDED.make,
                        gps_provider      = EXCLUDED.gps_provider,
                        gps_provider_status = 'active',
                        gps_device_id     = CASE
                            WHEN EXCLUDED.gps_device_id <> '' THEN EXCLUDED.gps_device_id
                            ELSE vehicles.gps_device_id
                        END,
                        chassis_number    = CASE
                            WHEN EXCLUDED.chassis_number <> '' THEN EXCLUDED.chassis_number
                            ELSE vehicles.chassis_number
                        END,
                        updated_at        = NOW()
                """),
                {"reg": reg, "vin": vin},
            )
        await db.commit()

        # ── 2. Reload vehicle id map after upsert ──
        all_vehicles = await db.execute(
            select(Vehicle.id, Vehicle.registration_number)
            .where(Vehicle.is_deleted == False)
        )
        reg_to_vehicle = {
            normalise_reg_number(row.registration_number): row.id
            for row in all_vehicles.all()
        }

        # ── 3. Ingest each position ──
        for pos in positions:
            try:
                vehicle_id = reg_to_vehicle.get(pos["registration_number"])
                if not vehicle_id:
                    # Should never happen after the upsert above
                    logger.warning("[iALERT] Vehicle %s still missing after upsert", pos["registration_number"])
                    skipped += 1
                    continue

                # 3a. Update current position on the Vehicle row
                await db.execute(
                    update(Vehicle)
                    .where(Vehicle.id == vehicle_id)
                    .values(
                        current_latitude=pos["latitude"],
                        current_longitude=pos["longitude"],
                        current_location=f"{pos['latitude']:.6f}, {pos['longitude']:.6f}",
                        odometer_reading=pos["odometer"] if pos["odometer"] > 0 else Vehicle.odometer_reading,
                        last_speed=pos["speed"],
                        last_ignition_on=pos["ignition_on"],
                        last_gps_at=pos["timestamp"],
                    )
                )

                # 3b. Upsert into gps_locations
                await db.execute(
                    text("""
                        INSERT INTO gps_locations (
                            vehicle_id, registration_number,
                            latitude, longitude, altitude,
                            speed, heading, odometer,
                            ignition_on, battery_voltage,
                            source, recorded_at
                        ) VALUES (
                            :vehicle_id, :reg,
                            :lat, :lon, :alt,
                            :speed, :heading, :odometer,
                            :ignition_on, :battery_voltage,
                            'ialert', :recorded_at
                        )
                        ON CONFLICT (registration_number, recorded_at) DO UPDATE SET
                            vehicle_id      = EXCLUDED.vehicle_id,
                            latitude        = EXCLUDED.latitude,
                            longitude       = EXCLUDED.longitude,
                            altitude        = EXCLUDED.altitude,
                            speed           = EXCLUDED.speed,
                            heading         = EXCLUDED.heading,
                            odometer        = EXCLUDED.odometer,
                            ignition_on     = EXCLUDED.ignition_on,
                            battery_voltage = EXCLUDED.battery_voltage
                    """),
                    {
                        "vehicle_id":      vehicle_id,
                        "reg":             pos["registration_number"],
                        "lat":             pos["latitude"],
                        "lon":             pos["longitude"],
                        "alt":             pos["altitude"],
                        "speed":           pos["speed"],
                        "heading":         pos["heading"],
                        "odometer":        pos["odometer"] if pos["odometer"] > 0 else None,
                        "ignition_on":     pos["ignition_on"],
                        "battery_voltage": pos["battery_voltage"],
                        "recorded_at":     pos["timestamp"],
                    },
                )

                # 3c. Store in MongoDB (best-effort)
                await _store_telemetry_mongo(vehicle_id, pos)

                # 3d. Broadcast via WebSocket (best-effort)
                await _broadcast_position(vehicle_id, pos)

                updated += 1

            except Exception as exc:
                logger.error(
                    "[iALERT] Error ingesting %s: %s",
                    pos.get("registration_number"),
                    exc,
                )
                errors += 1

        await db.commit()

    summary = {"updated": updated, "skipped": skipped, "errors": errors}
    if updated > 0:
        logger.info("[iALERT] Ingested %d positions (%d skipped, %d errors)", updated, skipped, errors)
    return summary



async def _store_telemetry_mongo(vehicle_id: int, pos: dict) -> None:
    """Insert telemetry point into MongoDB and upsert trip_tracking."""
    db = MongoDB.db
    if db is None:
        return  # MongoDB not configured — silently skip

    doc = {
        "vehicle_id": str(vehicle_id),
        "registration_number": pos["registration_number"],
        "lat": pos["latitude"],
        "lng": pos["longitude"],
        "altitude": pos["altitude"],
        "speed": pos["speed"],
        "heading": pos["heading"],
        "odometer": pos["odometer"],
        "ignition_on": pos["ignition_on"],
        "battery_voltage": pos["battery_voltage"],
        "timestamp": pos["timestamp"],
        "source": "ialert",
        "is_active": True,
    }

    await db.vehicle_telemetry.insert_one(doc)

    status = "moving" if pos["speed"] > 2 else ("idle" if pos["ignition_on"] else "stopped")
    await db.trip_tracking.update_one(
        {"vehicle_id": str(vehicle_id)},
        {"$set": {**doc, "status": status}},
        upsert=True,
    )


async def _broadcast_position(vehicle_id: int, pos: dict) -> None:
    """Push position update to WebSocket subscribers (best-effort)."""
    try:
        from app.websocket.manager import ws_manager
        await ws_manager.send_vehicle_update(
            vehicle_id=vehicle_id,
            data={
                "type": "gps_update",
                "vehicle_id": vehicle_id,
                "registration_number": pos["registration_number"],
                "latitude": pos["latitude"],
                "longitude": pos["longitude"],
                "speed": pos["speed"],
                "heading": pos["heading"],
                "ignition_on": pos["ignition_on"],
                "timestamp": pos["timestamp"].isoformat(),
                "source": "ialert",
            },
        )
    except Exception:
        pass  # WebSocket broadcast is best-effort


# ── High-level poll-and-ingest ───────────────────────────────────

async def poll_and_ingest() -> dict:
    """
    Single poll cycle: fetch from iALERT API → ingest into DB.
    Called by the APScheduler job or Celery task.
    """
    positions = await fetch_ialert_positions()
    return await ingest_ialert_positions(positions)
