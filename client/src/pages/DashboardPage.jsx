import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import StatTile from '../components/StatTile.jsx';
import AnimatedValue from '../components/AnimatedValue.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';
import DailyCostChart from '../components/charts/DailyCostChart.jsx';
import ForecastDetails from '../components/ForecastDetails.jsx';
import ModelCostChart from '../components/charts/ModelCostChart.jsx';
import TokenDonut from '../components/charts/TokenDonut.jsx';
import RankedBars from '../components/RankedBars.jsx';
import { formatMoney, formatTokens, formatCount, formatDate } from '../utils/format.js';

const MODEL_LABELS = {
  'holt-winters': 'Holt-Winters (weekly seasonality)',
  'linear-regression': 'linear regression (short history)',
  'historical-mean': 'historical mean (very short history)',
};

export default function DashboardPage() {
  const summary = useApi(() => api.summary(), []);
  const predictions = useApi(() => api.predictions(30), []);
  const projects = useApi(() => api.projects(), []);

  if (summary.loading) return <Loading />;
  if (summary.error) return <ErrorState message={summary.error} />;

  const { totals, by_model: byModel, cache_saved_usd: cacheSaved } = summary.data;
  if (totals.sessions === 0) {
    return (
      <Empty message="No sessions analysed yet — the first scan may still be running. Hit Refresh in a few seconds." />
    );
  }

  const forecastTotal = predictions.data?.totalForecast ?? 0;
  const projectItems = (projects.data?.projects || [])
    .filter((p) => p.cost_usd > 0)
    .map((p) => ({ id: p.id, label: p.name, value: p.cost_usd, href: `/projects/${p.id}` }));

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        {formatCount(totals.sessions)} sessions across {formatCount(totals.projects)} projects ·{' '}
        {formatDate(totals.first_activity)} → {formatDate(totals.last_activity)}
      </p>

      <div className="stat-grid">
        <StatTile label="Total spend" accent
          value={<AnimatedValue value={totals.cost_usd} format={formatMoney} />}
          hint="what these sessions cost at API prices" />
        <StatTile label="Saved by caching"
          value={<AnimatedValue value={cacheSaved} format={formatMoney} />}
          hint="cache reads billed at 10% of input" />
        <StatTile label="Next 30 days"
          value={<AnimatedValue value={forecastTotal} format={formatMoney} />}
          hint={predictions.data ? `forecast · ${MODEL_LABELS[predictions.data.model]}` : 'forecast'} />
        <StatTile label="API requests"
          value={<AnimatedValue value={totals.requests} format={formatCount} />}
          hint={`${formatCount(totals.tool_calls)} tool calls`} />
        <StatTile label="Tokens processed"
          value={<AnimatedValue
            value={totals.input_tokens + totals.output_tokens + totals.cache_read_tokens + totals.cache_create_tokens}
            format={formatTokens}
          />}
          hint={`${formatTokens(totals.output_tokens)} generated`} />
      </div>

      <div className="card">
        <div className="card-title">Daily cost & 30-day forecast</div>
        <p className="card-subtitle">
          Solid gold: actual spend per day. Dashed blue: {predictions.data ? MODEL_LABELS[predictions.data.model] : 'forecast'} with 80% interval.{' '}
          <Link to="/help">How the forecast works →</Link>
        </p>
        {predictions.loading ? (
          <Loading label="Fitting forecast…" />
        ) : predictions.error ? (
          <ErrorState message={predictions.error} />
        ) : (
          <>
            <DailyCostChart history={predictions.data.history} forecast={predictions.data.forecast} />
            <ForecastDetails result={predictions.data} />
          </>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 'var(--space-5)' }}>
        <div className="card">
          <div className="card-title">Cost by model</div>
          <p className="card-subtitle">Where the money goes, per model family</p>
          <ModelCostChart byModel={byModel} />
        </div>
        <div className="card">
          <div className="card-title">Token composition</div>
          <p className="card-subtitle">Cache reads are 90% cheaper than fresh input</p>
          <TokenDonut totals={totals} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--space-5)' }}>
        <div className="card-title">Top projects by spend</div>
        <p className="card-subtitle">
          <Link to="/projects">All {formatCount(totals.projects)} projects →</Link>
        </p>
        <RankedBars items={projectItems} />
      </div>
    </>
  );
}
