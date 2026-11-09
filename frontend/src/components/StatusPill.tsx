import type { EvidenceStatus } from '../types';
import { EVIDENCE_LABELS } from '../utils/format';

const META: Record<EvidenceStatus, { icon: string; cls: string; hint: string }> = {
  verified: { icon: '✓', cls: 'pill-verified', hint: 'Supported by multiple consistent sources' },
  single_source: { icon: '1', cls: 'pill-single', hint: 'Supported by one source only' },
  conflicting: { icon: '≠', cls: 'pill-conflict', hint: 'Sources contradict each other; a reviewer must decide' },
  no_evidence: { icon: '?', cls: 'pill-none', hint: 'No supporting source was identified' },
};

export default function StatusPill({ status }: { status: EvidenceStatus }) {
  const m = META[status];
  return (
    <span className={`pill ${m.cls}`} title={m.hint}>
      <i aria-hidden="true">{m.icon}</i>
      <span>{EVIDENCE_LABELS[status]}</span>
    </span>
  );
}
