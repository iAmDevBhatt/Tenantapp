from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.security import hash_password, verify_password, create_access_token
from backend.models.admin_user import AdminUser
from backend.models.tenant_user import TenantUser


def admin_login(db: Session, username: str, password: str) -> str:
    admin = db.query(AdminUser).filter(AdminUser.username == username).first()
    if not admin or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return create_access_token(subject=admin.id, role="admin")


def admin_change_password(db: Session, admin: AdminUser, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    admin.password_hash = hash_password(new_password)
    db.commit()


def tenant_login(db: Session, username: str, password: str) -> str:
    tu = db.query(TenantUser).filter(TenantUser.username == username).first()
    if not tu or not verify_password(password, tu.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if tu.portal_access_blocked:
        raise HTTPException(status_code=403, detail="Portal access has been suspended. Contact your landlord.")
    return create_access_token(subject=tu.id, role="tenant", extra_claims={"tenantId": tu.tenant_id})
