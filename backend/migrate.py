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
import uuid
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.engine import Connection

from backend.core.config import settings
from backend.database import engine, Base
import backend.models  # noqa: F401


_KNOWN_TABLES = {
    "tenants", "tenant_users", "tenant_documents", "tenant_invites",
    "invoices", "invoice_writeoffs", "invoice_payments", "properties", "property_flats",
    "meter_submissions", "admin_users", "settings",
}


def _add_column_if_missing(conn: Connection, table: str, column: str, ddl_type: str) -> None:
    assert table in _KNOWN_TABLES, f"migrate: unexpected table name '{table}'"
    existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
    if column not in existing:
        print(f"migrate: adding {table}.{column}")
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))


def _backfill_legacy_payments(conn: Connection) -> None:
    """R10: the old single-payment flow wrote a running total straight into
    invoices.amount_paid. Now that payments are a proper additive ledger
    (invoice_payments), convert each such invoice into one equivalent
    payment row. Guarded by "zero existing payment rows for this invoice",
    so it's safe to run every boot -- an invoice that already has any real
    payment (migrated or newly recorded) is never touched again."""
    legacy = conn.execute(text(
        "SELECT id, amount_paid, paid_date, created_at FROM invoices "
        "WHERE amount_paid IS NOT NULL AND amount_paid > 0 "
        "AND id NOT IN (SELECT invoice_id FROM invoice_payments)"
    )).fetchall()
    for inv_id, amount_paid, paid_date, created_at in legacy:
        print(f"migrate: backfilling legacy payment for invoice {inv_id}")
        fallback_date = str(created_at)[:10] if created_at else date.today().isoformat()
        conn.execute(
            text(
                "INSERT INTO invoice_payments "
                "(id, invoice_id, amount, paid_date, method, notes, recorded_by, created_at) "
                "VALUES (:id, :invoice_id, :amount, :paid_date, NULL, NULL, NULL, :created_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "invoice_id": inv_id,
                "amount": amount_paid,
                "paid_date": paid_date or fallback_date,
                "created_at": datetime.utcnow(),
            },
        )


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
        # R10: migrate legacy amount_paid values into the invoice_payments ledger
        _backfill_legacy_payments(conn)
        # R11: an earlier version of the R10 backfill stamped a "Migrated from..."
        # sentence into `notes`, which then showed up on the payment receipt PDF as
        # if it were a real note. Clear it -- idempotent, matches nothing once run.
        conn.execute(text(
            "UPDATE invoice_payments SET notes = NULL "
            "WHERE notes = 'Migrated from the previous single amount-received field'"
        ))
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
