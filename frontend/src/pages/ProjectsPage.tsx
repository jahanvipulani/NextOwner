import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import ProjectCard from '../components/ProjectCard';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('updated');
  const list = useAsync(() => Api.listProjects({ q: q || undefined, status: status || undefined, sort }), [q, status, sort]);

  return (
    <>
      <PageHeader
        title="My Projects"
        subtitle="Every project you belong to, with your role and handover progress."
        actions={<Link to="/projects/new" className="btn btn-primary">+ Create New Handover</Link>}
      />
      <div className="flex flex-wrap gap-2">
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="Search projects"
          aria-label="Search projects"
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
        />
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
      {list.loading ? <Spinner label="Loading projects" /> : null}
      <ErrorBanner message={list.error} onRetry={list.reload} />
      {list.data && list.data.length === 0 ? (
        <EmptyState title="No projects found" text="Try a different search, or create a new project." action={<Link className="btn btn-primary" to="/projects/new">Create project</Link>} />
      ) : null}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {(list.data ?? []).map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </>
  );
}
