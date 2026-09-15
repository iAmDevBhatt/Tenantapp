import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime

from backend.database import Base


class AppSettings(Base):
    """Singleton row (enforced in settings_service, not a DB constraint) with
    owner-level info used as the UPI payee display name and pre-filled onto
    new tenants."""
    __tablename__ = "settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_name = Column(String, nullable=False, default="")
    default_upi_id = Column(String, nullable=True)
    property_photo_path = Column(String, nullable=True)  # relative to UPLOADS_DIR
    invoice_due_days = Column(Integer, nullable=False, default=7)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
