import os
import tempfile

# Required env vars must be set BEFORE backend.core.config is imported by
# anything (it reads them once, at module import time via pydantic-settings).
os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin-test-pass")

_tmp_dir = tempfile.mkdtemp(prefix="rentledger-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_dir}/test.db"
os.environ["DATA_DIR"] = _tmp_dir
os.environ["UPLOADS_DIR"] = os.path.join(_tmp_dir, "uploads")

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.seed import run_seed

run_seed()


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def admin_headers(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin-test-pass"})
    assert resp.status_code == 200, resp.text
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


def make_tenant(client, admin_headers, **overrides):
    body = {
        "name": "Test Tenant",
        "phone": "+911234567890",
        "propertyAddress": "123 Main St",
        "monthlyRent": "8000",
        "roomRate": "6.65",
        "waterRate": "6.65",
        "waterDivisor": 1,
        "upiId": "landlord@upi",
        "moveInDate": "2024-01-01",
    }
    body.update(overrides)
    resp = client.post("/api/tenants", json=body, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()
