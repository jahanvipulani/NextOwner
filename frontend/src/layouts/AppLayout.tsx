import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => window.innerWidth < 900);
  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 grow flex-col">
        <Topbar />
        <main className="mx-auto flex w-full flex-col gap-6 px-6 py-6" style={{ maxWidth: 1240 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
