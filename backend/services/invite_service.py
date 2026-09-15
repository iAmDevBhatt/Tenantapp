import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.security import hash_password
from backend.models.tenant import Tenant
from backend.models.tenant_invite import TenantInvite
from backend.models.tenant_user import TenantUser


def current_invite(db: Session, tenant_id: str) -> TenantInvite | None:
    return (
        db.query(TenantInvite)
        .filter(TenantInvite.tenant_id == tenant_id)
        .order_by(TenantInvite.created_at.desc())
        .first()
    )


def generate_invite(db: Session, tenant_id: str) -> TenantInvite:
    """Generating a new code makes any previous one for this tenant stop
    working (queries always take the most-recently-created row)."""
    code = secrets.token_urlsafe(9)  # short enough to paste, long enough to guess-proof
    invite = TenantInvite(
        tenant_id=tenant_id,
        code=code,
        expires_at=datetime.utcnow() + timedelta(days=settings.TENANT_INVITE_EXPIRY_DAYS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


def revoke_invite(db: Session, tenant_id: str) -> None:
    invite = current_invite(db, tenant_id)
    if invite and not invite.used_at:
        db.delete(invite)
        db.commit()


def validate_code(db: Session, code: str) -> tuple[TenantInvite, Tenant]:
    invite = db.query(TenantInvite).filter(TenantInvite.code == code).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if invite.used_at:
        raise HTTPException(status_code=400, detail="This invite has already been used")
    if invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This invite has expired")
    tenant = invite.tenant
    return invite, tenant


def register_tenant_user(db: Session, code: str, username: str, password: str) -> TenantUser:
    invite, tenant = validate_code(db, code)

    existing = db.query(TenantUser).filter(TenantUser.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    if tenant.tenant_user:
        raise HTTPException(status_code=400, detail="This tenant already has a portal account")

    tenant_user = TenantUser(
        tenant_id=tenant.id,
        username=username,
        password_hash=hash_password(password),
    )
    invite.used_at = datetime.utcnow()
    db.add(tenant_user)
    db.commit()
    db.refresh(tenant_user)
    return tenant_user
