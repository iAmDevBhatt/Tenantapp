from datetime import datetime

from pydantic import BaseModel


class InviteOut(BaseModel):
    code: str
    expiresAt: datetime
    usedAt: datetime | None = None


class InviteStatus(BaseModel):
    invite: InviteOut | None
    hasRegistered: bool
