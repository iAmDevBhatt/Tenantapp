import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, Numeric, Integer, Boolean, Date, DateTime
from sqlalchemy.orm import relationship

from backend.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    property_address = Column(Text, nullable=False)
    monthly_rent = Column(Numeric(10, 2), nullable=False, default=0)
    room_rate = Column(Numeric(10, 2), nullable=False)
    water_rate = Column(Numeric(10, 2), nullable=False)
    water_divisor = Column(Integer, nullable=False, default=1)
    upi_id = Column(String, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    move_in_date = Column(Date, nullable=False)
    move_out_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship(
        "TenantDocument", cascade="all, delete-orphan", back_populates="tenant"
    )
    invoices = relationship("Invoice", back_populates="tenant")
    invites = relationship(
        "TenantInvite", cascade="all, delete-orphan", back_populates="tenant"
    )
    tenant_user = relationship(
        "TenantUser", uselist=False, cascade="all, delete-orphan", back_populates="tenant"
    )
