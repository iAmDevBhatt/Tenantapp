from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.core.limiter import limiter
from backend.database import get_db
from backend.schemas.portal_auth import ValidateCodeResponse, RegisterRequest, PortalLoginRequest
from backend.schemas.auth import TokenResponse
from backend.services import invite_service, auth_service
from backend.core.security import create_access_token

router = APIRouter(prefix="/api/portal/auth", tags=["portal-auth"])


@router.get("/validate-code", response_model=ValidateCodeResponse)
def validate_code(code: str, db: Session = Depends(get_db)):
    try:
        invite, tenant = invite_service.validate_code(db, code)
    except HTTPException:
        return ValidateCodeResponse(valid=False)
    return ValidateCodeResponse(
        valid=True,
        tenantName=tenant.name,
        alreadyRegistered=bool(tenant.tenant_users),
        existingLoginCount=len(tenant.tenant_users),
    )


@router.post("/register", response_model=TokenResponse)
@limiter.limit("10/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    tenant_user = invite_service.register_tenant_user(db, body.code, body.username, body.password, body.fullName)
    token = create_access_token(
        subject=tenant_user.id, role="tenant", extra_claims={"tenantId": tenant_user.tenant_id}
    )
    return TokenResponse(accessToken=token, role="tenant")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/minute")
def login(request: Request, body: PortalLoginRequest, db: Session = Depends(get_db)):
    token = auth_service.tenant_login(db, body.username, body.password)
    return TokenResponse(accessToken=token, role="tenant")
