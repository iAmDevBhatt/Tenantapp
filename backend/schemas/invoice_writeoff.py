from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class WriteOffCreate(BaseModel):
    amount: Decimal
    reason: str


class WriteOffOut(BaseModel):
    id: str
    invoiceId: str
    amount: Decimal
    reason: str
    writtenOffBy: str | None
    writtenOffAt: datetime

    model_config = {"from_attributes": True}
