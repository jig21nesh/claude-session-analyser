import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../src/db.js';
import { parseSessionFile, scanAll, projectNameFromDir } from '../src/analyzer.js';
import { makeTempProjectsDir, writeSessionFile, assistantEntry, userEntry } from './helpers.js';

let projectsDir;
let db;

beforeEach(() => {
  projectsDir = makeTempProjectsDir();
  db = openDb(':memory:');
});

afterEach(() => {
  fs.rmSync(projectsDir, { recursive: true, force: true });
});

test('parseSessionFile aggregates usage, deduplicating by requestId', async () => {
  const dup = assistantEntry({ requestId: 'req_1', input: 1000, output: 100, toolUses: 1 });
  const filePath = writeSessionFile(projectsDir, '-Users-tester-dev-sample-project', 'aaaa-bbbb', [
    userEntry({ text: 'hello' }),
    dup,
    dup, // same requestId repeated (streamed content blocks) — must count once
    assistantEntry({ requestId: 'req_2', input: 2000, output: 200, cacheRead: 5000 }),
    userEntry({ toolResult: true }), // tool result, not a human message
    'this line is not json {{{',
  ]);

  const parsed = await parseSessionFile(filePath);
  assert.equal(parsed.requests, 2);
  assert.equal(parsed.totals.input, 3000);
  assert.equal(parsed.totals.output, 300);
  assert.equal(parsed.totals.cacheRead, 5000);
  assert.equal(parsed.userMessages, 1);
  assert.equal(parsed.toolCalls, 1);
  assert.equal(parsed.malformedLines, 1);
  assert.equal(parsed.cwd, '/Users/tester/dev/sample-project');
});

test('parseSessionFile splits cache creation into 5m and 1h buckets', async () => {
  const filePath = writeSessionFile(projectsDir, '-p', 'cccc-dddd', [
    assistantEntry({ requestId: 'r1', cache5m: 111, cache1h: 222 }),
  ]);
  const parsed = await parseSessionFile(filePath);
  assert.equal(parsed.totals.cache5m, 111);
  assert.equal(parsed.totals.cache1h, 222);
});

test('parseSessionFile tracks sidechain cost separately', async () => {
  const filePath = writeSessionFile(projectsDir, '-p', 'eeee-ffff', [
    assistantEntry({ requestId: 'r1', input: 1e6, output: 0, sidechain: true, model: 'claude-opus-4-8' }),
    assistantEntry({ requestId: 'r2', input: 1e6, output: 0, sidechain: false, model: 'claude-opus-4-8' }),
  ]);
  const parsed = await parseSessionFile(filePath);
  assert.ok(Math.abs(parsed.totals.sidechainCost - 5) < 1e-9);
  assert.ok(Math.abs(parsed.totals.cost - 10) < 1e-9);
});

test('scanAll stores sessions and is incremental on unchanged files', async () => {
  writeSessionFile(projectsDir, '-Users-tester-dev-sample-project', 'aaaa-1111', [
    assistantEntry({ requestId: 'r1', model: 'claude-fable-5', input: 500, output: 50 }),
  ]);
  const first = await scanAll(db, projectsDir);
  assert.equal(first.parsed, 1);
  assert.equal(first.skipped, 0);

  const second = await scanAll(db, projectsDir);
  assert.equal(second.parsed, 0);
  assert.equal(second.skipped, 1);

  const forced = await scanAll(db, projectsDir, { force: true });
  assert.equal(forced.parsed, 1);

  const session = db.prepare('SELECT * FROM sessions').get();
  assert.equal(session.requests, 1);
  assert.equal(session.input_tokens, 500);
  const project = db.prepare('SELECT * FROM projects').get();
  assert.equal(project.name, 'sample-project');
  assert.equal(project.path, '/Users/tester/dev/sample-project');
});

test('scanAll removes sessions whose files disappeared', async () => {
  const filePath = writeSessionFile(projectsDir, '-p', 'aaaa-2222', [
    assistantEntry({ requestId: 'r1' }),
  ]);
  await scanAll(db, projectsDir);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);

  fs.rmSync(filePath);
  const result = await scanAll(db, projectsDir);
  assert.equal(result.removed, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  // Cascade cleaned dependent rows too.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session_model_usage').get().n, 0);
});

test('scanAll records per-model and per-day breakdowns', async () => {
  writeSessionFile(projectsDir, '-p', 'aaaa-3333', [
    assistantEntry({ requestId: 'r1', model: 'claude-fable-5', timestamp: '2026-07-01T10:00:00Z', input: 100 }),
    assistantEntry({ requestId: 'r2', model: 'claude-haiku-4-5', timestamp: '2026-07-02T10:00:00Z', input: 200 }),
  ]);
  await scanAll(db, projectsDir);
  const models = db.prepare('SELECT model FROM session_model_usage ORDER BY model').all().map((r) => r.model);
  assert.deepEqual(models, ['claude-fable-5', 'claude-haiku-4-5']);
  const days = db.prepare('SELECT date FROM session_daily_usage ORDER BY date').all().map((r) => r.date);
  assert.deepEqual(days, ['2026-07-01', '2026-07-02']);
});

test('scanAll survives an unreadable projects dir', async () => {
  const result = await scanAll(db, '/nonexistent/path/for/testing');
  assert.equal(result.sessions, 0);
});

test('scanAll merges nested subagent transcripts into the parent session', async () => {
  writeSessionFile(projectsDir, '-p', 'aaaa-4444', [
    userEntry({}),
    assistantEntry({ requestId: 'req_main', model: 'claude-fable-5', input: 1000, output: 100 }),
  ]);
  // Subagent transcript nested under <session>/subagents/ with its own requests.
  writeSessionFile(projectsDir, '-p/aaaa-4444/subagents', 'agent-x1', [
    userEntry({ text: 'subagent task prompt' }),
    assistantEntry({ requestId: 'req_sub', model: 'claude-opus-4-8', input: 1e6, output: 0 }),
    assistantEntry({ requestId: 'req_main', input: 999999, output: 999999 }), // duplicate id across files → counted once
  ]);

  await scanAll(db, projectsDir);
  const session = db.prepare("SELECT * FROM sessions WHERE session_id = 'aaaa-4444'").get();
  assert.ok(session, 'nested files attach to the parent session');
  assert.equal(session.file_count, 2);
  assert.equal(session.requests, 2);
  // Subagent user entries are not human prompts.
  assert.equal(session.user_messages, 1);
  // Sidechain cost = the opus subagent request ($5/M input on 1M tokens).
  assert.ok(Math.abs(session.sidechain_cost_usd - 5) < 1e-6, `sidechain ${session.sidechain_cost_usd}`);
  const models = db.prepare("SELECT model FROM session_model_usage WHERE session_id = ? ORDER BY model").all(session.id);
  assert.equal(models.length, 2);
});

test('projectNameFromDir falls back to the last path segment', () => {
  assert.equal(projectNameFromDir('-Users-x-dev-my-app'), 'app');
  assert.equal(projectNameFromDir(''), '');
});

test('scanAll derives project names from Windows-style cwd paths', async () => {
  writeSessionFile(projectsDir, '-C-Users-dev-win-project', 'aaaa-5555', [
    assistantEntry({ requestId: 'r1', cwd: 'C:\\Users\\dev\\win-project' }),
  ]);
  await scanAll(db, projectsDir);
  const project = db.prepare('SELECT name, path FROM projects').get();
  assert.equal(project.name, 'win-project');
  assert.equal(project.path, 'C:\\Users\\dev\\win-project');
});
