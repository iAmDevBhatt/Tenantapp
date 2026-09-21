from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PortalMeOut(BaseModel):
    tenantId: str
    name: str
    propertyAddress: str
    active: bool
    moveInDate: date
    moveOutDate: date | None
    phone: str | None
    monthlyRent: Decimal
    roomRate: Decimal
    waterRate: Decimal
    hasProfilePhoto: bool
    permanentAddress: str | None
    emergencyContactName: str | None
    emergencyContactPhone: str | None
