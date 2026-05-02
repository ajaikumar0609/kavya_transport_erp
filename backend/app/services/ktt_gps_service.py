"""
KT Telematic (KTT) GPS Pull API Integration
============================================
Polls the KTT customer portal REST API to fetch real-time GPS
telemetry for KTT-tracked vehicles and ingests into our pipeline.

API Spec:
  URL:    https://customer.ktt.io/kavyatransport/vehicles
  Auth:   X-AT-AccessToken header
  Rate:   1 request per minute (enforced server-side)
  Format: JSON — { "success": bool, "vehicles": [...] }

Vehicle packet fields:
  id   — KTT internal device ID
  vno  — Vehicle registration number (no dashes, e.g. "TN72CB7731")
  lat  — Latitude (float)
  lon  — Longitude (float)
  spd  — Speed (km/h)
  crs  — Course/heading (degrees, 0–360)
  ign  — Ignition: 0 = OFF, 1 = ON
  time — Timestamp string "YYYY-MM-DD HH:MM:SS" (IST)

This service:
  1. Polls the KTT API every 60 s (rate-limit safe)
  2. Normalises registration numbers for DB lookup
  3. Updates Vehicle GPS coords in PostgreSQL
  4. Stores telemetry points in MongoDB (vehicle_telemetry + trip_tracking)
  5. Broadcasts position updates via WebSocket to subscribed clients
"""

import re
import logging
from datetime import datetime

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.mongodb.connection import MongoDB
from app.models.postgres.vehicle import Vehicle


def _make_session():
    """Create a fresh NullPool engine+session for use inside celery forked workers.
    NullPool avoids the asyncpg 'Future attached to a different loop' error that
    occurs when a pooled connection is inherited across a fork boundary."""
    engine = create_async_engine(settings.POSTGRES_URL, poolclass=NullPool)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

logger = logging.getLogger(__name__)

_KTT_API_URL = "https://customer.ktt.io/kavyatransport/vehicles"

# ── Registration number normalisation ────────────────────────────
_RE_NON_ALNUM = re.compile(r"[^A-Z0-9]", re.IGNORECASE)


def normalise_reg_number(raw: str) -> str:
    """Strip dashes/spaces and uppercase: 'TN-72-CB-7731' → 'TN72CB7731'."""
    return _RE_NON_ALNUM.sub("", raw).upper()


# ── KTT API client ───────────────────────────────────────────────

async def fetch_ktt_positions() -> list[dict]:
    """
    Call the KTT Pull API and return a list of normalised
    vehicle position dicts.

    Returns [] on any retriable error (network, timeout, auth).
    """
    token = settings.KTT_ACCESS_TOKEN

    if not token:
        logger.warning("[KTT] KTT_ACCESS_TOKEN not configured — skipping poll")
        return []

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                _KTT_API_URL,
                headers={"X-AT-AccessToken": token},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        logger.error("[KTT] API timeout after 20s")
        return []
    except httpx.HTTPStatusError as exc:
        logger.error("[KTT] HTTP %s — %s", exc.response.status_code, exc.response.text[:300])
        return []
    except Exception as exc:
        logger.error("[KTT] Unexpected error: %s", exc)
        return []

    if not data.get("success"):
        logger.error("[KTT] API returned failure: %s", data.get("error"))
        return []

    vehicles = data.get("vehicles", [])
    if not isinstance(vehicles, list):
        logger.error("[KTT] Unexpected 'vehicles' format: %s", type(vehicles))
        return []

    results = []
    for pkt in vehicles:
        try:
            results.append(_parse_ktt_packet(pkt))
        except Exception as exc:
            logger.warning("[KTT] Skipping malformed packet %s: %s", pkt, exc)
    return results


def _parse_ktt_packet(pkt: dict) -> dict:
    """
    Normalise a raw KTT JSON vehicle entry into our internal format.

    Raw entry example:
    {
      "id": 92360,
      "vno": "TN72CB7731",
      "lat": 8.84824,
      "lon": 77.756702,
      "spd": 0,
      "crs": 147,
      "ign": 0,
      "time": "2026-04-26 15:53:14"
    }
    """
    raw_reg = str(pkt.get("vno", "")).strip()
    reg = normalise_reg_number(raw_reg)
    if not reg:
        raise ValueError("Missing vno (registration number)")

    dt_raw = pkt.get("time", "")
    try:
        # KTT API returns IST (UTC+5:30) — convert to UTC so last_gps_at is stored correctly
        from datetime import timedelta
        timestamp = datetime.strptime(dt_raw, "%Y-%m-%d %H:%M:%S") - timedelta(hours=5, minutes=30)
    except (ValueError, TypeError):
        timestamp = datetime.utcnow()

    return {
        "registration_number": reg,
        "registration_number_raw": raw_reg,
        "ktt_device_id": pkt.get("id"),
        "latitude": _safe_float_or_none(pkt.get("lat")),
        "longitude": _safe_float_or_none(pkt.get("lon")),
        "speed": _safe_float(pkt.get("spd")),
        "heading": _safe_float(pkt.get("crs")),
        "ignition_on": int(pkt.get("ign", 0)) == 1,
        "timestamp": timestamp,
        "source": "ktt",
    }


def _safe_float(val) -> float:
    try:
        return float(val) if val is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


def _safe_float_or_none(val) -> float | None:
    """Return float, or None if val is None/0 (treat 0,0 as 'no GPS fix')."""
    try:
        f = float(val) if val is not None else None
        return None if f == 0.0 else f
    except (ValueError, TypeError):
        return None


# ── Ingest pipeline ──────────────────────────────────────────────

async def ingest_ktt_positions(positions: list[dict]) -> dict:
    """
    Process parsed KTT positions:
      1. Update Vehicle GPS coords in PostgreSQL
      2. Store telemetry in MongoDB
      3. Broadcast via WebSocket

    Returns summary dict with counts.
    """
    if not positions:
        return {"updated": 0, "skipped": 0, "errors": 0}

    updated = 0
    skipped = 0
    errors = 0

    AsyncSessionLocal = _make_session()
    async with AsyncSessionLocal() as db:
        all_vehicles = await db.execute(
            select(Vehicle.id, Vehicle.registration_number)
            .where(Vehicle.is_deleted == False)
        )
        reg_to_vehicle = {
            normalise_reg_number(row.registration_number): row.id
            for row in all_vehicles.all()
        }

        for pos in positions:
            try:
                vehicle_id = reg_to_vehicle.get(pos["registration_number"])
                if not vehicle_id:
                    logger.debug(
                        "[KTT] Vehicle %s not in DB — skipping",
                        pos["registration_number"],
                    )
                    skipped += 1
                    continue

                # ── 1. Update PostgreSQL Vehicle row ──
                update_values: dict = {
                    "last_speed": pos["speed"],
                    "last_ignition_on": pos["ignition_on"],
                    "last_gps_at": pos["timestamp"],
                }
                # Only overwrite coordinates if KTT returned a valid (non-zero) fix
                if pos["latitude"] is not None and pos["longitude"] is not None:
                    update_values["current_latitude"] = pos["latitude"]
                    update_values["current_longitude"] = pos["longitude"]
                    update_values["current_location"] = (
                        f"{pos['latitude']:.6f}, {pos['longitude']:.6f}"
                    )
                await db.execute(
                    update(Vehicle)
                    .where(Vehicle.id == vehicle_id)
                    .values(**update_values)
                )

                # ── 2. Store in MongoDB ──
                await _store_telemetry_mongo(vehicle_id, pos)

                # ── 3. Broadcast via WebSocket ──
                await _broadcast_position(vehicle_id, pos)

                updated += 1

            except Exception as exc:
                logger.error(
                    "[KTT] Error ingesting %s: %s",
                    pos.get("registration_number"),
                    exc,
                )
                errors += 1

        await db.commit()

    summary = {"updated": updated, "skipped": skipped, "errors": errors}
    if updated > 0:
        logger.info("[KTT] Ingested %d positions (%d skipped, %d errors)", updated, skipped, errors)
    return summary


async def _store_telemetry_mongo(vehicle_id: int, pos: dict) -> None:
    """Insert telemetry point into MongoDB and upsert trip_tracking."""
    db = MongoDB.db
    if db is None:
        return

    doc = {
        "vehicle_id": str(vehicle_id),
        "registration_number": pos["registration_number"],
        "lat": pos["latitude"],
        "lng": pos["longitude"],
        "speed": pos["speed"],
        "heading": pos["heading"],
        "ignition_on": pos["ignition_on"],
        "timestamp": pos["timestamp"],
        "source": "ktt",
        "ktt_device_id": pos.get("ktt_device_id"),
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
                "source": "ktt",
            },
        )
    except Exception:
        pass  # WebSocket broadcast is best-effort


# ── High-level poll-and-ingest ───────────────────────────────────

async def poll_and_ingest() -> dict:
    """
    Single poll cycle: fetch from KTT API → ingest into DB.
    Called by the Celery task every 60 s.
    """
    positions = await fetch_ktt_positions()
    return await ingest_ktt_positions(positions)
