import { useEffect } from 'react';
import type { ClaimLite } from '../types';
import EvidencePanel from './EvidencePanel';
import CategoryTag from './CategoryTag';
import StatusPill from './StatusPill';

interface Props {
  claim: ClaimLite;
  canReadSource: boolean;
  onClose: () => void;
}

/** Side drawer that shows the evidence behind one claim. */
export default function EvidenceDrawer({ claim, canReadSource, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex justify-end"
      style={{ background: 'rgba(15,20,28,0.55)', zIndex: 60 }}
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="flex h-full w-full flex-col gap-4 overflow-auto p-5"
        style={{ maxWidth: 560, background: 'var(--surface)', borderLeft: '1px solid var(--line)' }}
        role="dialog"
        aria-label="Evidence for this claim"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryTag category={claim.category} />
            <StatusPill status={claim.evidence_status} />
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <h2>{claim.text}</h2>
        <EvidencePanel evidence={claim.evidence} canReadSource={canReadSource} />
      </aside>
    </div>
  );
}
