import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import StatTile from '../components/StatTile.jsx';
import { Loading, ErrorState } from '../components/States.jsx';
import DailyCostChart from '../components/charts/DailyCostChart.jsx';
import ModelCostChart from '../components/charts/ModelCostChart.jsx';
import SessionsTable from '../components/SessionsTable.jsx';
import ImprovementCard from '../components/ImprovementCard.jsx';
import { formatMoney, formatTokens, formatCount, formatDate } from '../utils/format.js';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const detail = useApi(() => api.project(id), [id]);
  const sessions = useApi(() => api.projectSessions(id, page), [id, page]);
  const daily = useApi(() => api.dailyCosts(id), [id]);
  const improvements = useApi(() => api.improvements(id), [id]);

  if (detail.loading) return <Loading />;
  if (detail.error) return <ErrorState message={detail.error} />;

  const { project, totals, by_model: byModel } = detail.data;
  const totalPages = sessions.data ? Math.max(1, Math.ceil(sessions.data.total / sessions.data.page_size)) : 1;

  return (
    <>
      <h1 className="page-title">{project.name}</h1>
      <p className="page-subtitle">
        <code>{project.path}</code> · {formatDate(totals.first_activity)} → {formatDate(totals.last_activity)}
      </p>

      <div className="stat-grid">
        <StatTile label="Project spend" value={formatMoney(totals.cost_usd)} accent />
        <StatTile label="Sessions" value={formatCount(totals.sessions)} />
        <StatTile label="Requests" value={formatCount(totals.requests)}
          hint={`${formatCount(totals.tool_calls)} tool calls`} />
        <StatTile label="Output tokens" value={formatTokens(totals.output_tokens)} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Daily cost</div>
          {daily.loading ? <Loading /> : daily.error ? <ErrorState message={daily.error} /> : (
            <DailyCostChart history={daily.data.days.map((d) => ({ date: d.date, cost: d.cost }))} height={260} />
          )}
        </div>
        <div className="card">
          <div className="card-title">Cost by model</div>
          <ModelCostChart byModel={byModel} height={260} />
        </div>
      </div>

      {improvements.data?.improvements.length > 0 && (
        <>
          <h2 className="section-title">
            Savings opportunities · ≈ {formatMoney(improvements.data.total_estimated_savings_usd)}
          </h2>
          {improvements.data.improvements.map((item) => (
            <ImprovementCard key={item.id} item={item} />
          ))}
        </>
      )}

      <h2 className="section-title">Sessions</h2>
      <div className="card">
        {sessions.loading ? <Loading /> : sessions.error ? <ErrorState message={sessions.error} /> : (
          <>
            <SessionsTable sessions={sessions.data.sessions} />
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, alignItems: 'center' }}>
                <button type="button" className="refresh-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>page {page} of {totalPages}</span>
                <button type="button" className="refresh-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
