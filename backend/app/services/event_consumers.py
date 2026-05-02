# Event consumer handlers — subscribe to event bus events
# and route to appropriate notification channels (WebSocket, in-app).
# Push notifications (FCM/Firebase) have been removed.

import logging
from app.services.event_bus import event_bus, EventTypes

logger = logging.getLogger(__name__)


async def handle_sos_triggered(event: dict, db=None):
    """SOS — immediate push to admin + fleet manager."""
    logger.critical(f"[SOS] Driver SOS triggered: {event}")
    payload = event.get("payload", {})
    driver_name = payload.get("driver_name", "Unknown Driver")
    trip_number = payload.get("trip_number", "N/A")
    origin = payload.get("origin", "")
    destination = payload.get("destination", "")
    vehicle_reg = payload.get("vehicle_registration", "")
    location_name = payload.get("location_name", "")
    ec_name = payload.get("emergency_contact_name", "")
    ec_phone = payload.get("emergency_contact_phone", "")

    title = f"🆘 SOS EMERGENCY — {driver_name}"
    body = (
        f"Driver {driver_name} in trip {trip_number} is in Emergency!\n"
        f"Route: {origin} → {destination} | Vehicle: {vehicle_reg}"
    )
    if location_name:
        body += f"\nLocation: {location_name}"
    if ec_name:
        body += f"\nEmergency Contact: {ec_name} ({ec_phone})"

    if db is not None:
        try:
            from app.services.notification_service import notification_service
            await notification_service.send(
                db=db,
                event_type="sos_triggered",
                title=title,
                body=body,
                target_roles=["ADMIN", "FLEET_MANAGER"],
                data={
                    "event_type": "sos_triggered",
                    "trip_id": str(payload.get("trip_id", "")),
                    "trip_number": trip_number,
                    "driver_name": driver_name,
                    "driver_phone": str(payload.get("driver_phone", "")),
                    "vehicle_registration": vehicle_reg,
                    "origin": origin,
                    "destination": destination,
                    "emergency_contact_name": ec_name or "",
                    "emergency_contact_phone": ec_phone or "",
                    "location_name": location_name or "",
                    "route": f"/fleet/notifications",
                    "urgency": "critical",
                },
                urgency="critical",
            )
        except Exception as e:
            logger.error(f"[SOS] notification failed: {e}")
    else:
        logger.warning("[SOS] No DB session available for SOS notification")

    await _broadcast_ws("sos_alert", event)


async def handle_trip_delay(event: dict):
    """Trip delay predicted — notify fleet manager."""
    logger.warning(f"[DELAY] Trip delay predicted: {event}")
    await _broadcast_ws("trip_delay", event)


async def handle_fuel_mismatch(event: dict):
    """Fuel anomaly — notify fleet manager + accountant."""
    logger.warning(f"[FUEL] Mismatch detected: {event}")
    await _broadcast_ws("fuel_alert", event)


async def handle_expense_fraud(event: dict):
    """Expense fraud flagged — notify accountant."""
    logger.warning(f"[EXPENSE] Fraud flagged: {event}")
    await _broadcast_ws("expense_fraud", event)


async def handle_driver_score_critical(event: dict):
    """Driver score critical — notify fleet manager."""
    logger.warning(f"[DRIVER] Score critical: {event}")
    await _broadcast_ws("driver_alert", event)


async def handle_vehicle_risk_high(event: dict):
    """Vehicle high risk — notify fleet manager."""
    logger.warning(f"[VEHICLE] High risk: {event}")
    await _broadcast_ws("vehicle_alert", event)


async def handle_trip_deviation(event: dict):
    """Route deviation — notify fleet manager."""
    logger.warning(f"[TRIP] Route deviation: {event}")
    await _broadcast_ws("trip_deviation", event)


async def handle_trip_unauthorised_stop(event: dict):
    """Unauthorized stop — notify fleet manager."""
    logger.warning(f"[TRIP] Unauthorized stop: {event}")
    await _broadcast_ws("trip_stop_alert", event)


async def handle_document_expiry(event: dict):
    """Document expiring — notify admin."""
    logger.info(f"[DOC] Expiry warning: {event}")
    await _broadcast_ws("document_expiry", event)


def register_all_consumers():
    """Register all event consumers with the event bus. Call on app startup."""
    event_bus.subscribe(EventTypes.SOS_TRIGGERED, handle_sos_triggered)
    event_bus.subscribe(EventTypes.TRIP_DELAY_PREDICTED, handle_trip_delay)
    event_bus.subscribe(EventTypes.TRIP_DELAY_CONFIRMED, handle_trip_delay)
    event_bus.subscribe(EventTypes.FUEL_MISMATCH, handle_fuel_mismatch)
    event_bus.subscribe(EventTypes.FUEL_OFFSITE, handle_fuel_mismatch)
    event_bus.subscribe(EventTypes.EXPENSE_FRAUD_FLAGGED, handle_expense_fraud)
    event_bus.subscribe(EventTypes.DRIVER_SCORE_CRITICAL, handle_driver_score_critical)
    event_bus.subscribe(EventTypes.VEHICLE_RISK_HIGH, handle_vehicle_risk_high)
    event_bus.subscribe(EventTypes.TRIP_DEVIATION, handle_trip_deviation)
    event_bus.subscribe(EventTypes.TRIP_UNAUTHORISED_STOP, handle_trip_unauthorised_stop)
    event_bus.subscribe(EventTypes.DOCUMENT_EXPIRY_7D, handle_document_expiry)
    event_bus.subscribe(EventTypes.DOCUMENT_EXPIRY_1D, handle_document_expiry)
    logger.info("[EventBus] All 12 consumers registered")


async def _broadcast_ws(channel: str, event: dict):
    """Broadcast event to WebSocket subscribers."""
    try:
        from app.websocket.manager import ws_manager
        await ws_manager.broadcast(channel, event)
    except Exception as e:
        logger.debug(f"WebSocket broadcast failed (expected if no WS manager): {e}")
