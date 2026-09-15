from pydantic import BaseModel


class SettingsOut(BaseModel):
    ownerName: str
    defaultUpiId: str | None
    hasPropertyPhoto: bool
    invoiceDueDays: int


class SettingsUpdate(BaseModel):
    ownerName: str | None = None
    defaultUpiId: str | None = None
    invoiceDueDays: int | None = None
