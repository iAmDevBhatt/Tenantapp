from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class PaymentCreate(BaseModel):
    amount: Decimal
    paidDate: date | None = None
    method: str | None = None
    notes: str | None = None


class PaymentOut(BaseModel):
    id: str
    invoiceId: str
    amount: Decimal
    paidDate: date
    method: str | None = None
    notes: str | None = None
    recordedBy: str | None = None
    createdAt: datetime

    model_config = {"from_attributes": True}
