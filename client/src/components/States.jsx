export function Loading({ label = 'Loading analysis…' }) {
  return (
    <div className="state" role="status">
      <div className="spin-lg" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div className="state error" role="alert">
      ⚠ {message || 'Something went wrong.'}
      <div style={{ fontSize: 'var(--fs-xs)', marginTop: 8, color: 'var(--text-muted)' }}>
        Is the API running on port 15801? Try <code>npm run dev</code> from the repo root.
      </div>
    </div>
  );
}

export function Empty({ message }) {
  return <div className="state">{message}</div>;
}
