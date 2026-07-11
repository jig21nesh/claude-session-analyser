import { Link } from 'react-router-dom';
import { formatMoney } from '../utils/format.js';

/** Ranked horizontal bar list (projects by cost). Direct-labelled, no legend needed. */
export default function RankedBars({ items, max = 8 }) {
  const top = items.slice(0, max);
  const highest = Math.max(...top.map((i) => i.value), 1);
  return (
    <div>
      {top.map((item) => (
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 84px', gap: 12, alignItems: 'center', padding: '7px 0' }}>
          <Link to={item.href} className="row-link" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-s)' }}>
            {item.label}
          </Link>
          <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(1.5, (item.value / highest) * 100)}%`,
                height: '100%',
                background: 'var(--series-1)',
                borderRadius: 4,
              }}
            />
          </div>
          <div style={{ textAlign: 'right', fontSize: 'var(--fs-s)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
            {formatMoney(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
