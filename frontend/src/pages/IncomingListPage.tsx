import { Link } from 'react-router-dom';
import { Api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import { fmtDate } from '../utils/format';

export default function IncomingListPage() {
  const list = useAsync(() => Api.incomingList(), []);
  const rows = list.data ?? [];
  return (
    <>
      <PageHeader eyebrow="Incoming owner" title="Handovers shared with you" subtitle="Only approved, authorised information appears here." />
      {list.loading ? <Spinner label="Loading handovers" /> : null}
      <ErrorBanner message={list.error} onRetry={list.reload} />
      {!list.loading && rows.length === 0 ? <EmptyState title="Nothing has been shared with you yet" text="When a team lead shares an approved handover, it appears here and you get a notification." /> : null}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {rows.map((h) => (
          <Link key={h.id} to={`/incoming/${h.id}`} className="card card-link flex flex-col gap-2">
            <h3>{h.project_name}</h3>
            <div className="flex flex-wrap gap-2">
              <span className="tag tag-royal">Version {h.version}</span>
              <span className={h.acknowledged_at ? 'tag tag-soft' : 'tag tag-pink'}>{h.acknowledged_at ? 'Receipt acknowledged' : 'Needs acknowledgement'}</span>
            </div>
            <div className="small muted">Approved by {h.approved_by ?? 'Unknown'}, shared {fmtDate(h.shared_at)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
