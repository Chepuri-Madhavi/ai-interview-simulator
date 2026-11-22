import os
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="ais-test-")
os.environ.update({
    "APP_ENV": "test",
    "DATABASE_URL": f"sqlite:///{_tmp}/test.db",
    "STORAGE_DIR": f"{_tmp}/storage",
    "LLM_PROVIDER": "fake",
    "SECRET_KEY": "test-secret",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.llm import get_llm  # noqa: E402

SAMPLES = Path(__file__).resolve().parents[2] / "samples"


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def fake_llm():
    llm = get_llm()
    llm.calls.clear()
    return llm


_n = 0


def register(client, email=None):
    global _n
    _n += 1
    r = client.post("/api/auth/register", json={"email": email or f"user{_n}@example.com", "password": "password123", "full_name": "Test"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client):
    return register(client)
