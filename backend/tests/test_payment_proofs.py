import io
from decimal import Decimal

from backend.tests.conftest import make_tenant
from backend.tests.test_payments import make_invoice


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


def _upload_proof(client, headers, invoice_id):
    resp = client.post(
        f"/api/portal/invoices/{invoice_id}/payment-proofs",
        files={"file": ("proof.jpg", io.BytesIO(b"fake screenshot"), "image/jpeg")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_payment_proof_full_flow(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Proof Test Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])
    tenant_headers = _register_portal_user(client, admin_headers, tenant["id"], "prooftenant", "password123")

    proof = _upload_proof(client, tenant_headers, invoice["id"])
    assert proof["status"] == "pending"
    assert proof["invoiceId"] == invoice["id"]

    # tenant can view their own submitted proof's photo
    photo = client.get(f"/api/portal/invoices/{invoice['id']}/payment-proofs/{proof['id']}/photo", headers=tenant_headers)
    assert photo.status_code == 200

    # admin sees it pending
    admin_list = client.get(f"/api/invoices/{invoice['id']}/payment-proofs", headers=admin_headers)
    assert admin_list.status_code == 200
    assert len(admin_list.json()) == 1
    assert admin_list.json()[0]["status"] == "pending"

    # admin approves
    review = client.post(
        f"/api/invoices/{invoice['id']}/payment-proofs/{proof['id']}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "approved"

    # reviewing an already-reviewed proof is rejected
    re_review = client.post(
        f"/api/invoices/{invoice['id']}/payment-proofs/{proof['id']}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert re_review.status_code == 409

    # admin records a payment attaching the approved proof
    net = invoice["netPayable"]
    payment_resp = client.post(
        f"/api/invoices/{invoice['id']}/payments",
        json={"amount": net, "paymentProofId": proof["id"]},
        headers=admin_headers,
    )
    assert payment_resp.status_code == 200, payment_resp.text
    data = payment_resp.json()
    assert data["paid"] is True  # fully covered -> auto-marked paid

    proof_after = client.get(f"/api/invoices/{invoice['id']}/payment-proofs", headers=admin_headers).json()[0]
    assert proof_after["status"] == "applied"
    payment_id = data["payments"][0]["id"]
    assert proof_after["appliedToPaymentId"] == payment_id

    # deleting the payment reverts the proof so it can be reused
    delete_resp = client.delete(f"/api/invoices/{invoice['id']}/payments/{payment_id}", headers=admin_headers)
    assert delete_resp.status_code == 200, delete_resp.text
    proof_reverted = client.get(f"/api/invoices/{invoice['id']}/payment-proofs", headers=admin_headers).json()[0]
    assert proof_reverted["status"] == "approved"
    assert proof_reverted["appliedToPaymentId"] is None


def test_delete_invoice_with_pending_proof_does_not_raise(client, admin_headers):
    tenant = make_tenant(client, admin_headers, name="Proof Cleanup Tenant")
    invoice = make_invoice(client, admin_headers, tenant["id"])
    tenant_headers = _register_portal_user(client, admin_headers, tenant["id"], "proofcleanup", "password123")
    _upload_proof(client, tenant_headers, invoice["id"])

    resp = client.delete(f"/api/invoices/{invoice['id']}", headers=admin_headers)
    assert resp.status_code == 200, resp.text


def test_tenant_cannot_reach_another_tenants_payment_proofs(client, admin_headers):
    tenant_a = make_tenant(client, admin_headers, name="Proof Tenant A")
    tenant_b = make_tenant(client, admin_headers, name="Proof Tenant B")
    invoice_a = make_invoice(client, admin_headers, tenant_a["id"])

    headers_b = _register_portal_user(client, admin_headers, tenant_b["id"], "proofb", "password123")

    resp = client.get(f"/api/portal/invoices/{invoice_a['id']}/payment-proofs", headers=headers_b)
    assert resp.status_code == 404

    upload = client.post(
        f"/api/portal/invoices/{invoice_a['id']}/payment-proofs",
        files={"file": ("proof.jpg", io.BytesIO(b"fake"), "image/jpeg")},
        headers=headers_b,
    )
    assert upload.status_code == 404
