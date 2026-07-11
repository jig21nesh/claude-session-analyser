import { useApi, useRefresh } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import { formatDateTime } from '../utils/format.js';

export default function RefreshButton({ onDone }) {
  const { data: summary, reload } = useApi(() => api.summary(), []);
  const { running, progress, start } = useRefresh(() => {
    reload();
    onDone?.();
  });

  const label = running
    ? progress?.total
      ? `Analysing ${progress.processed}/${progress.total}`
      : 'Analysing…'
    : 'Refresh analysis';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div className="refresh-meta">
        Last analysed
        <br />
        {formatDateTime(summary?.last_refresh_at)}
      </div>
      <button type="button" className="refresh-btn" onClick={start} disabled={running}>
        {running && <span className="spin" aria-hidden="true" />}
        {label}
      </button>
    </div>
  );
}
