import { useNavigate } from 'react-router-dom';
import { Api, downloadHandoverPdf } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { useProject } from '../context/ProjectContext';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';
import { fmtDate } from '../utils/format';
import { formatError } from '../utils/errors';

export default function ReportsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { select, projects } = useProject();
  const list = useAsync(() => Api.allHandovers(), []);
  const rows = list.data ?? [];
  const roleOf = (projectId: number) => projects.find((p) => p.id === projectId)?.my_role;

  return (
    <>
      <PageHeader eyebrow="Handover" title="Handover Reports" subtitle="Every handover version you are allowed to see, across projects." />
      {list.loading ? <Spinner label="Loading reports" /> : null}
      <ErrorBanner message={list.error} onRetry={list.reload} />
      {!list.loading && rows.length === 0 ? <EmptyState title="No handover reports yet" text="Generate one from the Generate Handover page after reviewing claims." /> : null}
      {rows.length > 0 ? (
        <div className="card scroll-x">
          <table className="tbl">
            <thead><tr><th>Project</th><th>Version</th><th>Status</th><th>Generated</th><th>Approved by</th><th>Acknowledged</th><th /></tr></thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td>{h.project_name}</td>
                  <td>v{h.version}</td>
                  <td><span className={h.status === 'draft' ? 'tag tag-pink' : 'tag tag-soft'}>{h.status}</span></td>
                  <td>{fmtDate(h.generated_at)}</td>
                  <td>{h.approved_by ?? 'Not approved'}</td>
                  <td>{h.acknowledged_by ? `${h.acknowledged_by}, ${fmtDate(h.acknowledged_at)}` : 'No'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-sm" onClick={() => {
                        if (roleOf(h.project_id) === 'incoming_owner') nav(`/incoming/${h.id}`);
                        else { select(h.project_id); nav('/handover'); }
                      }}>Open</button>
                      <button type="button" className="btn btn-sm" onClick={() => {
                        downloadHandoverPdf(h.id, `handover-${h.project_name.replace(/\W+/g, '-')}-v${h.version}.pdf`).then(
                          () => toast.push('PDF downloaded'),
                          (e: unknown) => toast.push(formatError(e), 'error'),
                        );
                      }}>PDF</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
