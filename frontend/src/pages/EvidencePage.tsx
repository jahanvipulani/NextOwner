import { useState } from 'react';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import RequireProject from '../components/RequireProject';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import ClaimDetails from '../components/ClaimDetails';
import EvidencePanel from '../components/EvidencePanel';
import StatusPill from '../components/StatusPill';
import ReviewBadge from '../components/ReviewBadge';
import CategoryTag from '../components/CategoryTag';
import { CATEGORY_LABELS, CATEGORY_ORDER, EVIDENCE_LABELS } from '../utils/format';
import type { Claim, EvidenceStatus, ProjectDetail } from '../types';

const EVIDENCE_ORDER: EvidenceStatus[] = ['verified', 'single_source', 'conflicting', 'no_evidence'];

function Inner({ project }: { project: ProjectDetail }) {
  const [category, setCategory] = useState('');
  const [evidenceStatus, setEvidenceStatus] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const canReadSource = project.permissions.includes('sources.read');
  const sources = useAsync(() => (canReadSource ? Api.listSources(project.id) : Promise.resolve([])), [project.id, canReadSource]);
  const claims = useAsync(
    () =>
      Api.listClaims(project.id, {
        category: category || undefined,
        evidence_status: evidenceStatus || undefined,
        source_id: sourceId ? Number(sourceId) : undefined,
        q: q.trim() || undefined,
      }),
    [project.id, category, evidenceStatus, sourceId, q],
  );

  const list: Claim[] = claims.data ?? [];
  const tally: Record<EvidenceStatus, number> = { verified: 0, single_source: 0, conflicting: 0, no_evidence: 0 };
  list.forEach((c) => {
    tally[c.evidence_status] += 1;
  });

  return (
    <>
      <PageHeader
        eyebrow="Step 4 · Verify"
        title="Evidence Explorer"
        subtitle="Every claim links to the passage it came from. Open a claim to inspect the original source."
      />
      <div className="card flex flex-wrap items-end gap-3">
        <div className="label" style={{ minWidth: 120 }}>
          <label htmlFor="ev-project">Project</label>
          <input id="ev-project" className="input" value={project.name} readOnly />
        </div>
        <div className="label">
          <label htmlFor="ev-cat">Claim type</label>
          <select id="ev-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All types</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div className="label">
          <label htmlFor="ev-status">Evidence status</label>
          <select id="ev-status" className="select" value={evidenceStatus} onChange={(e) => setEvidenceStatus(e.target.value)}>
            <option value="">All statuses</option>
            {EVIDENCE_ORDER.map((s) => (
              <option key={s} value={s}>{EVIDENCE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        {canReadSource ? (
          <div className="label">
            <label htmlFor="ev-source">Source document</label>
            <select id="ev-source" className="select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">All sources</option>
              {(sources.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="label grow" style={{ minWidth: 180 }}>
          <label htmlFor="ev-q">Search claims</label>
          <input id="ev-q" className="input" placeholder="Search text" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 small">
        <span className="muted">{list.length} claims</span>
        {EVIDENCE_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <StatusPill status={s} /> {tally[s]}
          </span>
        ))}
      </div>

      {claims.loading ? <Spinner label="Loading claims" /> : null}
      <ErrorBanner message={claims.error} onRetry={claims.reload} />
      {!claims.loading && !claims.error && list.length === 0 ? (
        <EmptyState title="No claims match" text="Run Knowledge Reconstruction first, or clear the filters." />
      ) : null}

      <div className="flex flex-col gap-3">
        {list.map((c) => {
          const open = openId === c.id;
          return (
            <article key={c.id} className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryTag category={c.category} />
                <StatusPill status={c.evidence_status} />
                <ReviewBadge status={c.status} />
                <span className="small muted">{c.evidence.length} source passage{c.evidence.length === 1 ? '' : 's'}</span>
              </div>
              <div className="font-medium" style={{ fontSize: 16 }}>{c.text}</div>
              {c.evidence_note ? <div className="banner banner-warn small">{c.evidence_note}</div> : null}
              <div>
                <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpenId(open ? null : c.id)}>
                  {open ? 'Hide evidence' : 'Inspect evidence'}
                </button>
              </div>
              {open ? (
                <div className="flex flex-col gap-3">
                  <ClaimDetails category={c.category} details={c.details} />
                  <EvidencePanel evidence={c.evidence} canReadSource={canReadSource} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}

export default function EvidencePage() {
  return <RequireProject>{(p) => <Inner project={p} />}</RequireProject>;
}
