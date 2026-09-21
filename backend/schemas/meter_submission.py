from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class MeterSubmissionOut(BaseModel):
    id: str
    tenantId: str
    photoType: str
    originalFilename: str
    contentType: str | None
    sizeBytes: int | None
    submittedAt: datetime
    status: str  # pending | approved | applied | rejected
    appliedToInvoiceId: str | None
    notes: str | None
    model_config = {"from_attributes": True}


class ReviewRequest(BaseModel):
    action: Literal["approve", "reject"]
    notes: str | None = None
