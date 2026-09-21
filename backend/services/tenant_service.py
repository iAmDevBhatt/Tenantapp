from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

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
