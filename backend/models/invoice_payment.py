import uuid
from datetime import date, datetime

from sqlalchemy import Column, String, Text, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from backend.database import Base


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    paid_date = Column(Date, nullable=False, default=date.today)
    method = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    recorded_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payments")
    proof = relationship("PaymentProof", foreign_keys="[PaymentProof.applied_to_payment_id]", back_populates="payment", uselist=False)
