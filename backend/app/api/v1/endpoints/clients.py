# Client Management Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.postgres.connection import get_db
from app.core.security import TokenData, get_current_user
from app.middleware.permissions import require_permission, Permissions
from app.schemas.base import APIResponse, PaginationMeta
from app.schemas.client import ClientCreate, ClientUpdate, ClientContactCreate
from app.services import client_service
from app.utils.tenant_guard import assert_tenant_access

router = APIRouter()


@router.get("", response_model=APIResponse)
async def list_clients(
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None, status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission(Permissions.CLIENT_READ)),
):
    clients, total = await client_service.list_clients(db, page, limit, search, status)
    pages = (total + limit - 1) // limit
    items = [{c.key: getattr(cl, c.key) for c in cl.__table__.columns} for cl in clients]
    return APIResponse(success=True, data=items, pagination=PaginationMeta(page=page, limit=limit, total=total, pages=pages))


@router.get("/{client_id}", response_model=APIResponse)
async def get_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.CLIENT_READ)),
):
    client = await client_service.get_client(db, client_id)
    assert_tenant_access(client, current_user, not_found_detail="Client not found")
    contacts = await client_service.list_client_contacts(db, client_id)
    data = {c.key: getattr(client, c.key) for c in client.__table__.columns}
    data["contacts"] = [{c.key: getattr(ct, c.key) for c in ct.__table__.columns} for ct in contacts]
    return APIResponse(success=True, data=data)


@router.post("", response_model=APIResponse, status_code=201)
async def create_client(
    data: ClientCreate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.CLIENT_CREATE)),
):
    client = await client_service.create_client(db, data.model_dump(exclude_unset=True))
    return APIResponse(success=True, data={"id": client.id, "code": client.code}, message="Client created")


@router.put("/{client_id}", response_model=APIResponse)
async def update_client(
    client_id: int, data: ClientUpdate, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.CLIENT_UPDATE)),
):
    existing = await client_service.get_client(db, client_id)
    assert_tenant_access(existing, current_user, not_found_detail="Client not found")
    client = await client_service.update_client(db, client_id, data.model_dump(exclude_unset=True))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return APIResponse(success=True, message="Client updated")


@router.delete("/{client_id}", response_model=APIResponse)
async def delete_client(
    client_id: int, db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.CLIENT_DELETE)),
):
    existing = await client_service.get_client(db, client_id)
    assert_tenant_access(existing, current_user, not_found_detail="Client not found")
    success = await client_service.delete_client(db, client_id)
    if not success:
        raise HTTPException(status_code=404, detail="Client not found")
    return APIResponse(success=True, message="Client deleted")


# --- Contacts ---
@router.get("/{client_id}/contacts", response_model=APIResponse)
async def list_contacts(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.CLIENT_READ)),
):
    parent = await client_service.get_client(db, client_id)
    assert_tenant_access(parent, current_user, not_found_detail="Client not found")
    contacts = await client_service.list_client_contacts(db, client_id)
    items = [{c.key: getattr(ct, c.key) for c in ct.__table__.columns} for ct in contacts]
    return APIResponse(success=True, data=items)


@router.post("/{client_id}/contacts", response_model=APIResponse, status_code=201)
async def add_contact(
    client_id: int, data: ClientContactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission(Permissions.CLIENT_UPDATE)),
):
    parent = await client_service.get_client(db, client_id)
    assert_tenant_access(parent, current_user, not_found_detail="Client not found")
    contact = await client_service.create_client_contact(db, client_id, data.model_dump())
    return APIResponse(success=True, data={"id": contact.id}, message="Contact added")


@router.delete("/contacts/{contact_id}", response_model=APIResponse)
async def remove_contact(contact_id: int, db: AsyncSession = Depends(get_db), current_user: TokenData = Depends(get_current_user)):
    success = await client_service.delete_client_contact(db, contact_id)
    if not success:
        raise HTTPException(status_code=404, detail="Contact not found")
    return APIResponse(success=True, message="Contact removed")
