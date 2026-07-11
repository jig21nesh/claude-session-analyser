import DocSection from './DocSection.jsx';
import { MODEL_SWITCHER_URL } from '../../constants.js';

const ALTERNATIVES = [
  ['Holt-Winters ✓', 'Built for exactly this shape of data: small (weeks–months of daily points), trending, weekly-seasonal. Fits in milliseconds, fully interpretable, zero extra dependencies.'],
  ['Linear regression', 'Captures trend but is blind to the weekday pattern. Used automatically as the fallback when there are fewer than two weeks of history (plain mean under five days).'],
  ['ARIMA / SARIMA', 'Comparable accuracy but needs careful order selection and more data to be stable. A strong upgrade path once you have 6+ months of history.'],
  ['Prophet', 'Excellent with holidays and changepoints, but drags in a Python/Stan runtime — this tool installs with a single npm install.'],
  ['LSTM / gradient boosting', 'Needs orders of magnitude more data than a personal usage history provides, is opaque, and requires training infrastructure for marginal gain on ~100 points.'],
];

export default function Forecasting() {
  return (
    <DocSection id="forecasting" icon="🔮" kicker="Machine learning" title="The forecasting model">
      <p>
        The 30-day forecast uses <strong>Holt-Winters triple exponential smoothing</strong>{' '}
        (additive, damped trend, 7-day season). It decomposes daily spend into three
        interpretable parts:
      </p>
      <ul>
        <li><strong>Level</strong> — your current baseline daily spend,</li>
        <li><strong>Trend</strong> — whether usage is growing or shrinking (damped, so it never extrapolates to infinity),</li>
        <li><strong>Weekly seasonality</strong> — the weekday/weekend rhythm of development work.</li>
      </ul>
      <p>
        The smoothing parameters (α, β, γ, φ) shown under the dashboard chart are not hand-tuned:
        they are grid-searched by <em>rolling-origin backtesting</em> — repeatedly fitting on
        history and scoring one-step-ahead RMSE, a standard form of time-series cross-validation.
        The shaded band is an 80% prediction interval from those backtest residuals, widening with
        horizon. The test suite includes a holdout validation asserting the model at least halves
        the error of a naive mean on seasonal data.
      </p>

      <h3>Why Holt-Winters over the alternatives?</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Candidate</th><th>Verdict</th></tr>
          </thead>
          <tbody>
            {ALTERNATIVES.map(([name, verdict]) => (
              <tr key={name}><td><strong>{name}</strong></td><td>{verdict}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>When you should switch models</h3>
      <ul>
        <li><strong>&gt; 6 months of dense history:</strong> SARIMA or Prophet will likely edge ahead — consider an optional Python sidecar.</li>
        <li>
          <strong>Regime changes</strong> (new job, new pricing, adopting{' '}
          <a href={MODEL_SWITCHER_URL} target="_blank" rel="noreferrer">model-switcher</a>): any
          smoothing model needs about a season to adapt — re-read the forecast after big workflow
          changes.
        </li>
        <li><strong>Known limits:</strong> no public-holiday awareness; additive seasonality assumes a roughly constant weekly amplitude.</li>
      </ul>
    </DocSection>
  );
}
