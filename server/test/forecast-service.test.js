import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setMeta } from '../src/db.js';
import { computeAndStoreForecast, getForecast } from '../src/forecast-service.js';

let db;

function insertDailyUsage(days) {
  db.prepare("INSERT INTO projects (dir_name, path, name) VALUES ('-p', '/dev/p', 'p')").run();
  db.prepare(`
    INSERT INTO sessions (session_id, project_id, file_path, file_mtime_ms, file_size)
    VALUES ('aaaa-fc', 1, '/tmp/x.jsonl', 0, 0)
  `).run();
  const sid = Number(db.prepare("SELECT id FROM sessions WHERE session_id = 'aaaa-fc'").get().id);
  const insert = db.prepare(
    'INSERT INTO session_daily_usage (session_id, date, cost_usd) VALUES (?, ?, ?)'
  );
  const start = new Date('2026-06-01T00:00:00Z').getTime();
  days.forEach((cost, i) => {
    insert.run(sid, new Date(start + i * 86400000).toISOString().slice(0, 10), cost);
  });
}

beforeEach(() => {
  db = openDb(':memory:');
});

test('computeAndStoreForecast persists the full report', () => {
  insertDailyUsage(Array.from({ length: 21 }, (_, i) => 5 + (i % 7)));
  const result = computeAndStoreForecast(db, 30);
  assert.equal(result.model, 'holt-winters');
  assert.ok(result.explanation.includes('Holt-Winters'));

  const row = db.prepare('SELECT * FROM forecasts WHERE horizon_days = 30').get();
  assert.ok(row);
  assert.equal(row.model, 'holt-winters');
  const stored = JSON.parse(row.result_json);
  assert.equal(stored.forecast.length, 30);
  assert.deepEqual(JSON.parse(row.params_json), result.params);
});

test('getForecast serves the stored report until a newer analysis exists', () => {
  insertDailyUsage([1, 2, 3, 4, 5, 6]);
  setMeta(db, 'last_refresh_at', '2026-07-01T00:00:00.000Z');

  const first = getForecast(db, 14);
  assert.equal(first.fromStore, false);
  const second = getForecast(db, 14);
  assert.equal(second.fromStore, true);
  assert.equal(second.generatedAt, first.generatedAt);

  // A newer refresh invalidates the stored report.
  setMeta(db, 'last_refresh_at', new Date(Date.now() + 60000).toISOString());
  const third = getForecast(db, 14);
  assert.equal(third.fromStore, false);
});

test('different horizons are stored as separate reports', () => {
  insertDailyUsage([1, 2, 3, 4, 5, 6]);
  getForecast(db, 7);
  getForecast(db, 30);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM forecasts').get().n, 2);
});
