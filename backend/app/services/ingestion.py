"""Turn an uploaded file into numbered pages with source locations.

Page numbers are real for PDFs. TXT and DOCX have no pages, so they are split into
blocks of up to PAGE_BLOCK lines or paragraphs, and each segment keeps its line or
paragraph number as `loc`.
"""
from __future__ import annotations

import io
import re
import zipfile
from typing import Any

from app.services.extraction import redact

PAGE_BLOCK = 40
ALLOWED = {"pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "txt": "text/plain"}


class IngestError(ValueError):
    """Raised when a file cannot be read. The message is safe to show to the user."""


def file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED:
        raise IngestError("Unsupported file type. Upload a PDF, DOCX or TXT file.")
    return ext


def _check_magic(ext: str, data: bytes) -> None:
    if ext == "pdf" and not data.lstrip()[:5].startswith(b"%PDF"):
        raise IngestError("This file is not a valid PDF.")
    if ext == "docx" and not zipfile.is_zipfile(io.BytesIO(data)):
        raise IngestError("This file is not a valid DOCX document.")


def _paginate(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pages = []
    for i in range(0, len(segments), PAGE_BLOCK):
        chunk = segments[i:i + PAGE_BLOCK]
        pages.append({"page": len(pages) + 1, "text": "\n".join(s["text"] for s in chunk), "segments": chunk})
    return pages


def _read_txt(data: bytes) -> list[dict[str, Any]]:
    text = data.decode("utf-8", errors="replace")
    segs = []
    for n, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if line:
            segs.append({"loc": f"Line {n}", "text": line})
    return _paginate(segs)


def _read_docx(data: bytes) -> list[dict[str, Any]]:
    from docx import Document  # imported lazily so the module loads without python-docx

    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001
        raise IngestError("The DOCX file could not be read.") from exc
    segs = []
    n = 0
    for p in doc.paragraphs:
        n += 1
        t = p.text.strip()
        if t:
            segs.append({"loc": f"Paragraph {n}", "text": t})
    for ti, table in enumerate(doc.tables, start=1):
        for ri, row in enumerate(table.rows, start=1):
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                segs.append({"loc": f"Table {ti}, row {ri}", "text": " | ".join(cells)})
    return _paginate(segs)


def _read_pdf(data: bytes) -> list[dict[str, Any]]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise IngestError("The PDF is password protected.")
        pages = []
        for i, pg in enumerate(reader.pages, start=1):
            raw = (pg.extract_text() or "").strip()
            if not raw:
                continue
            joined = re.sub(r"(?<!\n)\n(?!\n)", " ", raw)  # undo line wrapping inside paragraphs
            segs = [{"loc": f"Page {i}", "text": joined}]
            pages.append({"page": i, "text": raw, "segments": segs})
        return pages
    except IngestError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise IngestError("The PDF could not be read.") from exc


def ingest_bytes(filename: str, data: bytes) -> dict[str, Any]:
    """Returns {file_type, mime, pages, page_count, redactions}. Text is redacted."""
    ext = file_type(filename)
    if not data:
        raise IngestError("The file is empty.")
    _check_magic(ext, data)
    pages = {"pdf": _read_pdf, "docx": _read_docx, "txt": _read_txt}[ext](data)
    if not pages:
        raise IngestError("No readable text was found. Scanned PDFs need OCR, which is not supported yet.")
    return finalize_pages(pages, ext)


def finalize_pages(pages: list[dict[str, Any]], ext: str) -> dict[str, Any]:
    totals = {"secret": 0, "email": 0, "phone": 0}
    for p in pages:
        p["text"], c = redact(p["text"])
        for k in totals:
            totals[k] += c[k]
        for s in p["segments"]:
            s["text"], _ = redact(s["text"])
    return {"file_type": ext, "mime": ALLOWED.get(ext, "text/plain"), "pages": pages, "page_count": len(pages), "redactions": totals}
