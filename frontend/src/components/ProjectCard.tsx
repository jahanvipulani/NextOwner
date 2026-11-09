import { Link } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import type { ProjectSummary } from '../types';
import { PROJECT_STATUS_LABELS, ROLE_LABELS, fmtDate } from '../utils/format';
import DemoBadge from './DemoBadge';

export default function ProjectCard({ project }: { project: ProjectSummary }) {
  const { select } = useProject();
  return (
    <Link
      to={`/projects/${project.id}`}
      className="card card-link flex flex-col gap-3"
      onClick={() => select(project.id)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0">{project.name}</h3>
        <div className="flex flex-wrap gap-2">
          <DemoBadge name={project.name} />
          <span className="tag tag-soft">{PROJECT_STATUS_LABELS[project.status]}</span>
        </div>
      </div>
      <p className="muted small" style={{ minHeight: 40 }}>
        {project.description || 'No description yet.'}
      </p>
      <div className="small muted flex flex-wrap gap-x-4 gap-y-1">
        <span>Owner: {project.owner.name}</span>
        <span>{project.member_count} members</span>
        <span>{project.source_count} sources</span>
        <span>Updated {fmtDate(project.updated_at)}</span>
      </div>
      <div>
        <div className="small mb-1 flex justify-between">
          <span className="muted">Handover completion</span>
          <strong>{project.progress}%</strong>
        </div>
        <div className="progress" aria-label={`Progress ${project.progress}%`}>
          <div style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
        </div>
      </div>
      <div className="small muted">Your role: {ROLE_LABELS[project.my_role]}</div>
    </Link>
  );
}
