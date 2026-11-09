import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Api, downloadHandoverPdf } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import HandoverView from '../components/HandoverView';
import EvidenceDrawer from '../components/EvidenceDrawer';
import { fmtDate } from '../utils/format';
import { formatError } from '../utils/errors';
import type { ClaimLite } from '../types';

export default function IncomingDetailPage() {
  const { id } = useParams();
  const hid = Number(id);
  const toast = useToast();
  const data = useAsync(() => Api.incoming(hid), [hid]);
  const [inspect, setInspect] = useState<ClaimLite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = data.data;

  async function ack() {
    setBusy(true);
    setError(null);
    try {
      data.setData(await Api.acknowledge(hid));
      toast.push('Receipt acknowledged');
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Incoming owner"
        title={h ? `Handover: ${h.project_name}` : 'Handover'}
        subtitle="Approved project knowledge, with the evidence you are authorised to see."
        actions={<Link className="btn" to="/incoming">All handovers</Link>}
      />
      {data.loading ? <Spinner label="Loading handover" /> : null}
      <ErrorBanner message={data.error} onRetry={data.reload} />
      <ErrorBanner message={error} />
      {h ? (
        <>
          <div className="card flex flex-wrap items-center gap-3">
            {h.acknowledged_at ? (
              <span className="tag tag-soft">Receipt acknowledged by {h.acknowledged_by}, {fmtDate(h.acknowledged_at)}</span>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void ack()}>Acknowledge receipt</button>
            )}
            <button type="button" className="btn" onClick={() => void downloadHandoverPdf(h.id, `handover-v${h.version}.pdf`).catch((e: unknown) => toast.push(formatError(e), 'error'))}>Download PDF</button>
            <span className="small muted">Tick off first-week steps as you go. Ticks are not saved.</span>
          </div>
          <HandoverView handover={h} onInspect={setInspect} checklist />
        </>
      ) : null}
      {inspect ? <EvidenceDrawer claim={inspect} canReadSource={false} onClose={() => setInspect(null)} /> : null}
    </>
  );
}
