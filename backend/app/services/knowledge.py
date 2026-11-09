"""Database-backed logic: claim details, reconstruction, review state and handovers."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    ActivityLog, Decision, Dependency, EvidenceReference, ExtractedClaim, Handover, Notification, OpenQuestion,
    Project, ProjectMember, Responsibility, Risk, Source, User,
)
from app.services import llm
from app.services.extraction import Doc, Draft, Page, Segment, extract_rules, jaccard, tokens

# category -> (model, relationship attribute, fields)
DETAIL_MODELS: dict[str, tuple[type, str, list[str]]] = {
    "decision": (Decision, "decision", ["rationale", "decision_date", "responsible_person"]),
    "ownership": (Responsibility, "responsibility", ["assignee", "status", "deadline"]),
    "risk": (Risk, "risk", ["severity", "impact", "mitigation"]),
    "dependency": (Dependency, "dependency", ["related_task", "component", "responsible_person"]),
    "question": (OpenQuestion, "question", ["why_it_matters", "responsible_person", "related_source"]),
}
CONTACT_FIELDS = ["name", "role", "area", "contact_details"]
SECTIONS = {"decisions": "decision", "responsibilities": "ownership", "risks": "risk", "dependencies": "dependency", "questions": "question", "contacts": "contact"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ----------------------------------------------------------------------------
# activity and notifications
# ----------------------------------------------------------------------------
def log_activity(db: Session, project_id: Optional[int], user: Optional[User], kind: str, message: str) -> None:
    db.add(ActivityLog(project_id=project_id, user_id=user.id if user else None, kind=kind, message=message))


def notify(db: Session, user_id: int, project_id: Optional[int], title: str, body: str, link: Optional[str] = None) -> None:
    db.add(Notification(user_id=user_id, project_id=project_id, title=title, body=body, link=link))


def members_with_permission(db: Session, project_id: int, roles: tuple[str, ...]) -> list[ProjectMember]:
    return [m for m in db.query(ProjectMember).filter_by(project_id=project_id).all() if m.role.name in roles]


# ----------------------------------------------------------------------------
# claim details
# ----------------------------------------------------------------------------
def get_details(c: ExtractedClaim) -> dict[str, Optional[str]]:
    if c.category == "contact":
        return {k: (c.extra or {}).get(k) for k in CONTACT_FIELDS}
    model, attr, fields = DETAIL_MODELS[c.category]
    row = getattr(c, attr)
    out = {k: (getattr(row, k) if row else None) for k in fields}
    return out


def set_details(c: ExtractedClaim, details: dict[str, Any]) -> None:
    if c.category == "contact":
        merged = dict(c.extra or {})
        for k in CONTACT_FIELDS:
            if k in details:
                merged[k] = _blank(details[k])
        c.extra = merged
        return
    model, attr, fields = DETAIL_MODELS[c.category]
    row = getattr(c, attr)
    if row is None:
        row = model()
        setattr(c, attr, row)
    for k in fields:
        if k in details:
            v = _blank(details[k])
            if k == "severity" and v is not None:
                v = v.lower() if v.lower() in ("low", "medium", "high") else None
            setattr(row, k, v)


def _blank(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# ----------------------------------------------------------------------------
# serialisation
# ----------------------------------------------------------------------------
def evidence_out(e: EvidenceReference) -> dict[str, Any]:
    s = e.source
    return {
        "id": e.id, "source_id": e.source_id, "source_name": s.name, "source_type": s.source_type,
        "quote": e.quote, "page": e.page, "location": e.location, "author": e.author, "date": e.ref_date,
        "reference": e.reference, "confidential": s.confidential,
    }


def claim_out(c: ExtractedClaim, hide_confidential: bool = False) -> dict[str, Any]:
    ev = [evidence_out(e) for e in c.evidence]
    if hide_confidential:
        ev = [e for e in ev if not e["confidential"]]
    return {
        "id": c.id, "project_id": c.project_id, "category": c.category, "text": c.text, "status": c.status,
        "evidence_status": c.evidence_status, "evidence_note": c.evidence_note, "details": get_details(c),
        "evidence": ev, "comment_count": len(c.comments),
        "reviewed_by": c.reviewed_by.name if c.reviewed_by else None, "reviewed_at": iso(c.reviewed_at),
        "created_at": iso(c.created_at), "updated_at": iso(c.updated_at),
    }


def snapshot_of(c: ExtractedClaim) -> dict[str, Any]:
    return {"text": c.text, "details": get_details(c), "status": c.status}


def claim_is_confidential(c: ExtractedClaim) -> bool:
    return bool(c.evidence) and all(e.source.confidential for e in c.evidence)


def claim_matches_user(c: ExtractedClaim, user: User) -> bool:
    """Contributors only see claims that name them (assignee, responsible person or contact)."""
    first = user.name.strip().lower()
    if not first:
        return False
    return any(isinstance(v, str) and first in v.lower() for v in get_details(c).values())


# ----------------------------------------------------------------------------
# evidence status
# ----------------------------------------------------------------------------
def refresh_statuses(db: Session, project_id: int) -> None:
    claims = db.query(ExtractedClaim).filter_by(project_id=project_id).all()
    groups: dict[int, list[ExtractedClaim]] = {}
    for c in claims:
        if c.conflict_group is not None and c.status != "rejected":
            groups.setdefault(c.conflict_group, []).append(c)
    for c in claims:
        others = [o for o in groups.get(c.conflict_group, []) if o.id != c.id] if c.conflict_group is not None else []
        n_sources = len({e.source_id for e in c.evidence})
        if c.status != "rejected" and others:
            c.evidence_status = "conflicting"
            c.evidence_note = f"Conflicts with: {others[0].text[:140]}"
        elif c.category == "question":
            c.evidence_status = "no_evidence"
            c.evidence_note = "The sources raise this question but nothing in them answers it."
        elif n_sources == 0:
            c.evidence_status, c.evidence_note = "no_evidence", "No supporting source was identified."
        elif n_sources >= 2:
            c.evidence_status, c.evidence_note = "verified", None
        else:
            c.evidence_status, c.evidence_note = "single_source", None


# ----------------------------------------------------------------------------
# reconstruction
# ----------------------------------------------------------------------------
def load_docs(db: Session, project_id: int) -> list[Doc]:
    docs: list[Doc] = []
    for s in db.query(Source).filter_by(project_id=project_id, status="processed").order_by(Source.id).all():
        d = s.document
        if d is None or not d.pages:
            continue
        pages = [
            Page(p["page"], p["text"], [Segment(sg["loc"], sg["text"], sg.get("author"), sg.get("date")) for sg in p["segments"]])
            for p in d.pages
        ]
        docs.append(Doc(s.id, s.name, s.source_type, s.confidential, d.author, d.doc_date, pages))
    return docs


def run_reconstruction(db: Session, project: Project, user: User, use_llm: bool = True) -> dict[str, Any]:
    settings = get_settings()
    docs = load_docs(db, project.id)
    all_sources = db.query(Source).filter_by(project_id=project.id).count()
    warnings: list[str] = []
    drafts: Optional[list[Draft]] = None
    mode = "rules"
    if use_llm and settings.llm_enabled:
        try:
            drafts, stats = llm.extract_llm(docs)
            mode = "llm"
            if stats["dropped"]:
                warnings.append(f"{stats['dropped']} LLM claim(s) were dropped because their quoted evidence was not found in the source text.")
        except llm.LLMError as exc:
            warnings.append(f"{exc} Rule-based extraction was used instead.")
    if drafts is None:
        drafts = extract_rules(docs)

    # Replace unreviewed claims; keep reviewed claims and any claim with comments.
    for c in db.query(ExtractedClaim).filter_by(project_id=project.id, status="pending").all():
        if not c.comments:
            db.delete(c)
    db.flush()
    kept = db.query(ExtractedClaim).filter_by(project_id=project.id).all()
    kept_tokens = [(k.category, tokens(k.text), k.text.strip().lower()) for k in kept]
    base_group = max([k.conflict_group or 0 for k in kept] + [0])

    created = 0
    by_category: dict[str, int] = {}
    high_risks = []
    for d in drafts:
        tk = tokens(d.text)
        if any(cat == d.category and (txt == d.text.strip().lower() or jaccard(tk, t2) >= 0.6) for cat, t2, txt in kept_tokens):
            continue
        claim = ExtractedClaim(
            project_id=project.id, category=d.category, text=d.text, status="pending", evidence_status=d.evidence_status,
            evidence_note=d.evidence_note, extracted_by=d.extracted_by, extra={},
            conflict_group=(base_group + d.conflict_group) if d.conflict_group else None,
        )
        set_details(claim, d.details)
        for e in d.evidence:
            claim.evidence.append(EvidenceReference(
                source_id=e["source_id"], quote=e["quote"], page=e.get("page"), location=e.get("location"),
                author=e.get("author"), ref_date=e.get("date"), reference=e["reference"],
            ))
        db.add(claim)
        created += 1
        by_category[d.category] = by_category.get(d.category, 0) + 1
        if d.category == "risk" and d.details.get("severity") == "high":
            high_risks.append(d.text)
    db.flush()
    refresh_statuses(db, project.id)

    project.last_recon_at, project.last_recon_mode, project.last_recon_claims = now(), mode, created
    if project.status == "planning":
        project.status = "in_progress"
    log_activity(db, project.id, user, "knowledge_extracted", f"Knowledge extraction completed: {created} claims ({mode})")
    for text in high_risks[:3]:
        log_activity(db, project.id, user, "risk_identified", f"Risk identified: {text[:120]}")
    db.commit()

    all_claims = db.query(ExtractedClaim).filter_by(project_id=project.id).all()
    es = {"verified": 0, "single_source": 0, "conflicting": 0, "no_evidence": 0}
    for c in all_claims:
        if c.status == "pending":
            es[c.evidence_status] = es.get(c.evidence_status, 0) + 1
    return {
        "mode": mode, "claims_created": created, "sources_used": len(docs), "sources_skipped": max(0, all_sources - len(docs)),
        "by_category": by_category, "evidence_status": es, "warnings": warnings,
    }


# ----------------------------------------------------------------------------
# handovers
# ----------------------------------------------------------------------------
def claim_lite(c: ExtractedClaim) -> dict[str, Any]:
    return {
        "id": c.id, "category": c.category, "text": c.text, "status": c.status, "evidence_status": c.evidence_status,
        "details": get_details(c), "evidence": [evidence_out(e) for e in c.evidence],
    }


def _refs(sections: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    seen, refs = set(), []
    for key in ("decisions", "responsibilities", "risks", "dependencies", "questions", "contacts"):
        for item in sections.get(key, []):
            for e in item["evidence"]:
                k = (e["source_id"], e["quote"])
                if k in seen:
                    continue
                seen.add(k)
                refs.append({"claim_id": item["id"], "source_name": e["source_name"], "page": e["page"], "quote": e["quote"], "reference": e["reference"]})
    return refs


def _first_week_plan(sec: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = [{
        "day": "Day 1", "title": "Read this handover and acknowledge receipt",
        "detail": "Read the decisions and the unresolved items first. Acknowledge receipt in NextOwner when you are done.", "claim_id": None,
    }]
    for c in sec["contacts"][:2]:
        d = c["details"]
        plan.append({"day": "Day 1", "title": f"Introduce yourself to {d.get('name') or c['text']}", "detail": f"Area: {d.get('area') or 'Unknown'}", "claim_id": c["id"]})
    for c in sorted(sec["responsibilities"], key=lambda x: x["details"].get("deadline") or "9999")[:3]:
        d = c["details"]
        plan.append({"day": "Day 2", "title": f"Confirm ownership: {c['text']}", "detail": f"Assigned to {d.get('assignee') or 'Unknown'}. Deadline: {d.get('deadline') or 'Unknown'}.", "claim_id": c["id"]})
    for c in sorted(sec["risks"], key=lambda x: 0 if x["details"].get("severity") == "high" else 1)[:2]:
        plan.append({"day": "Day 3", "title": f"Review risk: {c['text']}", "detail": f"Severity: {c['details'].get('severity') or 'Unknown'}. Mitigation: {c['details'].get('mitigation') or 'Unknown'}.", "claim_id": c["id"]})
    for c in sec["dependencies"][:2]:
        plan.append({"day": "Day 4", "title": f"Check dependency: {c['text']}", "detail": f"Component: {c['details'].get('component') or 'Unknown'}.", "claim_id": c["id"]})
    for c in (sec["questions"] + sec["unresolved"])[:3]:
        plan.append({"day": "Day 5", "title": f"Resolve open issue: {c['text']}", "detail": "Not confirmed in the sources. Ask the team lead before relying on it.", "claim_id": c["id"]})
    return plan


def build_handover_content(db: Session, project: Project) -> dict[str, Any]:
    claims = db.query(ExtractedClaim).filter_by(project_id=project.id).order_by(ExtractedClaim.id).all()
    sec: dict[str, list[dict[str, Any]]] = {k: [] for k in SECTIONS}
    unresolved: list[dict[str, Any]] = []
    approved = 0
    for c in claims:
        if c.status == "rejected":
            continue
        lite = claim_lite(c)
        if c.status in ("accepted", "edited") and c.evidence_status != "conflicting":
            sec[next(k for k, v in SECTIONS.items() if v == c.category)].append(lite)
            approved += 1
        else:
            unresolved.append(lite)  # pending, unknown or conflicting: shown, never presented as approved
    sec["unresolved"] = unresolved
    n_sources = db.query(Source).filter_by(project_id=project.id).count()
    overview = (
        f"{project.name}. {project.description or ''}".strip()
        + f"\nHandover from {project.owner.name} to {project.incoming_owner.name if project.incoming_owner else 'the incoming owner (not set)'}."
        + f"\nBuilt from {n_sources} source(s). {approved} claim(s) were approved by a reviewer. {len(unresolved)} item(s) remain unresolved and are listed separately."
    )
    content: dict[str, Any] = {"overview": overview, **{k: sec[k] for k in SECTIONS}, "unresolved": unresolved}
    content["evidence_refs"] = _refs(sec)
    content["first_week_plan"] = _first_week_plan(sec)
    return content


def filter_for_incoming(content: dict[str, Any]) -> dict[str, Any]:
    """Role-trim a stored handover: no confidential evidence, no pending claims."""
    withheld = 0

    def keep(item: dict[str, Any]) -> Optional[dict[str, Any]]:
        evs = [e for e in item["evidence"] if not e["confidential"]]
        if item["evidence"] and not evs:
            return None
        return {**item, "evidence": evs}

    out: dict[str, Any] = {"overview": content["overview"]}
    removed_ids: set[int] = set()
    for key in list(SECTIONS) + ["unresolved"]:
        items = content.get(key, [])
        if key == "unresolved":
            items = [i for i in items if i["status"] != "pending"]
        kept = []
        for i in items:
            k = keep(i)
            if k is None:
                withheld += 1
                removed_ids.add(i["id"])
            else:
                kept.append(k)
        out[key] = kept
    out["evidence_refs"] = _refs(out)
    out["first_week_plan"] = [p for p in content.get("first_week_plan", []) if p.get("claim_id") not in removed_ids]
    out["withheld_count"] = withheld
    return out


def handover_out(h: Handover, content: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return {
        "id": h.id, "project_id": h.project_id, "project_name": h.project.name, "version": h.version, "status": h.status,
        "content": content if content is not None else h.content, "generated_at": iso(h.created_at),
        "approved_by": h.approved_by.name if h.approved_by else None, "approved_at": iso(h.approved_at),
        "shared_at": iso(h.shared_at), "acknowledged_by": h.acknowledged_by.name if h.acknowledged_by else None,
        "acknowledged_at": iso(h.acknowledged_at),
    }
