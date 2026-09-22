from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TenantBase(BaseModel):
    name: str
    phone: str | None = None
    propertyAddress: str
    monthlyRent: Decimal = Decimal("0")
    roomRate: Decimal
    waterRate: Decimal
    waterDivisor: int = Field(default=1, ge=1)
    upiId: str | None = None
    moveInDate: date
    permanentAddress: str | None = None
    emergencyContactName: str | None = None
    emergencyContactPhone: str | None = None


class TenantCreate(TenantBase):
    flatId: str | None = None


class TenantUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    propertyAddress: str | None = None
    monthlyRent: Decimal | None = None
    roomRate: Decimal | None = None
    waterRate: Decimal | None = None
    waterDivisor: int | None = Field(default=None, ge=1)
    upiId: str | None = None
    moveInDate: date | None = None
    flatId: str | None = None
    permanentAddress: str | None = None
    emergencyContactName: str | None = None
    emergencyContactPhone: str | None = None


class DeactivateRequest(BaseModel):
    moveOutDate: date | None = None


class TenantOut(BaseModel):
    id: str
    name: str
    phone: str | None
    propertyAddress: str
    monthlyRent: Decimal
    roomRate: Decimal
    waterRate: Decimal
    waterDivisor: int
    upiId: str | None
    active: bool
    moveInDate: date
    moveOutDate: date | None
    hasPortalAccount: bool = False
    portalUsername: str | None = None
    hasProfilePhoto: bool = False
    portalAccessBlocked: bool = False
    flatId: str | None = None
    permanentAddress: str | None = None
    emergencyContactName: str | None = None
    emergencyContactPhone: str | None = None
    createdAt: datetime

    model_config = {"from_attributes": True}


class PortalPasswordResetOut(BaseModel):
    password: str


class NextInvoiceDefaults(BaseModel):
    roomStart: Decimal
    waterStart: Decimal
    previousDues: Decimal
