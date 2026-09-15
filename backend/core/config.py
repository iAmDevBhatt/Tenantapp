"""Central app settings, read from environment (.env in dev). No secret has a
committed fallback for JWT_SECRET / ADMIN_PASSWORD -- boot fails loudly instead."""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Rent Ledger"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite:///./data/app.db"

    # Directory that holds uploaded files (tenant documents, property photo).
    # Kept separate from the DB's directory so each can be a separate Docker volume.
    UPLOADS_DIR: str = "./uploads"
    DATA_DIR: str = "./data"

    JWT_SECRET: str = ""  # required in prod; see main.py boot check
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24 * 14  # 2 weeks -- landlord/tenant shouldn't re-login constantly

    # Seed-time only: used by seed.py to create the first admin account if admin_users is empty.
    ADMIN_USERNAME: str = ""
    ADMIN_PASSWORD: str = ""

    TENANT_INVITE_EXPIRY_DAYS: int = 14

    CORS_ORIGINS: str = "http://localhost:5173"

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()

# Make sure the directories exist for local/dev runs (Docker mounts volumes here too --
# creating them is a harmless no-op when they already exist as a mount point).
os.makedirs(settings.DATA_DIR, exist_ok=True)
os.makedirs(settings.UPLOADS_DIR, exist_ok=True)
