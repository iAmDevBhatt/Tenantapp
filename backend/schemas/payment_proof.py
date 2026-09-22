from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class PaymentProofOut(BaseModel):
    id: str
    tenantId: str
    invoiceId: str
    originalFilename: str
    contentType: str | None
    sizeBytes: int | None
    submittedAt: datetime
    status: str  # pending | approved | applied | rejected
    notes: str | None
    appliedToPaymentId: str | None
    model_config = {"from_attributes": True}


class PaymentProofReviewRequest(BaseModel):
    action: Literal["approve", "reject"]
    notes: str | None = None
