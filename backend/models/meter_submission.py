import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, ForeignKey

from backend.database import Base


class MeterSubmission(Base):
    """Phase 2 / roadmap: a tenant-submitted photo of a meter reading, pending
    landlord review before being applied to that tenant's next invoice. Table
    exists now (schema stability) but has no router/UI wired up in v1 -- see
    ROADMAP in REQUIREMENTS.md."""
    __tablename__ = "meter_submissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    photo_path = Column(String, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False, default="pending")  # pending | applied | rejected
    applied_to_invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=True)
    notes = Column(Text, nullable=True)
