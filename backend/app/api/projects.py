from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_access, get_current_user
from app.core.rbac import ALL_PERMISSIONS, ROLES
from app.database.session import get_db
from app.models import ActivityLog, Notification, Project, ProjectMember, Role, User
from app.schemas import MemberIn, NewProjectBody, PatchMemberBody, PatchProjectBody
from app.services.knowledge import iso, log_activity, notify
from app.services.projects import activity_out, dashboard, project_detail, project_stats, project_summary, roles_info

router = APIRouter(tags=["projects"])


def _role(db: Session, name: str) -> Role:
    r = db.query(Role).filter_by(name=name).first()
    if r is None:
        raise HTTPException(500, "Roles are not initialised")
    return r


def _user_by_email(db: Session, email: str) -> User:
    u = db.query(User).filter_by(email=email.strip().lower()).first()
    if u is None:
        raise HTTPException(422, f"No user is registered with the email {email}. Ask them to register first.")
    return u


def _upsert_member(db: Session, project: Project, user: User, role: str, can_approve: bool = False) -> None:
    m = db.query(ProjectMember).filter_by(project_id=project.id, user_id=user.id).first()
    if m is None:
        db.add(ProjectMember(project_id=project.id, user_id=user.id, role_id=_role(db, role).id, can_approve=can_approve))
    else:
        m.role_id, m.can_approve = _role(db, role).id, can_approve


@router.get("/permissions")
def permissions(user: User = Depends(get_current_user)):
    return {"roles": roles_info(), "all_permissions": [{"key": k, "label": v} for k, v in ALL_PERMISSIONS]}


@router.get("/dashboard")
def get_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return dashboard(db, user)


@router.get("/projects")
def list_projects(q: Optional[str] = None, status: Optional[str] = None, sort: str = "updated",
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    members = db.query(ProjectMember).filter_by(user_id=user.id).all()
    roles = {m.project_id: m.role.name for m in members}
    query = db.query(Project).filter(Project.id.in_(list(roles) or [0]))
    if status:
        query = query.filter(Project.status == status)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        from sqlalchemy import func, or_
        query = query.filter(or_(func.lower(Project.name).like(like), func.lower(Project.description).like(like)))
    out = [project_summary(db, p, roles[p.id]) for p in query.all()]
    if sort == "name":
        out.sort(key=lambda p: p["name"].lower())
    elif sort == "progress":
        out.sort(key=lambda p: -p["progress"])
    else:
        out.sort(key=lambda p: p["updated_at"], reverse=True)
    return out


@router.post("/projects", status_code=201)
def create_project(body: NewProjectBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner = _user_by_email(db, body.owner_email) if body.owner_email else user
    incoming = _user_by_email(db, body.incoming_owner_email) if body.incoming_owner_email else None
    extra = [(_user_by_email(db, m.email), m.role, m.can_approve) for m in body.members]
    project = Project(
        organisation_id=user.organisation_id, name=body.name.strip(), description=body.description, category=body.category,
        status=body.status, owner_id=owner.id, incoming_owner_id=incoming.id if incoming else None, start_date=body.start_date,
    )
    db.add(project)
    db.flush()
    _upsert_member(db, project, user, "team_lead", True)
    _upsert_member(db, project, owner, "team_lead", True)
    for u, role, ca in extra:
        if u.id not in (user.id, owner.id):
            _upsert_member(db, project, u, role, ca)
    if incoming and incoming.id not in (user.id, owner.id):
        _upsert_member(db, project, incoming, "incoming_owner")
    log_activity(db, project.id, user, "project_created", f"Project created: {project.name}")
    db.commit()
    db.refresh(project)
    return project_summary(db, project, "team_lead")


@router.get("/projects/{project_id}")
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return project_detail(db, get_access(db, user, project_id))


@router.patch("/projects/{project_id}")
def patch_project(project_id: int, body: PatchProjectBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("project.manage")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(a.project, k, v)
    log_activity(db, project_id, user, "project_updated", f"Project settings updated: {a.project.name}")
    db.commit()
    return project_detail(db, a)


def _members_guard(db: Session, user: User, project_id: int):
    a = get_access(db, user, project_id)
    a.require("members.manage")
    return a


@router.post("/projects/{project_id}/members")
def add_member(project_id: int, body: MemberIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _members_guard(db, user, project_id)
    target = _user_by_email(db, body.email)
    _upsert_member(db, a.project, target, body.role, body.can_approve)
    if body.role == "incoming_owner":
        a.project.incoming_owner_id = target.id
    log_activity(db, project_id, user, "member_added", f"{target.name} added as {body.role.replace('_', ' ')}")
    notify(db, target.id, project_id, "You were added to a project", f"{a.project.name} as {body.role.replace('_', ' ')}", "/projects/" + str(project_id))
    db.commit()
    db.refresh(a.project)
    return project_detail(db, a)


def _team_leads(project: Project) -> int:
    return sum(1 for m in project.members if m.role.name == "team_lead")


@router.patch("/projects/{project_id}/members/{user_id}")
def patch_member(project_id: int, user_id: int, body: PatchMemberBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _members_guard(db, user, project_id)
    m = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
    if m is None:
        raise HTTPException(404, "Member not found")
    if body.role and body.role != "team_lead" and m.role.name == "team_lead" and _team_leads(a.project) <= 1:
        raise HTTPException(409, "A project needs at least one team lead.")
    if body.role:
        m.role_id = _role(db, body.role).id
        if body.role == "incoming_owner":
            a.project.incoming_owner_id = user_id
    if body.can_approve is not None:
        m.can_approve = body.can_approve
    log_activity(db, project_id, user, "member_updated", f"Permissions changed for {m.user.name}")
    db.commit()
    db.refresh(a.project)
    return project_detail(db, a)


@router.delete("/projects/{project_id}/members/{user_id}")
def remove_member(project_id: int, user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _members_guard(db, user, project_id)
    m = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
    if m is None:
        raise HTTPException(404, "Member not found")
    if m.role.name == "team_lead" and _team_leads(a.project) <= 1:
        raise HTTPException(409, "A project needs at least one team lead.")
    if user_id == a.project.owner_id:
        raise HTTPException(409, "The project owner cannot be removed.")
    db.delete(m)
    log_activity(db, project_id, user, "member_removed", f"{m.user.name} removed from the project")
    db.commit()
    db.refresh(a.project)
    return project_detail(db, a)


@router.get("/activity")
def activity(project_id: Optional[int] = None, limit: int = 30, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = [m.project_id for m in db.query(ProjectMember).filter_by(user_id=user.id).all()]
    if project_id is not None:
        if project_id not in ids:
            raise HTTPException(403, "You are not a member of this project")
        ids = [project_id]
    rows = db.query(ActivityLog).filter(ActivityLog.project_id.in_(ids or [0])).order_by(ActivityLog.id.desc()).limit(min(limit, 100)).all()
    return [activity_out(a) for a in rows]


@router.get("/notifications")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Notification).filter_by(user_id=user.id).order_by(Notification.id.desc()).limit(50).all()
    return [{"id": n.id, "title": n.title, "body": n.body, "link": n.link, "read": n.is_read, "created_at": iso(n.created_at)} for n in rows]


@router.post("/notifications/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter_by(user_id=user.id, is_read=False).update({"is_read": True})
    db.commit()
    return {"ok": True}


@router.post("/notifications/{notification_id}/read")
def read_one(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.query(Notification).filter_by(id=notification_id, user_id=user.id).first()
    if n is None:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}
