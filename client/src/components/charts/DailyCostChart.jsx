import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { SERIES } from '../../constants.js';
import { shortDate, formatMoney } from '../../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';
import { CHART_ANIMATION } from '../../utils/motion.js';

/**
 * Daily spend line; when a forecast is supplied it continues as a dashed line
 * with an 80% interval band.
 */
export default function DailyCostChart({ history, forecast = [], height = 300 }) {
  const data = [
    ...history.map((p) => ({ date: p.date, actual: p.cost })),
    ...forecast.map((p) => ({ date: p.date, predicted: p.cost, band: [p.lower80, p.upper80] })),
  ];
  // Connect the two lines at the seam.
  const lastActualIndex = history.length - 1;
  if (lastActualIndex >= 0 && forecast.length > 0) {
    data[lastActualIndex] = { ...data[lastActualIndex], predicted: history[lastActualIndex].cost };
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          stroke="var(--axis-ink)"
          tick={{ fill: 'var(--axis-ink)', fontSize: 11 }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          stroke="var(--axis-ink)"
          tick={{ fill: 'var(--axis-ink)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatMoney(v, { compact: true })}
          width={58}
        />
        <Tooltip content={<ChartTooltip labelFormatter={shortDate} />} />
        {forecast.length > 0 && (
          <>
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
              iconType="plainline"
            />
            <Area
              name="80% interval"
              dataKey="band"
              stroke="none"
              fill="var(--series-2)"
              fillOpacity={0.1}
              {...CHART_ANIMATION}
              legendType="rect"
            />
          </>
        )}
        <Line
          name="Daily cost"
          dataKey="actual"
          stroke={SERIES.gold}
          strokeWidth={2}
          dot={false}
          {...CHART_ANIMATION}
        />
        {forecast.length > 0 && (
          <Line
            name="Forecast"
            dataKey="predicted"
            stroke={SERIES.blue}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            {...CHART_ANIMATION}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
