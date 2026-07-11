import { formatDate } from '../utils/format.js';

export const RANGE_PRESETS = [
  { key: 'all', label: 'All', days: null },
  { key: 'year', label: 'Year', days: 365 },
  { key: 'month', label: 'Month', days: 30 },
  { key: 'week', label: 'Week', days: 7 },
  { key: 'day', label: 'Today', days: 1 },
];

/** First date (YYYY-MM-DD, UTC) covered by a preset, or null for all history. */
export function sinceForPreset(key, now = new Date()) {
  const preset = RANGE_PRESETS.find((p) => p.key === key);
  if (!preset || preset.days === null) return null;
  const start = new Date(now.getTime() - (preset.days - 1) * 86400000);
  return start.toISOString().slice(0, 10);
}

export default function RangeFilter({ value, onChange, firstActivity }) {
  const since = sinceForPreset(value);
  const caption =
    since === null
      ? firstActivity
        ? `${formatDate(firstActivity)} → today · all history`
        : 'all history'
      : `${formatDate(since)} → today`;

  return (
    <div className="range-filter" role="group" aria-label="Date range">
      <div className="range-pills">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={value === preset.key ? 'active' : ''}
            aria-pressed={value === preset.key}
            onClick={() => onChange(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <span className="range-caption">{caption}</span>
    </div>
  );
}
