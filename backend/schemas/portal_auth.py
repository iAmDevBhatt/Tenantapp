from pydantic import BaseModel, field_validator


class ValidateCodeResponse(BaseModel):
    valid: bool
    tenantName: str | None = None
    alreadyRegistered: bool = False


class RegisterRequest(BaseModel):
    code: str
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("username")
    @classmethod
    def username_min_length(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v.strip()


class PortalLoginRequest(BaseModel):
    username: str
    password: str
