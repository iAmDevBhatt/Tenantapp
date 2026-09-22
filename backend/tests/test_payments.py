from decimal import Decimal

from sqlalchemy import text

from backend.database import engine
from backend.migrate import run_migrations
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


def test_add_and_delete_payments_are_additive(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Payment Test Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])
    net = Decimal(invoice["netPayable"])

    resp1 = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={"amount": "40", "paidDate": "2024-02-05"},
        headers=admin_headers,
    )
    assert resp1.status_code == 200, resp1.text
    data1 = resp1.json()
    assert len(data1["payments"]) == 1
    assert Decimal(data1["totalPaid"]) == Decimal("40")
    assert Decimal(data1["outstanding"]) == net - Decimal("40")

    resp2 = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={"amount": "60", "paidDate": "2024-02-10", "method": "UPI"},
        headers=admin_headers,
    )
    assert resp2.status_code == 200, resp2.text
    data2 = resp2.json()
    assert len(data2["payments"]) == 2
    assert Decimal(data2["totalPaid"]) == Decimal("100")
    assert Decimal(data2["outstanding"]) == net - Decimal("100")

    first_payment_id = data2["payments"][0]["id"]
    resp3 = client.delete(f"/api/invoices/{invoice['id']}/payments/{first_payment_id}", headers=admin_headers)
    assert resp3.status_code == 200, resp3.text
    data3 = resp3.json()
    assert len(data3["payments"]) == 1
    assert Decimal(data3["totalPaid"]) == Decimal("60")
    assert Decimal(data3["outstanding"]) == net - Decimal("60")


def test_full_payment_auto_marks_invoice_paid(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Auto Paid Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])
    net = invoice["netPayable"]

    # partial payment: should NOT auto-mark paid
    partial = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={"amount": "10"},
        headers=admin_headers,
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()["paid"] is False

    # remaining payment: should auto-mark paid
    remaining = str(Decimal(net) - Decimal("10"))
    full = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={"amount": remaining, "paidDate": "2024-03-01"},
        headers=admin_headers,
    )
    assert full.status_code == 200, full.text
    data = full.json()
    assert data["paid"] is True
    assert data["paidDate"] == "2024-03-01"
    assert Decimal(data["outstanding"]) == Decimal("0")


def test_payment_cannot_exceed_outstanding(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Overpay Test Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])
    net = invoice["netPayable"]

    resp = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={"amount": str(Decimal(net) + Decimal("1"))},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_payment_receipt_pdf_or_501(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Receipt Test Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])
    resp = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={"amount": "40"},
        headers=admin_headers,
    )
    payment_id = resp.json()["payments"][0]["id"]
    receipt = client.get(
        f"/api/invoices/{invoice['id']}/payments/{payment_id}/receipt.pdf", headers=admin_headers
    )
    assert receipt.status_code in (200, 501)
    if receipt.status_code == 200:
        assert receipt.headers["content-type"] == "application/pdf"


def test_payee_name_reflects_current_settings_not_creation_time(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Payee Name Tenant")
    original = client.get("/api/settings", headers=admin_headers).json()["ownerName"]
    try:
        set1 = client.put("/api/settings", json={"ownerName": "Old Owner"}, headers=admin_headers)
        assert set1.status_code == 200, set1.text
        invoice = make_invoice(client, admin_headers, tenant["id"])
        assert invoice["payeeName"] == "Old Owner"

        set2 = client.put("/api/settings", json={"ownerName": "New Owner"}, headers=admin_headers)
        assert set2.status_code == 200, set2.text

        refetched = client.get(f"/api/invoices/{invoice['id']}", headers=admin_headers).json()
        assert refetched["payeeName"] == "New Owner"  # live, not frozen at creation
    finally:
        client.put("/api/settings", json={"ownerName": original}, headers=admin_headers)


def test_legacy_amount_paid_backfills_once(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Legacy Backfill Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])

    # Simulate a pre-migration invoice that used the old single amount_paid column
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE invoices SET amount_paid = :amt WHERE id = :id"),
            {"amt": "25.00", "id": invoice["id"]},
        )

    run_migrations()
    run_migrations()  # must not double-insert

    resp = client.get(f"/api/invoices/{invoice['id']}", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["payments"]) == 1
    assert data["payments"][0]["amount"] == "25.00"
    assert data["payments"][0]["notes"] is None
