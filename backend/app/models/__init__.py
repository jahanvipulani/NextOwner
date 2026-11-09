"""SQLAlchemy models. 21 tables, as listed in the Round 2 brief."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Organisation(Base, Timestamps):
    __tablename__ = "organisations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)


class User(Base, Timestamps):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    organisation_id: Mapped[int] = mapped_column(ForeignKey("organisations.id"))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    organisation: Mapped[Organisation] = relationship()


class Role(Base, Timestamps):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    label: Mapped[str] = mapped_column(String(100))
    permissions: Mapped[list["Permission"]] = relationship(back_populates="role", cascade="all, delete-orphan")


class Permission(Base, Timestamps):
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("role_id", "key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    key: Mapped[str] = mapped_column(String(80))
    role: Mapped[Role] = relationship(back_populates="permissions")


class Project(Base, Timestamps):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    organisation_id: Mapped[int] = mapped_column(ForeignKey("organisations.id"))
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="planning", index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    incoming_owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    start_date: Mapped[Optional[str]] = mapped_column(String(10))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    last_recon_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_recon_mode: Mapped[Optional[str]] = mapped_column(String(10))
    last_recon_claims: Mapped[Optional[int]] = mapped_column(Integer)
    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    incoming_owner: Mapped[Optional[User]] = relationship(foreign_keys=[incoming_owner_id])
    members: Mapped[list["ProjectMember"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base, Timestamps):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    can_approve: Mapped[bool] = mapped_column(Boolean, default=False)
    project: Mapped[Project] = relationship(back_populates="members")
    user: Mapped[User] = relationship()
    role: Mapped[Role] = relationship()


class Source(Base, Timestamps):
    """A connection to project material: an upload or an imported repository."""
    __tablename__ = "sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(30))  # document | meeting_notes | chat_export | github
    name: Mapped[str] = mapped_column(String(300))
    origin: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="processed")
    error: Mapped[Optional[str]] = mapped_column(Text)
    confidential: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    uploaded_by: Mapped[Optional[User]] = relationship()
    document: Mapped[Optional["Document"]] = relationship(back_populates="source", uselist=False, cascade="all, delete-orphan")


class Document(Base, Timestamps):
    """The stored file and its extracted, redacted text."""
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), unique=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    file_type: Mapped[str] = mapped_column(String(10))
    mime: Mapped[Optional[str]] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    stored_path: Mapped[Optional[str]] = mapped_column(String(500))
    author: Mapped[Optional[str]] = mapped_column(String(200))
    doc_date: Mapped[Optional[str]] = mapped_column(String(10))
    pages: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    redactions: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)
    source: Mapped[Source] = relationship(back_populates="document")


class ExtractedClaim(Base, Timestamps):
    __tablename__ = "extracted_claims"
    __table_args__ = (Index("ix_claims_project_status", "project_id", "status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(20), index=True)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # review status
    evidence_status: Mapped[str] = mapped_column(String(20), default="single_source")
    evidence_note: Mapped[Optional[str]] = mapped_column(Text)
    conflict_group: Mapped[Optional[int]] = mapped_column(Integer)
    extracted_by: Mapped[str] = mapped_column(String(10), default="rules")
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # contact fields
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[Optional[User]] = relationship()
    evidence: Mapped[list["EvidenceReference"]] = relationship(back_populates="claim", cascade="all, delete-orphan", order_by="EvidenceReference.id")
    decision: Mapped[Optional["Decision"]] = relationship(uselist=False, cascade="all, delete-orphan")
    responsibility: Mapped[Optional["Responsibility"]] = relationship(uselist=False, cascade="all, delete-orphan")
    risk: Mapped[Optional["Risk"]] = relationship(uselist=False, cascade="all, delete-orphan")
    dependency: Mapped[Optional["Dependency"]] = relationship(uselist=False, cascade="all, delete-orphan")
    question: Mapped[Optional["OpenQuestion"]] = relationship(uselist=False, cascade="all, delete-orphan")
    comments: Mapped[list["ReviewComment"]] = relationship(cascade="all, delete-orphan", order_by="ReviewComment.id")
    history: Mapped[list["ReviewHistory"]] = relationship(cascade="all, delete-orphan", order_by="ReviewHistory.id")


class EvidenceReference(Base, Timestamps):
    __tablename__ = "evidence_references"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True)
    quote: Mapped[str] = mapped_column(Text)
    page: Mapped[Optional[int]] = mapped_column(Integer)
    location: Mapped[Optional[str]] = mapped_column(String(100))
    author: Mapped[Optional[str]] = mapped_column(String(200))
    ref_date: Mapped[Optional[str]] = mapped_column(String(10))
    reference: Mapped[str] = mapped_column(String(500))
    claim: Mapped[ExtractedClaim] = relationship(back_populates="evidence")
    source: Mapped[Source] = relationship()


class Decision(Base, Timestamps):
    __tablename__ = "decisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), unique=True)
    rationale: Mapped[Optional[str]] = mapped_column(Text)
    decision_date: Mapped[Optional[str]] = mapped_column(String(30))
    responsible_person: Mapped[Optional[str]] = mapped_column(String(200))


class Responsibility(Base, Timestamps):
    __tablename__ = "responsibilities"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), unique=True)
    assignee: Mapped[Optional[str]] = mapped_column(String(200))
    status: Mapped[Optional[str]] = mapped_column(String(50))
    deadline: Mapped[Optional[str]] = mapped_column(String(30))


class Risk(Base, Timestamps):
    __tablename__ = "risks"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), unique=True)
    severity: Mapped[Optional[str]] = mapped_column(String(10))
    impact: Mapped[Optional[str]] = mapped_column(Text)
    mitigation: Mapped[Optional[str]] = mapped_column(Text)


class Dependency(Base, Timestamps):
    __tablename__ = "dependencies"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), unique=True)
    related_task: Mapped[Optional[str]] = mapped_column(String(200))
    component: Mapped[Optional[str]] = mapped_column(Text)
    responsible_person: Mapped[Optional[str]] = mapped_column(String(200))


class OpenQuestion(Base, Timestamps):
    __tablename__ = "open_questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), unique=True)
    why_it_matters: Mapped[Optional[str]] = mapped_column(Text)
    responsible_person: Mapped[Optional[str]] = mapped_column(String(200))
    related_source: Mapped[Optional[str]] = mapped_column(String(300))


class ReviewComment(Base, Timestamps):
    __tablename__ = "review_comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(20), default="comment")
    body: Mapped[str] = mapped_column(Text)
    author_role: Mapped[str] = mapped_column(String(50), default="")
    user: Mapped[User] = relationship()


class ReviewHistory(Base, Timestamps):
    __tablename__ = "review_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("extracted_claims.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(20))
    previous_value: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_value: Mapped[dict[str, Any]] = mapped_column(JSON)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    reviewer: Mapped[User] = relationship()


class Handover(Base, Timestamps):
    __tablename__ = "handovers"
    __table_args__ = (UniqueConstraint("project_id", "version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    content: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    approved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    shared_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    acknowledged_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    project: Mapped[Project] = relationship()
    approved_by: Mapped[Optional[User]] = relationship(foreign_keys=[approved_by_id])
    acknowledged_by: Mapped[Optional[User]] = relationship(foreign_keys=[acknowledged_by_id])


class HandoverApproval(Base, Timestamps):
    __tablename__ = "handover_approvals"
    id: Mapped[int] = mapped_column(primary_key=True)
    handover_id: Mapped[int] = mapped_column(ForeignKey("handovers.id", ondelete="CASCADE"), index=True)
    approver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(20), default="approved")
    comment: Mapped[Optional[str]] = mapped_column(Text)


class ActivityLog(Base, Timestamps):
    __tablename__ = "activity_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    project: Mapped[Optional[Project]] = relationship()
    user: Mapped[Optional[User]] = relationship()


class Notification(Base, Timestamps):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[Optional[str]] = mapped_column(String(200))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
