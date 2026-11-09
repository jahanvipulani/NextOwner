import type { Category, ClaimDetailsMap } from '../types';
import { DETAIL_FIELDS, detailValue, orUnknown } from '../utils/format';

interface Props {
  category: Category;
  details: ClaimDetailsMap;
}

/** Label/value list for a claim's structured fields. Missing values read "Unknown". */
export default function ClaimDetails({ category, details }: Props) {
  return (
    <dl className="m-0 grid gap-x-6 gap-y-1 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
      {DETAIL_FIELDS[category].map((f) => {
        const v = detailValue(details, f.key);
        return (
          <div key={f.key} className="min-w-0">
            <dt className="eyebrow">{f.label}</dt>
            <dd className={`m-0 ${v ? '' : 'muted'}`} style={{ overflowWrap: 'anywhere' }}>
              {orUnknown(v)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
