import { useApi, useRefresh } from '../hooks/useApi.js';
import { useAutoRefresh } from '../hooks/useAutoRefresh.js';
import { api } from '../services/api.js';
import { AUTO_REFRESH_SECONDS } from '../constants.js';
import { formatDateTime } from '../utils/format.js';
import AutoRefreshControl from './AutoRefreshControl.jsx';

export default function RefreshButton({ onDone }) {
  const { data: summary, reload } = useApi(() => api.summary(), []);
  const { running, progress, start } = useRefresh(() => {
    reload();
    onDone?.();
  });
  const { secondsLeft, paused, toggle } = useAutoRefresh({
    seconds: AUTO_REFRESH_SECONDS,
    busy: running,
    onTrigger: start,
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
      <AutoRefreshControl secondsLeft={secondsLeft} paused={paused} onToggle={toggle} />
      <button type="button" className="refresh-btn" onClick={start} disabled={running}>
        {running && <span className="spin" aria-hidden="true" />}
        {label}
      </button>
    </div>
  );
}
