import { Link } from 'react-router-dom';
import { IMPROVEMENT_CATEGORY_LABELS } from '../constants.js';
import { formatMoney } from '../utils/format.js';

const SEVERITY_ICONS = { high: '▲', medium: '◆', low: '●' };

export default function ImprovementCard({ item }) {
  return (
    <article className={`improvement ${item.severity}`}>
      <div className="improvement-head">
        <span className={`badge ${item.severity}`}>
          {SEVERITY_ICONS[item.severity]} {item.severity}
        </span>
        <span className="improvement-title">{item.title}</span>
        {item.estimated_savings_usd > 0 && (
          <span className="improvement-savings">save ≈ {formatMoney(item.estimated_savings_usd)}</span>
        )}
      </div>
      <p className="improvement-body">{linkify(item.description)}</p>
      <div className="improvement-context">
        {IMPROVEMENT_CATEGORY_LABELS[item.category] || item.category}
        {item.project_name && (
          <>
            {' · '}
            <Link to={`/projects/${item.project_id}`}>{item.project_name}</Link>
          </>
        )}
        {item.session_uuid && (
          <>
            {' · session '}
            <Link to={`/sessions/${item.session_uuid}`}>{item.session_uuid.slice(0, 8)}…</Link>
          </>
        )}
      </div>
    </article>
  );
}

function linkify(text) {
  const parts = String(text).split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}
