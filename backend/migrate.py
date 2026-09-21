"""Idempotent, non-destructive schema migrations. New tables are handled by
Base.metadata.create_all() in main.py/here; changes to EXISTING tables go
here as guarded ALTER TABLE steps so re-running on every container start is
always safe. No Alembic -- this app's schema is simple enough that a
hand-written, ordered list of guarded steps is simpler and just as honest
(see WEB_APP_BLUEPRINT.md Option A).

Uses the app's own SQLAlchemy `engine` for everything, including the guarded
ALTER TABLE steps -- not a second, manually-opened sqlite3.connect(). That
engine already resolves DATABASE_URL correctly (relative dev paths, and the
`sqlite:////absolute/path` form Docker uses); re-parsing the URL by hand here
previously mishandled the 4-slash absolute form and broke migrations under
Docker -- don't reintroduce that."""
from sqlalchemy import text
from sqlalchemy.engine import Connection

from backend.core.config import settings
from backend.database import engine, Base
import backend.models  # noqa: F401


_KNOWN_TABLES = {
    "tenants", "tenant_users", "tenant_documents", "tenant_invites",
    "invoices", "invoice_writeoffs", "properties", "property_flats",
    "meter_submissions", "admin_users", "settings",
}


def _add_column_if_missing(conn: Connection, table: str, column: str, ddl_type: str) -> None:
    assert table in _KNOWN_TABLES, f"migrate: unexpected table name '{table}'"
    existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
    if column not in existing:
        print(f"migrate: adding {table}.{column}")
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))


def run_migrations() -> None:
    Base.metadata.create_all(bind=engine)

    if not settings.DATABASE_URL.startswith("sqlite"):
        return  # non-sqlite backends: rely on create_all only for now

    with engine.begin() as conn:
        # R1: tenant passport photo
        _add_column_if_missing(conn, "tenants", "profile_photo_path", "TEXT")
        # R2: flat association (Property → Flat → Tenant)
        _add_column_if_missing(conn, "tenants", "flat_id", "TEXT")
        # R4: tenant permanent address + emergency contact
        _add_column_if_missing(conn, "tenants", "permanent_address", "TEXT")
        _add_column_if_missing(conn, "tenants", "emergency_contact_name", "TEXT")
        _add_column_if_missing(conn, "tenants", "emergency_contact_phone", "TEXT")
        # R5: link tenant_documents to an invoice (for meter reading photos)
        _add_column_if_missing(conn, "tenant_documents", "invoice_id", "TEXT")
        # R6: partial payment tracking
        _add_column_if_missing(conn, "invoices", "amount_paid", "NUMERIC(10,2)")
        # R7: landlord controls which documents are visible to the tenant
        _add_column_if_missing(conn, "tenant_documents", "tenant_visible", "INTEGER NOT NULL DEFAULT 0")
        # R8: landlord can block portal access temporarily (or on move-out)
        _add_column_if_missing(conn, "tenant_users", "portal_access_blocked", "INTEGER NOT NULL DEFAULT 0")
        # R9: meter submission metadata (photo type, filename, MIME, size)
        _add_column_if_missing(conn, "meter_submissions", "photo_type", "TEXT NOT NULL DEFAULT 'other'")
        _add_column_if_missing(conn, "meter_submissions", "original_filename", "TEXT NOT NULL DEFAULT ''")
        _add_column_if_missing(conn, "meter_submissions", "content_type", "TEXT")
        _add_column_if_missing(conn, "meter_submissions", "size_bytes", "INTEGER")


if __name__ == "__main__":
    run_migrations()
    print("migrate: done")
