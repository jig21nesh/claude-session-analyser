import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import { Loading, ErrorState, Empty } from '../components/States.jsx';
import { formatMoney, formatTokens, formatCount, formatDate } from '../utils/format.js';

export default function ProjectsPage() {
  const { data, loading, error } = useApi(() => api.projects(), []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  const projects = data.projects;
  if (projects.length === 0) return <Empty message="No projects found in ~/.claude/projects yet." />;

  const maxCost = Math.max(...projects.map((p) => p.cost_usd), 1);

  return (
    <>
      <h1 className="page-title">Projects</h1>
      <p className="page-subtitle">Every project Claude Code has worked in, ranked by spend.</p>
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Project</th>
              <th>Spend</th>
              <th className="num">Cost</th>
              <th className="num">Sessions</th>
              <th className="num">Requests</th>
              <th className="num">Output tokens</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link className="row-link" to={`/projects/${p.id}`}>{p.name}</Link>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{p.path}</div>
                </td>
                <td className="bar-cell">
                  <div className="bar-fill" style={{ width: `${Math.max(2, (p.cost_usd / maxCost) * 100)}%` }} />
                </td>
                <td className="num">{formatMoney(p.cost_usd)}</td>
                <td className="num">{formatCount(p.sessions)}</td>
                <td className="num">{formatCount(p.requests)}</td>
                <td className="num">{formatTokens(p.output_tokens)}</td>
                <td>{formatDate(p.last_activity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
