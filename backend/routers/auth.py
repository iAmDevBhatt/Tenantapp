from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.models.admin_user import AdminUser
from backend.schemas.auth import LoginRequest, TokenResponse, AdminOut, ChangePasswordRequest
from backend.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    token = auth_service.admin_login(db, body.username, body.password)
    return TokenResponse(accessToken=token, role="admin")


@router.get("/me", response_model=AdminOut)
def me(admin: AdminUser = Depends(get_current_admin)):
    return admin


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    auth_service.admin_change_password(db, admin, body.currentPassword, body.newPassword)
    return {"ok": True}
