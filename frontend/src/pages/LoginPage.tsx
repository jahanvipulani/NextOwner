import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatError } from '../utils/errors';
import { isValidEmail } from '../utils/format';

const DEMO_PASSWORD = 'Demo@12345';
const DEMO_ACCOUNTS = [
  { email: 'lead@demo.nextowner.dev', label: 'Team Lead (Priya Sharma)' },
  { email: 'reviewer@demo.nextowner.dev', label: 'Reviewer (Rahul Nair)' },
  { email: 'contributor@demo.nextowner.dev', label: 'Contributor (Meera Joshi)' },
  { email: 'incoming@demo.nextowner.dev', label: 'Incoming Owner (Sana Kapoor)' },
];

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode === 'register') {
      if (!name.trim()) {
        setError('Your name is required.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password, organisation.trim());
      navigate('/', { replace: true, state: { fromLogin: true } });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  function fill(demoEmail: string) {
    setMode('login');
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="grid w-full gap-6" style={{ maxWidth: 920, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="flex flex-col justify-center gap-4">
          <div className="flex items-center gap-2" aria-hidden="true">
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--muted)' }} />
            <i style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--royal)' }} />
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--pink)' }} />
          </div>
          <h1 style={{ fontSize: 48 }}>NextOwner</h1>
          <p className="muted max-w-md">
            Evidence-linked, permission-aware project handovers. Sources go in, claims are checked against evidence, a person approves, and the incoming owner gets a trimmed plan.
          </p>
          <div className="card-2">
            <div className="eyebrow mb-2">Demo accounts</div>
            <p className="small muted mb-2">Synthetic demonstration data. Click an account to fill the form. Password for all: {DEMO_PASSWORD}</p>
            <div className="flex flex-col gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} type="button" className="btn btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => fill(a.email)}>
                  <span className="mono-quote">{a.email}</span>
                  <span className="muted">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <form className="card flex flex-col gap-3" style={{ padding: 22, borderColor: '#2c3a66' }} onSubmit={(e) => void submit(e)} noValidate>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'tab-on' : ''}`} onClick={() => { setMode('login'); setError(null); }}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'tab-on' : ''}`} onClick={() => { setMode('register'); setError(null); }}>
              Create account
            </button>
          </div>
          {mode === 'register' ? (
            <>
              <div>
                <label className="label" htmlFor="reg-name">Full name</label>
                <input id="reg-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="reg-org">Organisation (optional)</label>
                <input id="reg-org" className="input" value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
              </div>
            </>
          ) : null}
          <div>
            <label className="label" htmlFor="login-email">Email</label>
            <input id="login-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="login-password">Password</label>
            <input id="login-password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>
          {error ? <div className="field-error" role="alert">{error}</div> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
