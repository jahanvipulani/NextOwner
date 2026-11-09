"""Unit tests for the pure service layer (no database needed)."""
import io

import pytest

from app.services import demo_data
from app.services.extraction import Doc, Page, Segment, classify, extract_rules, redact, split_sentences
from app.services.ingestion import IngestError, ingest_bytes
from app.services.pdf_report import build_pdf


def demo_docs() -> list[Doc]:
    docs = []
    for i, d in enumerate(demo_data.DEMO_DOCS, start=1):
        res = ingest_bytes(d["filename"], d["text"].encode())
        pages = [Page(p["page"], p["text"], [Segment(**s) for s in p["segments"]]) for p in res["pages"]]
        docs.append(Doc(i, d["filename"], d["source_type"], d["confidential"], d["author"], d["doc_date"], pages))
    return docs


def test_redaction_masks_secrets_emails_phones_but_not_dates():
    text, counts = redact("Key sk_test_ABCDEF123456 mail a.b@uni.edu call 98765 43210 on 2026-02-11")
    assert "sk_test" not in text and "@" not in text and "98765" not in text
    assert counts == {"secret": 1, "email": 1, "phone": 1}
    assert "2026-02-11" in text


def test_sentence_split_and_classify():
    assert len(split_sentences("One thing. Another thing here.\nThird line")) == 3
    d = classify("Decision: keep v1 until sign off, because v2 differs.")
    assert d and d.category == "decision" and d.fields["rationale"] == "v2 differs"
    assert classify("Open question: who owns the queue now?").category == "question"
    t = classify("TASK-12 Migrate attachments to the new API — assigned to Dev Anand — due 2026-02-27.")
    assert t.category == "ownership" and t.owner == "Dev Anand" and t.fields["deadline"] == "2026-02-27"
    assert classify("Nothing interesting is said in this sentence at all.") is None


def test_unknown_stays_unknown_not_invented():
    r = classify("Risk: the cache layer is flaky under load.")
    assert r.fields["severity"] is None and r.fields["mitigation"] is None and r.fields["impact"] is None


def test_demo_documents_produce_the_expected_knowledge():
    drafts = extract_rules(demo_docs())
    by = {}
    for d in drafts:
        by.setdefault(d.category, []).append(d)
    assert len(by["decision"]) >= 3
    assert len(by["ownership"]) >= 4
    assert len(by["risk"]) >= 2
    assert len(by["dependency"]) == 2
    assert len(by["question"]) == 2
    assert len(by["contact"]) >= 1
    for d in drafts:
        assert d.evidence, "every claim needs evidence"
        for e in d.evidence:
            assert e["quote"] and e["reference"]


def test_verified_conflicting_and_no_evidence_statuses():
    drafts = extract_rules(demo_docs())
    statuses = {d.evidence_status for d in drafts}
    assert {"verified", "single_source", "conflicting", "no_evidence"} <= statuses
    keep = [d for d in drafts if "legacy upload API" in d.text and d.category == "decision"]
    assert keep and keep[0].conflict_group is not None
    assert len({e["source_id"] for e in keep[0].evidence}) == 2
    assert all(d.evidence_status == "no_evidence" for d in drafts if d.category == "question")


def test_confidential_only_claims_are_flagged():
    drafts = extract_rules(demo_docs())
    conf = [d for d in drafts if d.confidential]
    assert conf and all(all(e["confidential"] for e in d.evidence) for d in conf)
    assert not any("98765" in e["quote"] for d in drafts for e in d.evidence)


def test_txt_docx_pdf_ingestion():
    res = ingest_bytes("a.txt", b"First line\nDecision: keep the old API until March, because it works.")
    assert res["page_count"] == 1 and res["pages"][0]["segments"][1]["loc"] == "Line 2"

    from docx import Document
    buf = io.BytesIO()
    doc = Document()
    doc.add_paragraph("Risk: the backup job fails whenever the disk is full.")
    doc.save(buf)
    res = ingest_bytes("a.docx", buf.getvalue())
    assert res["pages"][0]["segments"][0]["loc"].startswith("Paragraph")

    pdf = build_pdf({"project_name": "Demo", "version": 1, "status": "draft", "approved_by": None,
                     "content": {"overview": "Hello world overview text.", "decisions": [], "responsibilities": [],
                                 "risks": [], "dependencies": [], "questions": [], "unresolved": [], "contacts": [],
                                 "evidence_refs": [], "first_week_plan": []}})
    assert pdf.startswith(b"%PDF")
    res = ingest_bytes("a.pdf", pdf)
    assert res["pages"][0]["segments"][0]["loc"] == "Page 1"
    assert "Hello world overview" in res["pages"][0]["text"]


def test_ingestion_rejects_bad_files():
    for name, data in [("a.exe", b"x"), ("a.txt", b""), ("a.pdf", b"not a pdf"), ("a.docx", b"not a zip")]:
        with pytest.raises(IngestError):
            ingest_bytes(name, data)
