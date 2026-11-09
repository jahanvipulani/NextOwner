from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.rbac import effective_permissions
from app.core.security import decode_token
from app.database.session import get_db
from app.models import Project, ProjectMember, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    uid = decode_token(creds.credentials)
    user = db.get(User, uid) if uid else None
    if user is None or not user.is_active:
        raise HTTPException(401, "Invalid or expired session")
    return user


class Access:
    """A user's membership in one project, with helpers to enforce permissions."""

    def __init__(self, project: Project, member: ProjectMember):
        self.project = project
        self.member = member
        self.role = member.role.name
        self.permissions = effective_permissions(self.role, member.can_approve)

    def can(self, perm: str) -> bool:
        return perm in self.permissions

    def require(self, *perms: str) -> None:
        """Passes when the user holds at least one of the listed permissions."""
        if not any(p in self.permissions for p in perms):
            raise HTTPException(403, "Your role does not allow this action")


def get_access(db: Session, user: User, project_id: int) -> Access:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    member = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user.id).first()
    if member is None:
        raise HTTPException(403, "You are not a member of this project")
    return Access(project, member)
