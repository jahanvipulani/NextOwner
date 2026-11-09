"""Role-based access control. Enforced in the API layer, never only in the UI."""
from __future__ import annotations

ALL_PERMISSIONS = [
    ("project.manage", "Edit project settings"),
    ("members.manage", "Assign team members"),
    ("sources.connect", "Connect and upload sources"),
    ("sources.read", "Read source documents"),
    ("knowledge.reconstruct", "Run knowledge reconstruction"),
    ("knowledge.view", "View all extracted knowledge"),
    ("claims.review", "Accept, edit, reject and mark claims unknown"),
    ("claims.comment", "Comment on claims and provide missing information"),
    ("claims.view_assigned", "View claims assigned to me"),
    ("handover.generate", "Generate and edit handover drafts"),
    ("handover.approve", "Approve handovers"),
    ("handover.share", "Share approved handovers"),
    ("handover.view_incoming", "View handovers shared with me"),
    ("handover.acknowledge", "Acknowledge receipt of a handover"),
]

ROLE_LABELS = {
    "team_lead": "Team Lead",
    "reviewer": "Reviewer",
    "contributor": "Contributor",
    "incoming_owner": "Incoming Owner",
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "team_lead": {
        "project.manage", "members.manage", "sources.connect", "sources.read", "knowledge.reconstruct",
        "knowledge.view", "claims.review", "claims.comment", "handover.generate", "handover.approve", "handover.share",
    },
    # Reviewers approve only when the team lead has set can_approve on their membership.
    "reviewer": {
        "sources.read", "knowledge.reconstruct", "knowledge.view", "claims.review", "claims.comment",
        "handover.generate", "handover.approve",
    },
    "contributor": {"claims.view_assigned", "claims.comment"},
    "incoming_owner": {"handover.view_incoming", "handover.acknowledge"},
}

ROLES = list(ROLE_LABELS)


def effective_permissions(role: str, can_approve: bool) -> set[str]:
    perms = set(ROLE_PERMISSIONS.get(role, set()))
    if role == "reviewer" and not can_approve:
        perms.discard("handover.approve")
    return perms
