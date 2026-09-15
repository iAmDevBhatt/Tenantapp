import uuid
from datetime import date, datetime

from sqlalchemy import Column, String, Text, Numeric, Integer, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from backend.database import Base


class Invoice(Base):
    """An immutable snapshot. Every rate/amount field here is copied at
    creation time from the Tenant/Settings rows and never re-read live
    afterwards -- so an old invoice always renders/recomputes the same way
    even if the tenant's current rates change later. Only `previous_dues` is
    a free-typed input; everything else under "computed" is server-computed
    and never trusted from client input (see schemas/invoice.py)."""
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    invoice_date = Column(Date, nullable=False, default=date.today)

    # Inputs
    room_start = Column(Numeric(10, 2), nullable=False)
    room_end = Column(Numeric(10, 2), nullable=False)
    water_start = Column(Numeric(10, 2), nullable=False)
    water_end = Column(Numeric(10, 2), nullable=False)
    previous_dues = Column(Numeric(10, 2), nullable=False, default=0)

    # Snapshot of tenant/settings at save time
    room_rate = Column(Numeric(10, 2), nullable=False)
    water_rate = Column(Numeric(10, 2), nullable=False)
    water_divisor = Column(Integer, nullable=False, default=1)
    monthly_rent = Column(Numeric(10, 2), nullable=False)
    upi_id = Column(String, nullable=True)
    payee_name = Column(String, nullable=True)
    due_days = Column(Integer, nullable=False, default=7)

    # Computed (server-only, never accepted from the client)
    room_usage = Column(Numeric(10, 2), nullable=False)
    water_usage = Column(Numeric(10, 2), nullable=False)
    room_amount = Column(Numeric(10, 2), nullable=False)
    water_amount = Column(Numeric(10, 2), nullable=False)
    total_payable = Column(Numeric(10, 2), nullable=False)

    paid = Column(Boolean, nullable=False, default=False)
    paid_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="invoices")
    writeoffs = relationship("InvoiceWriteOff", cascade="all, delete-orphan", back_populates="invoice", order_by="InvoiceWriteOff.written_off_at")
    meter_photos = relationship(
        "TenantDocument",
        primaryjoin="and_(TenantDocument.invoice_id == Invoice.id)",
        foreign_keys="[TenantDocument.invoice_id]",
        order_by="TenantDocument.uploaded_at",
        viewonly=True,
    )
