# NextOwner

Evidence-linked, permission-aware project handovers. Sources go in, claims come out with the passage they came from, a human reviews every claim, and only approved, role-trimmed content reaches the incoming owner.

Team Invictus · Round 2 functional MVP. All demonstration data is synthetic.

## Run it

Requires Docker Desktop (or Docker Engine with the Compose plugin).

```bash
docker compose up --build        # foreground
docker compose up -d --build     # background
docker compose logs -f           # follow logs
docker compose down              # stop, keeps database and uploads
docker compose down -v           # stop AND DELETE the database and uploaded files (intentional resets only)
```

Optional: `cp .env.example .env` and edit it. It also runs without a `.env`, using local-only defaults.

| What | Where |
| --- | --- |
| App | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

PostgreSQL is not published to the host. Only the backend reaches it, over the internal Docker network. Data lives in the `pgdata` volume; uploads live in the `uploads` volume.

## Demo accounts

Password for all four: `Demo@12345`

| Role | Email | Try this |
| --- | --- | --- |
| Team Lead | lead@demo.nextowner.dev | Everything: upload, reconstruct, approve, share |
| Reviewer | reviewer@demo.nextowner.dev | Accept, edit, reject claims; approves if the lead allows |
| Contributor | contributor@demo.nextowner.dev | Sees only claims assigned to them, no confidential evidence |
| Incoming Owner | incoming@demo.nextowner.dev | Sees only shared, approved handovers |

The project "Student Research Portal" is preloaded (3 source documents, claims already extracted by the rule-based extractor, all pending review). Registration creates a fresh workspace where you are team lead.

## Judge walkthrough (about 5 minutes)

1. Log in as the team lead. The dashboard numbers come from the database.
2. Open **Connect Sources**, drop in a PDF, DOCX or TXT (optional), then open **Knowledge Reconstruction** and press the button.
3. Open **Evidence Explorer**. Filter by type or status, open a claim, and read the highlighted original passage. One claim is *Conflicting*, two questions are *No evidence*.
4. Open **Review Workspace**. Accept, edit, reject or mark unknown. Add a comment. Check the review history tab.
5. Open **Handover Reports → Generate Handover**. Generate, edit the overview, approve, download the PDF, share.
6. Log out, log in as `incoming@demo.nextowner.dev`, open the handover, check that confidential evidence is withheld, and acknowledge receipt.

## Architecture

```
React + Vite + TS + Tailwind  --nginx /api-->  FastAPI  --SQLAlchemy-->  PostgreSQL
 (port 3000)                                   (port 8000)                (internal only)
                                                  |-- ingestion (PDF/DOCX/TXT, page-aware, masks secrets/emails/phones)
                                                  |-- extraction (rule-based, or LLM if LLM_API_KEY is set)
                                                  |-- evidence linking, conflict detection, review history
                                                  |-- handover builder, role filter, PDF (reportlab)
```

Data flow: upload → text per page (sensitive values masked) → sentence segments → claims with evidence references → evidence status (verified / single source / conflicting / no evidence) → human review → draft handover from accepted and edited claims → approval → share → filtered incoming view.

Key decisions:
- **No source, no statement.** Every claim stores the exact passage, source, page and reference. The LLM path rejects any claim whose quoted passage is not found verbatim in the source.
- **Unknown stays unknown.** Missing fields are `null` and shown as "Unknown". Nothing is guessed.
- **Permissions are enforced in the API** (`app/core/rbac.py`, `app/api/deps.py`), not only hidden in the UI.
- **Approval gate.** Pending claims never enter approved sections; they appear as unresolved.
- **Matte theme.** Charcoal blue, royal blue and bubblegum pink from the Round 1 deck, flat fills, no shadows or gradients.

## Technology and external services

FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16, PyJWT, bcrypt, pypdf, python-docx, reportlab, httpx; React 18, Vite, TypeScript, Tailwind CSS, React Router, Axios, Recharts, Lucide; nginx; Docker Compose.
Optional: Anthropic Messages API (`LLM_API_KEY`) for extraction. Optional: GitHub REST API for importing a public repository's issues and pull requests (`GITHUB_TOKEN` raises rate limits).

## Implemented

Login and registration (JWT, bcrypt) · four project roles enforced by the API · dashboard with real statistics, project search/filter/sort, activity, notifications, progress chart · project creation with members · PDF/DOCX/TXT upload with type and size validation, progress bar, page-aware text extraction, masking of secrets/emails/phones · GitHub public repository import · knowledge reconstruction for six categories · evidence explorer with filters and original-source view · review workspace with accept/edit/reject/unknown, comments, clarification requests, history with previous and updated values · handover generation, edit, save draft, approve, PDF download, share · incoming owner view with first-week checklist and acknowledgement · synthetic demo data and accounts · backend and frontend tests.

## Not implemented (and not claimed)

- Google Drive and Google Docs connectors: shown as "not implemented" on the Connect Sources page.
- Redis, Celery and pgvector: not used. Reconstruction runs synchronously, which is fine at MVP scale. Semantic retrieval is not needed by the rule-based path.
- Expiring share links, SSO, email delivery, and a live diff when sources change.
- Alembic: the first revision creates the schema from the models; later changes need new revisions.
- Gap interview and a conversational Q&A over approved content (planned for Round 3).

## Honest status of testing

This code was written in an environment without Docker, npm or network access. What was actually run there: the pure service tests (`pytest backend/tests/test_services.py`: 8 passing), Python compilation of every backend file, a syntax check of every TypeScript file, and `docker compose config` validation. **Not run there:** the API tests, the frontend build and tests, the Docker build, the LLM path and the GitHub import. Please run the checks below on your machine and report any failure.

```bash
docker compose up --build                                   # full stack
docker compose run --rm backend pytest -q                   # backend tests (service + API)
cd frontend && npm install && npm run typecheck && npm test # frontend
```

## Layout

```
backend/app/{api,models,schemas,services,core,database}   backend/alembic   backend/tests
frontend/src/{components,pages,layouts,hooks,services,context,types,utils}
docker-compose.yml  .env.example  API.md
```

API reference: `API.md` (contract) and the live Swagger UI at `/docs`.
