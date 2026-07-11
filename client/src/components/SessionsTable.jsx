import { Link } from 'react-router-dom';
import ModelTag from './ModelTag.jsx';
import { formatMoney, formatTokens, formatCount, formatDateTime, formatDuration } from '../utils/format.js';

export default function SessionsTable({ sessions }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Session</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Models</th>
            <th className="num">Prompts</th>
            <th className="num">Requests</th>
            <th className="num">Output</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.session_id}>
              <td>
                <Link className="row-link" to={`/sessions/${s.session_id}`}>
                  {s.session_id.slice(0, 8)}…
                </Link>
                {s.git_branch && (
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{s.git_branch}</div>
                )}
              </td>
              <td>{formatDateTime(s.started_at)}</td>
              <td>{formatDuration(s.started_at, s.ended_at)}</td>
              <td>
                {JSON.parse(s.models || '[]')
                  .filter((m) => m !== '<synthetic>')
                  .slice(0, 2)
                  .map((m) => (
                    <div key={m}><ModelTag model={m} /></div>
                  ))}
              </td>
              <td className="num">{formatCount(s.user_messages)}</td>
              <td className="num">{formatCount(s.requests)}</td>
              <td className="num">{formatTokens(s.output_tokens)}</td>
              <td className="num" style={{ fontWeight: 600 }}>{formatMoney(s.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
