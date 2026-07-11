import { AUTO_REFRESH_SECONDS } from '../constants.js';

/** Auto-refresh countdown pill: pause/resume toggle + always-visible seconds. */
export default function AutoRefreshControl({ secondsLeft, paused, onToggle }) {
  return (
    <div className="auto-refresh" title={`Auto refresh every ${AUTO_REFRESH_SECONDS}s`}>
      <button
        type="button"
        className="auto-refresh-toggle"
        onClick={onToggle}
        aria-label={paused ? 'Resume auto refresh' : 'Pause auto refresh'}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      <span className="auto-refresh-count">
        {paused ? `Paused · ${secondsLeft}s` : `Next in ${secondsLeft}s`}
      </span>
    </div>
  );
}
