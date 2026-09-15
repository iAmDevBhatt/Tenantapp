from pydantic import BaseModel


class ValidateCodeResponse(BaseModel):
    valid: bool
    tenantName: str | None = None
    alreadyRegistered: bool = False


class RegisterRequest(BaseModel):
    code: str
    username: str
    password: str


class PortalLoginRequest(BaseModel):
    username: str
    password: str
