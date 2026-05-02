# FCM Push Notification Service
# Firebase/FCM has been removed. Push notifications are disabled.
# Replace this module with a third-party provider (e.g. OneSignal, Expo) when needed.
import logging

logger = logging.getLogger(__name__)

_DISABLED = {"success": False, "source": "DISABLED", "message": "Push notifications are not configured"}


async def send_push_notification(device_token: str, title: str, body: str, data: dict | None = None) -> dict:
    logger.info(f"[FCM-DISABLED] push to token={device_token[:10]}… title={title!r}")
    return _DISABLED


async def send_push_to_topic(topic: str, title: str, body: str, data: dict | None = None) -> dict:
    logger.info(f"[FCM-DISABLED] push to topic={topic!r} title={title!r}")
    return {**_DISABLED, "topic": topic}


async def send_push_to_multiple(device_tokens: list[str], title: str, body: str, data: dict | None = None) -> dict:
    logger.info(f"[FCM-DISABLED] multicast to {len(device_tokens)} tokens title={title!r}")
    return {**_DISABLED, "success_count": 0, "failure_count": len(device_tokens)}
