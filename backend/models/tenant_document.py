import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from backend.database import Base


class TenantDocument(Base):
    __tablename__ = "tenant_documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)          # name on disk (uuid-prefixed, collision-safe)
    original_filename = Column(String, nullable=False)  # name to show/download as
    file_path = Column(String, nullable=False)          # path relative to UPLOADS_DIR
    content_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    doc_type = Column(String, nullable=False, default="other")  # lease | rental_agreement | id_proof | photo | meter_reading | other
    tenant_visible = Column(Boolean, nullable=False, default=False)
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=True, index=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="documents")
