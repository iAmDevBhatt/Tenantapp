from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.schemas.property import (
    PropertyOut, PropertyCreate, PropertyUpdate, FlatCreate, FlatUpdate, FlatOut,
)
from backend.services import property_service

router = APIRouter(prefix="/api/properties", tags=["properties"], dependencies=[Depends(get_current_admin)])


def _flat_out(f) -> FlatOut:
    return FlatOut(id=f.id, propertyId=f.property_id, label=f.label, createdAt=f.created_at)


def _prop_out(p) -> PropertyOut:
    return PropertyOut(
        id=p.id, name=p.name, address=p.address, createdAt=p.created_at,
        flats=[_flat_out(f) for f in p.flats],
    )


@router.get("", response_model=list[PropertyOut])
def list_properties(db: Session = Depends(get_db)):
    return [_prop_out(p) for p in property_service.list_properties(db)]


@router.post("", response_model=PropertyOut)
def create_property(body: PropertyCreate, db: Session = Depends(get_db)):
    p = property_service.create_property(db, name=body.name, address=body.address)
    return _prop_out(p)


@router.get("/{property_id}", response_model=PropertyOut)
def get_property(property_id: str, db: Session = Depends(get_db)):
    return _prop_out(property_service.get_or_404(db, property_id))


@router.put("/{property_id}", response_model=PropertyOut)
def update_property(property_id: str, body: PropertyUpdate, db: Session = Depends(get_db)):
    p = property_service.get_or_404(db, property_id)
    p = property_service.update_property(db, p, name=body.name, address=body.address)
    return _prop_out(p)


@router.delete("/{property_id}")
def delete_property(property_id: str, db: Session = Depends(get_db)):
    p = property_service.get_or_404(db, property_id)
    property_service.delete_property(db, p)
    return {"ok": True}


@router.post("/{property_id}/flats", response_model=PropertyOut)
def create_flat(property_id: str, body: FlatCreate, db: Session = Depends(get_db)):
    property_service.get_or_404(db, property_id)
    p = property_service.create_flat(db, property_id=property_id, label=body.label)
    return _prop_out(p)


@router.put("/{property_id}/flats/{flat_id}", response_model=PropertyOut)
def update_flat(property_id: str, flat_id: str, body: FlatUpdate, db: Session = Depends(get_db)):
    f = property_service.get_flat_or_404(db, property_id, flat_id)
    p = property_service.update_flat(db, f, label=body.label)
    return _prop_out(p)


@router.delete("/{property_id}/flats/{flat_id}")
def delete_flat(property_id: str, flat_id: str, db: Session = Depends(get_db)):
    f = property_service.get_flat_or_404(db, property_id, flat_id)
    property_service.delete_flat(db, f)
    return {"ok": True}
