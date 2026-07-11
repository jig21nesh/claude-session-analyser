import { Link } from 'react-router-dom';
import { formatMoney, formatDateTime } from '../utils/format.js';

const MODEL_NAMES = {
  'holt-winters': 'Holt-Winters (additive · 7-day season · damped trend)',
  'linear-regression': 'Linear regression',
  'historical-mean': 'Historical mean',
};

/** Metadata strip explaining the model behind a forecast. */
export default function ForecastDetails({ result }) {
  if (!result) return null;
  const facts = [
    ['Model', MODEL_NAMES[result.model] || result.model],
    ['Fitted on', `${result.historyDays} days of history`],
    ['Backtest error', `MAE ${formatMoney(result.metrics.mae)} · RMSE ${formatMoney(result.metrics.rmse)} / day`],
  ];
  if (result.params) {
    facts.push([
      'Parameters',
      `α=${result.params.alpha} · β=${result.params.beta} · γ=${result.params.gamma} · φ=${result.params.phi}`,
    ]);
  }
  if (result.generatedAt) {
    facts.push(['Report generated', formatDateTime(result.generatedAt)]);
  }

  return (
    <div className="forecast-details">
      <dl className="forecast-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Why this model? How are the parameters chosen?</summary>
        <p>
          {result.explanation} See <Link to="/help">Help</Link> for the full comparison against
          ARIMA, Prophet and neural approaches — and when it is worth switching.
        </p>
      </details>
    </div>
  );
}
