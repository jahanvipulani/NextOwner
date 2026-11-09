"""API tests run against a throw-away SQLite database. They need the packages in requirements.txt."""
import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["LLM_API_KEY"] = ""
os.environ["SECRET_KEY"] = "test-secret"

import pytest  # noqa: E402

PASSWORD = "Demo@12345"


@pytest.fixture(scope="session")
def client():
    for mod in ("fastapi", "sqlalchemy", "httpx"):
        pytest.importorskip(mod)
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:  # runs the lifespan: creates tables and seeds the demo project
        yield c


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def lead(client):
    return _login(client, "lead@demo.nextowner.dev")


@pytest.fixture(scope="session")
def reviewer(client):
    return _login(client, "reviewer@demo.nextowner.dev")


@pytest.fixture(scope="session")
def contributor(client):
    return _login(client, "contributor@demo.nextowner.dev")


@pytest.fixture(scope="session")
def incoming(client):
    return _login(client, "incoming@demo.nextowner.dev")


@pytest.fixture(scope="session")
def project_id(client, lead):
    projects = client.get("/api/projects", headers=lead).json()
    return next(p["id"] for p in projects if p["name"] == "Student Research Portal")
