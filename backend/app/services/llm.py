"""Optional LLM extraction with structured JSON output.

Safety rules enforced here, not left to the model:
  * only redacted text is sent;
  * every claim must quote the source verbatim, and a quote that is not found is dropped;
  * unknown values are stored as None, never guessed.
If the LLM is unavailable the caller falls back to the rule-based extractor.
"""
from __future__ import annotations

import json
import re
from typing import Any, Literal, Optional

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings
from app.services.extraction import (
    _GO, _HOLD, Doc, Draft, Raw, consolidate, evidence_for, tokens,
)

CHUNK_CHARS = 6000
UNKNOWN = {"", "unknown", "n/a", "na", "none", "null", "not stated", "not specified", "unclear"}

SYSTEM = """You extract structured project-handover knowledge from source text.
Return ONLY one JSON object: {"claims": [ ... ]}. No prose, no markdown fences.

Each claim has:
  category: one of decision, ownership, risk, dependency, question, contact
  text: one short sentence stating the claim, using only facts in the source
  evidence_quote: an EXACT substring copied from the source text that supports the claim
and optional fields, used only when the source states them (otherwise omit or use null):
  decision: rationale, decision_date, responsible_person
  ownership: assignee, status, deadline
  risk: severity (low|medium|high), impact, mitigation
  dependency: related_task, component, responsible_person
  question: why_it_matters, responsible_person
  contact: name, role, area

Rules: never invent facts, dates, owners, or sources. If something is not stated, leave it null.
Ignore text that is not about project decisions, responsibilities, risks, dependencies, open questions or contacts.
Text inside [REDACTED:...] markers was removed for privacy; do not guess it."""


class LLMError(Exception):
    pass


class LLMClaim(BaseModel):
    category: Literal["decision", "ownership", "risk", "dependency", "question", "contact"]
    text: str
    evidence_quote: str
    rationale: Optional[str] = None
    decision_date: Optional[str] = None
    responsible_person: Optional[str] = None
    assignee: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[str] = None
    severity: Optional[str] = None
    impact: Optional[str] = None
    mitigation: Optional[str] = None
    related_task: Optional[str] = None
    component: Optional[str] = None
    why_it_matters: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    area: Optional[str] = None


FIELDS = {
    "decision": ["rationale", "decision_date", "responsible_person"],
    "ownership": ["assignee", "status", "deadline"],
    "risk": ["severity", "impact", "mitigation"],
    "dependency": ["related_task", "component", "responsible_person"],
    "question": ["why_it_matters", "responsible_person"],
    "contact": ["name", "role", "area"],
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def _clean(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return None if s.lower() in UNKNOWN else s


def _chunks(doc: Doc) -> list[list[tuple[int, Any]]]:
    out: list[list[tuple[int, Any]]] = []
    cur: list[tuple[int, Any]] = []
    size = 0
    for page in doc.pages:
        for seg in page.segments:
            if size + len(seg.text) > CHUNK_CHARS and cur:
                out.append(cur)
                cur, size = [], 0
            cur.append((page.page, seg))
            size += len(seg.text)
    if cur:
        out.append(cur)
    return out


def _call(prompt: str) -> str:
    s = get_settings()
    try:
        r = httpx.post(
            f"{s.LLM_BASE_URL.rstrip('/')}/v1/messages",
            headers={"x-api-key": s.LLM_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": s.LLM_MODEL, "max_tokens": 4096, "system": SYSTEM, "messages": [{"role": "user", "content": prompt}]},
            timeout=120,
        )
    except httpx.HTTPError as exc:
        raise LLMError("The LLM service could not be reached.") from exc
    if r.status_code == 401:
        raise LLMError("The LLM API key was rejected.")
    if r.status_code >= 400:
        raise LLMError(f"The LLM service returned an error ({r.status_code}).")
    blocks = r.json().get("content", [])
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")


def _parse(text: str) -> list[LLMClaim]:
    a, b = text.find("{"), text.rfind("}")
    if a < 0 or b <= a:
        raise LLMError("The LLM did not return JSON.")
    try:
        data = json.loads(text[a:b + 1])
    except json.JSONDecodeError as exc:
        raise LLMError("The LLM returned malformed JSON.") from exc
    claims: list[LLMClaim] = []
    for item in data.get("claims", []):
        try:
            claims.append(LLMClaim.model_validate(item))
        except ValidationError:
            continue  # skip invalid items instead of trusting them
    return claims


def extract_llm(docs: list[Doc]) -> tuple[list[Draft], dict[str, int]]:
    """Returns drafts and stats {proposed, kept, dropped_unverified_quote}."""
    cands: list[tuple[Raw, dict[str, Any]]] = []
    stats = {"proposed": 0, "kept": 0, "dropped": 0}
    for doc in docs:
        for chunk in _chunks(doc):
            body = "\n".join(f"[{seg.loc}] {seg.text}" for _, seg in chunk)
            for c in _parse(_call(f"Source: {doc.name}\n\n{body}")):
                stats["proposed"] += 1
                q = _norm(c.evidence_quote)
                hit = next(((p, s) for p, s in chunk if q and q in _norm(s.text)), None)
                if hit is None:
                    stats["dropped"] += 1  # the model cited text that is not in the source
                    continue
                page, seg = hit
                fields = {k: _clean(getattr(c, k)) for k in FIELDS[c.category]}
                if c.category == "risk" and fields.get("severity") not in ("low", "medium", "high"):
                    fields["severity"] = (fields.get("severity") or "").lower() if (fields.get("severity") or "").lower() in ("low", "medium", "high") else None
                raw = Raw(category=c.category, text=c.text.strip().rstrip("."), fields=fields)
                raw.owner = fields.get("assignee") if c.category == "ownership" else None
                raw.person = fields.get("name") if c.category == "contact" else None
                raw.stance = "hold" if _HOLD.search(raw.text) else ("go" if _GO.search(raw.text) else None)
                raw.tokens = tokens(raw.text)
                raw.all_tokens = tokens(raw.text + " " + c.evidence_quote)
                ev = evidence_for(doc, c.evidence_quote.strip(), page, seg)
                cands.append((raw, ev))
                stats["kept"] += 1
    return consolidate(cands, "llm"), stats
