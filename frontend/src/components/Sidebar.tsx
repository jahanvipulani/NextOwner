import { NavLink } from 'react-router-dom';
import {
  BrainCircuit,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FileSearch,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plug,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const FULL: Item[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'My Projects', icon: FolderKanban },
  { to: '/sources', label: 'Connect Sources', icon: Plug },
  { to: '/reconstruction', label: 'Knowledge Reconstruction', icon: BrainCircuit },
  { to: '/evidence', label: 'Evidence Explorer', icon: FileSearch },
  { to: '/review', label: 'Review Workspace', icon: ClipboardCheck },
  { to: '/reports', label: 'Handover Reports', icon: FileText },
  { to: '/team', label: 'Team & Permissions', icon: ShieldCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const INCOMING: Item[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/incoming', label: 'My Handover', icon: Inbox },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const { logout } = useAuth();
  const { incomingOnly } = useProject();
  const items = incomingOnly ? INCOMING : FULL;

  return (
    <aside
      className="flex flex-col bg-charcoal text-on-charcoal"
      style={{ width: collapsed ? 64 : 244, flex: 'none', position: 'sticky', top: 0, height: '100vh', transition: 'width 120ms' }}
      aria-label="Main navigation"
    >
      <div className="flex items-center gap-2 px-4 py-4" style={{ height: 60 }}>
        <span className="flex items-center gap-1" aria-hidden="true">
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--charcoal-muted)' }} />
          <i style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--royal)' }} />
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pink)' }} />
        </span>
        {collapsed ? null : <span className="font-display text-lg font-bold">NextOwner</span>}
      </div>
      <nav className="flex grow flex-col gap-1 px-2 py-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            title={it.label}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-royal text-royal-ink' : 'text-charcoal-muted hover:bg-charcoal-2 hover:text-on-charcoal'
              }`
            }
            style={{ textDecoration: 'none' }}
          >
            <it.icon size={18} aria-hidden="true" />
            {collapsed ? <span className="sr-only">{it.label}</span> : <span>{it.label}</span>}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={logout}
          title="Logout"
          className="mt-2 flex items-center gap-3 rounded px-3 py-2 text-left text-sm font-medium text-charcoal-muted hover:bg-charcoal-2 hover:text-on-charcoal"
          style={{ background: 'transparent', border: 0, cursor: 'pointer' }}
        >
          <LogOut size={18} aria-hidden="true" />
          {collapsed ? <span className="sr-only">Logout</span> : <span>Logout</span>}
        </button>
      </nav>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="m-2 flex items-center justify-center rounded px-3 py-2 text-charcoal-muted hover:bg-charcoal-2 hover:text-on-charcoal"
        style={{ background: 'transparent', border: '1px solid #475569', cursor: 'pointer' }}
      >
        {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
      </button>
    </aside>
  );
}
