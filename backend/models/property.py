import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from backend.database import Base


class Property(Base):
    __tablename__ = "properties"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    address = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    flats = relationship("PropertyFlat", cascade="all, delete-orphan", back_populates="property", order_by="PropertyFlat.label")


class PropertyFlat(Base):
    __tablename__ = "property_flats"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id = Column(String(36), ForeignKey("properties.id"), nullable=False, index=True)
    label = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property", back_populates="flats")
    tenants = relationship("Tenant", back_populates="flat")
