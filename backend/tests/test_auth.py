def test_register_login_me(client):
    r = client.post("/api/auth/register", json={"email": "Ana@Example.com", "password": "password123", "full_name": "Ana"})
    assert r.status_code == 201
    assert client.post("/api/auth/register", json={"email": "ana@example.com", "password": "password123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong-pass"}).status_code == 401
    tok = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "password123"}).json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.json()["email"] == "ana@example.com"


def test_requires_auth(client):
    assert client.get("/api/interviews").status_code == 401
    assert client.get("/api/interviews", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_short_password_rejected(client):
    assert client.post("/api/auth/register", json={"email": "b@example.com", "password": "short"}).status_code == 422


def test_preferences_whitelisted(client, auth):
    r = client.patch("/api/auth/me", json={"preferences": {"tts_rate": 1.2, "is_admin": True}}, headers=auth)
    assert r.json()["preferences"] == {"tts_rate": 1.2}
