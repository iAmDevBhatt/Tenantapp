from backend.tests.conftest import make_tenant


def test_forged_total_is_ignored(client, admin_headers):
    """A client can't set totalPayable/roomAmount/etc directly -- the schema
    doesn't declare them as inputs, so the server always recomputes from the
    tenant's live rates at save time."""
    tenant = make_tenant(client, admin_headers, roomRate="6.65", waterRate="6.65", monthlyRent="8000")

    body = {
        "tenantId": tenant["id"],
        "invoiceDate": "2024-02-01",
        "roomStart": "2135",
        "roomEnd": "2236",
        "waterStart": "837",
        "waterEnd": "870",
        "previousDues": "0",
        # forged / extra fields a malicious or buggy client might send:
        "totalPayable": "1.00",
        "roomAmount": "1.00",
        "waterAmount": "1.00",
        "roomRate": "0.01",
    }
    resp = client.post("/api/invoices", json=body, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["totalPayable"] == "8891.10"
    assert data["roomAmount"] == "671.65"
    assert data["waterAmount"] == "219.45"
    assert data["roomRate"] == "6.65"


def test_next_invoice_defaults_autofill(client, admin_headers):
    tenant = make_tenant(client, admin_headers, roomRate="6.65", waterRate="6.65", monthlyRent="8000")

    resp = client.post(
        "/api/invoices",
        json={
            "tenantId": tenant["id"], "invoiceDate": "2024-02-01",
            "roomStart": "2135", "roomEnd": "2236", "waterStart": "837", "waterEnd": "870",
            "previousDues": "0",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    invoice = resp.json()

    defaults = client.get(f"/api/tenants/{tenant['id']}/next-invoice-defaults", headers=admin_headers)
    assert defaults.status_code == 200
    d = defaults.json()
    assert d["roomStart"] == "2236.00"
    assert d["waterStart"] == "870.00"
    assert d["previousDues"] == "8891.10"  # unpaid -> carries forward

    toggle = client.post(
        f"/api/invoices/{invoice['id']}/toggle-paid", json={"paid": True}, headers=admin_headers
    )
    assert toggle.status_code == 200

    defaults2 = client.get(f"/api/tenants/{tenant['id']}/next-invoice-defaults", headers=admin_headers)
    assert defaults2.json()["previousDues"] == "0.00"
