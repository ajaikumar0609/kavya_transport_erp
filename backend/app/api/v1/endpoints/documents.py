# Document Management Endpoints
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional
import json
import logging
from datetime import datetime, date as date_type, timedelta

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.schemas.base import APIResponse, PaginationMeta
from app.models.postgres.document import Document, EntityType, DocumentType, DocumentApprovalStatus
from app.services import s3_service
from app.services.document_extraction_service import (
    DocumentExtractionService,
    ENTITY_DOCUMENTS,
    DOC_TYPE_TO_ENUM,
    EXPIRY_FIELDS,
    ISSUE_DATE_FIELDS,
    SYSTEM_GENERATED_TYPES,
)
from app.middleware.permissions import require_permission, require_any_permission, Permissions
from app.utils.tenant_guard import assert_tenant_access

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "image/heic", "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

DOC_TYPE_ALIASES = {
    "license": "driving_license",
    "bank_passbook": "passbook",
    "bank_account": "passbook",
}

DOCUMENT_NUMBER_FIELDS = {
    "driving_license": "license_number",
    "rc": "registration_number",
    "insurance": "policy_number",
    "fitness": "certificate_number",
    "puc": "certificate_number",
    "permit": "permit_number",
    "tax_receipt": "receipt_number",
}


def _parse_ddmmyyyy(value: Optional[str]) -> Optional[date_type]:
    """Parse DD/MM/YYYY string to a Python date. Returns None on failure."""
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%d/%m/%Y").date()
    except (ValueError, AttributeError):
        return None


def _normalize_doc_type(value: str) -> str:
    key = (value or "").strip().lower()
    return DOC_TYPE_ALIASES.get(key, key)


def _parse_date_mixed(value: Optional[str]) -> Optional[date_type]:
    if not value:
        return None
    parsed = _parse_ddmmyyyy(value)
    if parsed:
        return parsed
    try:
        return datetime.fromisoformat(value.strip()).date()
    except (ValueError, AttributeError):
        return None

router = APIRouter()


# ── AI Document Extraction ──────────────────────────────────────────────────

@router.post("/extract", response_model=APIResponse)
async def extract_document(
    file: UploadFile = File(...),
    document_type: str = Form(...),
    entity_type: str = Form(...),
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_CREATE)),
):
    """
    Upload a document image or PDF and extract structured data using AI.

    Returns extracted JSON data for user review — does NOT save to database.
    Call POST /documents/upload with the reviewed data to persist.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload JPEG, PNG, WEBP, HEIC, PDF, PPT, or PPTX.",
        )

    from app.utils.upload_validator import validate_upload, ALLOWED_IMAGE_DOC_MIMES
    file_bytes, detected_mime, _safe = await validate_upload(
        file, allowed_mimes=ALLOWED_IMAGE_DOC_MIMES, max_bytes=MAX_FILE_SIZE,
    )

    service = DocumentExtractionService()
    result = await service.extract(
        document_type=_normalize_doc_type(document_type),
        file_bytes=file_bytes,
        media_type=detected_mime,
    )

    extraction_message = (
        "Extraction complete. Review the fields below before saving."
        if result.get("extracted")
        else result.get("message", "Extraction unavailable. You can continue with manual entry.")
    )

    return APIResponse(
        success=True,
        data={
            **result,
            "entity_type": entity_type,
        },
        message=extraction_message,
    )


@router.get("/requirements", response_model=APIResponse)
async def get_document_requirements(
    entity_type: str = Query(...),
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_READ)),
):
    """
    Returns the required and optional document checklist for an entity type.
    entity_type: vehicle | driver | employee | client
    """
    if entity_type not in ENTITY_DOCUMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown entity type: '{entity_type}'. Use: vehicle, driver, employee, client",
        )
    return APIResponse(success=True, data=ENTITY_DOCUMENTS[entity_type])


@router.get("", response_model=APIResponse)
async def list_documents(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    approval_status: Optional[str] = None,
    document_type: Optional[str] = None,
    expiry_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_READ)),
):
    query = select(Document).where(Document.is_deleted == False)
    count_query = select(func.count(Document.id)).where(Document.is_deleted == False)

    if search:
        sf = or_(Document.title.ilike(f"%{search}%"), Document.document_number.ilike(f"%{search}%"))
        query = query.where(sf)
        count_query = count_query.where(sf)

    if entity_type:
        query = query.where(Document.entity_type == EntityType(entity_type.upper()))
        count_query = count_query.where(Document.entity_type == EntityType(entity_type.upper()))

    if entity_id:
        query = query.where(Document.entity_id == entity_id)
        count_query = count_query.where(Document.entity_id == entity_id)

    if approval_status:
        try:
            resolved_status = DocumentApprovalStatus(approval_status.strip().upper())
            query = query.where(Document.approval_status == resolved_status)
            count_query = count_query.where(Document.approval_status == resolved_status)
        except ValueError:
            # Ignore unknown status filters instead of breaking list API.
            pass

    if document_type:
        normalized_doc_type = _normalize_doc_type(document_type)
        doc_type_key = DOC_TYPE_TO_ENUM.get(normalized_doc_type, normalized_doc_type.upper())
        try:
            resolved_doc_type = DocumentType(doc_type_key)
            query = query.where(Document.document_type == resolved_doc_type)
            count_query = count_query.where(Document.document_type == resolved_doc_type)
        except ValueError:
            # Ignore unknown doc type filters instead of breaking list API.
            pass

    if expiry_filter:
        today = date_type.today()
        soon_cutoff = today + timedelta(days=30)
        key = expiry_filter.strip().lower()
        if key == "expired":
            query = query.where(Document.expiry_date.isnot(None), Document.expiry_date < today)
            count_query = count_query.where(Document.expiry_date.isnot(None), Document.expiry_date < today)
        elif key == "expiring_soon":
            query = query.where(Document.expiry_date.isnot(None), Document.expiry_date >= today, Document.expiry_date <= soon_cutoff)
            count_query = count_query.where(Document.expiry_date.isnot(None), Document.expiry_date >= today, Document.expiry_date <= soon_cutoff)
        elif key == "valid":
            query = query.where(Document.expiry_date.isnot(None), Document.expiry_date > soon_cutoff)
            count_query = count_query.where(Document.expiry_date.isnot(None), Document.expiry_date > soon_cutoff)

    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + limit - 1) // limit
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit).order_by(Document.id.desc()))
    docs = result.scalars().all()

    def _serialize_doc(d):
        row = {}
        for c in d.__table__.columns:
            v = getattr(d, c.key)
            if hasattr(v, 'isoformat'):
                v = v.isoformat()
            elif hasattr(v, 'value'):   # SQLAlchemy Enum
                v = v.value
            elif hasattr(v, '__float__') and not isinstance(v, (int, float, bool)):  # Decimal
                v = float(v)
            row[c.key] = v
        return row

    items = [_serialize_doc(d) for d in docs]
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


# ── Lookup endpoints (must be before /{doc_id} to avoid path conflicts) ──
@router.get("/lookup/entities", response_model=APIResponse)
async def lookup_entities(
    entity_type: str = Query("vehicle"),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_READ)),
):
    """Lookup entities (vehicles, drivers, trips, clients) for document linking."""
    items = []
    if entity_type == "vehicle":
        from app.models.postgres.vehicle import Vehicle
        q = select(Vehicle.id, Vehicle.registration_number, Vehicle.make, Vehicle.model).where(Vehicle.is_deleted == False)
        if search:
            q = q.where(Vehicle.registration_number.ilike(f"%{search}%"))
        result = await db.execute(q.order_by(Vehicle.registration_number).limit(50))
        items = [{"id": r.id, "name": f"{r.registration_number} ({r.make} {r.model})"} for r in result.all()]
    elif entity_type == "driver":
        from app.models.postgres.driver import Driver
        q = select(Driver.id, Driver.first_name, Driver.last_name, Driver.phone, Driver.employee_code).where(Driver.is_deleted == False)
        if search:
            q = q.where(Driver.first_name.ilike(f"%{search}%"))
        result = await db.execute(q.order_by(Driver.first_name).limit(50))
        items = [{"id": r.id, "name": f"{r.first_name} {r.last_name or ''} ({r.employee_code})".strip()} for r in result.all()]
    elif entity_type == "trip":
        from app.models.postgres.trip import Trip
        q = select(Trip.id, Trip.trip_number, Trip.origin, Trip.destination).where(Trip.is_deleted == False)
        if search:
            q = q.where(Trip.trip_number.ilike(f"%{search}%"))
        result = await db.execute(q.order_by(Trip.id.desc()).limit(50))
        items = [{"id": r.id, "name": f"{r.trip_number} ({r.origin} → {r.destination})"} for r in result.all()]
    elif entity_type == "client":
        from app.models.postgres.client import Client
        q = select(Client.id, Client.name, Client.code).where(Client.is_deleted == False)
        if search:
            q = q.where(Client.name.ilike(f"%{search}%"))
        result = await db.execute(q.order_by(Client.name).limit(50))
        items = [{"id": r.id, "name": f"{r.name} ({r.code})"} for r in result.all()]
    return APIResponse(success=True, data={"items": items})


@router.get("/lookup/compliance-categories", response_model=APIResponse)
async def lookup_compliance_categories(
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_READ)),
):
    categories = [
        {"value": "registration", "label": "Vehicle Registration"},
        {"value": "insurance", "label": "Insurance"},
        {"value": "fitness", "label": "Fitness Certificate"},
        {"value": "pollution", "label": "PUC / Pollution"},
        {"value": "permit", "label": "Permit"},
        {"value": "tax", "label": "Road Tax"},
        {"value": "license", "label": "Driver License"},
        {"value": "other", "label": "Other"},
    ]
    return APIResponse(success=True, data={"items": categories})


@router.get("/{doc_id}", response_model=APIResponse)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_READ)),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    assert_tenant_access(doc, current_user, not_found_detail="Document not found")
    row = {c.key: getattr(doc, c.key) for c in doc.__table__.columns}
    if row.get('file_url'):
        try:
            from app.services.s3_service import presign_stored_url
            row['file_url'] = await presign_stored_url(row['file_url'], expires_in=7200)
        except Exception:
            pass
    return APIResponse(success=True, data=row)


@router.post("/upload", response_model=APIResponse, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    entity_type: str = Form("vehicle"),
    entity_id: int = Form(0),
    entity_label: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    document_type: str = Form("other"),
    extracted_data: Optional[str] = Form(None),
    document_number: Optional[str] = Form(None),
    issue_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_CREATE)),
):
    """
    Upload a document file to S3/local storage.

    Pass extracted_data as a JSON string to store AI-extracted fields.
    Expiry alerts are auto-created if the document expires within 30 days.
    """
    from app.utils.generators import generate_number
    from app.utils.upload_validator import validate_upload, safe_original_name, ALLOWED_IMAGE_DOC_MIMES
    content, detected_mime, safe_name = await validate_upload(
        file, allowed_mimes=ALLOWED_IMAGE_DOC_MIMES, max_bytes=MAX_FILE_SIZE,
    )
    display_name = safe_original_name(file.filename)

    folder = f"documents/{entity_type}"
    upload_result = await s3_service.upload_file(content, safe_name, folder, detected_mime)

    # Parse extracted_data JSON string
    parsed_extracted: Optional[dict] = None
    if extracted_data:
        try:
            parsed_extracted = json.loads(extracted_data)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Invalid extracted_data JSON in upload, ignoring.")

    # Auto-run extraction on uploaded file when client does not send extracted_data.
    # This keeps upload UX simple: upload file once, backend extracts what it can.
    if not parsed_extracted:
        try:
            extraction_service = DocumentExtractionService()
            extraction_result = await extraction_service.extract(
                document_type=_normalize_doc_type(document_type),
                file_bytes=content,
                media_type=detected_mime,
            )
            extracted_payload = extraction_result.get("data")
            if extraction_result.get("extracted") and isinstance(extracted_payload, dict):
                parsed_extracted = extracted_payload
            else:
                logger.info(
                    "Auto extraction skipped for '%s': %s",
                    document_type,
                    extraction_result.get("reason") or extraction_result.get("message"),
                )
        except Exception as e:
            logger.warning("Auto extraction failed during upload for '%s': %s", document_type, e)

    # Resolve DocumentType enum (support both lowercase API types and existing uppercase values)
    normalized_doc_type = _normalize_doc_type(document_type)
    doc_type_key = DOC_TYPE_TO_ENUM.get(normalized_doc_type, document_type.upper())
    try:
        resolved_doc_type = DocumentType(doc_type_key)
    except ValueError:
        resolved_doc_type = DocumentType.OTHER

    # Resolve EntityType enum
    try:
        resolved_entity_type = EntityType(entity_type.upper())
    except ValueError:
        resolved_entity_type = EntityType.VEHICLE

    # Extract expiry and issue dates from parsed_extracted if present
    resolved_expiry_date: Optional[date_type] = None
    resolved_issue_date: Optional[date_type] = None
    resolved_document_number: Optional[str] = document_number
    if parsed_extracted:
        expiry_field = EXPIRY_FIELDS.get(normalized_doc_type)
        if expiry_field:
            resolved_expiry_date = _parse_ddmmyyyy(parsed_extracted.get(expiry_field))
        issue_field = ISSUE_DATE_FIELDS.get(normalized_doc_type)
        if issue_field:
            resolved_issue_date = _parse_ddmmyyyy(parsed_extracted.get(issue_field))
        if not resolved_document_number:
            number_field = DOCUMENT_NUMBER_FIELDS.get(normalized_doc_type)
            if number_field:
                resolved_document_number = parsed_extracted.get(number_field)

    if issue_date:
        resolved_issue_date = _parse_date_mixed(issue_date)
    if expiry_date:
        resolved_expiry_date = _parse_date_mixed(expiry_date)

    doc = Document(
        doc_number=generate_number("DOC", 4),
        title=title or display_name,
        document_type=resolved_doc_type,
        entity_type=resolved_entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        document_number=resolved_document_number,
        file_url=upload_result.get("url", ""),
        file_key=upload_result.get("key", ""),
        file_name=display_name,
        file_size=len(content),
        file_type=detected_mime,
        uploaded_by=current_user.user_id,
        extracted_data=parsed_extracted,
        issue_date=resolved_issue_date,
        expiry_date=resolved_expiry_date,
        tenant_id=current_user.tenant_id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Sync driver's license master record from uploaded driving license document.
    if (
        resolved_entity_type == EntityType.DRIVER
        and doc_type_key == "LICENSE"
        and entity_id
        and resolved_document_number
    ):
        try:
            from app.models.postgres.driver import DriverLicense, LicenseType

            existing_result = await db.execute(
                select(DriverLicense)
                .where(DriverLicense.driver_id == entity_id)
                .order_by(DriverLicense.id.desc())
            )
            existing_license = existing_result.scalars().first()

            if existing_license:
                existing_license.license_number = resolved_document_number
                if resolved_issue_date:
                    existing_license.issue_date = resolved_issue_date
                if resolved_expiry_date:
                    existing_license.expiry_date = resolved_expiry_date
                existing_license.file_url = upload_result.get("url", existing_license.file_url)
                await db.commit()
            elif resolved_expiry_date:
                new_license = DriverLicense(
                    driver_id=entity_id,
                    license_number=resolved_document_number,
                    license_type=LicenseType.TRANSPORT,
                    issue_date=resolved_issue_date,
                    expiry_date=resolved_expiry_date,
                    file_url=upload_result.get("url", ""),
                    is_verified=False,
                )
                db.add(new_license)
                await db.commit()
            else:
                logger.warning(
                    "Skipping driver license sync for driver_id=%s because expiry_date is missing.",
                    entity_id,
                )
        except Exception as e:
            logger.warning("Could not sync driver license for driver_id=%s: %s", entity_id, e)

    # Sync selected vehicle profile from uploaded RC extracted fields.
    if (
        resolved_entity_type == EntityType.VEHICLE
        and doc_type_key == "RC"
        and entity_id
        and parsed_extracted
    ):
        try:
            from app.models.postgres.vehicle import Vehicle

            vehicle_result = await db.execute(
                select(Vehicle).where(Vehicle.id == entity_id, Vehicle.is_deleted == False)
            )
            vehicle = vehicle_result.scalar_one_or_none()

            if vehicle:
                extracted_reg = (parsed_extracted.get("registration_number") or "").strip().upper() or None
                current_reg = (vehicle.registration_number or "").strip().upper() if vehicle.registration_number else None

                # Never overwrite registration_number with a conflicting value.
                if extracted_reg and current_reg and extracted_reg != current_reg:
                    logger.warning(
                        "Skipping RC registration sync for vehicle_id=%s due to mismatch (%s vs %s)",
                        entity_id,
                        extracted_reg,
                        current_reg,
                    )

                owner_name = parsed_extracted.get("owner_name")
                engine_number = parsed_extracted.get("engine_number")
                chassis_number = parsed_extracted.get("chassis_number")
                fuel_type = parsed_extracted.get("fuel_type")

                if owner_name:
                    vehicle.owner_name = owner_name
                if engine_number:
                    vehicle.engine_number = engine_number
                if chassis_number:
                    vehicle.chassis_number = chassis_number
                if fuel_type:
                    vehicle.fuel_type = str(fuel_type).strip().lower()

                await db.commit()
        except Exception as e:
            logger.warning("Could not sync RC details for vehicle_id=%s: %s", entity_id, e)

    # Sync vehicle insurance validity from uploaded insurance document.
    if (
        resolved_entity_type == EntityType.VEHICLE
        and doc_type_key == "INSURANCE"
        and entity_id
        and resolved_expiry_date
    ):
        try:
            from app.models.postgres.vehicle import Vehicle

            vehicle_result = await db.execute(
                select(Vehicle).where(Vehicle.id == entity_id, Vehicle.is_deleted == False)
            )
            vehicle = vehicle_result.scalar_one_or_none()
            if vehicle:
                vehicle.insurance_valid_until = resolved_expiry_date
                await db.commit()
        except Exception as e:
            logger.warning("Could not sync insurance validity for vehicle_id=%s: %s", entity_id, e)

    # Sync vehicle PUC validity from uploaded PUC document.
    if (
        resolved_entity_type == EntityType.VEHICLE
        and doc_type_key == "PUC"
        and entity_id
        and resolved_expiry_date
    ):
        try:
            from app.models.postgres.vehicle import Vehicle

            vehicle_result = await db.execute(
                select(Vehicle).where(Vehicle.id == entity_id, Vehicle.is_deleted == False)
            )
            vehicle = vehicle_result.scalar_one_or_none()
            if vehicle:
                vehicle.puc_valid_until = resolved_expiry_date
                await db.commit()
        except Exception as e:
            logger.warning("Could not sync PUC validity for vehicle_id=%s: %s", entity_id, e)

    # Sync vehicle fitness validity from uploaded fitness document.
    if (
        resolved_entity_type == EntityType.VEHICLE
        and doc_type_key == "FITNESS"
        and entity_id
        and resolved_expiry_date
    ):
        try:
            from app.models.postgres.vehicle import Vehicle

            vehicle_result = await db.execute(
                select(Vehicle).where(Vehicle.id == entity_id, Vehicle.is_deleted == False)
            )
            vehicle = vehicle_result.scalar_one_or_none()
            if vehicle:
                vehicle.fitness_valid_until = resolved_expiry_date
                await db.commit()
        except Exception as e:
            logger.warning("Could not sync fitness validity for vehicle_id=%s: %s", entity_id, e)

    # Sync vehicle permit validity from uploaded permit document.
    if (
        resolved_entity_type == EntityType.VEHICLE
        and doc_type_key == "PERMIT"
        and entity_id
        and resolved_expiry_date
    ):
        try:
            from app.models.postgres.vehicle import Vehicle

            vehicle_result = await db.execute(
                select(Vehicle).where(Vehicle.id == entity_id, Vehicle.is_deleted == False)
            )
            vehicle = vehicle_result.scalar_one_or_none()
            if vehicle:
                vehicle.permit_valid_until = resolved_expiry_date
                await db.commit()
        except Exception as e:
            logger.warning("Could not sync permit validity for vehicle_id=%s: %s", entity_id, e)

    # Create expiry compliance alert if document expires within 30 days
    if resolved_expiry_date and entity_id:
        try:
            from app.services import compliance_alert_service
            today = date_type.today()
            days_until = (resolved_expiry_date - today).days
            if days_until <= 30:
                from app.models.postgres.document import DocumentType as DT
                doc_label = title or document_type.replace("_", " ").title()
                severity = "critical" if days_until <= 7 else "high"
                message = (
                    f"{doc_label} expires in {days_until} days"
                    if days_until >= 0
                    else f"{doc_label} expired {abs(days_until)} days ago"
                )
                vehicle_id = entity_id if entity_type.lower() == "vehicle" else None
                driver_id = entity_id if entity_type.lower() == "driver" else None
                await compliance_alert_service.create_alert(
                    db=db,
                    title=f"Document Expiring: {doc_label}",
                    alert_type="warning",
                    severity=severity,
                    message=message,
                    vehicle_id=vehicle_id,
                    driver_id=driver_id,
                    document_id=doc.id,
                    entity_type=entity_type.lower(),
                    entity_id=entity_id,
                    due_date=datetime.combine(resolved_expiry_date, datetime.min.time()),
                )
        except Exception as e:
            logger.warning(f"Could not create expiry alert for document {doc.id}: {e}")

    # EVT-05: TMS compliance alerts on document upload (fire-and-forget)
    if resolved_expiry_date and entity_id:
        try:
            from app.services.tms_automation_service import evt_05_compliance_alerts
            from app.db.postgres.connection import AsyncSessionLocal

            _et = entity_type
            _eid = entity_id
            _dt = document_type
            _exp = resolved_expiry_date
            _vid = entity_id if entity_type.lower() == "vehicle" else None
            _did = entity_id if entity_type.lower() == "driver" else None

            async def _run_evt05():
                async with AsyncSessionLocal() as _db:
                    await evt_05_compliance_alerts(
                        _db, entity_type=_et, entity_id=_eid,
                        doc_type=_dt, expiry_date=_exp,
                        vehicle_id=_vid, driver_id=_did,
                    )

            background_tasks.add_task(_run_evt05)
        except Exception:
            pass

    return APIResponse(
        success=True,
        data={
            "id": doc.id,
            "url": upload_result.get("url"),
            "source": upload_result.get("source"),
            "document_number": resolved_document_number,
            "issue_date": resolved_issue_date.isoformat() if resolved_issue_date else None,
            "expiry_date": resolved_expiry_date.isoformat() if resolved_expiry_date else None,
        },
        message="Document uploaded successfully",
    )


@router.delete("/{doc_id}", response_model=APIResponse)
async def delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.DOCUMENT_DELETE)),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    assert_tenant_access(doc, current_user, not_found_detail="Document not found")

    # Delete underlying file first when we have a storage key.
    if doc.file_key:
        try:
            await s3_service.delete_file(doc.file_key)
        except Exception as e:
            logger.warning("Could not delete file key '%s' for doc_id=%s: %s", doc.file_key, doc_id, e)

    # Hard-delete document record from DB.
    await db.delete(doc)
    await db.commit()
    return APIResponse(success=True, message="Document deleted")
