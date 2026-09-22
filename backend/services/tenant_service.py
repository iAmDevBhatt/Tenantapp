import secrets
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.security import hash_password
from backend.models.tenant import Tenant


def get_or_404(db: Session, tenant_id: str) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def list_tenants(db: Session, active: str = "true") -> list[Tenant]:
    q = db.query(Tenant)
    if active == "true":
        q = q.filter(Tenant.active.is_(True))
    elif active == "false":
        q = q.filter(Tenant.active.is_(False))
    return q.order_by(Tenant.name.asc()).all()


def create_tenant(db: Session, data: dict) -> Tenant:
    tenant = Tenant(**data)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def update_tenant(db: Session, tenant: Tenant, data: dict) -> Tenant:
    for key, value in data.items():
        if value is not None:
            setattr(tenant, key, value)
    db.commit()
    db.refresh(tenant)
    return tenant


def deactivate(db: Session, tenant: Tenant, move_out_date: date | None) -> Tenant:
    tenant.active = False
    tenant.move_out_date = move_out_date or date.today()
    if tenant.tenant_user:
        tenant.tenant_user.portal_access_blocked = True
    db.commit()
    db.refresh(tenant)
    return tenant


def reactivate(db: Session, tenant: Tenant) -> Tenant:
    tenant.active = True
    tenant.move_out_date = None
    db.commit()
    db.refresh(tenant)
    return tenant


def delete_portal_account(db: Session, tenant: Tenant) -> Tenant:
    if not tenant.tenant_user:
        raise HTTPException(status_code=400, detail="This tenant has no portal account.")
    db.delete(tenant.tenant_user)
    db.commit()
    db.refresh(tenant)
    return tenant


def reset_portal_password(db: Session, tenant: Tenant) -> str:
    if not tenant.tenant_user:
        raise HTTPException(status_code=400, detail="This tenant has no portal account.")
    new_password = secrets.token_urlsafe(9)  # same pattern as invite_service.generate_invite
    tenant.tenant_user.password_hash = hash_password(new_password)
    db.commit()
    return new_password
