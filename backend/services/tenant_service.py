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
from backend.models.tenant_user import TenantUser


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
    for tu in tenant.tenant_users:
        tu.portal_access_blocked = True
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


def _get_portal_user_or_404(tenant: Tenant, tenant_user_id: str) -> TenantUser:
    tu = next((u for u in tenant.tenant_users if u.id == tenant_user_id), None)
    if not tu:
        raise HTTPException(status_code=404, detail="Portal login not found")
    return tu


def delete_portal_account(db: Session, tenant: Tenant, tenant_user_id: str) -> Tenant:
    tu = _get_portal_user_or_404(tenant, tenant_user_id)
    db.delete(tu)
    db.commit()
    db.refresh(tenant)
    return tenant


def reset_portal_password(db: Session, tenant: Tenant, tenant_user_id: str) -> str:
    tu = _get_portal_user_or_404(tenant, tenant_user_id)
    new_password = secrets.token_urlsafe(9)  # same pattern as invite_service.generate_invite
    tu.password_hash = hash_password(new_password)
    db.commit()
    return new_password


def toggle_portal_block(db: Session, tenant: Tenant, tenant_user_id: str) -> Tenant:
    tu = _get_portal_user_or_404(tenant, tenant_user_id)
    tu.portal_access_blocked = not tu.portal_access_blocked
    db.commit()
    db.refresh(tenant)
    return tenant


def update_portal_user(db: Session, tenant: Tenant, tenant_user_id: str, full_name: str | None, show_on_invoice: bool | None) -> Tenant:
    tu = _get_portal_user_or_404(tenant, tenant_user_id)
    if full_name is not None:
        tu.full_name = full_name
    if show_on_invoice is not None:
        tu.show_on_invoice = show_on_invoice
    db.commit()
    db.refresh(tenant)
    return tenant
