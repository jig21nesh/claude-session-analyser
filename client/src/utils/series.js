/** Fill missing days with zero cost so the x-axis is a true time axis. */
export function fillDailyGaps(points) {
  if (points.length === 0) return [];
  const byDate = new Map(points.map((p) => [p.date, p]));
  const dates = [...byDate.keys()].sort();
  const start = new Date(`${dates[0]}T00:00:00Z`).getTime();
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime();
  const out = [];
  for (let t = start; t <= end; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? { date, cost: 0 });
  }
  return out;
}
