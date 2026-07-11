export default function StatTile({ label, value, hint, accent = false }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${accent ? ' accent' : ''}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
