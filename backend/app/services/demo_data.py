"""Synthetic demonstration data. Every name, date and fact here is invented."""

DEMO_PASSWORD = "Demo@12345"

DEMO_USERS = [
    {"email": "lead@demo.nextowner.dev", "name": "Priya Sharma", "role": "team_lead"},
    {"email": "reviewer@demo.nextowner.dev", "name": "Rahul Nair", "role": "reviewer"},
    {"email": "contributor@demo.nextowner.dev", "name": "Meera Joshi", "role": "contributor"},
    {"email": "incoming@demo.nextowner.dev", "name": "Sana Kapoor", "role": "incoming_owner"},
]

DEMO_PROJECT = {
    "name": "Student Research Portal",
    "description": "A university research portal for managing student research activities. SYNTHETIC DEMONSTRATION DATA.",
    "category": "Education technology",
    "status": "in_progress",
    "start_date": "2025-09-01",
}

DEMO_DOCS = [
    {
        "filename": "charter-and-design-notes.txt",
        "source_type": "document",
        "confidential": False,
        "author": "Priya Sharma",
        "doc_date": "2026-01-10",
        "text": (
            "Student Research Portal: project charter and design notes\n"
            "The portal lets students submit research proposals and lets supervisors review them.\n"
            "Decision: use PostgreSQL as the only database because supervisors need audit history on every proposal.\n"
            "Decision: keep the proposal submission form on the legacy upload API until the March migration is signed off, "
            "because the new API does not store draft attachments yet.\n"
            "Priya Sharma owns the proposal submission module and the supervisor review workflow.\n"
            "Rahul Nair maintains the authentication service.\n"
            "Risk: the legacy upload API is deprecated and will be switched off in April.\n"
            "The plagiarism checker depends on the university library API for reference matching.\n"
            "Ask Meera Joshi about supervisor onboarding and access rights.\n"
        ),
    },
    {
        "filename": "weekly-sync-notes-2026-02-03.txt",
        "source_type": "meeting_notes",
        "confidential": False,
        "author": "Rahul Nair",
        "doc_date": "2026-02-03",
        "text": (
            "Weekly sync notes\n"
            "Attendees: Priya, Rahul, Meera and Dev.\n"
            "Agreed: keep the proposal submission form on the legacy upload API until the March migration is signed off.\n"
            "Meera Joshi is responsible for supervisor onboarding documentation.\n"
            "TASK-12 Migrate proposal attachments to the new API — assigned to Dev Anand — due 2026-02-27.\n"
            "TASK-15 Add reviewer dashboard filters — assigned to Rahul Nair — due 2026-03-06.\n"
            "Open question: who will own the plagiarism checker licence renewal after Priya leaves?\n"
            "Open question: should students be able to withdraw a proposal after supervisor review starts?\n"
            "The reviewer dashboard depends on the supervisor roles table from the authentication service.\n"
            "Risk: the nightly backup job fails whenever the storage volume is nearly full.\n"
            "Ask Meera Joshi for help with supervisor access requests.\n"
        ),
    },
    {
        "filename": "supervisor-and-budget-notes-confidential.txt",
        "source_type": "document",
        "confidential": True,
        "author": "Priya Sharma",
        "doc_date": "2026-02-10",
        "text": (
            "Supervisor and budget notes (confidential)\n"
            "Risk: the plagiarism checker licence costs 9,500 USD per year and auto-renews on 1 May.\n"
            "Decision: negotiate a lower licence tier before the renewal date.\n"
            "Priya Sharma owns the budget approval for the portal.\n"
            "Finance contact is reachable on 98765 43210 for urgent invoices.\n"
        ),
    },
]
