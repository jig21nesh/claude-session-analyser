import DocSection from './DocSection.jsx';

export default function GettingStarted() {
  return (
    <DocSection id="getting-started" icon="🚀" kicker="Basics" title="How it works">
      <p>
        Claude Code writes a transcript of every session to{' '}
        <code>~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl</code>, with subagent and
        workflow-agent transcripts nested under <code>&lt;session&gt;/subagents/</code>. The
        analyser stream-parses all of them, extracts <em>only usage metadata</em> — token counts,
        models, timestamps — and stores the aggregates in a local SQLite database.
      </p>
      <ul>
        <li>
          <strong>Refresh</strong> re-scans the transcript folder. It is incremental — only new or
          changed sessions are re-parsed — so it takes seconds after the first run, and it finishes
          by recomputing the improvement and forecast reports.
        </li>
        <li>
          <strong>Auto refresh</strong> triggers the same incremental re-scan every 30 seconds; the
          countdown in the header always shows the seconds until the next run, and the ❚❚ / ▶
          button pauses and resumes it.
        </li>
        <li>
          <strong>Full reset:</strong> delete <code>server/data/analyser.db</code>; the next
          refresh rebuilds everything from the transcripts.
        </li>
        <li>
          <strong>Ports:</strong> web UI <code>15800</code>, API <code>15801</code> — configurable
          in <code>.env</code> (see <code>.env.example</code>).
        </li>
      </ul>
    </DocSection>
  );
}
