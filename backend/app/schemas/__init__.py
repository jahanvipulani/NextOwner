"""Request bodies. Responses are built by the serialisers in app.services."""
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Role = Literal["team_lead", "reviewer", "contributor", "incoming_owner"]
ProjectStatus = Literal["planning", "in_progress", "ready_for_handover", "completed"]
EMAIL_RX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _email(v: str) -> str:
    v = v.strip().lower()
    if not EMAIL_RX.match(v):
        raise ValueError("Enter a valid email address")
    return v


class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str
    password: str = Field(min_length=8, max_length=128)
    organisation: Optional[str] = Field(default=None, max_length=200)

    _e = field_validator("email")(_email)


class LoginBody(BaseModel):
    email: str
    password: str

    _e = field_validator("email")(_email)


class MemberIn(BaseModel):
    email: str
    role: Role
    can_approve: bool = False

    _e = field_validator("email")(_email)


class NewProjectBody(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    category: Optional[str] = Field(default=None, max_length=100)
    owner_email: Optional[str] = None
    incoming_owner_email: Optional[str] = None
    members: list[MemberIn] = []
    start_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: ProjectStatus = "planning"


class PatchProjectBody(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    category: Optional[str] = Field(default=None, max_length=100)
    status: Optional[ProjectStatus] = None


class PatchMemberBody(BaseModel):
    role: Optional[Role] = None
    can_approve: Optional[bool] = None


class GithubBody(BaseModel):
    repo: str
    max_items: int = Field(default=15, ge=1, le=30)


class ReviewBody(BaseModel):
    action: Literal["accept", "edit", "reject", "unknown"]
    text: Optional[str] = Field(default=None, max_length=2000)
    details: Optional[dict[str, Optional[str]]] = None
    comment: Optional[str] = Field(default=None, max_length=2000)


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    kind: Literal["comment", "clarification", "information"] = "comment"


class PlanItem(BaseModel):
    day: str = Field(max_length=40)
    title: str = Field(max_length=300)
    detail: str = Field(default="", max_length=1000)
    claim_id: Optional[int] = None


class HandoverPut(BaseModel):
    overview: str = Field(max_length=8000)
    first_week_plan: list[PlanItem]
