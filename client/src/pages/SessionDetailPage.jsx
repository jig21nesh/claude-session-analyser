import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import StatTile from '../components/StatTile.jsx';
import ModelTag from '../components/ModelTag.jsx';
import TokenDonut from '../components/charts/TokenDonut.jsx';
import ImprovementCard from '../components/ImprovementCard.jsx';
import { Loading, ErrorState } from '../components/States.jsx';
import { formatMoney, formatTokens, formatCount, formatDateTime, formatDuration } from '../utils/format.js';

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const { data, loading, error } = useApi(() => api.session(sessionId), [sessionId]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const { session, by_model: byModel, improvements } = data;
  const donutTotals = {
    input_tokens: session.input_tokens,
    output_tokens: session.output_tokens,
    cache_read_tokens: session.cache_read_tokens,
    cache_create_tokens: session.cache_5m_tokens + session.cache_1h_tokens,
  };

  return (
    <>
      <h1 className="page-title" style={{ fontFamily: 'var(--font-display)' }}>
        Session <code>{session.session_id.slice(0, 13)}…</code>
      </h1>
      <p className="page-subtitle">
        <Link to={`/projects/${session.project_id}`}>{session.project_name}</Link>
        {session.git_branch ? ` · ${session.git_branch}` : ''} · {formatDateTime(session.started_at)} ·{' '}
        {formatDuration(session.started_at, session.ended_at)}
        {session.cli_version ? ` · Claude Code v${session.cli_version}` : ''}
      </p>

      <div className="stat-grid">
        <StatTile label="Session cost" value={formatMoney(session.cost_usd)} accent
          hint={session.sidechain_cost_usd > 0.005 ? `${formatMoney(session.sidechain_cost_usd)} in subagents` : undefined} />
        <StatTile label="Your prompts" value={formatCount(session.user_messages)} />
        <StatTile label="API requests" value={formatCount(session.requests)}
          hint={`${formatCount(session.tool_calls)} tool calls`} />
        <StatTile label="Output tokens" value={formatTokens(session.output_tokens)} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Token composition</div>
          <TokenDonut totals={donutTotals} height={260} />
        </div>
        <div className="card table-wrap">
          <div className="card-title">Per-model usage</div>
          <table className="data">
            <thead>
              <tr>
                <th>Model</th>
                <th className="num">Requests</th>
                <th className="num">Input</th>
                <th className="num">Cache read</th>
                <th className="num">Output</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((m) => (
                <tr key={m.model}>
                  <td><ModelTag model={m.model} /></td>
                  <td className="num">{formatCount(m.requests)}</td>
                  <td className="num">{formatTokens(m.input_tokens)}</td>
                  <td className="num">{formatTokens(m.cache_read_tokens)}</td>
                  <td className="num">{formatTokens(m.output_tokens)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatMoney(m.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {improvements.length > 0 && (
        <>
          <h2 className="section-title">Savings opportunities for this session</h2>
          {improvements.map((item, i) => (
            <ImprovementCard key={i} item={item} />
          ))}
        </>
      )}
    </>
  );
}
