from datetime import datetime
from pydantic import BaseModel


class FlatOut(BaseModel):
    id: str
    propertyId: str
    label: str
    createdAt: datetime

    model_config = {"from_attributes": True}


class FlatCreate(BaseModel):
    label: str


class FlatUpdate(BaseModel):
    label: str


class PropertyOut(BaseModel):
    id: str
    name: str
    address: str
    createdAt: datetime
    flats: list[FlatOut] = []

    model_config = {"from_attributes": True}


class PropertyCreate(BaseModel):
    name: str
    address: str


class PropertyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
