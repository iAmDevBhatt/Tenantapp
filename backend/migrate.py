"""Idempotent, non-destructive schema migrations. New tables are handled by
Base.metadata.create_all() in main.py/here; changes to EXISTING tables go
here as guarded ALTER TABLE steps so re-running on every container start is
always safe. No Alembic -- this app's schema is simple enough that a
hand-written, ordered list of guarded steps is simpler and just as honest
(see WEB_APP_BLUEPRINT.md Option A)."""
import sqlite3

from backend.core.config import settings
from backend.database import engine, Base
import backend.models  # noqa: F401


def _sqlite_path_from_url(url: str) -> str | None:
    prefix = "sqlite:///"
    if url.startswith(prefix):
        return url[len(prefix):].lstrip("/")
    return None


def _add_column_if_missing(cursor: sqlite3.Cursor, table: str, column: str, ddl_type: str) -> None:
    cursor.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    if column not in existing:
        print(f"migrate: adding {table}.{column}")
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")


def run_migrations() -> None:
    Base.metadata.create_all(bind=engine)

    db_path = _sqlite_path_from_url(settings.DATABASE_URL)
    if not db_path:
        return  # non-sqlite backends: rely on create_all only for now

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        # R1: tenant passport photo
        _add_column_if_missing(cur, "tenants", "profile_photo_path", "TEXT")
        # R2: flat association (Property → Flat → Tenant)
        _add_column_if_missing(cur, "tenants", "flat_id", "TEXT")
        # R4: tenant permanent address + emergency contact
        _add_column_if_missing(cur, "tenants", "permanent_address", "TEXT")
        _add_column_if_missing(cur, "tenants", "emergency_contact_name", "TEXT")
        _add_column_if_missing(cur, "tenants", "emergency_contact_phone", "TEXT")
        # R5: link tenant_documents to an invoice (for meter reading photos)
        _add_column_if_missing(cur, "tenant_documents", "invoice_id", "TEXT")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations()
    print("migrate: done")
