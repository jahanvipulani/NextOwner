import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Spinner from './components/Spinner';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import NewProjectPage from './pages/NewProjectPage';
import ProjectWorkspacePage from './pages/ProjectWorkspacePage';
import SourcesPage from './pages/SourcesPage';
import ReconstructionPage from './pages/ReconstructionPage';
import EvidencePage from './pages/EvidencePage';
import ReviewPage from './pages/ReviewPage';
import HandoverPage from './pages/HandoverPage';
import ReportsPage from './pages/ReportsPage';
import IncomingListPage from './pages/IncomingListPage';
import IncomingDetailPage from './pages/IncomingDetailPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner label="Loading NextOwner" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<NewProjectPage />} />
        <Route path="projects/:id" element={<ProjectWorkspacePage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="reconstruction" element={<ReconstructionPage />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="handover" element={<HandoverPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="incoming" element={<IncomingListPage />} />
        <Route path="incoming/:id" element={<IncomingDetailPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
