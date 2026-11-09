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
import EvidencePanel from '../components/EvidencePanel';
import StatusPill from '../components/StatusPill';
import ReviewBadge from '../components/ReviewBadge';
import CategoryTag from '../components/CategoryTag';
import { CATEGORY_LABELS, CATEGORY_ORDER, DETAIL_FIELDS, detailValue, fmtDateTime, orUnknown } from '../utils/format';
import { formatError } from '../utils/errors';
import type { Claim, ClaimDetailResponse, HistoryEntry, ProjectDetail } from '../types';

type View = 'pending' | 'reviewed' | 'all' | 'history';

function ClaimCard({ claim, project, onChanged }: { claim: Claim; project: ProjectDetail; onChanged: () => void }) {
  const toast = useToast();
  const canReview = project.permissions.includes('claims.review');
  const canComment = project.permissions.includes('claims.comment');
  const [showEvidence, setShowEvidence] = useState(false);
  const [detail, setDetail] = useState<ClaimDetailResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(claim.text);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDetail() {
    try {
      setDetail(await Api.getClaim(claim.id));
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function act(action: 'accept' | 'edit' | 'reject' | 'unknown') {
    setBusy(true);
    setError(null);
    try {
      const details: Record<string, string | null> = {};
      if (action === 'edit') {
        DETAIL_FIELDS[claim.category].forEach((f) => {
          const v = fields[f.key];
          if (v !== undefined && v !== (detailValue(claim.details, f.key) ?? '')) details[f.key] = v.trim() === '' ? null : v.trim();
        });
      }
      await Api.reviewClaim(claim.id, {
        action,
        text: action === 'edit' ? text : undefined,
        details: Object.keys(details).length > 0 ? details : undefined,
        comment: comment.trim() || undefined,
      });
      toast.push({ accept: 'Claim accepted', edit: 'Claim edited', reject: 'Claim rejected', unknown: 'Claim marked unknown' }[action]);
      setEditing(false);
      setComment('');
      setDetail(null);
      onChanged();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function addComment(kind: 'comment' | 'clarification' | 'information') {
    if (!comment.trim()) {
      setError('Write a comment first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Api.addComment(claim.id, comment.trim(), kind);
      toast.push(kind === 'clarification' ? 'Clarification requested' : 'Comment added');
      setComment('');
      await loadDetail();
      onChanged();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag category={claim.category} />
        <StatusPill status={claim.evidence_status} />
        <ReviewBadge status={claim.status} />
        {claim.reviewed_by ? <span className="small muted">by {claim.reviewed_by}, {fmtDateTime(claim.reviewed_at)}</span> : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="label">
            <label htmlFor={`txt-${claim.id}`}>Claim text</label>
            <textarea id={`txt-${claim.id}`} className="textarea" style={{ minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            {DETAIL_FIELDS[claim.category].map((f) => (
              <div className="label" key={f.key}>
                <label htmlFor={`f-${claim.id}-${f.key}`}>{f.label}</label>
                <input
                  id={`f-${claim.id}-${f.key}`}
                  className="input"
                  placeholder="Unknown"
                  defaultValue={detailValue(claim.details, f.key) ?? ''}
                  onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="font-medium" style={{ fontSize: 16 }}>{claim.text}</div>
          <ClaimDetails category={claim.category} details={claim.details} />
        </>
      )}

      {claim.evidence_note ? <div className="banner banner-warn small">{claim.evidence_note}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" aria-expanded={showEvidence} onClick={() => setShowEvidence((v) => !v)}>
          {showEvidence ? 'Hide evidence' : `View supporting evidence (${claim.evidence.length})`}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            if (!detail) void loadDetail();
            else setDetail(null);
          }}
        >
          {detail ? 'Hide comments and history' : `Comments (${claim.comment_count}) and history`}
        </button>
      </div>
      {showEvidence ? <EvidencePanel evidence={claim.evidence} canReadSource={project.permissions.includes('sources.read')} /> : null}

      {detail ? (
        <div className="card-2 flex flex-col gap-3">
          <div className="eyebrow">Comments</div>
          {detail.comments.length === 0 ? <p className="small muted">No comments yet.</p> : null}
          {detail.comments.map((c) => (
            <div key={c.id} className="small">
              <strong>{c.author}</strong> <span className="muted">({c.author_role}, {c.kind}, {fmtDateTime(c.created_at)})</span>
              <div>{c.body}</div>
            </div>
          ))}
          <div className="eyebrow">Review history</div>
          {detail.history.length === 0 ? <p className="small muted">Not reviewed yet.</p> : null}
          {detail.history.map((h) => (
            <div key={h.id} className="small">
              <strong>{h.reviewer}</strong> {h.action} on {fmtDateTime(h.created_at)}
              {h.previous.text !== h.updated.text ? (
                <div className="muted">Was: “{orUnknown(h.previous.text)}” → Now: “{orUnknown(h.updated.text)}”</div>
              ) : null}
              {h.comment ? <div>Comment: {h.comment}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {canReview || canComment ? (
        <div className="flex flex-col gap-2">
          <div className="label">
            <label htmlFor={`cm-${claim.id}`}>Comment (optional, saved with your action)</label>
            <textarea id={`cm-${claim.id}`} className="textarea" style={{ minHeight: 56 }} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          {error ? <div className="field-error">{error}</div> : null}
          <div className="flex flex-wrap gap-2">
            {canReview ? (
              editing ? (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act('edit')}>Save edit</button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act('accept')}>Accept</button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void act('reject')}>Reject</button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void act('unknown')}>Mark Unknown</button>
                </>
              )
            ) : null}
            {canComment ? (
              <>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void addComment('comment')}>Add comment</button>
                {canReview ? (
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void addComment('clarification')}>Request clarification</button>
                ) : (
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void addComment('information')}>Provide missing information</button>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function HistoryTable({ rows }: { rows: HistoryEntry[] }) {
  if (rows.length === 0) return <EmptyState title="No review history yet" text="Every accept, edit, reject and unknown action is recorded here." />;
  return (
    <div className="card scroll-x">
      <table className="tbl">
        <thead>
          <tr><th>When</th><th>Reviewer</th><th>Action</th><th>Claim</th><th>Previous</th><th>Updated</th><th>Comment</th></tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id}>
              <td>{fmtDateTime(h.created_at)}</td>
              <td>{h.reviewer}</td>
              <td>{h.action}</td>
              <td style={{ maxWidth: 260 }}>{h.claim_text}</td>
              <td>{h.previous.text !== h.updated.text ? orUnknown(h.previous.text) : h.previous.status ?? 'Unknown'}</td>
              <td>{h.previous.text !== h.updated.text ? orUnknown(h.updated.text) : h.updated.status ?? 'Unknown'}</td>
              <td>{h.comment ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inner({ project }: { project: ProjectDetail }) {
  const { refreshSelected } = useProject();
  const [view, setView] = useState<View>('pending');
  const [category, setCategory] = useState('');
  const claims = useAsync(() => Api.listClaims(project.id, { category: category || undefined }), [project.id, category]);
  const canReview = project.permissions.includes('claims.review');
  const history = useAsync(() => (canReview ? Api.reviewHistory(project.id) : Promise.resolve([])), [project.id, canReview, view === 'history']);

  const all = claims.data ?? [];
  const shown = all.filter((c) => (view === 'pending' ? c.status === 'pending' : view === 'reviewed' ? c.status !== 'pending' : true));
  const pendingCount = all.filter((c) => c.status === 'pending').length;

  function changed() {
    claims.reload();
    history.reload();
    void refreshSelected();
  }

  return (
    <>
      <PageHeader
        eyebrow="Step 5 · Review"
        title="Review Workspace"
        subtitle="Nothing becomes part of the handover until a reviewer accepts it. Accept, edit, reject or mark unknown, and leave a comment."
        actions={<Link className="btn btn-primary" to="/handover">Go to Generate Handover</Link>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="tabs" role="tablist">
          {([['pending', `Pending (${pendingCount})`], ['reviewed', 'Reviewed'], ['all', 'All claims'], ['history', 'Review history']] as [View, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`tab ${view === k ? 'tab-on' : ''}`} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
        {view !== 'history' ? (
          <select aria-label="Filter by claim type" className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All types</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        ) : null}
      </div>

      {!canReview ? <div className="banner banner-info small">Your role can comment on claims but cannot accept, edit or reject them.</div> : null}

      {view === 'history' ? (
        history.loading ? <Spinner label="Loading history" /> : <><ErrorBanner message={history.error} onRetry={history.reload} /><HistoryTable rows={history.data ?? []} /></>
      ) : (
        <>
          {claims.loading ? <Spinner label="Loading claims" /> : null}
          <ErrorBanner message={claims.error} onRetry={claims.reload} />
          {!claims.loading && shown.length === 0 ? (
            <EmptyState
              title={view === 'pending' ? 'No claims are waiting for review' : 'No claims here'}
              text={all.length === 0 ? 'Run Knowledge Reconstruction to extract claims from your sources.' : 'Switch tabs to see other claims.'}
              action={all.length === 0 ? <Link className="btn btn-primary" to="/reconstruction">Reconstruct knowledge</Link> : undefined}
            />
          ) : null}
          <div className="flex flex-col gap-3">
            {shown.map((c) => (
              <ClaimCard key={`${c.id}-${c.updated_at}`} claim={c} project={project} onChanged={changed} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function ReviewPage() {
  return <RequireProject>{(p) => <Inner project={p} />}</RequireProject>;
}
