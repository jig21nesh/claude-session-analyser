import DocSection from './DocSection.jsx';
import { MODEL_SWITCHER_URL } from '../../constants.js';

const HEURISTICS = [
  ['Model mix', 'Flags heavy premium-model usage and estimates savings from routing simple prompts to a Sonnet-class model with model-switcher.'],
  ['Prompt caching', 'Flags cache hit rates below 85% — misses bill at 10× the cached rate. Usual causes: gaps longer than the cache TTL, editing CLAUDE.md mid-session, many cold starts.'],
  ['Context size', 'Flags sessions averaging over 120k context tokens per request. Use /compact at checkpoints and /clear between unrelated tasks.'],
  ['Session habits', 'Flags projects dominated by tiny sessions — each new session re-pays the CLAUDE.md and system-prompt cache write.'],
  ['Output volume', 'Flags output-token-dominated spend; output is 5× input pricing. Ask for diffs, not full-file rewrites.'],
];

export default function SavingTokens() {
  return (
    <DocSection id="saving-tokens" icon="⚡" kicker="Improvements" title="The five saving heuristics">
      <p>
        Every recommendation on the Improvements page comes from one of five deterministic
        heuristics computed from your stored aggregates — <strong>no LLM is involved</strong>, so
        results are reproducible and free:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Heuristic</th><th>What it looks for</th></tr>
          </thead>
          <tbody>
            {HEURISTICS.map(([name, what]) => (
              <tr key={name}><td><strong>{name}</strong></td><td>{what}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The single biggest lever is usually the first one:{' '}
        <a href={MODEL_SWITCHER_URL} target="_blank" rel="noreferrer">model-switcher</a> classifies
        each prompt's complexity and keeps your session on a low-cost model, delegating only
        genuinely complex work to a heavy model via a subagent.
      </p>
    </DocSection>
  );
}
