"""Initial schema: every table declared in app.models.

Revision ID: 0001
Revises:
"""
from alembic import op

import app.models  # noqa: F401
from app.database.session import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The first revision creates the whole schema from the SQLAlchemy models (checkfirst, so it is safe to re-run).
    # Later schema changes should be added as new revisions with `alembic revision --autogenerate`.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
