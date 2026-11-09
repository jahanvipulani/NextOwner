import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BrainCircuit, ClipboardCheck, FileText, FolderKanban, Plug } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import ProjectCard from '../components/ProjectCard';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import { fmtDateTime } from '../utils/format';

interface StatCard {
  to: string;
  title: string;
  value: number;
  lines: string[];
  icon: LucideIcon;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { incomingOnly, loading: projectsLoading } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const dash = useAsync(() => Api.dashboard(), []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('updated');
  const list = useAsync(
    () => Api.listProjects({ q: q.trim() || undefined, status: status || undefined, sort }),
    [q, status, sort],
  );

  const fromLogin = (location.state as { fromLogin?: boolean } | null)?.fromLogin === true;
  useEffect(() => {
    if (fromLogin && !projectsLoading && incomingOnly) navigate('/incoming', { replace: true });
  }, [fromLogin, projectsLoading, incomingOnly, navigate]);

  const s = dash.data?.stats;
  const cards: StatCard[] = s
    ? [
        { to: '/projects', title: 'Total Projects', value: s.projects.total, lines: [`${s.projects.active} active`], icon: FolderKanban },
        { to: '/sources', title: 'Connected Sources', value: s.sources.total, lines: [`${s.sources.recent} uploaded recently`], icon: Plug },
        { to: '/evidence', title: 'Knowledge Claims', value: s.claims.total, lines: [`${s.claims.verified} verified`], icon: BrainCircuit },
        { to: '/review', title: 'Pending Reviews', value: s.reviews.pending, lines: [`${s.reviews.high_priority} high priority`], icon: ClipboardCheck },
        { to: '/reports', title: 'Approved Handovers', value: s.handovers.approved, lines: [`${s.handovers.recently_shared} recently shared`], icon: FileText },
      ]
    : [];

  return (
    <>
      <div className="hero-banner flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1">NextOwner dashboard</div>
          <h1>{`Welcome back, ${user?.name ?? ''}!`}</h1>
          <p className="mt-2 max-w-xl" style={{ color: '#b7c2d8' }}>Turn your project activity into an evidence-linked handover.</p>
        </div>
        <Link to="/projects/new" className="btn btn-primary" style={{ padding: '12px 20px', fontSize: 15 }}>
          + Create New Handover
        </Link>
      </div>

      {dash.loading ? <Spinner label="Loading dashboard" /> : null}
      <ErrorBanner message={dash.error} onRetry={dash.reload} />

      {s ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {cards.map((c) => (
            <Link key={c.title} to={c.to} className="card card-link flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="eyebrow">{c.title}</span>
                <span className={`stat-chip ${c.title === 'Pending Reviews' ? 'pink' : ''}`}><c.icon size={18} aria-hidden="true" /></span>
              </div>
              <div className="stat-num">
                {c.value}
              </div>
              {c.lines.map((l) => (
                <div key={l} className="small muted">
                  {l}
                </div>
              ))}
            </Link>
          ))}
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2>Recent projects</h2>
          <div className="flex flex-wrap gap-2">
            <input className="input" style={{ width: 200 }} placeholder="Search projects" aria-label="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" style={{ width: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="planning">Planning</option>
              <option value="in_progress">In Progress</option>
              <option value="ready_for_handover">Ready for Handover</option>
              <option value="completed">Completed</option>
            </select>
            <select className="select" style={{ width: 'auto' }} aria-label="Sort projects" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updated">Recently updated</option>
              <option value="name">Name</option>
              <option value="progress">Progress</option>
            </select>
          </div>
        </div>
        {list.loading ? <Spinner label="Loading projects" /> : null}
        <ErrorBanner message={list.error} onRetry={list.reload} />
        {list.data && list.data.length === 0 ? (
          <EmptyState
            title="No projects match"
            text="Create a project to start a handover, or clear the search and filters."
            action={<Link className="btn btn-primary" to="/projects/new">Create project</Link>}
          />
        ) : null}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {(list.data ?? []).slice(0, 6).map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
        {list.data && list.data.length > 6 ? (
          <Link to="/projects" className="small">View all {list.data.length} projects</Link>
        ) : null}
      </section>

      {dash.data ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <section className="card flex flex-col gap-3">
            <div>
              <h2>Project progress</h2>
              <p className="small muted">Counts from the database across your projects.</p>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dash.data.progress} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fontSize: 12, fill: 'var(--muted)' }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' }} labelStyle={{ color: 'var(--fg)' }} itemStyle={{ color: 'var(--fg)' }} />
                  <Bar dataKey="value" fill="#4169e1" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" style={{ fill: 'var(--fg)', fontSize: 12 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card flex flex-col gap-3">
            <h2>Recent activity</h2>
            {dash.data.activity.length === 0 ? <p className="muted">No activity yet.</p> : null}
            <ul className="m-0 flex flex-col gap-3 p-0" style={{ borderLeft: '2px solid var(--line)', marginLeft: 6 }}>
              {dash.data.activity.map((a) => (
                <li key={a.id} className="list-none" style={{ paddingLeft: 14 }}>
                  <div className="mono-quote muted">
                    {fmtDateTime(a.created_at)}
                    {a.user ? ` · ${a.user}` : ''}
                  </div>
                  <div>{a.message}</div>
                  {a.project_name ? <div className="small muted">{a.project_name}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </>
  );
}
