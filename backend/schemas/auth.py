from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    accessToken: str
    role: str


class AdminOut(BaseModel):
    id: str
    username: str

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str
