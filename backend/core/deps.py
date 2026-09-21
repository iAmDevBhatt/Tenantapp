from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.core.security import decode_token
from backend.database import get_db
from backend.models.admin_user import AdminUser
from backend.models.tenant_user import TenantUser

bearer = HTTPBearer(auto_error=False)


def get_current_admin(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> AdminUser:
    payload = decode_token(creds.credentials) if creds else None
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Not authenticated")
    admin = db.get(AdminUser, payload["sub"])
    if not admin:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return admin


def get_current_tenant(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> TenantUser:
    """Returns the TenantUser row. Routers must read `.tenant_id` off this
    object for scoping -- NEVER a client-supplied tenant id -- so a tenant can
    never view another tenant's data no matter what the frontend sends.
    Portal access stays available even after the tenant is marked inactive
    (moved out): it's read-only history, not gated on `active`."""
    payload = decode_token(creds.credentials) if creds else None
    if not payload or payload.get("role") != "tenant":
        raise HTTPException(status_code=401, detail="Not authenticated")
    tu = db.get(TenantUser, payload["sub"])
    if not tu or tu.tenant_id != payload.get("tenantId"):
        raise HTTPException(status_code=401, detail="Not authenticated")
    if tu.portal_access_blocked:
        raise HTTPException(status_code=403, detail="Portal access has been suspended. Contact your landlord.")
    return tu
