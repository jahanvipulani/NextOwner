import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { File as FileIcon, FileText, Github, HardDrive, MessageSquare, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import RequireProject from '../components/RequireProject';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import SourceText from '../components/SourceText';
import { fmtBytes, fmtDateTime } from '../utils/format';
import { formatError } from '../utils/errors';
import type { Integration, ProjectDetail, Source, SourcePage, SourceType } from '../types';

const ICONS: Record<string, LucideIcon> = {
  github: Github,
  google_drive: HardDrive,
  google_docs: FileText,
  pdf: FileText,
  docx: FileIcon,
  txt: FileText,
  meeting_notes: Users,
  chat_export: MessageSquare,
};

const PRESET: Record<string, SourceType> = {
  pdf: 'document',
  docx: 'document',
  txt: 'document',
  meeting_notes: 'meeting_notes',
  chat_export: 'chat_export',
};

const STATUS_LABEL: Record<Integration['status'], string> = {
  connected: 'Connected',
  available: 'Available',
  not_implemented: 'Not implemented',
};

interface UploadJob {
  id: number;
  name: string;
  progress: number;
  state: 'uploading' | 'done' | 'error';
  error: string | null;
}

function SourcesInner({ project }: { project: ProjectDetail }) {
  const toast = useToast();
  const canConnect = project.permissions.includes('sources.connect');
  const canRead = project.permissions.includes('sources.read');
  const system = useAsync(() => Api.system(), []);
  const integrations = useAsync(() => Api.integrations(project.id), [project.id]);
  const sources = useAsync(() => (canRead ? Api.listSources(project.id) : Promise.resolve([] as Source[])), [project.id, canRead]);
  const [sourceType, setSourceType] = useState<SourceType>('document');
  const [confidential, setConfidential] = useState(false);
  const [author, setAuthor] = useState('');
  const [docDate, setDocDate] = useState('');
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [repo, setRepo] = useState('');
  const [maxItems, setMaxItems] = useState(15);
  const [ghBusy, setGhBusy] = useState(false);
  const [ghError, setGhError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ name: string; pages: SourcePage[] } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLElement>(null);
  const githubRef = useRef<HTMLElement>(null);

  const maxMb = system.data?.max_upload_mb ?? 25;

  function validate(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'docx', 'txt'].includes(ext)) return `${file.name}: only PDF, DOCX and TXT files are supported.`;
    if (file.size === 0) return `${file.name}: the file is empty.`;
    if (file.size > maxMb * 1024 * 1024) return `${file.name}: larger than the ${maxMb} MB limit.`;
    return null;
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      const id = Date.now() + Math.random();
      const problem = validate(file);
      if (problem) {
        setJobs((j) => [{ id, name: file.name, progress: 0, state: 'error', error: problem }, ...j]);
        toast.push(problem, 'error');
        continue;
      }
      setJobs((j) => [{ id, name: file.name, progress: 0, state: 'uploading', error: null }, ...j]);
      try {
        await Api.uploadSource(project.id, file, sourceType, confidential, { author: author.trim(), doc_date: docDate }, (pct) =>
          setJobs((j) => j.map((x) => (x.id === id ? { ...x, progress: pct } : x))),
        );
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, progress: 100, state: 'done' } : x)));
        toast.push(`${file.name} uploaded and processed`);
        sources.reload();
        integrations.reload();
      } catch (e) {
        const msg = formatError(e);
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, state: 'error', error: msg } : x)));
        toast.push(msg, 'error');
      }
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!canConnect) return;
    void uploadFiles(Array.from(e.dataTransfer.files));
  }

  async function importGithub() {
    setGhError(null);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo.trim())) {
      setGhError('Enter a public repository as owner/name, for example octocat/Hello-World.');
      return;
    }
    setGhBusy(true);
    try {
      const s = await Api.importGithub(project.id, repo.trim(), maxItems);
      toast.push(`Imported ${s.name}`);
      setRepo('');
      sources.reload();
      integrations.reload();
    } catch (e) {
      setGhError(formatError(e));
    } finally {
      setGhBusy(false);
    }
  }

  async function view(id: number) {
    setViewLoading(true);
    try {
      const r = await Api.getSource(id);
      setViewing({ name: r.source.name, pages: r.pages });
    } catch (e) {
      toast.push(formatError(e), 'error');
    } finally {
      setViewLoading(false);
    }
  }

  async function remove(id: number) {
    try {
      await Api.deleteSource(id);
      toast.push('Source deleted');
      setConfirmDelete(null);
      sources.reload();
      integrations.reload();
    } catch (e) {
      toast.push(formatError(e), 'error');
    }
  }

  function connect(i: Integration) {
    if (i.key === 'github') githubRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else {
      const preset = PRESET[i.key];
      if (preset) setSourceType(preset);
      uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Step 2 · Connect sources"
        title="Connect Sources"
        subtitle="Bring in the authorised documents and repositories that describe this project. Only real, working integrations can be connected."
      />
      {!canRead && !canConnect ? <div className="banner banner-info">Your role cannot connect or view sources for this project.</div> : null}

      <section className="flex flex-col gap-3">
        {integrations.loading ? <Spinner label="Loading integrations" /> : null}
        <ErrorBanner message={integrations.error} onRetry={integrations.reload} />
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          {(integrations.data ?? []).map((i) => {
            const Icon = ICONS[i.key] ?? FileIcon;
            return (
              <div key={i.key} className="card flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><Icon size={18} aria-hidden="true" /><strong>{i.name}</strong></span>
                  <span className={i.status === 'connected' ? 'tag tag-soft' : i.status === 'not_implemented' ? 'tag tag-pink' : 'tag'}>{STATUS_LABEL[i.status]}</span>
                </div>
                <p className="small muted" style={{ minHeight: 40 }}>{i.description}</p>
                <div className="small muted">Last synchronised: {i.last_synced_at ? fmtDateTime(i.last_synced_at) : 'Never'}</div>
                <button type="button" className="btn btn-sm" disabled={!i.implemented || !canConnect} onClick={() => connect(i)}>
                  {!i.implemented ? 'Not implemented' : i.key === 'github' ? 'Import repository' : 'Upload files'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section ref={uploadRef} className="card flex flex-col gap-3">
        <h2>Upload documents</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <div>
            <label className="label" htmlFor="u-type">Source type</label>
            <select id="u-type" className="select" value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
              <option value="document">Document</option>
              <option value="meeting_notes">Meeting notes</option>
              <option value="chat_export">Chat export</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-author">Author (optional)</label>
            <input id="u-author" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="u-date">Document date (optional)</label>
            <input id="u-date" type="date" className="input" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <label className="small flex items-end gap-2 pb-2">
            <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--royal)' }} />
            Confidential (hidden from the incoming owner)
          </label>
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop files here or press Enter to choose files"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => canConnect && fileInput.current?.click()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && canConnect) fileInput.current?.click(); }}
          className="flex flex-col items-center gap-1 rounded py-8 text-center"
          style={{ border: `2px dashed ${dragging ? 'var(--royal)' : 'var(--line)'}`, background: dragging ? 'var(--royal-soft)' : 'var(--surface-2)', cursor: canConnect ? 'pointer' : 'not-allowed' }}
        >
          <strong>{canConnect ? 'Drag and drop files here, or click to choose' : 'Only a team lead can upload sources'}</strong>
          <span className="small muted">PDF, DOCX or TXT, up to {maxMb} MB each</span>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.txt"
          aria-label="Choose files"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void uploadFiles(files);
          }}
        />
        {jobs.length > 0 ? (
          <ul className="m-0 flex flex-col gap-2 p-0">
            {jobs.slice(0, 8).map((j) => (
              <li key={j.id} className="card-2 list-none">
                <div className="flex justify-between gap-2 small">
                  <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>{j.name}</span>
                  <span className={j.state === 'error' ? 'tag tag-pink' : j.state === 'done' ? 'tag tag-soft' : 'tag'}>
                    {j.state === 'uploading' ? `Uploading ${j.progress}%` : j.state === 'done' ? 'Processed' : 'Failed'}
                  </span>
                </div>
                <div className="progress mt-1"><div style={{ width: `${j.progress}%` }} /></div>
                {j.error ? <div className="field-error mt-2" role="alert">{j.error}</div> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section ref={githubRef} className="card flex flex-col gap-3">
        <h2>Import from GitHub</h2>
        <p className="small muted">Reads pull requests, issues and their comments from a public repository through the GitHub API. Nothing is written back.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div style={{ flex: '1 1 260px' }}>
            <label className="label" htmlFor="gh-repo">Repository (owner/name)</label>
            <input id="gh-repo" className="input" placeholder="octocat/Hello-World" value={repo} onChange={(e) => setRepo(e.target.value)} disabled={!canConnect} />
          </div>
          <div style={{ width: 120 }}>
            <label className="label" htmlFor="gh-max">Max items</label>
            <input id="gh-max" type="number" min={1} max={50} className="input" value={maxItems} onChange={(e) => setMaxItems(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={!canConnect} />
          </div>
          <button type="button" className="btn btn-primary" disabled={!canConnect || ghBusy} onClick={() => void importGithub()}>
            {ghBusy ? 'Importing' : 'Import'}
          </button>
        </div>
        {ghError ? <div className="field-error" role="alert">{ghError}</div> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2>Project sources</h2>
        {sources.loading ? <Spinner label="Loading sources" /> : null}
        <ErrorBanner message={sources.error} onRetry={sources.reload} />
        {sources.data && sources.data.length === 0 ? (
          <EmptyState title="No sources yet" text="Upload a document or import a repository to give NextOwner something to reconstruct from." />
        ) : null}
        {sources.data && sources.data.length > 0 ? (
          <div className="card scroll-x">
            <table className="tbl">
              <thead>
                <tr><th>Name</th><th>Type</th><th>Pages</th><th>Size</th><th>Access</th><th>Status</th><th>Added</th><th /></tr>
              </thead>
              <tbody>
                {sources.data.map((s) => (
                  <tr key={s.id}>
                    <td style={{ overflowWrap: 'anywhere' }}>{s.name}</td>
                    <td><span className="tag">{s.source_type.replace('_', ' ')}</span></td>
                    <td>{s.page_count ?? 'Unknown'}</td>
                    <td>{fmtBytes(s.size_bytes)}</td>
                    <td>{s.confidential ? <span className="tag tag-pink">Confidential</span> : <span className="tag">Team</span>}</td>
                    <td>{s.status === 'processed' ? <span className="tag tag-soft">Processed</span> : <span className="tag tag-pink" title={s.error ?? ''}>Failed</span>}</td>
                    <td>{fmtDateTime(s.created_at)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button type="button" className="btn btn-sm" onClick={() => void view(s.id)}>View text</button>
                        {canConnect ? (
                          confirmDelete === s.id ? (
                            <>
                              <button type="button" className="btn btn-sm btn-pink" onClick={() => void remove(s.id)}>Confirm delete</button>
                              <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(s.id)}>Delete</button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {viewLoading ? <Spinner label="Loading extracted text" /> : null}
        {viewing ? (
          <div className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3>{viewing.name}</h3>
              <button type="button" className="btn btn-sm" onClick={() => setViewing(null)}>Close</button>
            </div>
            {viewing.pages.length === 0 ? <p className="muted">No text could be extracted.</p> : null}
            {viewing.pages.map((p) => (
              <div key={p.page}>
                <div className="eyebrow mb-1">Page / section {p.page}</div>
                <SourceText text={p.text} quote="" />
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

export default function SourcesPage() {
  return <RequireProject>{(project) => <SourcesInner project={project} />}</RequireProject>;
}
