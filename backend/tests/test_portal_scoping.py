from backend.tests.conftest import make_tenant


def _register_portal_user(client, admin_headers, tenant_id, username, password):
    inv = client.post(f"/api/tenants/{tenant_id}/invite", headers=admin_headers)
    assert inv.status_code == 200, inv.text
    code = inv.json()["code"]
    resp = client.post(
        "/api/portal/auth/register",
        json={"code": code, "username": username, "password": password},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


def test_tenant_cannot_read_another_tenants_invoice(client, admin_headers):
    tenant_a = make_tenant(client, admin_headers, name="Tenant A")
    tenant_b = make_tenant(client, admin_headers, name="Tenant B")

    invoice = client.post(
        "/api/invoices",
        json={
            "tenantId": tenant_a["id"], "invoiceDate": "2024-02-01",
            "roomStart": "0", "roomEnd": "10", "waterStart": "0", "waterEnd": "10",
            "previousDues": "0",
        },
        headers=admin_headers,
    ).json()

    headers_b = _register_portal_user(client, admin_headers, tenant_b["id"], "tenantb", "password123")

    resp = client.get(f"/api/portal/invoices/{invoice['id']}", headers=headers_b)
    assert resp.status_code == 404

    resp_pdf = client.get(f"/api/portal/invoices/{invoice['id']}/pdf", headers=headers_b)
    assert resp_pdf.status_code == 404


def test_tenant_sees_own_invoices_only(client, admin_headers):
    tenant_a = make_tenant(client, admin_headers, name="Tenant C")
    client.post(
        "/api/invoices",
        json={
            "tenantId": tenant_a["id"], "invoiceDate": "2024-02-01",
            "roomStart": "0", "roomEnd": "10", "waterStart": "0", "waterEnd": "10",
            "previousDues": "0",
        },
        headers=admin_headers,
    )

    headers_a = _register_portal_user(client, admin_headers, tenant_a["id"], "tenantc", "password123")
    resp = client.get("/api/portal/invoices", headers=headers_a)
    assert resp.status_code == 200
    invoices = resp.json()
    assert len(invoices) == 1
    assert invoices[0]["tenantId"] == tenant_a["id"]
