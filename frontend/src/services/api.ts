import axios from 'axios';
import type {
  Activity,
  AuthResponse,
  Claim,
  ClaimDetailResponse,
  Comment,
  DashboardData,
  Handover,
  HistoryEntry,
  Integration,
  NewProjectBody,
  NotificationItem,
  PermissionsInfo,
  PlanItem,
  ProjectDetail,
  ProjectSummary,
  ReconstructResult,
  Reconstruction,
  Role,
  Source,
  SourcePage,
  SourceType,
  SystemInfo,
  User,
} from '../types';

export const TOKEN_KEY = 'nextowner_token';

export const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

http.interceptors.response.use(
  (r) => r,
  (error: unknown) => {
    const e = error as { response?: { status?: number }; config?: { url?: string } };
    const url = e.config?.url ?? '';
    const isAuthCall = url.startsWith('/auth/login') || url.startsWith('/auth/register');
    if (e.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

const get = <T>(url: string, params?: Record<string, string | number | undefined>) =>
  http.get<T>(url, { params }).then((r) => r.data);
const post = <T>(url: string, body?: unknown) => http.post<T>(url, body).then((r) => r.data);

export const Api = {
  login: (email: string, password: string) => post<AuthResponse>('/auth/login', { email, password }),
  register: (name: string, email: string, password: string, organisation?: string) =>
    post<AuthResponse>('/auth/register', { name, email, password, organisation: organisation || undefined }),
  me: () => get<User>('/auth/me'),
  system: () => get<SystemInfo>('/system'),
  dashboard: () => get<DashboardData>('/dashboard'),

  listProjects: (params?: { q?: string; status?: string; sort?: string }) =>
    get<ProjectSummary[]>('/projects', params),
  createProject: (body: NewProjectBody) => post<ProjectSummary>('/projects', body),
  getProject: (id: number) => get<ProjectDetail>(`/projects/${id}`),
  patchProject: (id: number, body: Record<string, string>) =>
    http.patch<ProjectDetail>(`/projects/${id}`, body).then((r) => r.data),
  addMember: (id: number, email: string, role: Role, canApprove: boolean) =>
    post<ProjectDetail>(`/projects/${id}/members`, { email, role, can_approve: canApprove }),
  patchMember: (id: number, userId: number, body: { role?: Role; can_approve?: boolean }) =>
    http.patch<ProjectDetail>(`/projects/${id}/members/${userId}`, body).then((r) => r.data),
  removeMember: (id: number, userId: number) =>
    http.delete<ProjectDetail>(`/projects/${id}/members/${userId}`).then((r) => r.data),
  permissions: () => get<PermissionsInfo>('/permissions'),

  integrations: (projectId: number) => get<Integration[]>('/integrations', { project_id: projectId }),
  listSources: (projectId: number) => get<Source[]>(`/projects/${projectId}/sources`),
  uploadSource: (
    projectId: number,
    file: File,
    sourceType: SourceType,
    confidential: boolean,
    extra: { author?: string; doc_date?: string },
    onProgress: (pct: number) => void,
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('source_type', sourceType);
    form.append('confidential', confidential ? 'true' : 'false');
    if (extra.author) form.append('author', extra.author);
    if (extra.doc_date) form.append('doc_date', extra.doc_date);
    return http
      .post<Source>(`/projects/${projectId}/sources/upload`, form, {
        onUploadProgress: (ev) => {
          if (ev.total) onProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      })
      .then((r) => r.data);
  },
  importGithub: (projectId: number, repo: string, maxItems: number) =>
    post<Source>(`/projects/${projectId}/sources/github`, { repo, max_items: maxItems }),
  getSource: (id: number) => get<{ source: Source; pages: SourcePage[] }>(`/sources/${id}`),
  deleteSource: (id: number) => http.delete(`/sources/${id}`).then((r) => r.data),

  reconstruct: (projectId: number) => post<ReconstructResult>(`/projects/${projectId}/reconstruct`),
  reconstruction: (projectId: number) => get<Reconstruction>(`/projects/${projectId}/reconstruction`),

  listClaims: (
    projectId: number,
    params: { category?: string; evidence_status?: string; status?: string; source_id?: number; q?: string },
  ) => get<Claim[]>(`/projects/${projectId}/claims`, params),
  getClaim: (id: number) => get<ClaimDetailResponse>(`/claims/${id}`),
  reviewClaim: (
    id: number,
    body: { action: 'accept' | 'edit' | 'reject' | 'unknown'; text?: string; details?: Record<string, string | null>; comment?: string },
  ) => post<Claim>(`/claims/${id}/review`, body),
  addComment: (id: number, body: string, kind: Comment['kind']) => post<Comment>(`/claims/${id}/comments`, { body, kind }),
  reviewHistory: (projectId: number) => get<HistoryEntry[]>(`/projects/${projectId}/review-history`),

  projectHandovers: (projectId: number) => get<Handover[]>(`/projects/${projectId}/handovers`),
  generateHandover: (projectId: number) => post<Handover>(`/projects/${projectId}/handover/generate`),
  saveHandover: (id: number, overview: string, plan: PlanItem[]) =>
    http.put<Handover>(`/handovers/${id}`, { overview, first_week_plan: plan }).then((r) => r.data),
  approveHandover: (id: number) => post<Handover>(`/handovers/${id}/approve`),
  shareHandover: (id: number) => post<Handover>(`/handovers/${id}/share`),
  allHandovers: () => get<Handover[]>('/handovers'),
  incomingList: () => get<Handover[]>('/incoming'),
  incoming: (id: number) => get<Handover>(`/incoming/${id}`),
  acknowledge: (id: number) => post<Handover>(`/incoming/${id}/acknowledge`),

  activity: (projectId?: number, limit?: number) => get<Activity[]>('/activity', { project_id: projectId, limit }),
  notifications: () => get<NotificationItem[]>('/notifications'),
  readAllNotifications: () => post<unknown>('/notifications/read-all'),
  readNotification: (id: number) => post<unknown>(`/notifications/${id}/read`),
};

/** Fetches the PDF with the auth header, then triggers a browser download. */
export async function downloadHandoverPdf(id: number, filename: string): Promise<void> {
  const res = await http.get<Blob>(`/handovers/${id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
