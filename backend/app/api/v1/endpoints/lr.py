# LR (Lorry Receipt) Endpoints
import os, uuid
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.middleware.permissions import require_permission, Permissions
from app.schemas.base import APIResponse, PaginationMeta
from app.schemas.lr import LRCreate, LRUpdate, LRStatusChange
from app.services import lr_service
from app.services.lr_pdf_service import build_lr_pdf, generate_and_upload_lr_pdf
from app.services.notification_service import notification_service

router = APIRouter()


@router.get("", response_model=APIResponse)
async def list_lrs(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, status: Optional[str] = None,
    job_id: Optional[int] = None, trip_id: Optional[int] = None,
    transport_type: Optional[str] = None,
    my_lrs: bool = Query(False, description="When true, return only LRs created by the current user"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_READ)),
):
    created_by = current_user.user_id if my_lrs else None
    lrs, total = await lr_service.list_lrs(db, page, limit, search, status, job_id, trip_id, transport_type, created_by)
    pages = (total + limit - 1) // limit
    items = []
    for lr in lrs:
        items.append(await lr_service.get_lr_with_details(db, lr))
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.get("/next-eway-number", response_model=APIResponse)
async def get_next_eway_number(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    next_number = await lr_service.get_next_eway_bill_number(db)
    return APIResponse(success=True, data={"eway_bill_number": next_number})


@router.get("/next-eway-bill-number", response_model=APIResponse)
async def get_next_eway_bill_number(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_READ)),
):
    """Return the next auto-incremented E-way bill number for new LRs."""
    next_num = await lr_service.get_next_eway_bill_number(db)
    return APIResponse(success=True, data={"next_eway_bill_number": next_num})


@router.get("/client/{client_id}/last-cargo-items", response_model=APIResponse)
async def get_last_cargo_items(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_READ)),
):
    """Return cargo items from the most recent LR for a client, used for auto-fill suggestions."""
    items = await lr_service.get_last_cargo_items_for_client(db, client_id)
    return APIResponse(success=True, data=items)


@router.get("/{lr_id}", response_model=APIResponse)
async def get_lr(lr_id: int, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    lr = await lr_service.get_lr(db, lr_id)
    if not lr:
        raise HTTPException(status_code=404, detail="LR not found")
    data = await lr_service.get_lr_with_details(db, lr)
    return APIResponse(success=True, data=data)


@router.get("/{lr_id}/print", response_model=APIResponse)
async def print_lr(lr_id: int, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    lr = await lr_service.get_lr(db, lr_id)
    if not lr:
        raise HTTPException(status_code=404, detail="LR not found")
    data = await lr_service.get_lr_with_details(db, lr)
    # Serialize date/datetime fields
    for key, val in data.items():
        import datetime as _dt
        if isinstance(val, (_dt.date, _dt.datetime)):
            data[key] = str(val)
    # Field aliases for print template
    data["vehicle_number"] = data.get("vehicle_registration") or data.get("vehicle_number")
    # Compute totals for print template
    freight = float(data.get("freight_amount") or 0)
    loading = float(data.get("loading_charges") or 0)
    unloading = float(data.get("unloading_charges") or 0)
    detention = float(data.get("detention_charges") or 0)
    other = float(data.get("other_charges") or 0)
    subtotal = freight + loading + unloading + detention + other
    gst_pct = float(data.get("gst_percentage") or 5)
    gst_amount = round(subtotal * gst_pct / 100, 2)
    data["subtotal"] = subtotal
    data["gst_percentage"] = gst_pct
    data["gst_amount"] = gst_amount
    data["total_amount"] = round(subtotal + gst_amount, 2)
    # Company info
    data["company_name"] = "Kavya Transports"
    data["company_address"] = ""
    data["company_gstin"] = ""
    data["company_phone"] = ""
    data["terms"] = [
        "Goods once booked will not be returned without prior notice.",
        "The consignor is responsible for proper packing of goods.",
        "Liability is limited to the declared value of goods.",
        "Subject to jurisdiction of local courts only.",
    ]
    return APIResponse(success=True, data=data)


@router.post("", response_model=APIResponse, status_code=201)
async def create_lr(
    data: LRCreate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_CREATE)),
):
    lr = await lr_service.create_lr(db, data.model_dump(), current_user.user_id)
    freight_fmt = f"₹{float(lr.freight_amount or 0):,.0f}"
    await notification_service.send(
        db, event_type="LR_CREATED",
        title="LR created",
        body=f"LR {lr.lr_number} created for job #{lr.job_id}",
        target_roles=["MANAGER"],
        data={"lr_id": str(lr.id)},
        urgency="normal", triggered_by=current_user.user_id,
    )
    await notification_service.send(
        db, event_type="LR_READY",
        title="LR ready",
        body=f"LR {lr.lr_number} – vehicle can depart after EWB",
        target_roles=["FLEET_MANAGER"],
        data={"lr_id": str(lr.id)},
        urgency="normal", triggered_by=current_user.user_id,
    )
    await notification_service.send(
        db, event_type="LR_FOR_BILLING",
        title="New LR for billing",
        body=f"LR {lr.lr_number} – {freight_fmt} freight",
        target_roles=["ACCOUNTANT"],
        data={"lr_id": str(lr.id)},
        urgency="normal", triggered_by=current_user.user_id,
    )
    return APIResponse(success=True, data={"id": lr.id, "lr_number": lr.lr_number}, message="LR created")


@router.put("/{lr_id}", response_model=APIResponse)
async def update_lr(
    lr_id: int, data: LRUpdate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_UPDATE)),
):
    lr = await lr_service.update_lr(db, lr_id, data.model_dump(exclude_unset=True))
    if not lr:
        raise HTTPException(status_code=404, detail="LR not found")
    return APIResponse(success=True, message="LR updated")


@router.delete("/{lr_id}", response_model=APIResponse)
async def delete_lr(
    lr_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_DELETE)),
):
    success = await lr_service.delete_lr(db, lr_id)
    if not success:
        raise HTTPException(status_code=404, detail="LR not found")
    return APIResponse(success=True, message="LR deleted")


@router.post("/{lr_id}/status", response_model=APIResponse)
async def change_lr_status(
    lr_id: int, data: LRStatusChange, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_UPDATE)),
):
    lr, error = await lr_service.change_lr_status(db, lr_id, data.status, current_user.user_id, data.remarks, data.received_by)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # EVT-02 / EVT-06: On POD received — auto-invoice & auto-close trip
    if data.status in ("pod_received", "pod_verified") and lr and lr.trip_id:
        try:
            from app.services.tms_automation_service import evt_02_invoice_on_pod, evt_06_trip_closure_on_pod
            from app.db.postgres.connection import AsyncSessionLocal

            async def _run_pod_hooks():
                async with AsyncSessionLocal() as _db:
                    await evt_02_invoice_on_pod(_db, lr.trip_id, current_user.user_id)
                    await evt_06_trip_closure_on_pod(_db, lr.trip_id, current_user.user_id)

            background_tasks.add_task(_run_pod_hooks)
        except Exception:
            pass

    return APIResponse(success=True, message=f"LR status changed to {data.status}")


@router.post("/{lr_id}/generate", response_model=APIResponse)
async def generate_lr(
    lr_id: int, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_UPDATE)),
):
    """Generate an LR — transitions status from draft to generated."""
    lr, error = await lr_service.change_lr_status(db, lr_id, "generated", current_user.user_id, "LR generated")
    if error:
        raise HTTPException(status_code=400, detail=error)

    # EVT-01: Auto-draft e-way bill (fire-and-forget)
    try:
        from app.services.tms_automation_service import evt_01_draft_ewb
        from app.db.postgres.connection import AsyncSessionLocal

        async def _run_evt01():
            async with AsyncSessionLocal() as _db:
                await evt_01_draft_ewb(_db, lr_id)

        background_tasks.add_task(_run_evt01)
    except Exception:
        pass

    data = await lr_service.get_lr_with_details(db, lr)
    return APIResponse(success=True, data=data, message="LR generated successfully")


@router.get("/{lr_id}/pdf", response_model=APIResponse)
async def get_lr_pdf_url(
    lr_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_READ)),
):
    """Generate LR PDF and upload to storage. Returns download URL."""
    try:
        result = await generate_and_upload_lr_pdf(db, lr_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return APIResponse(success=True, data=result, message="LR PDF generated")


@router.get("/{lr_id}/pdf/download")
async def download_lr_pdf(
    lr_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_READ)),
):
    """Generate and stream LR PDF as a direct download."""
    try:
        pdf_bytes = await build_lr_pdf(db, lr_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    lr = await lr_service.get_lr(db, lr_id)
    filename = f"{lr.lr_number}.pdf" if lr else f"LR-{lr_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{lr_id}/pod", response_model=APIResponse)
async def upload_pod(
    lr_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Upload Proof of Delivery (POD) for an LR. Accessible by driver (mobile) and fleet manager (web)."""
    from app.models.postgres.lr import LR
    from sqlalchemy import select

    result = await db.execute(select(LR).where(LR.id == lr_id, LR.is_deleted == False))
    lr = result.scalar_one_or_none()
    if not lr:
        raise HTTPException(status_code=404, detail="LR not found")

    # Save file — use absolute path anchored to this file's location (backend/uploads/)
    from pathlib import Path as _Path
    pod_dir = _Path(__file__).resolve().parents[4] / "uploads" / "trip_documents"
    pod_dir.mkdir(parents=True, exist_ok=True)
    ext = (file.filename or "pod.jpg").rsplit(".", 1)[-1].lower()
    filename = f"pod_{lr_id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = pod_dir / filename
    content = await file.read()
    file_path.write_bytes(content)

    # Update LR
    pod_url = f"/uploads/trip_documents/{filename}"
    lr.pod_uploaded = True
    lr.pod_file_url = pod_url
    from datetime import datetime
    lr.pod_upload_date = datetime.utcnow()
    if lr.status and str(lr.status).lower() not in ("pod_received", "pod_verified", "delivered"):
        await lr_service.change_lr_status(db, lr_id, "pod_received", current_user.user_id, "POD uploaded")
    else:
        await db.commit()

    try:
        await notification_service.send(
            db,
            event_type="LR_POD_UPLOADED",
            title="POD Uploaded",
            body=f"POD uploaded for LR {lr.lr_number}",
            target_roles=["FLEET_MANAGER", "ACCOUNTANT"],
            data={"lr_id": str(lr_id)},
            urgency="normal",
            triggered_by=current_user.user_id,
        )
    except Exception:
        pass

    return APIResponse(success=True, data={"pod_file_url": pod_url}, message="POD uploaded successfully")


@router.post("/{lr_id}/pod/verify", response_model=APIResponse)
async def verify_pod(
    lr_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.LR_UPDATE)),
):
    """Verify the uploaded POD for an LR (fleet manager / accountant action)."""
    from app.models.postgres.lr import LR
    from sqlalchemy import select

    result = await db.execute(select(LR).where(LR.id == lr_id, LR.is_deleted == False))
    lr = result.scalar_one_or_none()
    if not lr:
        raise HTTPException(status_code=404, detail="LR not found")
    if not lr.pod_uploaded:
        raise HTTPException(status_code=400, detail="POD has not been uploaded yet")

    lr.pod_verified = True
    lr.pod_verified_by = current_user.user_id
    await lr_service.change_lr_status(db, lr_id, "pod_verified", current_user.user_id, "POD verified by fleet manager")

    return APIResponse(success=True, data={"pod_verified": True}, message="POD verified successfully")
