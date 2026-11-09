import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { useProject } from '../context/ProjectContext';
import RequireProject from '../components/RequireProject';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import ClaimDetails from '../components/ClaimDetails';
import StatusPill from '../components/StatusPill';
import ReviewBadge from '../components/ReviewBadge';
import { CATEGORY_LABELS, CATEGORY_ORDER, fmtDateTime } from '../utils/format';
import { formatError } from '../utils/errors';
import type { Category, ProjectDetail, ReconstructResult } from '../types';

function Inner({ project }: { project: ProjectDetail }) {
  const toast = useToast();
  const { refreshSelected } = useProject();
  const recon = useAsync(() => Api.reconstruction(project.id), [project.id]);
  const [tab, setTab] = useState<Category>('decision');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReconstructResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRun = project.permissions.includes('knowledge.reconstruct');
  const canView = project.permissions.includes('knowledge.view');

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const r = await Api.reconstruct(project.id);
      setResult(r);
      toast.push(`Reconstruction finished: ${r.claims_created} new claims`);
      recon.reload();
      await refreshSelected();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setRunning(false);
    }
  }

  const claims = (recon.data?.claims ?? []).filter((c) => c.category === tab);
  const counts = recon.data?.by_category ?? {};

  return (
    <>
      <PageHeader
        eyebrow="Step 3 · Reconstruct"
        title="Knowledge Reconstruction"
        subtitle="Convert project activity into structured, actionable knowledge."
      />
      <div className="card flex flex-wrap items-center gap-4">
        <button type="button" className="btn btn-primary" style={{ padding: '14px 22px', fontSize: 15, letterSpacing: '0.04em' }} disabled={!canRun || running || project.source_count === 0} onClick={() => void run()}>
          {running ? 'RECONSTRUCTING' : 'RECONSTRUCT PROJECT KNOWLEDGE'}
        </button>
        <div className="small muted" style={{ flex: '1 1 260px' }}>
          {!canRun
            ? 'Only a team lead or reviewer can run reconstruction.'
            : project.source_count === 0
              ? 'Add at least one source first.'
              : 'Reads the permitted sources, extracts claims with their source passages and keeps anything you already reviewed. Pending claims are replaced.'}
        </div>
        {project.source_count === 0 ? <Link to="/sources" className="btn">Connect sources</Link> : null}
      </div>
      {running ? <Spinner label="Reading sources and extracting claims. This can take a minute." /> : null}
      <ErrorBanner message={error} />

      {result ? (
        <div className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2>Run summary</h2>
            <span className={result.mode === 'llm' ? 'tag tag-royal' : 'tag'}>{result.mode === 'llm' ? 'LLM extraction' : 'Rule-based extraction'}</span>
          </div>
          <div className="small muted">
            {result.sources_used} source{result.sources_used === 1 ? '' : 's'} used, {result.sources_skipped} skipped, {result.claims_created} claims created.
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill status="verified" /> <span className="small">{result.evidence_status.verified}</span>
            <StatusPill status="single_source" /> <span className="small">{result.evidence_status.single_source}</span>
            <StatusPill status="conflicting" /> <span className="small">{result.evidence_status.conflicting}</span>
            <StatusPill status="no_evidence" /> <span className="small">{result.evidence_status.no_evidence}</span>
          </div>
          {result.warnings.map((w) => (
            <div key={w} className="banner banner-warn small">{w}</div>
          ))}
        </div>
      ) : null}

      {recon.loading ? <Spinner label="Loading extracted knowledge" /> : null}
      <ErrorBanner message={recon.error} onRetry={recon.reload} />
      {!canView ? <div className="banner banner-info">Your role cannot view extracted knowledge.</div> : null}

      {recon.data && canView ? (
        <>
          {recon.data.last_run ? (
            <p className="small muted">Last run {fmtDateTime(recon.data.last_run.at)} using {recon.data.last_run.mode === 'llm' ? 'LLM extraction' : 'rule-based extraction'}.</p>
          ) : null}
          <div className="tabs" role="tablist">
            {CATEGORY_ORDER.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={tab === c} className={`tab ${tab === c ? 'tab-on' : ''}`} onClick={() => setTab(c)}>
                {CATEGORY_LABELS[c]} ({counts[c] ?? 0})
              </button>
            ))}
          </div>
          {claims.length === 0 ? (
            <EmptyState title={`No ${CATEGORY_LABELS[tab].toLowerCase()} found`} text="The sources do not contain enough information. NextOwner does not invent project facts." />
          ) : (
            <div className="flex flex-col gap-3">
              {claims.map((c) => (
                <article key={c.id} className="card flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={c.evidence_status} />
                    <ReviewBadge status={c.status} />
                  </div>
                  <div className="font-medium" style={{ fontSize: 16 }}>{c.text}</div>
                  <ClaimDetails category={c.category} details={c.details} />
                  <div className="small muted">
                    {c.evidence.length === 0
                      ? 'No evidence found'
                      : `Evidence: ${c.evidence.map((e) => e.reference).join('; ')}`}
                  </div>
                </article>
              ))}
            </div>
          )}
          {recon.data.claims.length > 0 ? (
            <div className="flex gap-2">
              <Link to="/evidence" className="btn">Open Evidence Explorer</Link>
              <Link to="/review" className="btn btn-primary">Go to review</Link>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default function ReconstructionPage() {
  return <RequireProject>{(p) => <Inner project={p} />}</RequireProject>;
}
