import { useState } from 'react';
import { Api } from '../services/api';
import type { Evidence, SourcePage } from '../types';
import { fmtDate, orUnknown } from '../utils/format';
import { formatError } from '../utils/errors';
import SourceText from './SourceText';
import Spinner from './Spinner';

interface Props {
  evidence: Evidence[];
  canReadSource: boolean;
}

export default function EvidencePanel({ evidence, canReadSource }: Props) {
  const [pagesBySource, setPagesBySource] = useState<Record<number, SourcePage[]>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(ev: Evidence) {
    const isOpen = !!open[ev.id];
    setOpen((o) => ({ ...o, [ev.id]: !isOpen }));
    if (isOpen || pagesBySource[ev.source_id]) return;
    setLoadingId(ev.id);
    setError(null);
    try {
      const res = await Api.getSource(ev.source_id);
      setPagesBySource((p) => ({ ...p, [ev.source_id]: res.pages }));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoadingId(null);
    }
  }

  if (evidence.length === 0) {
    return <p className="muted small">No evidence found for this claim.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <div className="field-error">{error}</div> : null}
      {evidence.map((ev) => {
        const pages = pagesBySource[ev.source_id];
        const page = pages ? (pages.find((p) => p.page === ev.page) ?? pages[0]) : undefined;
        return (
          <div key={ev.id} className="card-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{ev.source_name}</strong>
              <span className="tag">{ev.source_type.replace('_', ' ')}</span>
              {ev.confidential ? <span className="tag tag-pink">Confidential</span> : null}
            </div>
            <blockquote className="mono-quote m-0 border-l-2 pl-3" style={{ borderColor: 'var(--royal)' }}>
              {'“'}
              {ev.quote}
              {'”'}
            </blockquote>
            <div className="small muted flex flex-wrap gap-x-4 gap-y-1">
              <span>Author: {orUnknown(ev.author)}</span>
              <span>Date: {ev.date ? fmtDate(ev.date) : 'Unknown'}</span>
              <span>Page: {ev.page !== null ? ev.page : 'Unknown'}</span>
              {ev.location ? <span>Location: {ev.location}</span> : null}
              <span>Reference: {ev.reference}</span>
            </div>
            {canReadSource ? (
              <div>
                <button type="button" className="btn btn-sm" onClick={() => void toggle(ev)}>
                  {open[ev.id] ? 'Hide source text' : 'Show original source text'}
                </button>
                {open[ev.id] ? (
                  <div className="mt-2">
                    {loadingId === ev.id ? (
                      <Spinner label="Loading source" />
                    ) : page ? (
                      <SourceText text={page.text} quote={ev.quote} />
                    ) : (
                      <p className="muted small">Source text is not available.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
