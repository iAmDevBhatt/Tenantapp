import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from backend.database import Base


class TenantUser(Base):
    """A portal login. Created when someone completes registration via an
    invite code (see TenantInvite). Multiple TenantUser rows can point at
    the same tenant_id -- co-tenants sharing one flat/invoice each get their
    own login (own username/password/full_name) but see identical data,
    since every portal query is scoped by tenant_id, not by this row's id."""
    __tablename__ = "tenant_users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False, default="")
    show_on_invoice = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    portal_access_blocked = Column(Boolean, nullable=False, default=False)

    tenant = relationship("Tenant", back_populates="tenant_users")
