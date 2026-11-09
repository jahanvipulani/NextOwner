import type { Category, ClaimDetailsMap, EvidenceStatus, ProjectStatus, ReviewStatus, Role } from '../types';

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function orUnknown(v: string | null | undefined): string {
  return v && v.trim().length > 0 ? v : 'Unknown';
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const ROLE_LABELS: Record<Role, string> = {
  team_lead: 'Team Lead',
  reviewer: 'Reviewer',
  contributor: 'Contributor',
  incoming_owner: 'Incoming Owner',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  ready_for_handover: 'Ready for Handover',
  completed: 'Completed',
};

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending Review',
  accepted: 'Accepted',
  edited: 'Edited',
  rejected: 'Rejected',
  unknown: 'Unknown',
};

export const EVIDENCE_LABELS: Record<EvidenceStatus, string> = {
  verified: 'Verified',
  single_source: 'Single source',
  conflicting: 'Conflicting',
  no_evidence: 'No evidence',
};

export const CATEGORY_ORDER: Category[] = ['decision', 'ownership', 'risk', 'dependency', 'question', 'contact'];

export const CATEGORY_LABELS: Record<Category, string> = {
  decision: 'Decisions',
  ownership: 'Ownership',
  risk: 'Risks',
  dependency: 'Dependencies',
  question: 'Open questions',
  contact: 'Contacts',
};

export const CATEGORY_SINGULAR: Record<Category, string> = {
  decision: 'Decision',
  ownership: 'Ownership',
  risk: 'Risk',
  dependency: 'Dependency',
  question: 'Open question',
  contact: 'Contact',
};

export const DETAIL_FIELDS: Record<Category, { key: string; label: string }[]> = {
  decision: [
    { key: 'rationale', label: 'Rationale' },
    { key: 'decision_date', label: 'Decision date' },
    { key: 'responsible_person', label: 'Responsible person' },
  ],
  ownership: [
    { key: 'assignee', label: 'Assigned to' },
    { key: 'status', label: 'Current status' },
    { key: 'deadline', label: 'Deadline' },
  ],
  risk: [
    { key: 'severity', label: 'Severity' },
    { key: 'impact', label: 'Possible impact' },
    { key: 'mitigation', label: 'Suggested mitigation' },
  ],
  dependency: [
    { key: 'related_task', label: 'Related task' },
    { key: 'component', label: 'Dependent component' },
    { key: 'responsible_person', label: 'Responsible person' },
  ],
  question: [
    { key: 'why_it_matters', label: 'Why it matters' },
    { key: 'responsible_person', label: 'Who should answer' },
    { key: 'related_source', label: 'Related source' },
  ],
  contact: [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'area', label: 'Area of responsibility' },
    { key: 'contact_details', label: 'Contact details' },
  ],
};

export function detailValue(details: ClaimDetailsMap | null | undefined, key: string): string | null {
  if (!details) return null;
  const v = details[key];
  return v === undefined ? null : v;
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
