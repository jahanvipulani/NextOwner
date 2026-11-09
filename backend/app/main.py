from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, handovers, knowledge, projects, sources
from app.core.config import get_settings
from app.database.session import Base, SessionLocal, engine
from app.seed import ensure_roles, seed_demo


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Migrations normally create the schema (see start.sh). create_all is a safe no-op afterwards
    # and keeps `uvicorn app.main:app` working on a fresh SQLite file for local development.
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_roles(db)
        if get_settings().SEED_DEMO_DATA:
            seed_demo(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="NextOwner API", version="0.2.0", lifespan=lifespan,
    description="Evidence-linked, permission-aware project handovers. Authorize with a Bearer token from POST /api/auth/login.",
)
app.add_middleware(
    CORSMiddleware, allow_origins=[o.strip() for o in get_settings().CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
for r in (auth.router, projects.router, sources.router, knowledge.router, handovers.router):
    app.include_router(r, prefix="/api")


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}
