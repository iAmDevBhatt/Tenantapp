from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models.property import Property, PropertyFlat


def list_properties(db: Session) -> list[Property]:
    return db.query(Property).order_by(Property.name.asc()).all()


def get_or_404(db: Session, property_id: str) -> Property:
    p = db.get(Property, property_id)
    if not p:
        raise HTTPException(status_code=404, detail="Property not found")
    return p


def create_property(db: Session, name: str, address: str) -> Property:
    p = Property(name=name, address=address)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def update_property(db: Session, p: Property, name: str | None, address: str | None) -> Property:
    if name is not None:
        p.name = name
    if address is not None:
        p.address = address
    db.commit()
    db.refresh(p)
    return p


def delete_property(db: Session, p: Property) -> None:
    db.delete(p)
    db.commit()


def get_flat_or_404(db: Session, property_id: str, flat_id: str) -> PropertyFlat:
    f = db.get(PropertyFlat, flat_id)
    if not f or f.property_id != property_id:
        raise HTTPException(status_code=404, detail="Flat not found")
    return f


def create_flat(db: Session, property_id: str, label: str) -> Property:
    f = PropertyFlat(property_id=property_id, label=label)
    db.add(f)
    db.commit()
    prop = get_or_404(db, property_id)
    db.refresh(prop)
    return prop


def update_flat(db: Session, f: PropertyFlat, label: str) -> Property:
    f.label = label
    db.commit()
    prop = get_or_404(db, f.property_id)
    db.refresh(prop)
    return prop


def delete_flat(db: Session, f: PropertyFlat) -> None:
    db.delete(f)
    db.commit()
