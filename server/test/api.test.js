import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createScanService } from '../src/scan-service.js';
import { makeTempProjectsDir, writeSessionFile, assistantEntry, userEntry } from './helpers.js';

let server;
let baseUrl;
let projectsDir;
let db;

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

before(async () => {
  projectsDir = makeTempProjectsDir();
  const day = (d) => `2026-06-${String(d).padStart(2, '0')}T12:00:00.000Z`;
  // 20 days of activity so predictions can run Holt-Winters.
  const entries = [userEntry({})];
  for (let d = 1; d <= 20; d += 1) {
    entries.push(
      assistantEntry({
        requestId: `req_${d}`,
        model: d % 3 === 0 ? 'claude-haiku-4-5' : 'claude-fable-5',
        timestamp: day(d),
        input: 10000,
        output: 2000,
        cacheRead: 50000,
        cache5m: 8000,
        cwd: '/Users/tester/dev/alpha',
      })
    );
  }
  writeSessionFile(projectsDir, '-Users-tester-dev-alpha', '11111111-2222-3333-4444-555555555555', entries);
  writeSessionFile(projectsDir, '-Users-tester-dev-beta', '99999999-8888-7777-6666-555555555555', [
    userEntry({}),
    assistantEntry({ requestId: 'req_b1', cwd: '/Users/tester/dev/beta', input: 500, output: 100 }),
  ]);

  db = openDb(':memory:');
  const scanService = createScanService(db, projectsDir);
  await scanService.runAndWait();
  const app = createApp(db, scanService);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(projectsDir, { recursive: true, force: true });
});

test('GET /api/health returns the envelope', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.ok(body.timestamp);
});

test('GET /api/summary aggregates sessions, models and cache savings', async () => {
  const { status, body } = await get('/api/summary');
  assert.equal(status, 200);
  assert.equal(body.data.totals.sessions, 2);
  assert.equal(body.data.totals.projects, 2);
  assert.ok(body.data.totals.cost_usd > 0);
  assert.ok(body.data.by_model.length >= 2);
  assert.ok(body.data.cache_saved_usd > 0);
  assert.ok(body.data.last_refresh_at);
});

test('GET /api/projects lists projects ordered by cost', async () => {
  const { body } = await get('/api/projects');
  const projects = body.data.projects;
  assert.equal(projects.length, 2);
  assert.equal(projects[0].name, 'alpha');
  assert.ok(projects[0].cost_usd >= projects[1].cost_usd);
});

test('GET /api/projects/:id returns detail with model breakdown', async () => {
  const { body } = await get('/api/projects');
  const id = body.data.projects[0].id;
  const detail = await get(`/api/projects/${id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.project.id, id);
  assert.ok(detail.body.data.by_model.length >= 1);
  assert.equal(detail.body.data.totals.sessions, 1);
});

test('GET /api/projects/:id 404s on a missing project and 400s on bad input', async () => {
  assert.equal((await get('/api/projects/999999')).status, 404);
  assert.equal((await get('/api/projects/abc')).status, 400);
  assert.equal((await get('/api/projects/-1')).status, 400);
  // SQL injection attempt is rejected by validation, never reaching SQL.
  assert.equal((await get('/api/projects/1%3BDROP%20TABLE%20sessions')).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 2);
});

test('GET /api/projects/:id/sessions paginates', async () => {
  const { body } = await get('/api/projects');
  const id = body.data.projects[0].id;
  const page = await get(`/api/projects/${id}/sessions?page=1&page_size=10`);
  assert.equal(page.status, 200);
  assert.equal(page.body.data.total, 1);
  assert.equal(page.body.data.sessions.length, 1);
  const badPage = await get(`/api/projects/${id}/sessions?page_size=99999`);
  assert.equal(badPage.status, 400);
});

test('GET /api/sessions/:sessionId returns detail and validates input', async () => {
  const detail = await get('/api/sessions/11111111-2222-3333-4444-555555555555');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.session.project_name, 'alpha');
  assert.ok(detail.body.data.by_model.length >= 2);
  assert.ok(detail.body.data.daily.length >= 20);

  assert.equal((await get('/api/sessions/%2e%2e%2fetc%2fpasswd')).status, 400);
  assert.equal((await get('/api/sessions/00000000-0000-0000-0000-000000000000')).status, 404);
});

test('GET /api/daily-costs returns a dense-enough series and filters by project', async () => {
  const all = await get('/api/daily-costs');
  assert.equal(all.status, 200);
  assert.ok(all.body.data.days.length >= 20);

  const { body } = await get('/api/projects');
  const betaId = body.data.projects.find((p) => p.name === 'beta').id;
  const filtered = await get(`/api/daily-costs?project_id=${betaId}`);
  assert.equal(filtered.body.data.days.length, 1);

  assert.equal((await get('/api/daily-costs?project_id=zzz')).status, 400);
  assert.equal((await get('/api/daily-costs?days=0')).status, 400);
});

test('GET /api/predictions forecasts with model metadata and persists the report', async () => {
  const { status, body } = await get('/api/predictions?days=14');
  assert.equal(status, 200);
  assert.equal(body.data.forecast.length, 14);
  assert.ok(['holt-winters', 'linear-regression', 'historical-mean'].includes(body.data.model));
  assert.ok(body.data.history.length >= 20);
  assert.ok(body.data.explanation.length > 40, 'explains the model choice');

  // The report is stored; a second call serves it from the database.
  assert.ok(db.prepare('SELECT 1 FROM forecasts WHERE horizon_days = 14').get());
  const again = await get('/api/predictions?days=14');
  assert.equal(again.body.data.fromStore, true);

  assert.equal((await get('/api/predictions?days=5000')).status, 400);
});

test('GET /api/improvements returns recommendations with totals', async () => {
  const { status, body } = await get('/api/improvements');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.data.improvements));
  assert.equal(typeof body.data.total_estimated_savings_usd, 'number');
  assert.equal((await get('/api/improvements?project_id=x')).status, 400);
});

test('POST /api/refresh triggers a scan and reports status; concurrent refresh is rejected', async () => {
  const res = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
  assert.equal(res.status, 202);
  // Immediately after triggering, a second refresh may conflict (409) or the
  // first may already be done (202) — both are valid protocol outcomes.
  const second = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
  assert.ok([202, 409].includes(second.status));

  for (let i = 0; i < 50; i += 1) {
    const { body } = await get('/api/refresh-status');
    if (!body.data.running) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const { body } = await get('/api/refresh-status');
  assert.equal(body.data.running, false);
  assert.equal(body.data.lastError, null);
});

test('unknown routes return the 404 envelope', async () => {
  const { status, body } = await get('/api/nope');
  assert.equal(status, 404);
  assert.equal(body.status, 'error');
});

test('malformed JSON body returns 400, not a crash', async () => {
  const res = await fetch(`${baseUrl}/api/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
});
