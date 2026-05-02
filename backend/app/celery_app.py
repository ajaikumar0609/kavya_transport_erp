# Celery Application — background task processing
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "transport_erp",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.compliance_tasks",
        "app.tasks.eway_bill_tasks",
        "app.tasks.fuel_price_tasks",
        "app.tasks.geofence_tasks",
        "app.tasks.scoring_tasks",
        "app.tasks.notification_tasks",
        "app.tasks.intelligence_tasks",
        "app.tasks.finance_tasks",
        "app.tasks.banking_tasks",
        "app.tasks.ialert_tasks",
        "app.tasks.ktt_tasks",
        "app.tasks.pipeline_tasks",
        "app.tasks.gps_tasks",
        "app.tasks.ewb_expiry_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 min hard limit
    task_soft_time_limit=240,  # 4 min soft limit
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    # ── Task routing — separate queues per domain ─────────────
    task_routes={
        "app.tasks.finance_tasks.*":        {"queue": "finance"},
        "app.tasks.notification_tasks.*":   {"queue": "notifications"},
        "app.tasks.intelligence_tasks.*":   {"queue": "reports"},
        "app.tasks.scoring_tasks.*":        {"queue": "reports"},
        "gps.*":                            {"queue": "celery"},
        "app.tasks.ialert_tasks.*":         {"queue": "celery"},
        "app.tasks.ktt_tasks.*":            {"queue": "celery"},
        # payments queue — highest priority
        "app.tasks.payment_tasks.*":        {"queue": "payments"},
    },
    task_queue_max_priority=10,
    task_default_priority=5,
    # ── Default retry policy ─────────────────────────────────
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    beat_schedule={
        "check-compliance-daily": {
            "task": "app.tasks.compliance_tasks.check_all_compliance",
            "schedule": 86400.0,  # once a day
        },
        "sync-eway-bill-status": {
            "task": "app.tasks.eway_bill_tasks.sync_active_eway_bills",
            "schedule": 3600.0,  # every hour
        },
        "update-fuel-prices": {
            "task": "app.tasks.fuel_price_tasks.refresh_fuel_prices",
            "schedule": 21600.0,  # every 6 hours
        },
        "check-geofences": {
            "task": "app.tasks.geofence_tasks.check_geofences_periodic",
            "schedule": 30.0,  # every 30 seconds
        },
        "check-unauthorized-halts": {
            "task": "app.tasks.geofence_tasks.check_unauthorized_halts",
            "schedule": 300.0,  # every 5 minutes
        },
        "check-night-movement": {
            "task": "app.tasks.geofence_tasks.check_night_movement",
            "schedule": 600.0,  # every 10 minutes
        },
        "compute-monthly-scores": {
            "task": "app.tasks.scoring_tasks.compute_monthly_scores",
            "schedule": 86400.0 * 30,  # ~monthly (triggered manually or by cron)
        },
        "capture-behavior-events": {
            "task": "app.tasks.scoring_tasks.capture_behavior_events",
            "schedule": 60.0,  # every 60 seconds
        },
        "send-milestone-notifications": {
            "task": "app.tasks.notification_tasks.send_milestone_notifications",
            "schedule": 300.0,  # every 5 minutes
        },
        "send-payment-reminders": {
            "task": "app.tasks.notification_tasks.send_payment_reminders",
            "schedule": 86400.0,  # daily
        },
        # ── Finance Automation Tasks ──
        "detect-overdue-invoices": {
            "task": "app.tasks.finance_tasks.detect_overdue_invoices",
            "schedule": crontab(hour=7, minute=0),
        },
        "recalculate-aging": {
            "task": "app.tasks.finance_tasks.recalculate_aging",
            "schedule": crontab(hour=7, minute=30),
        },
        "check-payable-due-dates": {
            "task": "app.tasks.finance_tasks.check_payable_due_dates",
            "schedule": crontab(hour=8, minute=0),
        },
        "check-low-bank-balance": {
            "task": "app.tasks.finance_tasks.check_low_bank_balance",
            "schedule": crontab(hour=9, minute=0),
        },
        "generate-daily-digest": {
            "task": "app.tasks.finance_tasks.generate_daily_digest",
            "schedule": crontab(hour=21, minute=0),
        },
        "generate-weekly-pl": {
            "task": "app.tasks.finance_tasks.generate_weekly_pl",
            "schedule": crontab(hour=7, minute=0, day_of_week="monday"),
        },
        "generate-monthly-close": {
            "task": "app.tasks.finance_tasks.generate_monthly_close",
            "schedule": crontab(hour=6, minute=0, day_of_month=1),
        },
        "gst-filing-reminder": {
            "task": "app.tasks.finance_tasks.gst_filing_reminder",
            "schedule": crontab(hour=9, minute=0, day_of_month=20),
        },
        # ── Intelligence Tasks ──
        "intelligence-daily-job": {
            "task": "app.tasks.intelligence_tasks.run_daily_intelligence_job",
            "schedule": crontab(hour=2, minute=0),  # 02:00 IST
        },
        "intelligence-eta-corridors": {
            "task": "app.tasks.intelligence_tasks.recompute_eta_corridors",
            "schedule": crontab(hour=3, minute=0),  # 03:00 IST
        },
        "intelligence-expense-stats": {
            "task": "app.tasks.intelligence_tasks.recompute_expense_stats",
            "schedule": crontab(hour=3, minute=30),  # 03:30 IST
        },
        # ── Event Priority Pipeline Tasks ──
        "event-escalation-suppression": {
            "task": "app.tasks.intelligence_tasks.run_escalation_and_suppression",
            "schedule": 300.0,  # every 5 minutes
        },
        "morning-digest-notifications": {
            "task": "app.tasks.intelligence_tasks.send_morning_digest",
            "schedule": crontab(hour=7, minute=0),  # 07:00 IST
        },
        # ── Banking & EWB Tasks ──
        "check-ewb-expiry": {
            "task": "app.tasks.ewb_expiry_tasks.check_ewb_expiry",
            "schedule": 1800.0,  # every 30 minutes
        },
        "daily-balance-snapshot": {
            "task": "app.tasks.banking_tasks.daily_balance_snapshot",
            "schedule": crontab(hour=23, minute=59),
        },
        # ── Notification Alert Tasks ──
        "check-ewb-expiry-notify": {
            "task": "app.tasks.notification_tasks.check_ewb_expiry_notify",
            "schedule": crontab(minute=0),  # every hour
        },
        "check-service-due-notify": {
            "task": "app.tasks.notification_tasks.check_service_due_notify",
            "schedule": crontab(hour=7, minute=0),  # 7 AM daily
        },
        "check-overdue-invoices-notify": {
            "task": "app.tasks.notification_tasks.check_overdue_invoices_notify",
            "schedule": crontab(hour=9, minute=0),  # 9 AM daily
        },
        # ── iALERT GPS Polling (legacy, kept for backward compat) ──
        "poll-ialert-gps": {
            "task": "app.tasks.ialert_tasks.poll_ialert_gps",
            "schedule": float(settings.IALERT_POLL_INTERVAL_SECONDS),
        },
        # ── KTT GPS Polling (KT Telematic Pull API) ──
        "poll-ktt-gps": {
            "task": "app.tasks.ktt_tasks.poll_ktt_gps",
            "schedule": float(settings.KTT_POLL_INTERVAL_SECONDS),
        },
        # ── Unified GPS Polling (all providers) ──
        "gps-unified-poll": {
            "task": "gps.poll_all_providers",
            "schedule": float(settings.IALERT_POLL_INTERVAL_SECONDS),
        },
        "gps-provider-health": {
            "task": "gps.check_provider_health",
            "schedule": 300.0,  # every 5 min
        },
    },
)

# Auto-discover tasks from app.tasks package
celery_app.autodiscover_tasks(["app.tasks"])
