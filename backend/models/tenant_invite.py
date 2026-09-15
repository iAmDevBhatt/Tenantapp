import uuid
from datetime import datetime

from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from backend.database import Base


class TenantInvite(Base):
    """A one-time code the landlord generates per tenant so that tenant can
    self-register a portal login. Regenerating replaces the code (old one
    stops working); registering marks used_at."""
    __tablename__ = "tenant_invites"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    code = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="invites")
