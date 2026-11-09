import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { formatError } from '../utils/errors';
import { PROJECT_STATUS_LABELS, ROLE_LABELS, isValidEmail } from '../utils/format';
import type { ProjectStatus, Role } from '../types';

interface MemberRow {
  email: string;
  role: Role;
}

const CATEGORIES = ['Software product', 'Research', 'Student club', 'Operations', 'Community or volunteer', 'Other'];
const MEMBER_ROLES: Role[] = ['reviewer', 'contributor', 'team_lead'];

export default function NewProjectPage() {
  const { user } = useAuth();
  const { refresh, select } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [owner, setOwner] = useState(user?.email ?? '');
  const [incoming, setIncoming] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [startDate, setStartDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('in_progress');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateMember(i: number, patch: Partial<MemberRow>) {
    setMembers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Project name is required.');
    if (owner.trim() && !isValidEmail(owner)) return setError('The project owner must be a valid email address.');
    if (incoming.trim() && !isValidEmail(incoming)) return setError('The incoming owner must be a valid email address.');
    const filled = members.filter((m) => m.email.trim());
    if (filled.some((m) => !isValidEmail(m.email))) return setError('Every team member needs a valid email address.');
    setBusy(true);
    try {
      const p = await Api.createProject({
        name: name.trim(),
        description: description.trim(),
        category,
        owner_email: owner.trim() || undefined,
        incoming_owner_email: incoming.trim() || undefined,
        members: filled.map((m) => ({ email: m.email.trim(), role: m.role })),
        start_date: startDate || undefined,
        status,
      });
      await refresh();
      select(p.id);
      toast.push('Project created');
      navigate(`/projects/${p.id}`);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Step 1 · Create project" title="Create a new handover" subtitle="Describe the project, then add sources and let NextOwner reconstruct what the team knows." />
      <form className="card flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div>
            <label className="label" htmlFor="p-name">Project name</label>
            <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-cat">Project category</label>
            <select id="p-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="p-desc">Project description</label>
          <textarea id="p-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div>
            <label className="label" htmlFor="p-owner">Project owner (email)</label>
            <input id="p-owner" type="email" className="input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-incoming">Incoming owner (email)</label>
            <input id="p-incoming" type="email" className="input" placeholder="The person taking over" value={incoming} onChange={(e) => setIncoming(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-start">Project start date</label>
            <input id="p-start" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-status">Project status</label>
            <select id="p-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label" style={{ margin: 0 }}>Team members (must already have an account)</span>
            <button type="button" className="btn btn-sm" onClick={() => setMembers((m) => [...m, { email: '', role: 'contributor' }])}>
              Add member
            </button>
          </div>
          {members.length === 0 ? <p className="small muted">No extra members yet. You can add them later in Team & Permissions.</p> : null}
          <div className="flex flex-col gap-2">
            {members.map((m, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input className="input" style={{ flex: '1 1 240px' }} type="email" placeholder="name@example.com" aria-label={`Member ${i + 1} email`} value={m.email} onChange={(e) => updateMember(i, { email: e.target.value })} />
                <select className="select" style={{ width: 'auto' }} aria-label={`Member ${i + 1} role`} value={m.role} onChange={(e) => updateMember(i, { role: e.target.value as Role })}>
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" onClick={() => setMembers((rows) => rows.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
        {error ? <div className="field-error" role="alert">{error}</div> : null}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating' : 'Create Project'}</button>
          <button type="button" className="btn" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
