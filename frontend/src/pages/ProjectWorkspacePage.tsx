import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import PageHeader from '../components/PageHeader';
import DemoBadge from '../components/DemoBadge';
import { PROJECT_STATUS_LABELS, ROLE_LABELS, fmtDate, fmtDateTime } from '../utils/format';
import { formatError } from '../utils/errors';
import type { ProjectStatus } from '../types';

export default function ProjectWorkspacePage() {
  const { id } = useParams();
  const pid = Number(id);
  const { select, refresh } = useProject();
  const toast = useToast();
  const detail = useAsync(() => Api.getProject(pid), [pid]);

  useEffect(() => {
    if (Number.isFinite(pid)) select(pid);
  }, [pid, select]);

  if (detail.loading) return <Spinner label="Loading project" />;
  if (detail.error || !detail.data) return <ErrorBanner message={detail.error ?? 'Project not found.'} onRetry={detail.reload} />;
  const p = detail.data;
  const canManage = p.permissions.includes('project.manage');

  async function changeStatus(s: ProjectStatus) {
    try {
      await Api.patchProject(pid, { status: s });
      toast.push('Status updated');
      detail.reload();
      void refresh();
    } catch (e) {
      toast.push(formatError(e), 'error');
    }
  }

  const stages = [
    { to: '/sources', title: 'Connect sources', text: `${p.source_count} source${p.source_count === 1 ? '' : 's'} connected` },
    { to: '/reconstruction', title: 'Reconstruct knowledge', text: p.last_reconstruction ? `Last run ${fmtDateTime(p.last_reconstruction.at)} (${p.last_reconstruction.claims} claims)` : 'Not run yet' },
    { to: '/evidence', title: 'Inspect evidence', text: `${p.claim_count} claims with sources` },
    { to: '/review', title: 'Review claims', text: `${p.counts.pending} pending review` },
    { to: '/handover', title: 'Generate handover', text: 'Approve and share with the incoming owner' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Project workspace"
        title={p.name}
        subtitle={p.description ?? undefined}
        actions={
          <>
            <DemoBadge name={p.name} />
            {canManage ? (
              <select className="select" style={{ width: 'auto' }} aria-label="Project status" value={p.status} onChange={(e) => void changeStatus(e.target.value as ProjectStatus)}>
                {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            ) : (
              <span className="tag tag-soft">{PROJECT_STATUS_LABELS[p.status]}</span>
            )}
          </>
        }
      />
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {(
          [
            ['Pending', p.counts.pending],
            ['Accepted', p.counts.accepted],
            ['Edited', p.counts.edited],
            ['Rejected', p.counts.rejected],
            ['Unknown', p.counts.unknown],
          ] as [string, number][]
        ).map(([label, n]) => (
          <div key={label} className="card-2">
            <div className="eyebrow">{label}</div>
            <div className="font-display" style={{ fontSize: 28, fontWeight: 600 }}>{n}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="small mb-1 flex justify-between"><span className="muted">Handover completion</span><strong>{p.progress}%</strong></div>
        <div className="progress"><div style={{ width: `${p.progress}%` }} /></div>
        <div className="small muted mt-2 flex flex-wrap gap-x-4">
          <span>Owner: {p.owner.name}</span>
          <span>Incoming owner: {p.incoming_owner ? p.incoming_owner.name : 'Unknown'}</span>
          <span>Started: {p.start_date ? fmtDate(p.start_date) : 'Unknown'}</span>
          <span>Category: {p.category ?? 'Unknown'}</span>
          <span>Your role: {ROLE_LABELS[p.my_role]}</span>
        </div>
      </div>
      <section className="flex flex-col gap-3">
        <h2>Workflow</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {stages.map((s, i) => (
            <Link key={s.to} to={s.to} className="card card-link flex flex-col gap-1">
              <span className="eyebrow">Stage {i + 1}</span>
              <h3>{s.title}</h3>
              <span className="small muted">{s.text}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2>Members</h2>
          <Link to="/team" className="small">Manage team</Link>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {p.members.map((m) => (
                <tr key={m.user_id}><td>{m.name}</td><td>{m.email}</td><td>{ROLE_LABELS[m.role]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
