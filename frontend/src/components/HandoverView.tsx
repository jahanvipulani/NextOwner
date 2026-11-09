import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ClaimLite, Handover } from '../types';
import ClaimDetails from './ClaimDetails';
import StatusPill from './StatusPill';
import ReviewBadge from './ReviewBadge';
import CategoryTag from './CategoryTag';
import { detailValue, fmtDate } from '../utils/format';

interface Props {
  handover: Handover;
  onInspect?: (claim: ClaimLite) => void;
  checklist?: boolean;
}

function ClaimRow({ claim, onInspect }: { claim: ClaimLite; onInspect?: (c: ClaimLite) => void }) {
  return (
    <li className="card-2 flex flex-col gap-2 list-none">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag category={claim.category} />
        <StatusPill status={claim.evidence_status} />
        <ReviewBadge status={claim.status} />
      </div>
      <div className="font-medium">{claim.text}</div>
      <ClaimDetails category={claim.category} details={claim.details} />
      {onInspect ? (
        <div>
          <button type="button" className="btn btn-sm" onClick={() => onInspect(claim)}>
            Inspect evidence ({claim.evidence.length})
          </button>
        </div>
      ) : null}
    </li>
  );
}

function Section({ n, title, count, children }: { n: number; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-3">
        <span className="mono-quote muted">{n}.</span>
        {title}
        {count !== undefined ? <span className="small muted" style={{ fontFamily: 'IBM Plex Sans' }}>{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

function ClaimList({ items, onInspect, empty }: { items: ClaimLite[]; onInspect?: (c: ClaimLite) => void; empty: string }) {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="m-0 flex flex-col gap-2 p-0">
      {items.map((c) => (
        <ClaimRow key={c.id} claim={c} onInspect={onInspect} />
      ))}
    </ul>
  );
}

export default function HandoverView({ handover, onInspect, checklist }: Props) {
  const c = handover.content;
  const [done, setDone] = useState<Record<number, boolean>>({});
  const pending = c.responsibilities.filter((r) => !/done|complete|closed/i.test(detailValue(r.details, 'status') ?? ''));
  const unresolvedAll = [...c.questions, ...c.unresolved.filter((u) => !c.questions.some((q) => q.id === u.id))];

  return (
    <article className="flex flex-col gap-8">
      <div className="card flex flex-wrap items-center gap-3">
        <h2 className="grow">{handover.project_name}</h2>
        <span className="tag tag-royal">Version {handover.version}</span>
        <span className={handover.status === 'draft' ? 'tag tag-pink' : 'tag tag-soft'}>
          {handover.status === 'draft' ? 'Draft: not approved' : handover.status === 'approved' ? 'Approved' : 'Shared'}
        </span>
        <span className="small muted">Generated {fmtDate(handover.generated_at)}</span>
        {handover.approved_by ? <span className="small muted">Approved by {handover.approved_by}</span> : null}
      </div>

      {c.withheld_count && c.withheld_count > 0 ? (
        <div className="banner banner-info small">
          {c.withheld_count} item{c.withheld_count === 1 ? '' : 's'} withheld because they are confidential or not authorised for your role.
        </div>
      ) : null}

      <Section n={1} title="Project overview">
        <p className="max-w-3xl" style={{ whiteSpace: 'pre-wrap' }}>
          {c.overview || 'No overview written yet.'}
        </p>
      </Section>
      <Section n={2} title="Key decisions and rationale" count={c.decisions.length}>
        <ClaimList items={c.decisions} onInspect={onInspect} empty="No approved decisions." />
      </Section>
      <Section n={3} title="Current responsibilities" count={c.responsibilities.length}>
        <ClaimList items={c.responsibilities} onInspect={onInspect} empty="No approved responsibilities." />
      </Section>
      <Section n={4} title="Pending tasks" count={pending.length}>
        <ClaimList items={pending} onInspect={onInspect} empty="No pending tasks are recorded." />
      </Section>
      <Section n={5} title="Risks and blockers" count={c.risks.length}>
        <ClaimList items={c.risks} onInspect={onInspect} empty="No approved risks." />
      </Section>
      <Section n={6} title="Dependencies" count={c.dependencies.length}>
        <ClaimList items={c.dependencies} onInspect={onInspect} empty="No approved dependencies." />
      </Section>
      <Section n={7} title="Unresolved questions and open issues" count={unresolvedAll.length}>
        <div className="banner banner-warn small">
          These items are not confirmed. Do not treat them as verified project facts.
        </div>
        <ClaimList items={unresolvedAll} onInspect={onInspect} empty="Nothing unresolved." />
      </Section>
      <Section n={8} title="Important contacts" count={c.contacts.length}>
        <ClaimList items={c.contacts} onInspect={onInspect} empty="No approved contacts." />
      </Section>
      <Section n={9} title="Evidence references" count={c.evidence_refs.length}>
        {c.evidence_refs.length === 0 ? (
          <p className="muted">No evidence references.</p>
        ) : (
          <div className="scroll-x card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Page</th>
                  <th>Reference</th>
                  <th>Passage</th>
                </tr>
              </thead>
              <tbody>
                {c.evidence_refs.map((r, i) => (
                  <tr key={`${r.claim_id}-${i}`}>
                    <td>{r.source_name}</td>
                    <td>{r.page !== null ? r.page : 'Unknown'}</td>
                    <td className="mono-quote">{r.reference}</td>
                    <td className="mono-quote">{r.quote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section n={10} title="First-week action plan" count={c.first_week_plan.length}>
        {c.first_week_plan.length === 0 ? (
          <p className="muted">No plan has been written.</p>
        ) : (
          <ol className="m-0 flex flex-col gap-2 p-0">
            {c.first_week_plan.map((p, i) => (
              <li key={i} className="card-2 flex list-none items-start gap-3">
                {checklist ? (
                  <input
                    type="checkbox"
                    aria-label={`Mark ${p.title} done`}
                    checked={!!done[i]}
                    onChange={(e) => setDone((d) => ({ ...d, [i]: e.target.checked }))}
                    style={{ marginTop: 5, width: 16, height: 16, accentColor: 'var(--royal)' }}
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="eyebrow">{p.day}</div>
                  <div className="font-medium" style={done[i] ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>
                    {p.title}
                  </div>
                  <div className="small muted">{p.detail}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </article>
  );
}
