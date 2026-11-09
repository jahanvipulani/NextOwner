import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';

export default function SettingsPage() {
  const { user } = useAuth();
  const sys = useAsync(() => Api.system(), []);
  const s = sys.data;
  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" subtitle="Your account and how this deployment is configured." />
      <section className="card flex flex-col gap-2">
        <h2>Profile</h2>
        <div>{user?.name}</div>
        <div className="muted small">{user?.email} · {user?.organisation}</div>
      </section>
      <section className="card flex flex-col gap-3">
        <h2>Deployment</h2>
        {sys.loading ? <Spinner label="Loading" /> : null}
        <ErrorBanner message={sys.error} onRetry={sys.reload} />
        {s ? (
          <dl className="m-0 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div><dt className="eyebrow">Extraction mode</dt><dd className="m-0">{s.llm_enabled ? `LLM (${s.llm_model})` : 'Rule-based (no LLM key configured)'}</dd></div>
            <div><dt className="eyebrow">Upload limit</dt><dd className="m-0">{s.max_upload_mb} MB</dd></div>
            <div><dt className="eyebrow">Accepted files</dt><dd className="m-0">{s.allowed_types.join(', ').toUpperCase()}</dd></div>
            <div><dt className="eyebrow">Demo data</dt><dd className="m-0">{s.demo_mode ? 'Enabled. The Student Research Portal project is synthetic.' : 'Disabled'}</dd></div>
          </dl>
        ) : null}
        <p className="small muted">The LLM key is read from the server environment and is never sent to the browser. Change it in the .env file and restart the backend.</p>
      </section>
    </>
  );
}
