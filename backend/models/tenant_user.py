import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from backend.database import Base


class TenantUser(Base):
    """A tenant's portal login. Created once, when the tenant completes
    registration via an invite code (see TenantInvite)."""
    __tablename__ = "tenant_users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), unique=True, nullable=False)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    portal_access_blocked = Column(Boolean, nullable=False, default=False)

    tenant = relationship("Tenant", back_populates="tenant_user")
