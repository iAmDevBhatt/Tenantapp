import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime

from backend.database import Base


class AdminUser(Base):
    """The landlord's login. Seeded once from ADMIN_USERNAME/ADMIN_PASSWORD env
    vars if the table is empty (see seed.py); password can be changed afterwards
    via POST /api/auth/change-password."""
    __tablename__ = "admin_users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
