import DocSection from './DocSection.jsx';

export function Privacy() {
  return (
    <DocSection id="privacy" icon="🔒" kicker="Trust" title="Privacy & security">
      <ul>
        <li>The API server binds to <code>127.0.0.1</code> — nothing is reachable from the network.</li>
        <li>
          Only usage metadata (token counts, models, timestamps) is parsed into the database.
          Your prompts and Claude's replies never leave the transcript files.
        </li>
        <li>No API keys, no accounts, no telemetry. The improvements engine and the forecaster are deterministic — no LLM calls.</li>
        <li>The only external requests are the two Google-Fonts stylesheets in the UI.</li>
      </ul>
    </DocSection>
  );
}

const FAQS = [
  {
    q: "Why don't my numbers match Anthropic's console exactly?",
    a: 'Transcripts occasionally miss usage for interrupted requests, batch/priority discounts are not modelled, and unknown model ids fall back to Opus-tier pricing. Treat costs as accurate-to-a-few-percent, not to the cent.',
  },
  {
    q: 'Does it work on Windows?',
    a: 'Yes — the server, analyser and UI are pure Node/React with no native dependencies; paths (including Windows-style cwd values in transcripts) are handled on macOS, Linux and Windows.',
  },
  {
    q: 'Where is the data stored?',
    a: 'Everything lives in server/data/analyser.db (SQLite): sessions, per-model and per-day usage, improvement reports and forecast reports. Deleting the file is a safe full reset.',
  },
  {
    q: 'Can I change the ports?',
    a: 'Copy .env.example to .env and set PORT (web) and API_PORT (API). Defaults are 15800 and 15801.',
  },
];

export function Faq() {
  return (
    <DocSection id="faq" icon="❓" kicker="Answers" title="FAQ">
      {FAQS.map(({ q, a }) => (
        <details key={q} className="faq-item">
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </DocSection>
  );
}
