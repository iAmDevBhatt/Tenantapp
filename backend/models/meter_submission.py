import uuid
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey

from backend.database import Base


class MeterSubmission(Base):
    """Tenant-submitted photo of a meter reading. Status flow:
    pending → approved → applied  (landlord approves then tags to invoice)
    pending → rejected             (landlord rejects with optional notes)"""
    __tablename__ = "meter_submissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    photo_path = Column(String, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False, default="pending")  # pending | approved | applied | rejected
    applied_to_invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=True)
    notes = Column(Text, nullable=True)
    photo_type = Column(String, nullable=False, default="other")  # flat_meter | water_meter | property | other
    original_filename = Column(String, nullable=False, default="")
    content_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
