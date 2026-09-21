from datetime import datetime

from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: str
    tenantId: str
    originalFilename: str
    contentType: str | None
    sizeBytes: int | None
    docType: str
    tenantVisible: bool = False
    invoiceId: str | None = None
    uploadedAt: datetime

    model_config = {"from_attributes": True}
