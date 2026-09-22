import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from backend.database import Base


class PaymentProof(Base):
    """Tenant-submitted screenshot of a UPI/bank payment confirmation, tied
    to a specific invoice. Status flow: pending -> approved -> applied
    (attached to a specific InvoicePayment when the admin records it) or
    pending -> rejected."""
    __tablename__ = "payment_proofs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False, index=True)
    photo_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=False, default="")
    content_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False, default="pending")  # pending | approved | rejected | applied
    notes = Column(Text, nullable=True)
    applied_to_payment_id = Column(String(36), ForeignKey("invoice_payments.id"), nullable=True)

    invoice = relationship("Invoice", back_populates="payment_proofs")
    payment = relationship("InvoicePayment", foreign_keys=[applied_to_payment_id], back_populates="proof")
