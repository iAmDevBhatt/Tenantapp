import tempfile
import uuid

from sqlalchemy import create_engine, text

from backend.tests.conftest import make_tenant
from backend.tests.test_payments import make_invoice


def _register(client, tenant_id, admin_headers, username, password, full_name):
    inv = client.post(f"/api/tenants/{tenant_id}/invite", headers=admin_headers)
    assert inv.status_code == 200, inv.text
    code = inv.json()["code"]
    resp = client.post(
        "/api/portal/auth/register",
        json={"code": code, "username": username, "password": password, "fullName": full_name},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


def test_co_tenant_shares_same_data_via_separate_login(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Shared Flat Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])

    primary_headers = _register(client, tenant["id"], admin_headers, "primaryuser", "password123", "Primary Person")
    cotenant_headers = _register(client, tenant["id"], admin_headers, "cotenantuser", "password123", "Cotenant Person")

    # both logins see the exact same tenant record on GET /api/tenants/{id}
    tenant_row = client.get(f"/api/tenants/{tenant['id']}", headers=admin_headers).json()
    assert len(tenant_row["portalUsers"]) == 2
    usernames = {u["username"] for u in tenant_row["portalUsers"]}
    assert usernames == {"primaryuser", "cotenantuser"}

    # both logins see the same invoice list (same tenant_id under the hood)
    primary_invoices = client.get("/api/portal/invoices", headers=primary_headers).json()
    cotenant_invoices = client.get("/api/portal/invoices", headers=cotenant_headers).json()
    assert [i["id"] for i in primary_invoices] == [i["id"] for i in cotenant_invoices] == [invoice["id"]]

    # additionalOccupants is empty by default (show_on_invoice defaults False)
    inv_out = client.get(f"/api/invoices/{invoice['id']}", headers=admin_headers).json()
    assert inv_out["additionalOccupants"] == []

    # toggle the co-tenant's name on -> shows up on the invoice
    cotenant_id = next(u["id"] for u in tenant_row["portalUsers"] if u["username"] == "cotenantuser")
    toggle = client.patch(
        f"/api/tenants/{tenant['id']}/portal-users/{cotenant_id}",
        json={"showOnInvoice": True},
        headers=admin_headers,
    )
    assert toggle.status_code == 200, toggle.text
    inv_out2 = client.get(f"/api/invoices/{invoice['id']}", headers=admin_headers).json()
    assert inv_out2["additionalOccupants"] == ["Cotenant Person"]

    # blocking one login doesn't affect the other
    block = client.patch(f"/api/tenants/{tenant['id']}/portal-users/{cotenant_id}/block", headers=admin_headers)
    assert block.status_code == 200, block.text
    blocked_me = client.get("/api/portal/me", headers=cotenant_headers)
    assert blocked_me.status_code == 403
    still_ok = client.get("/api/portal/me", headers=primary_headers)
    assert still_ok.status_code == 200

    # deleting one login doesn't affect the other
    delete = client.delete(f"/api/tenants/{tenant['id']}/portal-users/{cotenant_id}", headers=admin_headers)
    assert delete.status_code == 200, delete.text
    tenant_after = client.get(f"/api/tenants/{tenant['id']}", headers=admin_headers).json()
    assert len(tenant_after["portalUsers"]) == 1
    still_ok2 = client.get("/api/portal/me", headers=primary_headers)
    assert still_ok2.status_code == 200


def test_migration_drops_legacy_unique_constraint_on_tenant_id():
    """Production's tenant_users table predates co-tenants and was created
    with UNIQUE(tenant_id) baked into the CREATE TABLE statement itself --
    create_all() never alters an existing table, so that constraint would
    silently survive an upgrade and break the very first co-tenant
    registration with a raw IntegrityError. This builds a throwaway DB with
    that exact old shape, runs the migration step against it directly, and
    confirms the constraint is gone and existing data survived."""
    from backend.migrate import _drop_tenant_user_unique_constraint

    tmp_path = tempfile.mktemp(suffix=".db")
    eng = create_engine(f"sqlite:///{tmp_path}")
    with eng.begin() as conn:
        conn.execute(text("""
            CREATE TABLE tenants (id VARCHAR(36) NOT NULL PRIMARY KEY, name VARCHAR NOT NULL)
        """))
        conn.execute(text("""
            CREATE TABLE tenant_users (
                id VARCHAR(36) NOT NULL,
                tenant_id VARCHAR(36) NOT NULL,
                username VARCHAR NOT NULL,
                password_hash VARCHAR NOT NULL,
                created_at DATETIME, portal_access_blocked INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (id),
                UNIQUE (tenant_id),
                FOREIGN KEY(tenant_id) REFERENCES tenants (id)
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX ix_tenant_users_username ON tenant_users (username)"))
        tenant_id = str(uuid.uuid4())
        existing_user_id = str(uuid.uuid4())
        conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, 'Old Tenant')"), {"id": tenant_id})
        conn.execute(
            text("INSERT INTO tenant_users (id, tenant_id, username, password_hash) VALUES (:id, :tid, 'olduser', 'hash')"),
            {"id": existing_user_id, "tid": tenant_id},
        )
        # simulate the two ALTER TABLE ADD COLUMN steps that run before this one
        conn.execute(text("ALTER TABLE tenant_users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''"))
        conn.execute(text("ALTER TABLE tenant_users ADD COLUMN show_on_invoice INTEGER NOT NULL DEFAULT 0"))

        _drop_tenant_user_unique_constraint(conn)

        # existing row survived the rebuild
        row = conn.execute(text("SELECT username, tenant_id FROM tenant_users WHERE id = :id"), {"id": existing_user_id}).fetchone()
        assert row == ("olduser", tenant_id)

        # a second login for the same tenant_id no longer violates a UNIQUE constraint
        conn.execute(
            text("INSERT INTO tenant_users (id, tenant_id, username, password_hash) VALUES (:id, :tid, 'newuser', 'hash')"),
            {"id": str(uuid.uuid4()), "tid": tenant_id},
        )
        count = conn.execute(text("SELECT COUNT(*) FROM tenant_users WHERE tenant_id = :tid"), {"tid": tenant_id}).scalar()
        assert count == 2

        # running it again is a no-op (already-rebuilt table has no UNIQUE(tenant_id) to find)
        _drop_tenant_user_unique_constraint(conn)
        count2 = conn.execute(text("SELECT COUNT(*) FROM tenant_users WHERE tenant_id = :tid"), {"tid": tenant_id}).scalar()
        assert count2 == 2

    eng.dispose()
