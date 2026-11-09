import { useEffect, useState } from 'react';
import { Api, downloadHandoverPdf } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { useProject } from '../context/ProjectContext';
import RequireProject from '../components/RequireProject';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import HandoverView from '../components/HandoverView';
import EvidenceDrawer from '../components/EvidenceDrawer';
import { fmtDate } from '../utils/format';
import { formatError } from '../utils/errors';
import type { ClaimLite, Handover, PlanItem, ProjectDetail } from '../types';

function Inner({ project }: { project: ProjectDetail }) {
  const toast = useToast();
  const { refreshSelected } = useProject();
  const list = useAsync(() => Api.projectHandovers(project.id), [project.id]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [overview, setOverview] = useState('');
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<ClaimLite | null>(null);
  const can = (p: string) => project.permissions.includes(p);

  const handovers = list.data ?? [];
  const current: Handover | null = handovers.find((h) => h.id === selectedId) ?? handovers[0] ?? null;

  useEffect(() => {
    if (current) {
      setOverview(current.content.overview);
      setPlan(current.content.first_week_plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.generated_at]);

  async function run(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.push(done);
      list.reload();
      await refreshSelected();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(null);
    }
  }

  const isDraft = current?.status === 'draft';
  const pending = project.counts.pending;

  return (
    <>
      <PageHeader
        eyebrow="Step 6 · Handover"
        title="Generate Handover"
        subtitle="Build the report from accepted and edited claims, correct it, approve it, then share it with the incoming owner."
        actions={
          can('handover.generate') ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => void run('generate', async () => {
                const h = await Api.generateHandover(project.id);
                setSelectedId(h.id);
                setMode('preview');
              }, 'Draft generated')}
            >
              {busy === 'generate' ? 'Generating' : current && isDraft ? 'Regenerate draft' : 'Generate handover'}
            </button>
          ) : null
        }
      />
      {pending > 0 ? (
        <div className="banner banner-warn small">
          {pending} claim{pending === 1 ? ' is' : 's are'} still pending review. They are left out of approved sections and shown as unresolved.
        </div>
      ) : null}
      <ErrorBanner message={error} />
      {list.loading ? <Spinner label="Loading handovers" /> : null}
      <ErrorBanner message={list.error} onRetry={list.reload} />

      {!list.loading && !current ? (
        <EmptyState title="No handover yet" text="Generate a draft once you have reviewed claims. Only accepted and edited claims are included." />
      ) : null}

      {current ? (
        <>
          <div className="card flex flex-wrap items-center gap-3">
            {handovers.length > 1 ? (
              <select aria-label="Handover version" className="select" style={{ width: 'auto' }} value={current.id} onChange={(e) => setSelectedId(Number(e.target.value))}>
                {handovers.map((h) => (
                  <option key={h.id} value={h.id}>Version {h.version}, {h.status}, {fmtDate(h.generated_at)}</option>
                ))}
              </select>
            ) : null}
            <div className="seg" role="group" aria-label="Report mode">
              <button type="button" className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Preview Handover</button>
              {isDraft && can('handover.generate') ? (
                <button type="button" className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit Report</button>
              ) : null}
            </div>
            <span className="grow" />
            {isDraft && can('handover.generate') ? (
              <button type="button" className="btn" disabled={busy !== null} onClick={() => void run('save', () => Api.saveHandover(current.id, overview, plan), 'Draft saved')}>
                Save Draft
              </button>
            ) : null}
            {isDraft && can('handover.approve') ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void run('approve', async () => {
                  await Api.saveHandover(current.id, overview, plan);
                  await Api.approveHandover(current.id);
                }, 'Handover approved')}
              >
                Approve Handover
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void run('pdf', () => downloadHandoverPdf(current.id, `handover-${project.name.replace(/\W+/g, '-')}-v${current.version}.pdf`), 'PDF downloaded')}
            >
              Download PDF
            </button>
            {can('handover.share') ? (
              <button type="button" className="btn btn-pink" disabled={busy !== null || current.status === 'draft'} title={current.status === 'draft' ? 'Approve the handover first' : undefined} onClick={() => void run('share', () => Api.shareHandover(current.id), 'Shared with the incoming owner')}>
                {current.status === 'shared' ? 'Share again' : 'Share Handover'}
              </button>
            ) : null}
          </div>
          {isDraft && !can('handover.approve') ? <div className="banner banner-info small">You can edit the draft. Approval needs a team lead, or a reviewer the team lead has authorised.</div> : null}
          {current.status === 'shared' ? (
            <div className="banner banner-info small">
              Shared {fmtDate(current.shared_at)}.{' '}
              {current.acknowledged_by ? `Receipt acknowledged by ${current.acknowledged_by} on ${fmtDate(current.acknowledged_at)}.` : 'Waiting for the incoming owner to acknowledge receipt.'}
            </div>
          ) : null}

          {mode === 'edit' && isDraft ? (
            <div className="card flex flex-col gap-4">
              <div className="label">
                <label htmlFor="ho-overview">Project overview</label>
                <textarea id="ho-overview" className="textarea" style={{ minHeight: 140, fontFamily: 'inherit' }} value={overview} onChange={(e) => setOverview(e.target.value)} />
              </div>
              <div className="eyebrow">First-week action plan</div>
              {plan.map((p, i) => (
                <div key={i} className="card-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <div className="label"><label htmlFor={`pd-${i}`}>When</label><input id={`pd-${i}`} className="input" value={p.day} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} /></div>
                  <div className="label"><label htmlFor={`pt-${i}`}>Action</label><input id={`pt-${i}`} className="input" value={p.title} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></div>
                  <div className="label" style={{ gridColumn: '1 / -1' }}><label htmlFor={`pn-${i}`}>Detail</label><input id={`pn-${i}`} className="input" value={p.detail} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)))} /></div>
                  <div><button type="button" className="btn btn-sm" onClick={() => setPlan(plan.filter((_, j) => j !== i))}>Remove</button></div>
                </div>
              ))}
              <div>
                <button type="button" className="btn btn-sm" onClick={() => setPlan([...plan, { day: 'Day 1', title: '', detail: '', claim_id: null }])}>Add step</button>
              </div>
              <p className="small muted">Claims cannot be edited here. Change them in the Review Workspace and regenerate the draft.</p>
            </div>
          ) : (
            <HandoverView handover={{ ...current, content: isDraft ? { ...current.content, overview, first_week_plan: plan } : current.content }} onInspect={setInspect} />
          )}
        </>
      ) : null}
      {inspect ? <EvidenceDrawer claim={inspect} canReadSource={project.permissions.includes('sources.read')} onClose={() => setInspect(null)} /> : null}
    </>
  );
}

export default function HandoverPage() {
  return <RequireProject>{(p) => <Inner project={p} />}</RequireProject>;
}
