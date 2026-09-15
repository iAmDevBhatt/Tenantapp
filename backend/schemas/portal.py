from datetime import date

from pydantic import BaseModel


class PortalMeOut(BaseModel):
    tenantId: str
    name: str
    propertyAddress: str
    active: bool
    moveInDate: date
    moveOutDate: date | None
