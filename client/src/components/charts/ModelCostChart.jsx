import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer,
} from 'recharts';
import { modelColour, shortModelName } from '../../constants.js';
import { formatMoney } from '../../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';

export default function ModelCostChart({ byModel, height = 300 }) {
  const data = byModel
    .filter((m) => m.cost_usd > 0.005)
    .map((m) => ({ model: m.model, name: shortModelName(m.model), cost: m.cost_usd }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 4 }} barCategoryGap="35%">
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis
          dataKey="name"
          stroke="var(--axis-ink)"
          tick={{ fill: 'var(--axis-ink)', fontSize: 11 }}
          tickLine={false}
          interval={0}
        />
        <YAxis
          stroke="var(--axis-ink)"
          tick={{ fill: 'var(--axis-ink)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatMoney(v, { compact: true })}
          width={58}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar name="Cost" dataKey="cost" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.model} fill={modelColour(entry.model)} />
          ))}
          <LabelList
            dataKey="cost"
            position="top"
            formatter={(v) => formatMoney(v, { compact: true })}
            style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
