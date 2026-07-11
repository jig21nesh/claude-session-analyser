import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { TOKEN_COLOURS } from '../../constants.js';
import { formatTokens } from '../../utils/format.js';

/** Token composition donut with the cache hit rate as the hero figure. */
export default function TokenDonut({ totals, height = 300 }) {
  const slices = [
    { key: 'cacheRead', name: 'Cache reads', value: totals.cache_read_tokens || 0 },
    { key: 'input', name: 'Fresh input', value: totals.input_tokens || 0 },
    { key: 'cacheWrite', name: 'Cache writes', value: totals.cache_create_tokens || 0 },
    { key: 'output', name: 'Output', value: totals.output_tokens || 0 },
  ].filter((s) => s.value > 0);

  const contextTokens = (totals.cache_read_tokens || 0) + (totals.input_tokens || 0);
  const hitRate = contextTokens > 0 ? (totals.cache_read_tokens / contextTokens) * 100 : 0;

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="chart-tooltip">
                  {payload[0].name}: <strong>{formatTokens(payload[0].value)}</strong> tokens
                </div>
              ) : null
            }
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="var(--surface-1)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={TOKEN_COLOURS[s.key]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-hero)', fontWeight: 600 }}>
          {hitRate.toFixed(0)}%
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>cache hit rate</div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', justifyContent: 'center' }}>
        {slices.map((s) => (
          <li key={s.key}>
            <span className="model-dot" style={{ background: TOKEN_COLOURS[s.key], display: 'inline-block', marginRight: 6 }} />
            {s.name} · {formatTokens(s.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}
