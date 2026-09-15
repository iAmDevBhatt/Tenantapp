from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

# NOTE: rates, divisor, rent, usage and amount fields are intentionally absent
# from the input schemas below. Pydantic drops anything a client sends that
# isn't declared here, so a forged `totalPayable` (etc.) in a request body is
# silently ignored -- invoice_service always recomputes from the live Tenant
# row at save time. See services/invoice_service.py::compute_invoice_amounts.


class InvoiceCreate(BaseModel):
    tenantId: str
    invoiceDate: date
    roomStart: Decimal
    roomEnd: Decimal
    waterStart: Decimal
    waterEnd: Decimal
    previousDues: Decimal = Decimal("0")


class InvoiceUpdate(BaseModel):
    invoiceDate: date | None = None
    roomStart: Decimal | None = None
    roomEnd: Decimal | None = None
    waterStart: Decimal | None = None
    waterEnd: Decimal | None = None
    previousDues: Decimal | None = None


class TogglePaidRequest(BaseModel):
    paid: bool
    paidDate: date | None = None


class InvoiceOut(BaseModel):
    id: str
    tenantId: str
    invoiceDate: date

    roomStart: Decimal
    roomEnd: Decimal
    waterStart: Decimal
    waterEnd: Decimal
    previousDues: Decimal

    roomRate: Decimal
    waterRate: Decimal
    waterDivisor: int
    monthlyRent: Decimal
    upiId: str | None
    payeeName: str | None
    dueDays: int

    roomUsage: Decimal
    waterUsage: Decimal
    roomAmount: Decimal
    waterAmount: Decimal
    totalPayable: Decimal

    paid: bool
    paidDate: date | None
    createdAt: datetime

    model_config = {"from_attributes": True}
