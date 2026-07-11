import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillDailySeries, linearRegression, holtWinters, forecastCosts } from '../src/predictor.js';

function daysFrom(start, values) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  return values.map((cost, i) => ({
    date: new Date(startMs + i * 86400000).toISOString().slice(0, 10),
    cost,
  }));
}

test('fillDailySeries fills gaps with zero-cost days', () => {
  const series = fillDailySeries([
    { date: '2026-07-01', cost: 5 },
    { date: '2026-07-04', cost: 2 },
  ]);
  assert.equal(series.length, 4);
  assert.deepEqual(series.map((p) => p.cost), [5, 0, 0, 2]);
});

test('fillDailySeries handles empty input', () => {
  assert.deepEqual(fillDailySeries([]), []);
});

test('linearRegression recovers a perfect line', () => {
  const { slope, intercept, predict } = linearRegression([2, 4, 6, 8, 10]);
  assert.ok(Math.abs(slope - 2) < 1e-9);
  assert.ok(Math.abs(intercept - 2) < 1e-9);
  assert.ok(Math.abs(predict(5) - 12) < 1e-9);
});

test('holtWinters learns a weekly seasonal pattern', () => {
  // 6 weeks of a strict weekly pattern: weekends near zero, midweek high.
  const week = [10, 12, 14, 13, 11, 2, 1];
  const ys = Array.from({ length: 42 }, (_, i) => week[i % 7]);
  const hw = holtWinters(ys, { alpha: 0.3, beta: 0.05, gamma: 0.3, phi: 0.98 });
  const fc = hw.forecast(7);
  // Forecast should preserve the weekend dip relative to midweek.
  const midweek = fc[2];
  const weekend = fc[5];
  assert.ok(midweek > weekend + 5, `expected seasonal shape, got midweek=${midweek} weekend=${weekend}`);
});

test('forecastCosts picks holt-winters with two weeks or more of data', () => {
  const week = [10, 12, 14, 13, 11, 2, 1];
  const rows = daysFrom('2026-06-01', Array.from({ length: 28 }, (_, i) => week[i % 7]));
  const result = forecastCosts(rows, 14);
  assert.equal(result.model, 'holt-winters');
  assert.equal(result.forecast.length, 14);
  assert.ok(result.params !== null);
  assert.ok(result.metrics.rmse >= 0);
  for (const point of result.forecast) {
    assert.ok(point.cost >= 0, 'forecast clamped at zero');
    assert.ok(point.upper95 >= point.upper80 && point.upper80 >= point.cost - 1e-9);
    assert.ok(point.lower95 <= point.lower80);
  }
});

test('forecastCosts falls back to linear regression on short histories', () => {
  const rows = daysFrom('2026-07-01', [1, 2, 3, 4, 5, 6]);
  const result = forecastCosts(rows, 5);
  assert.equal(result.model, 'linear-regression');
  // Rising trend should keep rising.
  assert.ok(result.forecast[4].cost > result.forecast[0].cost);
});

test('forecastCosts falls back to historical mean on tiny histories', () => {
  const rows = daysFrom('2026-07-01', [4, 6]);
  const result = forecastCosts(rows, 3);
  assert.equal(result.model, 'historical-mean');
  assert.ok(Math.abs(result.forecast[0].cost - 5) < 1e-9);
});

test('forecastCosts handles empty history', () => {
  const result = forecastCosts([], 5);
  assert.equal(result.model, 'historical-mean');
  assert.equal(result.forecast.length, 5);
  assert.equal(result.historyDays, 0);
});
