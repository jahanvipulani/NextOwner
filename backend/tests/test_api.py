"""End-to-end API tests: auth, RBAC, review, handover, incoming owner. Order matters inside the workflow test."""


def test_register_and_login(client):
    r = client.post("/api/auth/register", json={"name": "Test User", "email": "new.user@example.com", "password": "Sup3rSecret!"})
    assert r.status_code in (200, 201), r.text
    assert client.post("/api/auth/login", json={"email": "new.user@example.com", "password": "Sup3rSecret!"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "new.user@example.com", "password": "wrong"}).status_code == 401


def test_requires_authentication(client):
    assert client.get("/api/projects").status_code == 401
    assert client.get("/api/dashboard").status_code == 401


def test_dashboard_counts_come_from_the_database(client, lead):
    d = client.get("/api/dashboard", headers=lead).json()
    assert d["stats"]["projects"]["total"] >= 1
    assert d["stats"]["claims"]["total"] >= 10
    assert [p["stage"] for p in d["progress"]] == ["Sources Connected", "Knowledge Extracted", "Claims Reviewed", "Handover Approved"]


def test_create_project_logs_activity(client, lead):
    r = client.post("/api/projects", headers=lead, json={"name": "Lab Inventory", "description": "Inventory tool", "category": "Operations", "status": "planning"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    acts = client.get("/api/activity", headers=lead, params={"project_id": pid}).json()
    assert any(a["kind"] == "project_created" for a in acts)


def test_upload_validation(client, lead, project_id):
    bad = client.post(f"/api/projects/{project_id}/sources/upload", headers=lead,
                      files={"file": ("virus.exe", b"MZ", "application/octet-stream")}, data={"source_type": "document", "confidential": "false"})
    assert bad.status_code == 415
    empty = client.post(f"/api/projects/{project_id}/sources/upload", headers=lead,
                        files={"file": ("empty.txt", b"", "text/plain")}, data={"source_type": "document", "confidential": "false"})
    assert empty.status_code == 422


def test_upload_txt_is_stored_with_masked_secrets(client, lead, project_id):
    body = b"Decision: adopt weekly demos because stakeholders asked.\nStaging key is sk_test_ABCDEF123456789.\n"
    r = client.post(f"/api/projects/{project_id}/sources/upload", headers=lead,
                    files={"file": ("notes.txt", body, "text/plain")}, data={"source_type": "meeting_notes", "confidential": "false"})
    assert r.status_code == 201, r.text
    pages = client.get(f"/api/sources/{r.json()['id']}", headers=lead).json()["pages"]
    assert "sk_test_" not in pages[0]["text"]


def test_contributor_cannot_review_or_connect(client, contributor, project_id):
    claims = client.get(f"/api/projects/{project_id}/claims", headers=contributor)
    assert claims.status_code == 200
    assert all(not e["confidential"] for c in claims.json() for e in c["evidence"])
    assert client.post(f"/api/projects/{project_id}/reconstruct", headers=contributor).status_code == 403
    assert client.get(f"/api/projects/{project_id}/review-history", headers=contributor).status_code == 403


def test_incoming_owner_sees_nothing_before_sharing(client, incoming, project_id):
    assert client.get("/api/incoming", headers=incoming).json() == []
    assert client.get(f"/api/projects/{project_id}/claims", headers=incoming).status_code == 403


def test_review_to_handover_workflow(client, lead, reviewer, incoming, project_id):
    claims = client.get(f"/api/projects/{project_id}/claims", headers=lead).json()
    assert claims and all(c["status"] == "pending" for c in claims[:3])

    # Review: accept, edit, reject, unknown, each saved to history
    first, second, third, fourth = claims[0], claims[1], claims[2], claims[3]
    assert client.post(f"/api/claims/{first['id']}/review", headers=reviewer, json={"action": "accept"}).json()["status"] == "accepted"
    edited = client.post(f"/api/claims/{second['id']}/review", headers=reviewer, json={"action": "edit", "text": "Edited by reviewer", "comment": "clarified"}).json()
    assert edited["status"] == "edited" and edited["text"] == "Edited by reviewer"
    assert client.post(f"/api/claims/{second['id']}/review", headers=reviewer, json={"action": "edit"}).status_code == 422
    assert client.post(f"/api/claims/{third['id']}/review", headers=reviewer, json={"action": "reject"}).json()["status"] == "rejected"
    assert client.post(f"/api/claims/{fourth['id']}/review", headers=reviewer, json={"action": "unknown"}).json()["status"] == "unknown"
    hist = client.get(f"/api/projects/{project_id}/review-history", headers=lead).json()
    assert {h["action"] for h in hist} >= {"accept", "edit", "reject", "unknown"}
    assert any(h["previous"]["text"] != h["updated"]["text"] for h in hist if h["action"] == "edit")

    # Accept the rest so the handover has content
    for c in claims[4:]:
        client.post(f"/api/claims/{c['id']}/review", headers=lead, json={"action": "accept"})

    # Generate a draft. A rejected claim never appears. A draft cannot be shared.
    h = client.post(f"/api/projects/{project_id}/handover/generate", headers=lead).json()
    assert h["status"] == "draft"
    ids = {c["id"] for sec in ("decisions", "responsibilities", "risks", "dependencies", "contacts") for c in h["content"][sec]}
    assert third["id"] not in ids
    assert client.post(f"/api/handovers/{h['id']}/share", headers=lead).status_code == 409
    assert client.get("/api/incoming", headers=incoming).json() == []

    # Reviewer without approval right cannot approve; team lead can
    assert client.post(f"/api/handovers/{h['id']}/approve", headers=incoming).status_code == 403
    approved = client.post(f"/api/handovers/{h['id']}/approve", headers=lead).json()
    assert approved["status"] == "approved" and approved["approved_by"]
    assert client.put(f"/api/handovers/{h['id']}", headers=lead, json={"overview": "x", "first_week_plan": []}).status_code == 409

    pdf = client.get(f"/api/handovers/{h['id']}/pdf", headers=lead)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    # Share, then the incoming owner sees a filtered copy and can acknowledge
    assert client.post(f"/api/handovers/{h['id']}/share", headers=lead).json()["status"] == "shared"
    mine = client.get("/api/incoming", headers=incoming).json()
    assert len(mine) == 1
    view = client.get(f"/api/incoming/{h['id']}", headers=incoming).json()
    text = str(view["content"])
    assert "sk_test_" not in text
    sections = ("decisions", "responsibilities", "risks", "dependencies", "questions", "contacts", "unresolved")
    assert all(not e["confidential"] for sec in sections for c in view["content"][sec] for e in c["evidence"])
    assert view["content"]["withheld_count"] >= 1  # claims backed only by the confidential finance document
    ack = client.post(f"/api/incoming/{h['id']}/acknowledge", headers=incoming).json()
    assert ack["acknowledged_by"]
    assert client.get(f"/api/handovers/{h['id']}/pdf", headers=incoming).status_code == 200


def test_unauthorised_user_cannot_open_other_project(client, project_id):
    r = client.post("/api/auth/register", json={"name": "Outsider", "email": "outsider@example.com", "password": "Sup3rSecret!"})
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.get(f"/api/projects/{project_id}", headers=h).status_code == 403
    assert client.get(f"/api/projects/{project_id}/claims", headers=h).status_code == 403
