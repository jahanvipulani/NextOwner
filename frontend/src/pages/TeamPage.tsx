import { useState } from 'react';
import type { FormEvent } from 'react';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import RequireProject from '../components/RequireProject';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { ROLE_LABELS, isValidEmail } from '../utils/format';
import { formatError } from '../utils/errors';
import type { ProjectDetail, Role } from '../types';

const ROLES: Role[] = ['team_lead', 'reviewer', 'contributor', 'incoming_owner'];

function Inner({ project }: { project: ProjectDetail }) {
  const toast = useToast();
  const { user } = useAuth();
  const { refreshSelected } = useProject();
  const perms = useAsync(() => Api.permissions(), []);
  const canManage = project.permissions.includes('members.manage');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('contributor');
  const [canApprove, setCanApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function wrap(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.push(done);
      await refreshSelected();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError('Enter the email address of a registered user.');
      return;
    }
    void wrap(async () => {
      await Api.addMember(project.id, email.trim(), role, canApprove);
      setEmail('');
    }, 'Member added');
  }

  return (
    <>
      <PageHeader eyebrow="Access control" title="Team & Permissions" subtitle="Roles are enforced by the API, not only hidden in the interface." />
      <ErrorBanner message={error} />
      <section className="card flex flex-col gap-3">
        <h2>Members of {project.name}</h2>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Can approve</th><th /></tr></thead>
            <tbody>
              {project.members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.name}{m.user_id === user?.id ? ' (you)' : ''}</td>
                  <td>{m.email}</td>
                  <td>
                    {canManage ? (
                      <select aria-label={`Role for ${m.name}`} className="select" style={{ width: 'auto' }} value={m.role} disabled={busy} onChange={(e) => void wrap(() => Api.patchMember(project.id, m.user_id, { role: e.target.value as Role }), 'Role updated')}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    ) : ROLE_LABELS[m.role]}
                  </td>
                  <td>
                    {m.role === 'reviewer' ? (
                      <input type="checkbox" aria-label={`${m.name} can approve handovers`} checked={m.can_approve} disabled={!canManage || busy} onChange={(e) => void wrap(() => Api.patchMember(project.id, m.user_id, { can_approve: e.target.checked }), 'Approval right updated')} />
                    ) : m.role === 'team_lead' ? 'Yes' : 'No'}
                  </td>
                  <td>{canManage && m.user_id !== user?.id ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void wrap(() => Api.removeMember(project.id, m.user_id), 'Member removed')}>Remove</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManage ? (
        <form className="card flex flex-wrap items-end gap-3" onSubmit={add} noValidate>
          <div className="label grow" style={{ minWidth: 220 }}><label htmlFor="tm-email">Add a member by email</label><input id="tm-email" className="input" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="label"><label htmlFor="tm-role">Role</label>
            <select id="tm-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          </div>
          {role === 'reviewer' ? <label className="small flex items-center gap-2"><input type="checkbox" checked={canApprove} onChange={(e) => setCanApprove(e.target.checked)} /> Can approve handovers</label> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>Add member</button>
        </form>
      ) : <div className="banner banner-info small">Only a team lead can change members and roles.</div>}

      <section className="card flex flex-col gap-3">
        <h2>What each role can do</h2>
        {perms.loading ? <Spinner label="Loading permissions" /> : null}
        <ErrorBanner message={perms.error} onRetry={perms.reload} />
        {perms.data ? (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Permission</th>{perms.data.roles.map((r) => <th key={r.name}>{r.label}</th>)}</tr></thead>
              <tbody>
                {perms.data.all_permissions.map((p) => (
                  <tr key={p.key}>
                    <td>{p.label}</td>
                    {perms.data!.roles.map((r) => <td key={r.name}>{r.permissions.includes(p.key) ? 'Yes' : ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="small muted">Reviewers approve handovers only when the team lead has switched on their approval right.</p>
      </section>
    </>
  );
}

export default function TeamPage() {
  return <RequireProject>{(p) => <Inner project={p} />}</RequireProject>;
}
