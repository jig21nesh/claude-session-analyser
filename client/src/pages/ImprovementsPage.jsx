import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import ImprovementCard from '../components/ImprovementCard.jsx';
import { Loading, ErrorState, Empty } from '../components/States.jsx';
import { formatMoney } from '../utils/format.js';
import { MODEL_SWITCHER_URL } from '../constants.js';

export default function ImprovementsPage() {
  const { data, loading, error } = useApi(() => api.improvements(), []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const items = data.improvements;

  return (
    <>
      <h1 className="page-title">Improvements</h1>
      <p className="page-subtitle">
        Where and how tokens can be saved, computed from your actual usage patterns.
        {data.total_estimated_savings_usd > 0 &&
          ` Total opportunity ≈ ${formatMoney(data.total_estimated_savings_usd)}.`}
      </p>

      <div className="callout">
        <h3>⚡ The biggest lever: route prompts by complexity</h3>
        <p>
          Most Claude Code spend goes to premium models answering prompts that a cheaper model handles
          just as well — quick questions, small edits, formatting. <strong>model-switcher</strong> hooks into
          Claude Code, classifies each prompt as SIMPLE or COMPLEX, keeps your session on a low-cost model,
          and delegates only the genuinely complex work to a heavy model via a subagent.
        </p>
        <p>
          <a href={MODEL_SWITCHER_URL} target="_blank" rel="noreferrer">
            {MODEL_SWITCHER_URL} →
          </a>
        </p>
      </div>

      {items.length === 0 ? (
        <Empty message="No recommendations — your usage already looks efficient. Nice." />
      ) : (
        items.map((item) => <ImprovementCard key={item.id} item={item} />)
      )}
    </>
  );
}
