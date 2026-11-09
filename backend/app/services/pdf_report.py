"""Render a handover as a PDF with reportlab."""
from __future__ import annotations

import io
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROYAL = colors.HexColor("#3F5BBF")
CHARCOAL = colors.HexColor("#2A3748")
MUTED = colors.HexColor("#566478")

EVIDENCE_LABEL = {"verified": "Verified", "single_source": "Single source", "conflicting": "Conflicting", "no_evidence": "No evidence"}
REVIEW_LABEL = {"pending": "Pending review", "accepted": "Accepted", "edited": "Edited", "rejected": "Rejected", "unknown": "Unknown"}
DETAIL_LABELS = {
    "rationale": "Rationale", "decision_date": "Decision date", "responsible_person": "Responsible",
    "assignee": "Assigned to", "status": "Status", "deadline": "Deadline",
    "severity": "Severity", "impact": "Impact", "mitigation": "Mitigation",
    "related_task": "Related task", "component": "Component",
    "why_it_matters": "Why it matters", "related_source": "Source",
    "name": "Name", "role": "Role", "area": "Area", "contact_details": "Contact details",
}


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold", fontSize=22, textColor=CHARCOAL, alignment=0, spaceAfter=4),
        "sub": ParagraphStyle("s", parent=base["Normal"], fontSize=10, textColor=MUTED, spaceAfter=10),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=ROYAL, spaceBefore=14, spaceAfter=6),
        "body": ParagraphStyle("b", parent=base["Normal"], fontSize=10, leading=14),
        "claim": ParagraphStyle("c", parent=base["Normal"], fontSize=10, leading=14, fontName="Helvetica-Bold", spaceBefore=6),
        "meta": ParagraphStyle("m", parent=base["Normal"], fontSize=8.5, leading=12, textColor=MUTED, leftIndent=8),
        "quote": ParagraphStyle("q", parent=base["Normal"], fontName="Courier", fontSize=8, leading=11, textColor=MUTED, leftIndent=8),
    }


def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)


def _claim(story: list, st: dict[str, ParagraphStyle], c: dict[str, Any]) -> None:
    story.append(_p(c["text"], st["claim"]))
    story.append(_p(f"{EVIDENCE_LABEL.get(c.get('evidence_status'), '')}  |  {REVIEW_LABEL.get(c.get('status'), '')}", st["meta"]))
    for k, v in (c.get("details") or {}).items():
        if v:
            story.append(_p(f"{DETAIL_LABELS.get(k, k)}: {v}", st["meta"]))
    for ev in c.get("evidence", [])[:3]:
        story.append(_p(f"Source: {ev.get('reference')}", st["meta"]))
        story.append(_p(f"“{ev.get('quote')}”", st["quote"]))


def build_pdf(handover: dict[str, Any]) -> bytes:
    """handover: {project_name, version, status, approved_by, approved_at, shared_at, content}"""
    st = _styles()
    c = handover["content"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title=f"Handover: {handover['project_name']}", author="NextOwner")
    story: list = [
        _p(f"Handover: {handover['project_name']}", st["title"]),
        _p(f"Version {handover['version']}  |  Status: {handover['status'].title()}"
           + (f"  |  Approved by {handover['approved_by']}" if handover.get("approved_by") else "  |  NOT APPROVED"), st["sub"]),
        _p("Every claim below links to a source passage. Items marked Unknown, No evidence or Conflicting are not confirmed.", st["sub"]),
    ]
    story += [_p("1. Project overview", st["h2"]), _p(c.get("overview") or "No overview written.", st["body"])]
    sections = [
        ("2. Key decisions and rationale", c.get("decisions", [])),
        ("3. Current responsibilities", c.get("responsibilities", [])),
        ("4. Pending tasks", [r for r in c.get("responsibilities", []) if "done" not in (r.get("details", {}).get("status") or "").lower()]),
        ("5. Risks and blockers", c.get("risks", [])),
        ("6. Dependencies", c.get("dependencies", [])),
        ("7. Unresolved questions and open issues", list(c.get("questions", [])) + [u for u in c.get("unresolved", []) if all(u["id"] != q["id"] for q in c.get("questions", []))]),
        ("8. Important contacts", c.get("contacts", [])),
    ]
    for title, items in sections:
        story.append(_p(title, st["h2"]))
        if not items:
            story.append(_p("None recorded.", st["body"]))
        for it in items:
            _claim(story, st, it)
    story.append(_p("9. Evidence references", st["h2"]))
    refs = c.get("evidence_refs", [])
    if not refs:
        story.append(_p("None recorded.", st["body"]))
    for r in refs:
        story.append(_p(f"{r.get('reference')}", st["meta"]))
        story.append(_p(f"“{r.get('quote')}”", st["quote"]))
    story.append(_p("10. First-week action plan", st["h2"]))
    plan = c.get("first_week_plan", [])
    if not plan:
        story.append(_p("No plan written.", st["body"]))
    for item in plan:
        story.append(_p(f"{item.get('day')}: {item.get('title')}", st["claim"]))
        if item.get("detail"):
            story.append(_p(item["detail"], st["meta"]))
    story.append(Spacer(1, 10))
    doc.build(story)
    return buf.getvalue()
