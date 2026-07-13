"""
IFIAS Tasks -- Public API
Re-exports from pipeline_tasks + convenience helpers.
"""

# Re-export the main task
from app.tasks.pipeline_tasks import run_ifias_batch, ONEDRIVE_WATCH_PATH

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def trigger_batch(file_path: str, triggered_by: str = "manual") -> dict:
    """
    Programmatic trigger: validate file, create DB batch, fire Celery task.
    For browser uploads use POST /invoice-batches/upload instead.
    """
    from app.db.postgres.connection import SyncSessionLocal
    from app.models.postgres.ifias import ProcessingBatch
    from app.services.excel_parser_service import parse_invoice_excel

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Excel file not found: {file_path}")
    if path.suffix.lower() not in (".xlsx", ".xls"):
        raise ValueError(f"Expected .xlsx or .xls, got: {path.suffix}")

    parse_result = parse_invoice_excel(str(path))

    db = SyncSessionLocal()
    try:
        batch = ProcessingBatch(
            transporter_name=parse_result.transporter_name or path.stem,
            client_name=parse_result.client_name or "Unknown",
            billing_period=parse_result.billing_period or "",
            source_excel_path=str(path),
            sheet_name=parse_result.sheet_name,
            total_lrs=parse_result.total_rows,
            status="PENDING",
            triggered_by=triggered_by,
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)
        batch_id = batch.id
    finally:
        db.close()

    task = run_ifias_batch.delay(
        excel_path=str(path),
        batch_id=batch_id,
        triggered_by=triggered_by,
    )
    logger.info(f"[ifias] trigger_batch | batch_id={batch_id}  task_id={task.id}")
    return {
        "batch_id":  batch_id,
        "task_id":   task.id,
        "status":    "PENDING",
        "file":      path.name,
        "total_lrs": parse_result.total_rows,
    }


__all__ = [
    "run_ifias_batch",
    "trigger_batch",
    "ONEDRIVE_WATCH_PATH",
]
