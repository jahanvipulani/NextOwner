export type Role = 'team_lead' | 'reviewer' | 'contributor' | 'incoming_owner';
export type Category = 'decision' | 'ownership' | 'risk' | 'dependency' | 'question' | 'contact';
export type ReviewStatus = 'pending' | 'accepted' | 'edited' | 'rejected' | 'unknown';
export type EvidenceStatus = 'verified' | 'single_source' | 'conflicting' | 'no_evidence';
export type SourceType = 'document' | 'meeting_notes' | 'chat_export' | 'github';
export type HandoverStatus = 'draft' | 'approved' | 'shared';
export type ProjectStatus = 'planning' | 'in_progress' | 'ready_for_handover' | 'completed';
export type ClaimDetailsMap = Record<string, string | null>;

export interface User {
  id: number;
  name: string;
  email: string;
  organisation: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface PersonRef {
  id: number;
  name: string;
}

export interface ProjectSummary {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  status: ProjectStatus;
  owner: PersonRef;
  incoming_owner: PersonRef | null;
  member_count: number;
  source_count: number;
  claim_count: number;
  reviewed_count: number;
  progress: number;
  start_date: string | null;
  updated_at: string;
  my_role: Role;
}

export interface Member {
  user_id: number;
  name: string;
  email: string;
  role: Role;
  can_approve: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  members: Member[];
  permissions: string[];
  counts: { pending: number; accepted: number; edited: number; rejected: number; unknown: number };
  last_reconstruction: { at: string; mode: string; claims: number } | null;
}

export interface Source {
  id: number;
  project_id: number;
  name: string;
  source_type: SourceType;
  mime: string | null;
  size_bytes: number;
  page_count: number | null;
  confidential: boolean;
  uploaded_by: string | null;
  created_at: string;
  status: 'processed' | 'failed';
  error: string | null;
  origin: string | null;
}

export interface SourcePage {
  page: number;
  text: string;
}

export interface Evidence {
  id: number;
  source_id: number;
  source_name: string;
  source_type: SourceType;
  quote: string;
  page: number | null;
  location: string | null;
  author: string | null;
  date: string | null;
  reference: string;
  confidential: boolean;
}

export interface Claim {
  id: number;
  project_id: number;
  category: Category;
  text: string;
  status: ReviewStatus;
  evidence_status: EvidenceStatus;
  evidence_note: string | null;
  details: ClaimDetailsMap;
  evidence: Evidence[];
  comment_count: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  claim_id: number;
  author: string;
  author_role: string;
  kind: 'comment' | 'clarification' | 'information';
  body: string;
  created_at: string;
}

export interface HistorySnapshot {
  text: string | null;
  details: ClaimDetailsMap | null;
  status: string | null;
}

export interface HistoryEntry {
  id: number;
  claim_id: number;
  claim_text: string;
  reviewer: string;
  action: string;
  previous: HistorySnapshot;
  updated: HistorySnapshot;
  comment: string | null;
  created_at: string;
}

export interface ClaimDetailResponse {
  claim: Claim;
  comments: Comment[];
  history: HistoryEntry[];
}

export interface Activity {
  id: number;
  project_id: number | null;
  project_name: string | null;
  kind: string;
  message: string;
  user: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface ClaimLite {
  id: number;
  category: Category;
  text: string;
  status: ReviewStatus;
  evidence_status: EvidenceStatus;
  details: ClaimDetailsMap;
  evidence: Evidence[];
}

export interface PlanItem {
  day: string;
  title: string;
  detail: string;
  claim_id: number | null;
}

export interface EvidenceRef {
  claim_id: number;
  source_name: string;
  page: number | null;
  quote: string;
  reference: string;
}

export interface HandoverContent {
  overview: string;
  first_week_plan: PlanItem[];
  decisions: ClaimLite[];
  responsibilities: ClaimLite[];
  risks: ClaimLite[];
  dependencies: ClaimLite[];
  questions: ClaimLite[];
  contacts: ClaimLite[];
  unresolved: ClaimLite[];
  evidence_refs: EvidenceRef[];
  withheld_count?: number;
}

export interface Handover {
  id: number;
  project_id: number;
  project_name: string;
  version: number;
  status: HandoverStatus;
  content: HandoverContent;
  generated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  shared_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export interface DashboardData {
  stats: {
    projects: { total: number; active: number };
    sources: { total: number; recent: number };
    claims: { total: number; verified: number };
    reviews: { pending: number; high_priority: number };
    handovers: { approved: number; recently_shared: number };
  };
  progress: { stage: string; value: number }[];
  activity: Activity[];
  projects: ProjectSummary[];
}

export interface Integration {
  key: string;
  name: string;
  description: string;
  status: 'connected' | 'available' | 'not_implemented';
  implemented: boolean;
  last_synced_at: string | null;
}

export interface SystemInfo {
  llm_enabled: boolean;
  llm_model: string | null;
  max_upload_mb: number;
  allowed_types: string[];
  demo_mode: boolean;
}

export interface ReconstructResult {
  mode: 'llm' | 'rules';
  claims_created: number;
  sources_used: number;
  sources_skipped: number;
  by_category: Record<string, number>;
  evidence_status: { verified: number; single_source: number; conflicting: number; no_evidence: number };
  warnings: string[];
}

export interface Reconstruction {
  last_run: { at: string; mode: string; claims: number } | null;
  by_category: Record<string, number>;
  claims: Claim[];
}

export interface PermissionsInfo {
  roles: { name: Role; label: string; permissions: string[] }[];
  all_permissions: { key: string; label: string }[];
}

export interface NewProjectBody {
  name: string;
  description: string;
  category: string;
  owner_email?: string;
  incoming_owner_email?: string;
  members?: { email: string; role: Role }[];
  start_date?: string;
  status: ProjectStatus;
}
