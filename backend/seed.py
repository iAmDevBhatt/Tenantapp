"""Idempotent default data, safe to run on every container start:
- the single admin account, from ADMIN_USERNAME/ADMIN_PASSWORD (only created
  if admin_users is empty -- doesn't touch an existing/already-changed admin)
- the singleton settings row (defaults, if missing)
"""
from backend.core.config import settings
from backend.core.security import hash_password
from backend.database import SessionLocal
from backend.models.admin_user import AdminUser
from backend.models.settings import AppSettings


def run_seed() -> None:
    db = SessionLocal()
    try:
        if db.query(AdminUser).count() == 0:
            if not settings.ADMIN_USERNAME or not settings.ADMIN_PASSWORD:
                print(
                    "seed: WARNING -- no admin account exists and ADMIN_USERNAME/ADMIN_PASSWORD "
                    "are not set. Set them and restart to create the first login."
                )
            else:
                admin = AdminUser(
                    username=settings.ADMIN_USERNAME,
                    password_hash=hash_password(settings.ADMIN_PASSWORD),
                )
                db.add(admin)
                db.commit()
                print(f"seed: created admin account '{settings.ADMIN_USERNAME}'")

        if db.query(AppSettings).count() == 0:
            db.add(AppSettings(owner_name=settings.ADMIN_USERNAME or "Owner"))
            db.commit()
            print("seed: created default settings row")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
    print("seed: done")
