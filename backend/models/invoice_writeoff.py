import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from backend.database import Base


class InvoiceWriteOff(Base):
    __tablename__ = "invoice_writeoffs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    reason = Column(Text, nullable=False)
    written_off_by = Column(String, nullable=True)
    written_off_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="writeoffs")
