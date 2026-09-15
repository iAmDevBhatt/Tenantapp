from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.schemas.settings import SettingsOut, SettingsUpdate
from backend.services import settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(get_current_admin)])


def _to_out(row) -> SettingsOut:
    return SettingsOut(
        ownerName=row.owner_name,
        defaultUpiId=row.default_upi_id,
        hasPropertyPhoto=bool(row.property_photo_path),
        invoiceDueDays=row.invoice_due_days,
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _to_out(settings_service.get_or_create(db))


@router.put("", response_model=SettingsOut)
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    row = settings_service.get_or_create(db)
    data = {
        "owner_name": body.ownerName,
        "default_upi_id": body.defaultUpiId,
        "invoice_due_days": body.invoiceDueDays,
    }
    row = settings_service.update(db, row, data)
    return _to_out(row)


@router.get("/property-photo")
def get_property_photo(db: Session = Depends(get_db)):
    row = settings_service.get_or_create(db)
    path = settings_service.property_photo_absolute_path(row)
    if not path:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No property photo set")
    return FileResponse(path)


@router.post("/property-photo", response_model=SettingsOut)
def upload_property_photo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    row = settings_service.get_or_create(db)
    row = settings_service.save_property_photo(db, row, file)
    return _to_out(row)


@router.delete("/property-photo", response_model=SettingsOut)
def delete_property_photo(db: Session = Depends(get_db)):
    row = settings_service.get_or_create(db)
    row = settings_service.delete_property_photo(db, row)
    return _to_out(row)
