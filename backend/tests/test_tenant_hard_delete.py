import io

from backend.tests.conftest import make_tenant


def make_invoice(client, admin_headers, tenant_id, **overrides):
    body = {
        "tenantId": tenant_id, "invoiceDate": "2024-02-01",
        "roomStart": "2135", "roomEnd": "2236", "waterStart": "837", "waterEnd": "870",
        "previousDues": "0",
    }
    body.update(overrides)
    resp = client.post("/api/invoices", json=body, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_delete_tenant_removes_everything(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Delete Me")
    invoice = make_invoice(client, admin_headers, tenant["id"])

    writeoff_resp = client.post(
        f"/api/invoices/{invoice['id']}/writeoffs",
        json={"amount": "10", "reason": "test"},
        headers=admin_headers,
    )
    assert writeoff_resp.status_code == 200, writeoff_resp.text

    doc_resp = client.post(
        f"/api/tenants/{tenant['id']}/documents",
        files={"file": ("id.pdf", io.BytesIO(b"fake id proof"), "application/pdf")},
        data={"docType": "id_proof"},
        headers=admin_headers,
    )
    assert doc_resp.status_code == 200, doc_resp.text

    resp = client.delete(f"/api/tenants/{tenant['id']}", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}

    assert client.get(f"/api/tenants/{tenant['id']}", headers=admin_headers).status_code == 404
    assert client.get(f"/api/invoices/{invoice['id']}", headers=admin_headers).status_code == 404


def test_delete_tenant_with_no_invoices_or_documents(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Empty Test Tenant")
    resp = client.delete(f"/api/tenants/{tenant['id']}", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert client.get(f"/api/tenants/{tenant['id']}", headers=admin_headers).status_code == 404
