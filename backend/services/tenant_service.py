import os
import secrets
import shutil
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.security import hash_password
from backend.models.invoice import Invoice
from backend.models.meter_submission import MeterSubmission
from backend.models.tenant import Tenant
from backend.models.tenant_document import TenantDocument


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


def delete_tenant(db: Session, tenant: Tenant) -> None:
    """Permanently deletes a tenant and everything tied to it: meter
    submissions, documents (incl. meter-reading photos), invoices (+
    write-offs, payments, and payment proofs via ORM cascade), the portal
    account and invites (ORM cascade off Tenant), and every uploaded file
    on disk. Irreversible -- unlike `deactivate`, no history survives.
    Deletion order respects FK constraints (SQLite has foreign_keys=ON):
    rows that reference an invoice must go before the invoice itself."""
    tenant_id = tenant.id

    db.query(MeterSubmission).filter(MeterSubmission.tenant_id == tenant_id).delete()
    db.query(TenantDocument).filter(TenantDocument.tenant_id == tenant_id).delete()
    for invoice in db.query(Invoice).filter(Invoice.tenant_id == tenant_id).all():
        db.delete(invoice)  # cascades invoice_writeoffs, payments, payment_proofs

    db.delete(tenant)  # cascades tenant_user, invites; documents already cleared
    db.commit()

    shutil.rmtree(os.path.join(settings.UPLOADS_DIR, "tenants", tenant_id), ignore_errors=True)


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
