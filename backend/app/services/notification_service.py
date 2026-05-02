# Notification Service — DB record + Redis pub/sub + FCM + WhatsApp
import json
import logging
from typing import Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.postgres.notification import Notification
from app.models.postgres.user import User
from app.core.config import settings

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Central notification dispatcher.

    For every mutating action in the system, call:
        await notification_service.send(db, event_type, title, body, target_roles=...)
    or
        await notification_service.send(db, event_type, title, body, target_user_ids=...)

    Internally this will:
      1. Write one NotificationRecord per recipient to PostgreSQL.
      2. Publish to Redis pub/sub (per-user + role channels).
      3. Send FCM push notification.
      4. For urgent events: send Twilio WhatsApp to manager.
    """

    # ──────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────

    async def send(
        self,
        db: AsyncSession,
        event_type: str,
        title: str,
        body: str,
        target_roles: list[str] | None = None,
        target_user_ids: list[int] | None = None,
        data: dict | None = None,
        urgency: str = "normal",
        triggered_by: int | None = None,
    ) -> None:
        """
        Dispatch a notification to the specified roles and/or specific users.
        Must be called AFTER db.commit() so that the triggering entity is persisted.
        """
        try:
            await self._send_impl(
                db, event_type, title, body,
                target_roles=target_roles,
                target_user_ids=target_user_ids,
                data=data,
                urgency=urgency,
                triggered_by=triggered_by,
            )
        except Exception as exc:
            logger.error(f"NotificationService.send failed (event={event_type}): {exc}", exc_info=True)

    async def _send_impl(
        self,
        db: AsyncSession,
        event_type: str,
        title: str,
        body: str,
        target_roles: list[str] | None = None,
        target_user_ids: list[int] | None = None,
        data: dict | None = None,
        urgency: str = "normal",
        triggered_by: int | None = None,
    ) -> None:
        if data is None:
            data = {}
        if target_roles is None:
            target_roles = []
        if target_user_ids is None:
            target_user_ids = []

        recipient_user_ids: list[int] = list(target_user_ids)

        # Resolve role → user IDs
        if target_roles:
            role_users = await self._get_user_ids_by_roles(db, target_roles)
            recipient_user_ids = list(set(recipient_user_ids + role_users))

        # Persist one record per recipient user (if we have resolved users)
        notification_ids: list[int] = []
        if recipient_user_ids:
            for uid in recipient_user_ids:
                notif = Notification(
                    event_type=event_type,
                    title=title,
                    body=body,
                    target_role=target_roles[0] if (target_roles and uid not in target_user_ids) else None,
                    target_user_id=uid,
                    data=data,
                    is_read=False,
                    urgency=urgency,
                    triggered_by=triggered_by,
                    created_at=datetime.utcnow(),
                )
                db.add(notif)
            await db.flush()  # get IDs without full commit
            # Re-query to get generated IDs
            result = await db.execute(
                select(Notification).where(
                    Notification.event_type == event_type,
                    Notification.title == title,
                    Notification.triggered_by == triggered_by,
                    Notification.is_read.is_(False),
                ).order_by(Notification.id.desc()).limit(len(recipient_user_ids))
            )
            persisted = result.scalars().all()
            notification_ids = [n.id for n in persisted]
        else:
            # Role-only record (no resolved users yet — store as role notification)
            for role in target_roles:
                notif = Notification(
                    event_type=event_type,
                    title=title,
                    body=body,
                    target_role=role,
                    target_user_id=None,
                    data=data,
                    is_read=False,
                    urgency=urgency,
                    triggered_by=triggered_by,
                    created_at=datetime.utcnow(),
                )
                db.add(notif)
            await db.flush()

        # Fire and forget: Redis + FCM (do not block endpoint response)
        await self._publish_redis(recipient_user_ids, target_roles, event_type, title, body, data, urgency)
        await self._send_fcm_to_users(db, recipient_user_ids, title, body, data, urgency)

        if urgency == "urgent":
            await self._send_whatsapp_urgent(title, body, event_type)

    # ──────────────────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────────────────

    async def _get_user_ids_by_roles(self, db: AsyncSession, roles: list[str]) -> list[int]:
        """Resolve role names → active user IDs."""
        try:
            from app.models.postgres.user import Role, user_roles
            from sqlalchemy import and_

            # Normalise: the role_type enum stores uppercase values
            upper_roles = [r.upper() for r in roles]

            result = await db.execute(
                select(User.id).join(user_roles, user_roles.c.user_id == User.id)
                .join(Role, user_roles.c.role_id == Role.id)
                .where(
                    and_(
                        # SQLAlchemy enums compare to their .value string
                        Role.role_type.in_(upper_roles),
                        User.is_active.is_(True),
                        User.is_deleted.is_(False),
                    )
                )
            )
            return [row[0] for row in result.fetchall()]
        except Exception as exc:
            logger.warning(f"NotificationService: could not resolve roles {roles}: {exc}")
            return []

    async def _publish_redis(
        self,
        user_ids: list[int],
        roles: list[str],
        event_type: str,
        title: str,
        body: str,
        data: dict,
        urgency: str,
    ) -> None:
        """Publish notification to Redis channels."""
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            payload = json.dumps({
                "event_type": event_type,
                "title": title,
                "body": body,
                "data": data,
                "urgency": urgency,
            })
            async with r:
                for uid in user_ids:
                    await r.publish(f"kavya:notifications:{uid}", payload)
                for role in roles:
                    await r.publish(f"kavya:notifications:role:{role.upper()}", payload)
        except Exception as exc:
            logger.warning(f"NotificationService Redis publish failed: {exc}")

    async def _send_fcm_to_users(
        self,
        db: AsyncSession,
        user_ids: list[int],
        title: str,
        body: str,
        data: dict,
        urgency: str,
    ) -> None:
        """Send FCM push to each user's registered device token."""
        if not user_ids:
            return
        try:
            result = await db.execute(
                select(User.fcm_token).where(
                    User.id.in_(user_ids),
                    User.fcm_token.isnot(None),
                    User.is_active.is_(True),
                )
            )
            tokens = [row[0] for row in result.fetchall() if row[0]]
            if not tokens:
                return

            # FCM/Firebase removed — push notifications disabled.
            logger.info(
                f"[FCM-DISABLED] Would push to {len(tokens)} token(s): title={title!r} body={body!r}"
            )
        except Exception as exc:
            logger.warning(f"NotificationService FCM dispatch failed: {exc}")

    async def _send_whatsapp_urgent(self, title: str, body: str, event_type: str) -> None:
        """Send urgent events via Twilio WhatsApp to the company manager number."""
        try:
            from twilio.rest import Client as TwilioClient

            manager_number = getattr(settings, "MANAGER_WHATSAPP_NUMBER", None)
            twilio_sid = getattr(settings, "TWILIO_ACCOUNT_SID", None)
            twilio_token = getattr(settings, "TWILIO_AUTH_TOKEN", None)
            twilio_from = getattr(settings, "TWILIO_WHATSAPP_FROM", None)

            if not all([manager_number, twilio_sid, twilio_token, twilio_from]):
                return

            client = TwilioClient(twilio_sid, twilio_token)
            client.messages.create(
                from_=f"whatsapp:{twilio_from}",
                to=f"whatsapp:{manager_number}",
                body=f"🚨 [{event_type}]\n{title}\n{body}",
            )
        except Exception as exc:
            logger.warning(f"NotificationService WhatsApp failed: {exc}")


# Singleton instance — import and use directly
notification_service = NotificationService()
