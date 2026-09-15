import os
import uuid

from fastapi import UploadFile
from sqlalchemy.orm import Session

from backend.core.config import settings as app_settings
from backend.models.settings import AppSettings

PHOTO_SUBDIR = "settings"


def get_or_create(db: Session) -> AppSettings:
    row = db.query(AppSettings).first()
    if not row:
        row = AppSettings(owner_name="")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def update(db: Session, row: AppSettings, data: dict) -> AppSettings:
    for key, value in data.items():
        if value is not None:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def save_property_photo(db: Session, row: AppSettings, upload: UploadFile) -> AppSettings:
    photo_dir = os.path.join(app_settings.UPLOADS_DIR, PHOTO_SUBDIR)
    os.makedirs(photo_dir, exist_ok=True)

    if row.property_photo_path:
        old_abs = os.path.join(app_settings.UPLOADS_DIR, row.property_photo_path)
        if os.path.exists(old_abs):
            os.remove(old_abs)

    ext = os.path.splitext(upload.filename or "photo.jpg")[1] or ".jpg"
    stored_name = f"{uuid.uuid4()}{ext}"
    abs_path = os.path.join(photo_dir, stored_name)
    with open(abs_path, "wb") as f:
        f.write(upload.file.read())

    row.property_photo_path = os.path.join(PHOTO_SUBDIR, stored_name)
    db.commit()
    db.refresh(row)
    return row


def delete_property_photo(db: Session, row: AppSettings) -> AppSettings:
    if row.property_photo_path:
        abs_path = os.path.join(app_settings.UPLOADS_DIR, row.property_photo_path)
        if os.path.exists(abs_path):
            os.remove(abs_path)
        row.property_photo_path = None
        db.commit()
        db.refresh(row)
    return row


def property_photo_absolute_path(row: AppSettings) -> str | None:
    if not row.property_photo_path:
        return None
    return os.path.join(app_settings.UPLOADS_DIR, row.property_photo_path)
