"""Project serialisation and dashboard numbers, all computed from database rows."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import Access
from app.core.rbac import ROLE_LABELS
from app.models import ActivityLog, ExtractedClaim, Handover, Project, ProjectMember, Source, User
from app.services.knowledge import iso, now


def user_out(u: User) -> dict[str, Any]:
    return {"id": u.id, "name": u.name, "email": u.email, "organisation": u.organisation.name}


def person(u: User | None) -> dict[str, Any] | None:
    return {"id": u.id, "name": u.name} if u else None


def project_stats(db: Session, project_id: int) -> dict[str, Any]:
    sources = db.query(func.count(Source.id)).filter_by(project_id=project_id).scalar() or 0
    rows = dict(db.query(ExtractedClaim.status, func.count()).filter_by(project_id=project_id).group_by(ExtractedClaim.status).all())
    claims = sum(rows.values())
    reviewed = claims - rows.get("pending", 0)
    approved = db.query(func.count(Handover.id)).filter(Handover.project_id == project_id, Handover.status.in_(["approved", "shared"])).scalar() or 0
    progress = 0
    progress += 25 if sources else 0
    progress += 25 if claims else 0
    progress += round(25 * reviewed / claims) if claims else 0
    progress += 25 if approved else 0
    return {"sources": sources, "claims": claims, "reviewed": reviewed, "approved": approved, "progress": progress, "by_status": rows}


def project_summary(db: Session, p: Project, role: str) -> dict[str, Any]:
    st = project_stats(db, p.id)
    return {
        "id": p.id, "name": p.name, "description": p.description, "category": p.category, "status": p.status,
        "owner": person(p.owner), "incoming_owner": person(p.incoming_owner), "member_count": len(p.members),
        "source_count": st["sources"], "claim_count": st["claims"], "reviewed_count": st["reviewed"],
        "progress": st["progress"], "start_date": p.start_date, "updated_at": iso(p.updated_at), "my_role": role,
    }


def project_detail(db: Session, access: Access) -> dict[str, Any]:
    p = access.project
    out = project_summary(db, p, access.role)
    st = project_stats(db, p.id)["by_status"]
    out["members"] = [
        {"user_id": m.user_id, "name": m.user.name, "email": m.user.email, "role": m.role.name, "can_approve": m.can_approve}
        for m in p.members
    ]
    out["permissions"] = sorted(access.permissions)
    out["counts"] = {k: st.get(k, 0) for k in ("pending", "accepted", "edited", "rejected", "unknown")}
    out["last_reconstruction"] = (
        {"at": iso(p.last_recon_at), "mode": p.last_recon_mode, "claims": p.last_recon_claims or 0} if p.last_recon_at else None
    )
    return out


def activity_out(a: ActivityLog) -> dict[str, Any]:
    return {
        "id": a.id, "project_id": a.project_id, "project_name": a.project.name if a.project else None, "kind": a.kind,
        "message": a.message, "user": a.user.name if a.user else None, "created_at": iso(a.created_at),
    }


def dashboard(db: Session, user: User) -> dict[str, Any]:
    members = db.query(ProjectMember).filter_by(user_id=user.id).all()
    ids = [m.project_id for m in members]
    role_by_project = {m.project_id: m.role.name for m in members}
    projects = db.query(Project).filter(Project.id.in_(ids)).order_by(Project.updated_at.desc()).all() if ids else []
    week = now() - timedelta(days=7)
    stats: dict[str, Any] = {
        "projects": {"total": len(projects), "active": sum(1 for p in projects if p.status in ("in_progress", "ready_for_handover"))},
        "sources": {"total": 0, "recent": 0},
        "claims": {"total": 0, "verified": 0},
        "reviews": {"pending": 0, "high_priority": 0},
        "handovers": {"approved": 0, "recently_shared": 0},
    }
    progress = {"Sources Connected": 0, "Knowledge Extracted": 0, "Claims Reviewed": 0, "Handover Approved": 0}
    if ids:
        stats["sources"]["total"] = db.query(func.count(Source.id)).filter(Source.project_id.in_(ids)).scalar() or 0
        stats["sources"]["recent"] = db.query(func.count(Source.id)).filter(Source.project_id.in_(ids), Source.created_at >= week).scalar() or 0
        claims = db.query(ExtractedClaim).filter(ExtractedClaim.project_id.in_(ids)).all()
        stats["claims"]["total"] = len(claims)
        stats["claims"]["verified"] = sum(1 for c in claims if c.evidence_status == "verified")
        pend = [c for c in claims if c.status == "pending"]
        stats["reviews"]["pending"] = len(pend)
        stats["reviews"]["high_priority"] = sum(
            1 for c in pend if c.evidence_status == "conflicting" or (c.category == "risk" and c.risk and c.risk.severity == "high")
        )
        hs = db.query(Handover).filter(Handover.project_id.in_(ids)).all()
        stats["handovers"]["approved"] = sum(1 for h in hs if h.status in ("approved", "shared"))
        stats["handovers"]["recently_shared"] = sum(
            1 for h in hs if h.shared_at and (h.shared_at if h.shared_at.tzinfo else h.shared_at.replace(tzinfo=week.tzinfo)) >= week
        )
        progress["Sources Connected"] = stats["sources"]["total"]
        progress["Knowledge Extracted"] = len(claims)
        progress["Claims Reviewed"] = len(claims) - len(pend)
        progress["Handover Approved"] = stats["handovers"]["approved"]
    acts = (
        db.query(ActivityLog).filter(ActivityLog.project_id.in_(ids)).order_by(ActivityLog.id.desc()).limit(12).all() if ids else []
    )
    return {
        "stats": stats,
        "progress": [{"stage": k, "value": v} for k, v in progress.items()],
        "activity": [activity_out(a) for a in acts],
        "projects": [project_summary(db, p, role_by_project[p.id]) for p in projects[:6]],
    }


def roles_info() -> list[dict[str, Any]]:
    from app.core.rbac import ROLE_PERMISSIONS
    return [{"name": r, "label": ROLE_LABELS[r], "permissions": sorted(ROLE_PERMISSIONS[r])} for r in ROLE_LABELS]
