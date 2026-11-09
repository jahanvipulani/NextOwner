import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import type { ProjectDetail } from '../types';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

/** Renders children only when a project is selected, passing it down. */
export default function RequireProject({ children }: { children: (project: ProjectDetail) => ReactNode }) {
  const { selected, loading, projects } = useProject();
  if (loading) return <Spinner label="Loading projects" />;
  if (!selected) {
    return (
      <EmptyState
        title="No project selected"
        text={
          projects.length > 0
            ? 'Pick a project from the selector in the top bar, or open one from My Projects.'
            : 'You are not part of any project yet. Create one to start a handover.'
        }
        action={
          <>
            <Link className="btn btn-primary" to="/projects/new">
              Create project
            </Link>
            <Link className="btn" to="/projects">
              My Projects
            </Link>
          </>
        }
      />
    );
  }
  return <>{children(selected)}</>;
}
