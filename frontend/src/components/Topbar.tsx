import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Search } from 'lucide-react';
import { Api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import type { NotificationItem } from '../types';
import { ROLE_LABELS, fmtDateTime } from '../utils/format';

function titleFor(path: string): string {
  if (path === '/') return 'Dashboard';
  if (path === '/projects') return 'My Projects';
  if (path === '/projects/new') return 'Create New Handover';
  if (path.startsWith('/projects/')) return 'Project Workspace';
  if (path.startsWith('/sources')) return 'Connect Sources';
  if (path.startsWith('/reconstruction')) return 'Knowledge Reconstruction';
  if (path.startsWith('/evidence')) return 'Evidence Explorer';
  if (path.startsWith('/review')) return 'Review Workspace';
  if (path.startsWith('/handover')) return 'Generate Handover';
  if (path.startsWith('/reports')) return 'Handover Reports';
  if (path.startsWith('/incoming')) return 'Incoming Owner Handover';
  if (path.startsWith('/team')) return 'Team & Permissions';
  if (path.startsWith('/settings')) return 'Settings';
  return 'NextOwner';
}

export default function Topbar() {
  const { user, logout } = useAuth();
  const { projects, selectedId, select, myRole } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<NotificationItem[]>([]);
  const [menu, setMenu] = useState<'none' | 'notes' | 'profile'>('none');

  const loadNotes = useCallback(() => {
    Api.notifications()
      .then(setNotes)
      .catch(() => setNotes([]));
  }, []);

  useEffect(() => {
    loadNotes();
    const t = window.setInterval(loadNotes, 60000);
    return () => window.clearInterval(t);
  }, [loadNotes]);

  const unread = notes.filter((n) => !n.read).length;

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    navigate(q.trim() ? `/projects?q=${encodeURIComponent(q.trim())}` : '/projects');
  }

  async function openNote(n: NotificationItem) {
    setMenu('none');
    try {
      if (!n.read) await Api.readNotification(n.id);
    } finally {
      loadNotes();
    }
    if (n.link && n.link.startsWith('/')) navigate(n.link);
  }

  async function readAll() {
    await Api.readAllNotifications();
    loadNotes();
  }

  return (
    <header
      className="flex flex-wrap items-center gap-3 border-b px-6 py-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--line)', position: 'sticky', top: 0, zIndex: 20 }}
    >
      <h2 className="mr-auto min-w-0">{titleFor(location.pathname)}</h2>

      {projects.length > 0 ? (
        <select
          className="select"
          style={{ width: 'auto', maxWidth: 220 }}
          aria-label="Selected project"
          value={selectedId ?? ''}
          onChange={(e) => select(e.target.value ? Number(e.target.value) : null)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : null}

      <form onSubmit={submitSearch} className="relative" role="search">
        <Search size={16} className="muted" style={{ position: 'absolute', left: 10, top: 11 }} aria-hidden="true" />
        <input
          className="input"
          style={{ paddingLeft: 32, width: 220 }}
          placeholder="Search projects"
          aria-label="Search projects"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>

      <div className="relative">
        <button
          type="button"
          className="btn btn-ghost"
          aria-label={`Notifications, ${unread} unread`}
          onClick={() => {
            setMenu(menu === 'notes' ? 'none' : 'notes');
            loadNotes();
          }}
        >
          <Bell size={18} />
          {unread > 0 ? <span className="tag tag-demo">{unread}</span> : null}
        </button>
        {menu === 'notes' ? (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setMenu('none')} />
            <div
              className="card"
              style={{ position: 'absolute', right: 0, top: 44, width: 340, maxWidth: '86vw', zIndex: 40, maxHeight: 420, overflow: 'auto' }}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3>Notifications</h3>
                <button type="button" className="btn btn-sm" onClick={() => void readAll()} disabled={unread === 0}>
                  Mark all read
                </button>
              </div>
              {notes.length === 0 ? <p className="muted small">You have no notifications.</p> : null}
              <ul className="m-0 flex flex-col gap-2 p-0">
                {notes.map((n) => (
                  <li key={n.id} className="list-none">
                    <button
                      type="button"
                      onClick={() => void openNote(n)}
                      className="card-2 w-full text-left"
                      style={{ cursor: 'pointer', borderColor: n.read ? 'var(--line)' : 'var(--royal)' }}
                    >
                      <div className="font-medium">{n.title}</div>
                      <div className="small muted">{n.body}</div>
                      <div className="small muted">{fmtDateTime(n.created_at)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>

      <div className="relative">
        <button type="button" className="btn btn-ghost" onClick={() => setMenu(menu === 'profile' ? 'none' : 'profile')} aria-haspopup="menu">
          <span className="flex flex-col items-start leading-tight">
            <span className="font-medium">{user?.name ?? 'Account'}</span>
            <span className="small muted">{myRole ? ROLE_LABELS[myRole] : 'No project role'}</span>
          </span>
          <ChevronDown size={16} />
        </button>
        {menu === 'profile' ? (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setMenu('none')} />
            <div className="card flex flex-col gap-2" style={{ position: 'absolute', right: 0, top: 44, width: 240, zIndex: 40 }} role="menu">
              <div className="small muted">{user?.email}</div>
              <div className="small muted">{user?.organisation}</div>
              <button type="button" className="btn btn-sm" onClick={() => { setMenu('none'); navigate('/settings'); }}>
                Settings
              </button>
              <button type="button" className="btn btn-sm" onClick={logout}>
                Logout
              </button>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
