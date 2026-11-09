import os
import re
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_access, get_current_user
from app.core.config import get_settings
from app.database.session import get_db
from app.models import Document, EvidenceReference, ExtractedClaim, ProjectMember, Source, User
from app.schemas import GithubBody
from app.services import github
from app.services.ingestion import IngestError, finalize_pages, ingest_bytes
from app.services.ingestion import _paginate as paginate
from app.services.knowledge import iso, log_activity, refresh_statuses

router = APIRouter(tags=["sources"])
SOURCE_TYPES = {"document", "meeting_notes", "chat_export"}


def source_out(s: Source) -> dict:
    d = s.document
    return {
        "id": s.id, "project_id": s.project_id, "name": s.name, "source_type": s.source_type, "mime": d.mime if d else None,
        "size_bytes": d.size_bytes if d else 0, "page_count": d.page_count if d else None, "confidential": s.confidential,
        "uploaded_by": s.uploaded_by.name if s.uploaded_by else None, "created_at": iso(s.created_at),
        "status": s.status, "error": s.error, "origin": s.origin,
    }


@router.get("/projects/{project_id}/sources")
def list_sources(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("sources.read", "sources.connect")
    rows = db.query(Source).filter_by(project_id=project_id).order_by(Source.id.desc()).all()
    return [source_out(s) for s in rows]


@router.post("/projects/{project_id}/sources/upload", status_code=201)
async def upload_source(
    project_id: int,
    file: UploadFile = File(...),
    source_type: str = Form("document"),
    confidential: str = Form("false"),
    author: Optional[str] = Form(None),
    doc_date: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = get_access(db, user, project_id)
    a.require("sources.connect")
    settings = get_settings()
    if source_type not in SOURCE_TYPES:
        raise HTTPException(422, "Unknown source type")
    if doc_date and not re.match(r"^\d{4}-\d{2}-\d{2}$", doc_date):
        raise HTTPException(422, "Date must be YYYY-MM-DD")
    filename = os.path.basename(file.filename or "upload")
    try:
        from app.services.ingestion import file_type
        file_type(filename)
    except IngestError as exc:
        raise HTTPException(415, str(exc))
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is larger than {settings.MAX_UPLOAD_MB} MB.")
    try:
        res = ingest_bytes(filename, data)
    except IngestError as exc:
        raise HTTPException(422, str(exc))

    folder = Path(settings.UPLOAD_DIR) / str(project_id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = folder / f"{uuid.uuid4().hex}_{re.sub(r'[^A-Za-z0-9._-]', '_', filename)}"
    stored.write_bytes(data)

    src = Source(project_id=project_id, source_type=source_type, name=filename, confidential=confidential.lower() == "true",
                 uploaded_by_id=user.id, status="processed")
    src.document = Document(
        project_id=project_id, filename=filename, file_type=res["file_type"], mime=res["mime"], size_bytes=len(data),
        stored_path=str(stored), author=(author or "").strip() or None, doc_date=doc_date or None, pages=res["pages"],
        page_count=res["page_count"], redactions=res["redactions"],
    )
    db.add(src)
    masked = sum(res["redactions"].values())
    log_activity(db, project_id, user, "document_uploaded", f"Document uploaded: {filename}" + (f" ({masked} sensitive value(s) masked)" if masked else ""))
    db.commit()
    return source_out(src)


@router.post("/projects/{project_id}/sources/github", status_code=201)
def import_github(project_id: int, body: GithubBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("sources.connect")
    try:
        repo = github.parse_repo(body.repo)
        segs = github.fetch_repo(repo, body.max_items, get_settings().GITHUB_TOKEN)
    except github.GitHubError as exc:
        raise HTTPException(exc.status, str(exc))
    res = finalize_pages(paginate(segs), "txt")
    name = f"{repo} (GitHub)"
    existing = db.query(Source).filter_by(project_id=project_id, source_type="github", origin=f"https://github.com/{repo}").first()
    if existing:  # re-sync: replace the stored text, keep the same source id
        existing.document.pages, existing.document.page_count = res["pages"], res["page_count"]
        existing.document.redactions = res["redactions"]
        existing.document.updated_at = existing.updated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        src = existing
    else:
        src = Source(project_id=project_id, source_type="github", name=name, origin=f"https://github.com/{repo}", uploaded_by_id=user.id, status="processed")
        src.document = Document(
            project_id=project_id, filename=name, file_type="github", mime="application/vnd.github+json", size_bytes=sum(len(s["text"]) for s in segs),
            author=None, doc_date=None, pages=res["pages"], page_count=res["page_count"], redactions=res["redactions"],
        )
        db.add(src)
    log_activity(db, project_id, user, "source_connected", f"GitHub repository imported: {repo} ({len(segs)} items)")
    db.commit()
    return source_out(src)


@router.get("/sources/{source_id}")
def get_source(source_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    src = db.get(Source, source_id)
    if src is None:
        raise HTTPException(404, "Source not found")
    get_access(db, user, src.project_id).require("sources.read")
    pages = [{"page": p["page"], "text": p["text"]} for p in (src.document.pages if src.document else [])]
    return {"source": source_out(src), "pages": pages}


@router.delete("/sources/{source_id}")
def delete_source(source_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    src = db.get(Source, source_id)
    if src is None:
        raise HTTPException(404, "Source not found")
    a = get_access(db, user, src.project_id)
    a.require("sources.connect")
    pid, name = src.project_id, src.name
    stored = src.document.stored_path if src.document else None
    db.query(EvidenceReference).filter_by(source_id=source_id).delete()
    db.flush()
    # pending claims left with no evidence are removed; reviewed ones stay and show "No evidence"
    for c in db.query(ExtractedClaim).filter_by(project_id=pid, status="pending").all():
        if not c.evidence and not c.comments:
            db.delete(c)
    db.delete(src)
    db.flush()
    refresh_statuses(db, pid)
    log_activity(db, pid, user, "source_removed", f"Source removed: {name}")
    db.commit()
    if stored:
        try:
            Path(stored).unlink(missing_ok=True)
        except OSError:
            pass
    return {"ok": True}


@router.get("/integrations")
def integrations(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = get_access(db, user, project_id)
    a.require("sources.read", "sources.connect")
    srcs = db.query(Source).filter_by(project_id=project_id).all()

    def last(match) -> Optional[str]:
        ts = [s.updated_at for s in srcs if match(s)]
        return iso(max(ts)) if ts else None

    def ft(s: Source) -> str:
        return s.document.file_type if s.document else ""

    spec = [
        ("github", "GitHub", "Import README, pull requests, review comments and issues from a public repository.", True, lambda s: s.source_type == "github"),
        ("google_drive", "Google Drive", "Not available in this version. Export files and upload them instead.", False, lambda s: False),
        ("google_docs", "Google Docs", "Not available in this version. Download as DOCX and upload it instead.", False, lambda s: False),
        ("pdf", "PDF documents", "Upload PDFs. Page numbers are preserved for evidence links.", True, lambda s: ft(s) == "pdf"),
        ("docx", "DOCX documents", "Upload Word documents. Paragraph numbers are preserved.", True, lambda s: ft(s) == "docx"),
        ("txt", "TXT documents", "Upload plain text. Line numbers are preserved.", True, lambda s: ft(s) == "txt" and s.source_type == "document"),
        ("meeting_notes", "Meeting notes", "Upload notes as PDF, DOCX or TXT and tag them as meeting notes.", True, lambda s: s.source_type == "meeting_notes"),
        ("chat_export", "Chat exports", "Upload an exported chat as TXT and tag it as a chat export.", True, lambda s: s.source_type == "chat_export"),
    ]
    out = []
    for key, name, desc, impl, match in spec:
        has = any(match(s) for s in srcs)
        out.append({
            "key": key, "name": name, "description": desc, "implemented": impl,
            "status": "not_implemented" if not impl else ("connected" if has else "available"), "last_synced_at": last(match),
        })
    return out
