"""Seeds roles, permissions and (optionally) the synthetic demo project."""
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rbac import ALL_PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS
from app.core.security import hash_password
from app.models import Document, Notification, Organisation, Permission, Project, ProjectMember, Role, Source, User
from app.services import demo_data
from app.services.ingestion import ingest_bytes
from app.services.knowledge import log_activity, run_reconstruction


def ensure_roles(db: Session) -> None:
    valid = {k for k, _ in ALL_PERMISSIONS}
    for name, label in ROLE_LABELS.items():
        role = db.query(Role).filter_by(name=name).first() or Role(name=name, label=label)
        db.add(role)
        db.flush()
        have = {p.key for p in role.permissions}
        for key in sorted(ROLE_PERMISSIONS[name] & valid):
            if key not in have:
                role.permissions.append(Permission(key=key))
    db.commit()


def seed_demo(db: Session) -> None:
    if db.query(User).count() > 0:
        return
    org = Organisation(name="NextOwner Demo University")
    db.add(org)
    db.flush()
    users = {}
    for u in demo_data.DEMO_USERS:
        users[u["role"]] = User(organisation_id=org.id, email=u["email"], name=u["name"], password_hash=hash_password(demo_data.DEMO_PASSWORD))
        db.add(users[u["role"]])
    db.flush()
    lead = users["team_lead"]
    roles = {r.name: r for r in db.query(Role).all()}
    p = demo_data.DEMO_PROJECT
    project = Project(
        organisation_id=org.id, name=p["name"], description=p["description"], category=p["category"], status=p["status"],
        owner_id=lead.id, incoming_owner_id=users["incoming_owner"].id, start_date=p["start_date"], is_demo=True,
    )
    db.add(project)
    db.flush()
    for role, user in users.items():
        db.add(ProjectMember(project_id=project.id, user_id=user.id, role_id=roles[role].id, can_approve=role in ("team_lead", "reviewer")))
    log_activity(db, project.id, lead, "project_created", "Project created: Student Research Portal (synthetic demonstration data)")

    folder = Path(get_settings().UPLOAD_DIR) / str(project.id)
    folder.mkdir(parents=True, exist_ok=True)
    for d in demo_data.DEMO_DOCS:
        data = d["text"].encode()
        res = ingest_bytes(d["filename"], data)
        stored = folder / f"demo_{d['filename']}"
        stored.write_bytes(data)
        src = Source(project_id=project.id, source_type=d["source_type"], name=d["filename"], confidential=d["confidential"],
                     uploaded_by_id=lead.id, status="processed")
        src.document = Document(
            project_id=project.id, filename=d["filename"], file_type="txt", mime=res["mime"], size_bytes=len(data), stored_path=str(stored),
            author=d["author"], doc_date=d["doc_date"], pages=res["pages"], page_count=res["page_count"], redactions=res["redactions"],
        )
        db.add(src)
        log_activity(db, project.id, lead, "document_uploaded", f"Document uploaded: {d['filename']}")
    db.commit()
    run_reconstruction(db, project, lead, use_llm=False)  # rule-based so first start never needs an API key
    db.add(Notification(user_id=users["reviewer"].id, project_id=project.id, title="Claims are waiting for review",
                        body="Student Research Portal has extracted claims that need a reviewer.", link="/review"))
    db.commit()


if __name__ == "__main__":
    from app.database.session import SessionLocal

    with SessionLocal() as s:
        ensure_roles(s)
        if get_settings().SEED_DEMO_DATA:
            seed_demo(s)
    print("Seed complete.")
