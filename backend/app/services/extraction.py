"""Rule-based knowledge extraction.

Pure Python (standard library only) so it can be unit-tested without a database.

Pipeline: redact -> split into sentences -> classify -> consolidate across sources
-> detect conflicts -> assign an evidence status.

Nothing is invented: every claim carries the exact sentence it came from, and any
field the text does not state stays None (the UI shows "Unknown").
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

CATEGORIES = ["decision", "ownership", "risk", "dependency", "question", "contact"]

# ----------------------------------------------------------------------------
# Redaction: secrets, emails and phone numbers never reach the extractor or an LLM
# ----------------------------------------------------------------------------
_RX = [
    ("secret", re.compile(r"\b(?:sk|pk|rk|ghp|xox[bp])[_-][A-Za-z0-9_]{8,}\b")),
    ("secret", re.compile(r"\b(?:password|passwd|pwd|token|secret|api[_ -]?key)\s*[:=]\s*\S+", re.I)),
    ("email", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("phone", re.compile(r"(?<![\d-])\+?\d[\d ()-]{8,}\d(?![\d-])")),
]


def redact(text: str) -> tuple[str, dict[str, int]]:
    counts = {"secret": 0, "email": 0, "phone": 0}
    for kind, rx in _RX:
        def sub(m: re.Match[str], kind: str = kind) -> str:
            if kind == "phone":
                digits = re.sub(r"\D", "", m.group(0))
                if len(digits) < 9 or re.match(r"\d{4}-\d{2}-\d{2}", m.group(0)):
                    return m.group(0)
            counts[kind] += 1
            return f"[REDACTED:{kind}]"

        text = rx.sub(sub, text)
    return text, counts


# ----------------------------------------------------------------------------
# Input / output types
# ----------------------------------------------------------------------------
@dataclass
class Segment:
    loc: str
    text: str
    author: Optional[str] = None
    date: Optional[str] = None


@dataclass
class Page:
    page: int
    text: str
    segments: list[Segment]


@dataclass
class Doc:
    id: int
    name: str
    source_type: str
    confidential: bool
    author: Optional[str]
    date: Optional[str]
    pages: list[Page]


@dataclass
class Raw:
    """One classified sentence (or one LLM claim) before consolidation."""

    category: str
    text: str
    fields: dict[str, Any] = field(default_factory=dict)
    ref: Optional[str] = None
    owner: Optional[str] = None
    person: Optional[str] = None
    stance: Optional[str] = None
    unassigned: bool = False
    tokens: set[str] = field(default_factory=set)
    all_tokens: set[str] = field(default_factory=set)


@dataclass
class Draft:
    category: str
    text: str
    details: dict[str, Optional[str]]
    evidence: list[dict[str, Any]]
    evidence_status: str = "single_source"
    evidence_note: Optional[str] = None
    conflict_group: Optional[int] = None
    confidential: bool = False
    extracted_by: str = "rules"
    # internal merge state
    owner: Optional[str] = None
    person: Optional[str] = None
    stance: Optional[str] = None
    tokens: set[str] = field(default_factory=set)
    all_tokens: set[str] = field(default_factory=set)
    _team: bool = True


# ----------------------------------------------------------------------------
# Tokenising and similarity
# ----------------------------------------------------------------------------
_STOP = set(
    "the and for with that this from are was will has have not but its our you who what when after before until because "
    "into onto they them then than been being also just can should must need needs task due assigned all any too how why "
    "where which while would could there their here very more most some such only each other over under again further "
    "once about above below between both does did doing".split()
)


def tokens(text: str) -> set[str]:
    text = re.sub(r"\[redacted:\w+\]", " ", text.lower())
    out: set[str] = set()
    for w in re.split(r"[^a-z0-9]+", text):
        if not w or w in _STOP:
            continue
        if len(w) > 2 or re.match(r"v\d", w):
            out.add(w[:6])
    return out


def _inter(a: set[str], b: set[str]) -> int:
    return len(a & b)


def jaccard(a: set[str], b: set[str]) -> float:
    i = _inter(a, b)
    return i / max(1, len(a) + len(b) - i)


# ----------------------------------------------------------------------------
# Sentence classification
# ----------------------------------------------------------------------------
NAME = r"([A-Z][a-z]+(?: [A-Z][a-z]+)?)"
_EXPLICIT = re.compile(
    r"^(decision|agreed|resolved|action|todo|to-do|next step|risk|issue|warning|question|open question|dependency|owner)\s*:\s*(.+)$",
    re.I,
)
_EXMAP = {
    "decision": "decision", "agreed": "decision", "resolved": "decision",
    "action": "ownership", "todo": "ownership", "to-do": "ownership", "next step": "ownership",
    "risk": "risk", "issue": "risk", "warning": "risk",
    "question": "question", "open question": "question",
    "dependency": "dependency", "owner": "ownership",
}
_TASK = re.compile(r"^((?:TASK|TICKET|ISSUE|BUG)-\d+)\s+(.*)$", re.I)
_QUESTION = re.compile(r"\?\s*$|\b(open question|unclear|unknown|tbd|not sure|undecided|still need to decide)\b", re.I)
_DECISION = re.compile(
    r"\b(?:we|team|all) agreed\b|\bagreed (?:to|on|that)\b|\bdecided\b|\bwe chose\b|\bchose\b|\bgoing with\b|"
    r"\bsettled on\b|\bsigned off on\b|\bwe will\b|\bapproved\b",
    re.I,
)
_CONTACT = re.compile(r"\b(?:[Aa]sk|[Cc]ontact|[Tt]alk to|[Cc]heck with|[Rr]each out to)\s+" + NAME)
_OWNS = re.compile(r"^" + NAME + r"\s+(?:owns|is responsible for|maintains|is leading|will own|will handle)\b")
_RISK = re.compile(
    r"\b(risk|fragile|flaky|breaks?|broken|bug|fail(?:s|ed|ing|ure)?|outage|deprecated|vulnerab\w*|incident|silently|"
    r"drops?|nobody has|no one has|deadline|expires?|auto-renews|blocked|leaks?)\b",
    re.I,
)
_DEPENDENCY = re.compile(
    r"\b(depends? on|dependenc(?:y|ies)|relies on|rel(?:y|ies) on|waiting (?:on|for)|blocked by|requires?)\b", re.I
)
_ACTION = re.compile(r"\b(todo|to-do|next step|needs? to|must|should|follow[- ]?up|unassigned)\b", re.I)
_HIGH = re.compile(
    r"silently|deprecated|switched off|outage|data loss|breach|vulnerab|nobody has|no one has|auto-renews|fails whenever|"
    r"production",
    re.I,
)
_HOLD = re.compile(r"\b(hold|keep|pause|freeze|postpone|delay|defer|stay|remain|stop|do not|don't|never)\b", re.I)
_GO = re.compile(r"\b(migrat\w*|ship|switch|launch|move|roll ?out|upgrade|adopt|replace|start)\b", re.I)


def split_sentences(text: str) -> list[str]:
    out: list[str] = []
    for line in re.split(r"\n+", text):
        line = line.strip()
        if not line:
            continue
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])", line):
            s = s.strip()
            if s:
                out.append(s)
    return out


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def classify(sentence: str) -> Optional[Raw]:
    t = re.sub(r"^[-*•]\s+", "", sentence.strip())
    ref: Optional[str] = None
    cat: Optional[str] = None
    m = _TASK.match(t)
    if m:
        ref, t, cat = m.group(1).upper(), m.group(2), "ownership"
    else:
        m = _EXPLICIT.match(t)
        if m:
            cat, t = _EXMAP[m.group(1).lower()], m.group(2)
    if len(t.split()) < 4:
        return None
    if cat is None:
        if _QUESTION.search(t):
            cat = "question"
        elif _DECISION.search(t):
            cat = "decision"
        elif _CONTACT.search(t):
            cat = "contact"
        elif _OWNS.match(t):
            cat = "ownership"
        elif _RISK.search(t):
            cat = "risk"
        elif _DEPENDENCY.search(t):
            cat = "dependency"
        elif _ACTION.search(t):
            cat = "ownership"
    if cat is None:
        return None

    due = None
    d = re.search(r"\bdue (?:on )?(\d{4}-\d{2}-\d{2})", t, re.I)
    if d:
        due = d.group(1)
    assignee = None
    a = re.search(r"assigned to " + NAME, t)
    if a:
        assignee = a.group(1)
    unassigned = bool(re.search(r"\bunassigned\b|\bno owner\b", t, re.I))
    blocked = bool(re.search(r"blocked by", t, re.I))
    disp = re.sub(r"\s*[—-]+\s*(?:assigned to [^—.]+|due \d{4}-\d{2}-\d{2}|unassigned)", "", t, flags=re.I)
    disp = disp.rstrip(".").strip()

    raw = Raw(category=cat, text=_cap(disp), ref=ref)
    clause = disp
    f: dict[str, Any] = {}

    if cat == "decision":
        parts = re.split(r",?\s*\b(?:because|since)\b\s*", disp, maxsplit=1, flags=re.I)
        clause = parts[0]
        raw.text = _cap(clause)
        f["rationale"] = parts[1].rstrip(".") if len(parts) > 1 else None
    elif cat == "ownership":
        o = _OWNS.match(t)
        owner = assignee or (o.group(1) if o else None)
        if not owner:
            n = re.search(NAME, t)
            owner = n.group(1) if (n and re.match(r"owner\b", sentence, re.I)) else None
        raw.owner = owner
        f["assignee"] = owner
        f["deadline"] = due
        if unassigned and not owner:
            f["status"] = "Unassigned"
        elif blocked:
            f["status"] = "Blocked"
        elif owner:
            f["status"] = "Assigned"
        else:
            f["status"] = None
        raw.unassigned = unassigned and not owner
    elif cat == "risk":
        f["severity"] = "high" if _HIGH.search(t) else None
        im = re.search(r"\b(?:which|so that|meaning|causing)\b\s+(.+)$", disp, re.I)
        f["impact"] = im.group(1).rstrip(".") if im else None
        mt = re.search(r"\b(?:mitigat\w*|workaround)\s*[:\-]\s*(.+)$", disp, re.I)
        f["mitigation"] = mt.group(1).rstrip(".") if mt else None
    elif cat == "dependency":
        comp = re.search(r"\b(?:depends? on|relies on|rel(?:y|ies) on|blocked by|waiting (?:on|for)|requires?)\s+(.+)$", disp, re.I)
        f["component"] = comp.group(1).rstrip(".") if comp else None
        subj = re.match(NAME + r"\s+(?:depends?|relies|is waiting|is blocked|needs)", disp)
        f["responsible_person"] = subj.group(1) if subj else None
        f["related_task"] = ref
    elif cat == "question":
        f["why_it_matters"] = None
        who = re.search(r"\bwho (?:will|should) (?:own|answer|decide|handle)\b", disp, re.I)
        f["responsible_person"] = None if who else None
    elif cat == "contact":
        p = _CONTACT.search(t)
        raw.person = p.group(1) if p else None
        tp = re.search(r"\b(?:about|for|on)\s+(.+?)\.?$", t, re.I)
        f["name"] = raw.person
        f["role"] = None
        f["area"] = tp.group(1) if tp else None
        f["contact_details"] = None
        raw.text = f"{raw.person}: {f['area']}" if f.get("area") else str(raw.person)

    raw.fields = f
    raw.stance = "hold" if _HOLD.search(clause) else ("go" if _GO.search(clause) else None)
    raw.tokens = tokens(clause)
    raw.all_tokens = tokens(disp)
    return raw


# ----------------------------------------------------------------------------
# Consolidation, conflicts and evidence status
# ----------------------------------------------------------------------------
def _same(x: Draft, r: Raw) -> bool:
    if r.category == "contact":
        return bool(x.person and r.person and x.person.lower() == r.person.lower())
    if r.category == "ownership" and x.owner and r.owner and x.owner.lower() != r.owner.lower():
        return False
    i = _inter(x.tokens, r.tokens)
    return jaccard(x.tokens, r.tokens) >= 0.4 or i >= 4


def consolidate(candidates: list[tuple[Raw, dict[str, Any]]], extracted_by: str = "rules") -> list[Draft]:
    """candidates: (raw claim, evidence dict). Evidence must hold source_id and confidential."""
    drafts: list[Draft] = []
    for raw, ev in candidates:
        team = not ev.get("confidential", False)
        host = next((d for d in drafts if d.category == raw.category and _same(d, raw)), None)
        if host is None:
            drafts.append(
                Draft(
                    category=raw.category, text=raw.text, details=dict(raw.fields), evidence=[ev],
                    extracted_by=extracted_by, owner=raw.owner, person=raw.person, stance=raw.stance,
                    tokens=set(raw.tokens), all_tokens=set(raw.all_tokens), _team=team,
                )
            )
            continue
        if not any(e["source_id"] == ev["source_id"] and e["quote"] == ev["quote"] for e in host.evidence):
            host.evidence.append(ev)
        better = (team and not host._team) or (team == host._team and len(raw.text) > len(host.text))
        if better:
            host.text = raw.text
            host._team = team or host._team
        for k, v in raw.fields.items():  # fill unknowns from later sentences
            if host.details.get(k) in (None, "") and v not in (None, ""):
                host.details[k] = v
        if raw.category == "contact" and raw.fields.get("area"):
            areas = [a for a in (host.details.get("area") or "").split("; ") if a]
            if raw.fields["area"] not in areas:
                areas.append(raw.fields["area"])
            host.details["area"] = "; ".join(areas)
            host.text = f"{host.person}: {host.details['area']}"
        host.owner = host.owner or raw.owner
        host.tokens |= raw.tokens
        host.all_tokens |= raw.all_tokens

    _detect_conflicts(drafts)
    for d in drafts:
        d.confidential = all(e.get("confidential") for e in d.evidence)
        dates = sorted(e["date"] for e in d.evidence if e.get("date"))
        if d.category == "decision":
            d.details["decision_date"] = d.details.get("decision_date") or (dates[0] if dates else None)
            d.details.setdefault("responsible_person", None)
        if d.category == "question":
            d.details["related_source"] = d.evidence[0]["source_name"] if d.evidence else None
        if d.category == "risk" and d.details.get("severity") not in ("low", "medium", "high"):
            d.details["severity"] = None
        _status(d)
    return drafts


def _detect_conflicts(drafts: list[Draft]) -> None:
    group = 0
    for i, a in enumerate(drafts):
        for b in drafts[i + 1:]:
            if a.category not in ("decision", "ownership") or b.category not in ("decision", "ownership"):
                continue
            if not a.stance or not b.stance or a.stance == b.stance:
                continue
            sh = _inter(a.all_tokens, b.all_tokens)
            if sh >= 2 and sh / max(1, min(len(a.all_tokens), len(b.all_tokens))) >= 0.25:
                gid = a.conflict_group or b.conflict_group
                if gid is None:
                    group += 1
                    gid = group
                a.conflict_group = b.conflict_group = gid


def _status(d: Draft) -> None:
    if d.conflict_group is not None:
        d.evidence_status = "conflicting"
        d.evidence_note = "Another source points in the opposite direction. A reviewer must decide which is current."
    elif d.category == "question":
        d.evidence_status = "no_evidence"
        d.evidence_note = "The sources raise this question but nothing in them answers it."
    elif len({e["source_id"] for e in d.evidence}) >= 2:
        d.evidence_status = "verified"
    else:
        d.evidence_status = "single_source"


# ----------------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------------
def make_reference(doc_name: str, source_type: str, loc: str) -> str:
    if source_type == "github":
        return f"GitHub {loc}"
    return f"{doc_name}, {loc}"


def sentences_for_doc(doc: Doc) -> list[tuple[str, int, Segment]]:
    out = []
    for page in doc.pages:
        for seg in page.segments:
            for s in split_sentences(seg.text):
                out.append((s, page.page, seg))
    return out


def evidence_for(doc: Doc, sentence: str, page: int, seg: Segment) -> dict[str, Any]:
    return {
        "source_id": doc.id,
        "source_name": doc.name,
        "source_type": doc.source_type,
        "quote": sentence,
        "page": page,
        "location": seg.loc,
        "author": seg.author or doc.author,
        "date": seg.date or doc.date,
        "reference": make_reference(doc.name, doc.source_type, seg.loc),
        "confidential": doc.confidential,
    }


def extract_rules(docs: list[Doc]) -> list[Draft]:
    cands: list[tuple[Raw, dict[str, Any]]] = []
    for doc in docs:
        for s, page, seg in sentences_for_doc(doc):
            raw = classify(s)
            if raw:
                cands.append((raw, evidence_for(doc, s, page, seg)))
    return consolidate(cands, "rules")
