from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import get_access, get_current_user
from app.database.session import get_db
from app.models import Handover, HandoverApproval, ProjectMember, User
from app.schemas import HandoverPut
from app.services.knowledge import (
    build_handover_content, filter_for_incoming, handover_out, log_activity, members_with_permission, notify, now,
)
from app.services.pdf_report import build_pdf

router = APIRouter(tags=["handovers"])


def _load(db: Session, handover_id: int) -> Handover:
    h = db.get(Handover, handover_id)
    if h is None:
        raise HTTPException(404, "Handover not found")
    return h


@router.get("/projects/{project_id}/handovers")
def project_handovers(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("handover.generate")
    rows = db.query(Handover).filter_by(project_id=project_id).order_by(Handover.version.desc()).all()
    return [handover_out(h) for h in rows]


@router.post("/projects/{project_id}/handover/generate")
def generate(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("handover.generate")
    content = build_handover_content(db, a.project)
    draft = db.query(Handover).filter_by(project_id=project_id, status="draft").first()
    if draft:  # regenerate the existing draft instead of piling up drafts
        draft.content, draft.created_by_id = content, user.id
        draft.created_at = now()
    else:
        last = db.query(Handover).filter_by(project_id=project_id).order_by(Handover.version.desc()).first()
        draft = Handover(project_id=project_id, version=(last.version + 1) if last else 1, status="draft", content=content, created_by_id=user.id)
        db.add(draft)
    log_activity(db, project_id, user, "handover_generated", f"Handover draft generated (v{draft.version})")
    db.commit()
    db.refresh(draft)
    return handover_out(draft)


@router.put("/handovers/{handover_id}")
def save(handover_id: int, body: HandoverPut, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _load(db, handover_id)
    get_access(db, user, h.project_id).require("handover.generate")
    if h.status != "draft":
        raise HTTPException(409, "Only a draft can be edited. Generate a new version to make changes.")
    content = dict(h.content)
    content["overview"] = body.overview
    content["first_week_plan"] = [p.model_dump() for p in body.first_week_plan]
    h.content = content  # reassign so the JSON change is tracked
    log_activity(db, h.project_id, user, "handover_edited", f"Handover draft v{h.version} edited")
    db.commit()
    db.refresh(h)
    return handover_out(h)


@router.post("/handovers/{handover_id}/approve")
def approve(handover_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _load(db, handover_id)
    get_access(db, user, h.project_id).require("handover.approve")
    if h.status != "draft":
        raise HTTPException(409, "Only a draft can be approved.")
    h.status, h.approved_by_id, h.approved_at = "approved", user.id, now()
    db.add(HandoverApproval(handover_id=h.id, approver_id=user.id, decision="approved"))
    log_activity(db, h.project_id, user, "handover_approved", f"Handover v{h.version} approved")
    for m in members_with_permission(db, h.project_id, ("team_lead",)):
        if m.user_id != user.id:
            notify(db, m.user_id, h.project_id, "Handover approved", f"{user.name} approved v{h.version}. It can now be shared.", "/handover")
    db.commit()
    db.refresh(h)
    return handover_out(h)


@router.post("/handovers/{handover_id}/share")
def share(handover_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _load(db, handover_id)
    a = get_access(db, user, h.project_id)
    a.require("handover.share")
    if h.status == "draft":
        raise HTTPException(409, "Approve the handover before sharing it.")
    recipients = [m for m in db.query(ProjectMember).filter_by(project_id=h.project_id).all() if m.role.name == "incoming_owner"]
    if not recipients:
        raise HTTPException(422, "Add an incoming owner to the project before sharing.")
    h.status, h.shared_at = "shared", now()
    for m in recipients:
        notify(db, m.user_id, h.project_id, "A handover was shared with you", f"{h.project.name}, version {h.version}", "/incoming")
    log_activity(db, h.project_id, user, "handover_shared", f"Handover v{h.version} shared with {', '.join(m.user.name for m in recipients)}")
    db.commit()
    db.refresh(h)
    return handover_out(h)


def _incoming_for(db: Session, user: User) -> list[Handover]:
    pids = [m.project_id for m in db.query(ProjectMember).filter_by(user_id=user.id).all() if m.role.name == "incoming_owner"]
    if not pids:
        return []
    return db.query(Handover).filter(Handover.project_id.in_(pids), Handover.status == "shared").order_by(Handover.shared_at.desc()).all()


@router.get("/handovers")
def all_handovers(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = []
    for m in db.query(ProjectMember).filter_by(user_id=user.id).all():
        a = get_access(db, user, m.project_id)
        if a.can("handover.generate"):
            out += [handover_out(h) for h in db.query(Handover).filter_by(project_id=m.project_id).order_by(Handover.version.desc()).all()]
    out += [handover_out(h, filter_for_incoming(h.content)) for h in _incoming_for(db, user)]
    out.sort(key=lambda h: h["generated_at"] or "", reverse=True)
    return out


@router.get("/incoming")
def incoming(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [handover_out(h, filter_for_incoming(h.content)) for h in _incoming_for(db, user)]


def _incoming_one(db: Session, user: User, handover_id: int) -> Handover:
    h = _load(db, handover_id)
    a = get_access(db, user, h.project_id)
    a.require("handover.view_incoming")
    if h.status != "shared":
        raise HTTPException(403, "This handover has not been shared yet.")
    return h


@router.get("/incoming/{handover_id}")
def incoming_one(handover_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _incoming_one(db, user, handover_id)
    return handover_out(h, filter_for_incoming(h.content))


@router.post("/incoming/{handover_id}/acknowledge")
def acknowledge(handover_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _incoming_one(db, user, handover_id)
    get_access(db, user, h.project_id).require("handover.acknowledge")
    if h.acknowledged_at is None:
        h.acknowledged_by_id, h.acknowledged_at = user.id, now()
        log_activity(db, h.project_id, user, "handover_acknowledged", f"{user.name} acknowledged receipt of handover v{h.version}")
        for m in members_with_permission(db, h.project_id, ("team_lead",)):
            notify(db, m.user_id, h.project_id, "Handover acknowledged", f"{user.name} acknowledged v{h.version}.", "/reports")
        db.commit()
        db.refresh(h)
    return handover_out(h, filter_for_incoming(h.content))


@router.get("/handovers/{handover_id}/pdf")
def pdf(handover_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _load(db, handover_id)
    a = get_access(db, user, h.project_id)
    if a.can("handover.generate"):
        content = h.content
    elif a.can("handover.view_incoming") and h.status == "shared":
        content = filter_for_incoming(h.content)
    else:
        raise HTTPException(403, "You cannot download this handover")
    data = build_pdf({
        "project_name": h.project.name, "version": h.version, "status": h.status,
        "approved_by": h.approved_by.name if h.approved_by else None, "content": content,
    })
    safe = "".join(ch if ch.isalnum() else "-" for ch in h.project.name).strip("-").lower() or "handover"
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="handover-{safe}-v{h.version}.pdf"'})
