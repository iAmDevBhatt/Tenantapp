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
