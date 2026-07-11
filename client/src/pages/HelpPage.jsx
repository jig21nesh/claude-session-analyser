import { MODEL_SWITCHER_URL } from '../constants.js';

export default function HelpPage() {
  return (
    <div className="prose">
      <h1 className="page-title">Help</h1>
      <p className="page-subtitle">How the analyser works, what the numbers mean, and how the forecast is built.</p>

      <h2>How it works</h2>
      <p>
        Claude Code writes a transcript of every session to <code>~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl</code>.
        The analyser stream-parses those files, extracts <em>only usage metadata</em> — token counts, models,
        timestamps — and stores the aggregates in a local SQLite database. Your prompts and Claude's replies
        are never stored or sent anywhere; everything runs on <code>127.0.0.1</code>.
      </p>
      <ul>
        <li><strong>Refresh</strong> re-scans the transcript folder. It is incremental: only new or changed files are re-parsed, so it takes seconds after the first run.</li>
        <li>Deleting <code>server/data/analyser.db</code> resets everything; the next refresh rebuilds it.</li>
      </ul>

      <h2>How costs are calculated</h2>
      <p>
        Every API response in a transcript carries a usage block. Each bucket is priced at published API rates
        per model — for example Fable at $10/$50 per million input/output tokens, Opus 4.x at $5/$25,
        Sonnet at $3/$15, Haiku 4.5 at $1/$5:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Bucket</th><th>Multiplier</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td>Input tokens</td><td>1× input rate</td><td>Fresh, uncached prompt tokens</td></tr>
            <tr><td>Cache reads</td><td>0.1× input rate</td><td>Prompt prefix served from cache — 90% cheaper</td></tr>
            <tr><td>Cache writes (5 min TTL)</td><td>1.25× input rate</td><td>Writing your context into the cache</td></tr>
            <tr><td>Cache writes (1 h TTL)</td><td>2× input rate</td><td>Longer-lived cache writes</td></tr>
            <tr><td>Output tokens</td><td>1× output rate</td><td>Everything Claude generates — the expensive bucket</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Duplicate transcript entries for the same API request are deduplicated, and subagent (sidechain) usage
        is tracked separately. If you're on a Claude subscription these figures are the <em>equivalent API value</em> of
        your usage rather than an extra bill — still the right number for spotting waste.
      </p>

      <h2>The forecasting model — and why we chose it</h2>
      <p>
        The 30-day cost forecast uses <strong>Holt-Winters triple exponential smoothing</strong> (additive,
        with a damped trend and a 7-day season). It decomposes your daily spend into three
        interpretable parts:
      </p>
      <ul>
        <li><strong>Level</strong> — your current baseline daily spend,</li>
        <li><strong>Trend</strong> — whether usage is growing or shrinking (damped, so it doesn't extrapolate to infinity),</li>
        <li><strong>Weekly seasonality</strong> — the weekday/weekend rhythm of development work.</li>
      </ul>
      <p>
        The smoothing parameters (α, β, γ, φ) are not hand-tuned: the analyser grid-searches them by
        <em> rolling-origin backtesting</em> — repeatedly fitting on history and scoring one-step-ahead error
        (RMSE) — a standard form of time-series cross-validation. The shaded band on the chart is an 80%
        prediction interval derived from those backtest residuals, widening with the forecast horizon.
      </p>
      <h3>Why Holt-Winters over the alternatives?</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Candidate</th><th>Why not (here)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Holt-Winters ✓</strong></td>
              <td>Built for exactly this shape of data: small (weeks–months of daily points), trending, weekly-seasonal. Fits in milliseconds, fully interpretable, zero extra dependencies.</td>
            </tr>
            <tr>
              <td>Linear regression</td>
              <td>Captures trend but is blind to the weekday pattern. We <em>do</em> use it as the automatic fallback when you have under two weeks of history (and a plain mean under five days).</td>
            </tr>
            <tr>
              <td>ARIMA / SARIMA</td>
              <td>Comparable accuracy but needs careful order selection and more data to be stable; heavyweight to implement correctly. A strong upgrade path once you have 6+ months of history.</td>
            </tr>
            <tr>
              <td>Prophet</td>
              <td>Excellent with holidays and changepoints, but drags in a Python/Stan runtime — this tool installs with a single <code>npm install</code>.</td>
            </tr>
            <tr>
              <td>LSTM / gradient boosting</td>
              <td>Needs orders of magnitude more data than a personal usage history provides, is opaque, and requires training infrastructure for marginal gain on ~100 data points.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>When you should switch models</h3>
      <ul>
        <li><strong>&gt; 6 months of dense history:</strong> SARIMA or Prophet will likely edge ahead — consider an optional Python sidecar.</li>
        <li><strong>Regime changes</strong> (new job, new pricing, adopting <a href={MODEL_SWITCHER_URL} target="_blank" rel="noreferrer">model-switcher</a>): any smoothing model needs ~a season to adapt. Re-read the forecast after big workflow changes.</li>
        <li><strong>Known limits:</strong> no public-holiday awareness; additive seasonality assumes a roughly constant weekly amplitude.</li>
      </ul>

      <h2>The improvement heuristics</h2>
      <ul>
        <li><strong>Model mix</strong> — flags heavy premium-model usage and estimates savings from routing simple prompts to a Sonnet-class model with <a href={MODEL_SWITCHER_URL} target="_blank" rel="noreferrer">model-switcher</a>.</li>
        <li><strong>Prompt caching</strong> — flags cache hit rates below 85%; misses bill at 10× the cached rate.</li>
        <li><strong>Context size</strong> — flags sessions averaging &gt;120k context tokens per request; use <span className="kbd">/compact</span> and <span className="kbd">/clear</span>.</li>
        <li><strong>Session habits</strong> — flags projects dominated by tiny sessions, each re-paying the CLAUDE.md cache write.</li>
        <li><strong>Output volume</strong> — flags output-token-dominated spend; output is 5× input pricing.</li>
      </ul>

      <h2>FAQ</h2>
      <h3>Is any data sent anywhere?</h3>
      <p>No. The server binds to 127.0.0.1, reads your local transcripts, and stores aggregates in a local SQLite file. The only external requests are the two Google-Fonts stylesheets in the UI.</p>
      <h3>Why don't my numbers match Anthropic's console exactly?</h3>
      <p>Transcripts occasionally miss usage for interrupted requests, batch/priority discounts aren't modelled, and unknown model ids fall back to Opus-tier pricing. Treat costs as accurate-to-a-few-percent, not to the cent.</p>
      <h3>Ports?</h3>
      <p>Web UI on <code>15800</code>, API on <code>15801</code> (both configurable via <code>PORT</code> / <code>API_PORT</code>).</p>
    </div>
  );
}
