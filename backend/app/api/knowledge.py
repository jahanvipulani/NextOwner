from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import Access, get_access, get_current_user
from app.database.session import get_db
from app.models import ExtractedClaim, ReviewComment, ReviewHistory, User
from app.schemas import CommentBody, ReviewBody
from app.services.knowledge import (
    claim_is_confidential, claim_matches_user, claim_out, get_details, iso, log_activity, members_with_permission, notify,
    now, refresh_statuses, run_reconstruction, set_details, snapshot_of,
)

router = APIRouter(tags=["knowledge"])


def comment_out(c: ReviewComment) -> dict:
    return {"id": c.id, "claim_id": c.claim_id, "author": c.user.name, "author_role": c.author_role, "kind": c.kind, "body": c.body, "created_at": iso(c.created_at)}


def history_out(h: ReviewHistory, claim_text: str) -> dict:
    return {
        "id": h.id, "claim_id": h.claim_id, "claim_text": claim_text, "reviewer": h.reviewer.name, "action": h.action,
        "previous": h.previous_value, "updated": h.updated_value, "comment": h.comment, "created_at": iso(h.created_at),
    }


def _claim_access(db: Session, user: User, claim_id: int) -> tuple[ExtractedClaim, Access, bool]:
    """Loads a claim and checks the caller may see it. Returns (claim, access, restricted_view)."""
    claim = db.get(ExtractedClaim, claim_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    a = get_access(db, user, claim.project_id)
    if a.can("knowledge.view"):
        return claim, a, False
    if a.can("claims.view_assigned") and claim.status != "rejected" and not claim_is_confidential(claim) and claim_matches_user(claim, user):
        return claim, a, True
    raise HTTPException(403, "Your role cannot view this claim")


@router.post("/projects/{project_id}/reconstruct")
def reconstruct(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("knowledge.reconstruct")
    if not a.project.members or db.query(__import__("app.models", fromlist=["Source"]).Source).filter_by(project_id=project_id).count() == 0:
        raise HTTPException(422, "Add at least one source before reconstructing.")
    return run_reconstruction(db, a.project, user)


@router.get("/projects/{project_id}/reconstruction")
def reconstruction(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("knowledge.view")
    p = a.project
    claims = db.query(ExtractedClaim).filter_by(project_id=project_id).order_by(ExtractedClaim.id).all()
    by: dict[str, int] = {}
    for c in claims:
        by[c.category] = by.get(c.category, 0) + 1
    return {
        "last_run": {"at": iso(p.last_recon_at), "mode": p.last_recon_mode, "claims": p.last_recon_claims or 0} if p.last_recon_at else None,
        "by_category": by,
        "claims": [claim_out(c) for c in claims],
    }


@router.get("/projects/{project_id}/claims")
def list_claims(
    project_id: int, category: Optional[str] = None, evidence_status: Optional[str] = None, status: Optional[str] = None,
    source_id: Optional[int] = None, q: Optional[str] = None,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    a = get_access(db, user, project_id)
    full = a.can("knowledge.view")
    if not full and not a.can("claims.view_assigned"):
        raise HTTPException(403, "Your role cannot view claims")
    query = db.query(ExtractedClaim).filter_by(project_id=project_id)
    if category:
        query = query.filter(ExtractedClaim.category == category)
    if evidence_status:
        query = query.filter(ExtractedClaim.evidence_status == evidence_status)
    if status:
        query = query.filter(ExtractedClaim.status == status)
    claims = query.order_by(ExtractedClaim.id).all()
    if source_id is not None:
        claims = [c for c in claims if any(e.source_id == source_id for e in c.evidence)]
    if q and q.strip():
        needle = q.strip().lower()
        claims = [c for c in claims if needle in c.text.lower()]
    if not full:  # contributor: only their own, non-confidential claims
        claims = [c for c in claims if c.status != "rejected" and not claim_is_confidential(c) and claim_matches_user(c, user)]
    return [claim_out(c, hide_confidential=not full) for c in claims]


@router.get("/claims/{claim_id}")
def get_claim(claim_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    claim, a, restricted = _claim_access(db, user, claim_id)
    history = [] if restricted else [history_out(h, claim.text) for h in claim.history]
    return {"claim": claim_out(claim, hide_confidential=restricted), "comments": [comment_out(c) for c in claim.comments], "history": history}


@router.post("/claims/{claim_id}/review")
def review_claim(claim_id: int, body: ReviewBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    claim = db.get(ExtractedClaim, claim_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    a = get_access(db, user, claim.project_id)
    a.require("claims.review")
    before = snapshot_of(claim)
    if body.action == "edit":
        text = (body.text or "").strip()
        if not text:
            raise HTTPException(422, "Edited text is required.")
        claim.text = text
        if body.details:
            set_details(claim, body.details)
        claim.status = "edited"
    else:
        if body.details:
            set_details(claim, body.details)
        claim.status = {"accept": "accepted", "reject": "rejected", "unknown": "unknown"}[body.action]
    claim.reviewed_by_id, claim.reviewed_at = user.id, now()
    db.flush()
    db.add(ReviewHistory(
        claim_id=claim.id, reviewer_id=user.id, action=body.action, previous_value=before,
        updated_value={"text": claim.text, "details": get_details(claim), "status": claim.status}, comment=(body.comment or "").strip() or None,
    ))
    if body.comment and body.comment.strip():
        db.add(ReviewComment(claim_id=claim.id, user_id=user.id, kind="comment", body=body.comment.strip(), author_role=a.role))
    db.flush()
    refresh_statuses(db, claim.project_id)
    label = {"accept": "accepted", "edit": "edited", "reject": "rejected", "unknown": "marked unknown"}[body.action]
    log_activity(db, claim.project_id, user, "claim_reviewed", f"Claim {label}: {claim.text[:100]}")
    pending = db.query(ExtractedClaim).filter_by(project_id=claim.project_id, status="pending").count()
    if pending == 0:
        log_activity(db, claim.project_id, user, "review_completed", "Review completed: no claims are waiting for review")
    db.commit()
    db.refresh(claim)
    return claim_out(claim)


@router.post("/claims/{claim_id}/comments", status_code=201)
def add_comment(claim_id: int, body: CommentBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    claim, a, restricted = _claim_access(db, user, claim_id)
    a.require("claims.comment")
    if restricted and body.kind == "clarification":
        raise HTTPException(403, "Contributors can add comments and information, not clarification requests.")
    c = ReviewComment(claim_id=claim.id, user_id=user.id, kind=body.kind, body=body.body.strip(), author_role=a.role)
    db.add(c)
    if body.kind in ("clarification", "information"):
        title = "Clarification requested" if body.kind == "clarification" else "New information provided"
        for m in members_with_permission(db, claim.project_id, ("team_lead", "reviewer")):
            if m.user_id != user.id:
                notify(db, m.user_id, claim.project_id, title, f"{user.name} on: {claim.text[:100]}", "/review")
    log_activity(db, claim.project_id, user, "comment_added", f"{body.kind.title()} on: {claim.text[:90]}")
    db.commit()
    db.refresh(c)
    return comment_out(c)


@router.get("/projects/{project_id}/review-history")
def review_history(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("claims.review")
    rows = (
        db.query(ReviewHistory).join(ExtractedClaim, ReviewHistory.claim_id == ExtractedClaim.id)
        .filter(ExtractedClaim.project_id == project_id).order_by(ReviewHistory.id.desc()).all()
    )
    texts = {c.id: c.text for c in db.query(ExtractedClaim).filter_by(project_id=project_id).all()}
    return [history_out(h, texts.get(h.claim_id, "")) for h in rows]
