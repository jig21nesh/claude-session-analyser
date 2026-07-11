import { formatMoney } from '../../utils/format.js';

export default function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== undefined && p.value !== null && !p.hide);
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{labelFormatter ? labelFormatter(label) : label}</div>
      {rows.map((row) => (
        <div key={row.dataKey}>
          <span
            className="model-dot"
            style={{ background: row.stroke || row.fill, display: 'inline-block', marginRight: 6 }}
          />
          {row.name}: <strong>{Array.isArray(row.value)
            ? `${formatMoney(row.value[0])} – ${formatMoney(row.value[1])}`
            : formatMoney(row.value)}</strong>
        </div>
      ))}
    </div>
  );
}
