import DocSection from './DocSection.jsx';

const BUCKETS = [
  ['Input tokens', '1× input rate', 'Fresh, uncached prompt tokens'],
  ['Cache reads', '0.1× input rate', 'Prompt prefix served from cache — 90% cheaper'],
  ['Cache writes (5 min TTL)', '1.25× input rate', 'Writing your context into the cache'],
  ['Cache writes (1 h TTL)', '2× input rate', 'Longer-lived cache writes'],
  ['Output tokens', '1× output rate', 'Everything Claude generates — the expensive bucket'],
];

export default function CostMath() {
  return (
    <DocSection id="cost-math" icon="💰" kicker="Numbers" title="How costs are calculated">
      <p>
        Every API response in a transcript carries a usage block. Each bucket is priced at
        published API rates per model — Fable at $10/$50 per million input/output tokens,
        Opus 4.x at $5/$25, Sonnet at $3/$15, Haiku 4.5 at $1/$5:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Bucket</th><th>Multiplier</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            {BUCKETS.map(([bucket, mult, meaning]) => (
              <tr key={bucket}><td>{bucket}</td><td>{mult}</td><td>{meaning}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Duplicate transcript entries for the same API request are deduplicated, and subagent
        (sidechain) usage is tracked separately. On a Claude subscription these figures are the{' '}
        <em>equivalent API value</em> of your usage rather than an extra bill — still the right
        number for spotting waste.
      </p>
    </DocSection>
  );
}
