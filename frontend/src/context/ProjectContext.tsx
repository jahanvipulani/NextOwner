import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Api } from '../services/api';
import { useAuth } from './AuthContext';
import type { ProjectDetail, ProjectSummary, Role } from '../types';

const PROJECT_KEY = 'nextowner_project';

interface ProjectCtx {
  projects: ProjectSummary[];
  loading: boolean;
  selectedId: number | null;
  selected: ProjectDetail | null;
  myRole: Role | null;
  incomingOnly: boolean;
  select: (id: number | null) => void;
  refresh: () => Promise<void>;
  refreshSelected: () => Promise<void>;
  can: (permission: string) => boolean;
}

const Ctx = createContext<ProjectCtx | null>(null);

function storedId(): number | null {
  const raw = localStorage.getItem(PROJECT_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(storedId());
  const [selected, setSelected] = useState<ProjectDetail | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await Api.listProjects();
      setProjects(list);
      setSelectedId((prev) => (prev !== null && list.some((p) => p.id === prev) ? prev : (list[0]?.id ?? null)));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void refresh();
    } else {
      setProjects([]);
      setSelected(null);
    }
  }, [user, refresh]);

  useEffect(() => {
    if (selectedId === null) {
      setSelected(null);
      return;
    }
    let alive = true;
    Api.getProject(selectedId)
      .then((p) => {
        if (alive) setSelected(p);
      })
      .catch(() => {
        if (alive) setSelected(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const select = useCallback((id: number | null) => {
    if (id === null) localStorage.removeItem(PROJECT_KEY);
    else localStorage.setItem(PROJECT_KEY, String(id));
    setSelectedId(id);
  }, []);

  const refreshSelected = useCallback(async () => {
    if (selectedId === null) return;
    const [detail, list] = await Promise.all([Api.getProject(selectedId), Api.listProjects()]);
    setSelected(detail);
    setProjects(list);
  }, [selectedId]);

  const can = useCallback((permission: string) => (selected ? selected.permissions.includes(permission) : false), [selected]);

  const value = useMemo<ProjectCtx>(
    () => ({
      projects,
      loading,
      selectedId,
      selected,
      myRole: selected ? selected.my_role : null,
      incomingOnly: projects.length > 0 && projects.every((p) => p.my_role === 'incoming_owner'),
      select,
      refresh,
      refreshSelected,
      can,
    }),
    [projects, loading, selectedId, selected, select, refresh, refreshSelected, can],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProject must be used inside ProjectProvider');
  return v;
}
