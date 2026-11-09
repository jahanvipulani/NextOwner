from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.database.session import get_db
from app.models import Organisation, User
from app.schemas import LoginBody, RegisterBody
from app.services.projects import user_out

router = APIRouter(tags=["auth"])


@router.post("/auth/register")
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(409, "An account with this email already exists.")
    org_name = (body.organisation or "").strip() or "Independent"
    org = db.query(Organisation).filter_by(name=org_name).first() or Organisation(name=org_name)
    user = User(organisation=org, email=body.email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return {"access_token": create_access_token(user.id), "user": user_out(user)}


@router.post("/auth/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    return {"access_token": create_access_token(user.id), "user": user_out(user)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.get("/system")
def system():
    s = get_settings()
    return {
        "llm_enabled": s.llm_enabled, "llm_model": s.LLM_MODEL if s.llm_enabled else None,
        "max_upload_mb": s.MAX_UPLOAD_MB, "allowed_types": ["pdf", "docx", "txt"],
        "demo_mode": s.SEED_DEMO_DATA,
    }
