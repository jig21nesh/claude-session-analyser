import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { computeImprovements } from '../src/improvements.js';

let db;

function insertProject(name = 'proj') {
  db.prepare("INSERT INTO projects (dir_name, path, name) VALUES (?, ?, ?)").run(`-${name}`, `/dev/${name}`, name);
  return Number(db.prepare('SELECT id FROM projects WHERE name = ?').get(name).id);
}

function insertSession(projectId, sessionId, fields = {}) {
  const defaults = {
    requests: 100, user_messages: 10, tool_calls: 20,
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
    cache_5m_tokens: 0, cache_1h_tokens: 0, cost_usd: 0,
  };
  const v = { ...defaults, ...fields };
  db.prepare(`
    INSERT INTO sessions (session_id, project_id, file_path, file_mtime_ms, file_size,
      requests, user_messages, tool_calls, input_tokens, output_tokens,
      cache_read_tokens, cache_5m_tokens, cache_1h_tokens, cost_usd)
    VALUES (?, ?, '/tmp/x.jsonl', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, projectId, v.requests, v.user_messages, v.tool_calls, v.input_tokens,
    v.output_tokens, v.cache_read_tokens, v.cache_5m_tokens, v.cache_1h_tokens, v.cost_usd);
  return Number(db.prepare('SELECT id FROM sessions WHERE session_id = ?').get(sessionId).id);
}

function insertModelUsage(sessionRowId, model, fields = {}) {
  const defaults = {
    requests: 100, input_tokens: 0, output_tokens: 0,
    cache_read_tokens: 0, cache_5m_tokens: 0, cache_1h_tokens: 0, cost_usd: 0,
  };
  const v = { ...defaults, ...fields };
  db.prepare(`
    INSERT INTO session_model_usage (session_id, model, requests, input_tokens, output_tokens,
      cache_read_tokens, cache_5m_tokens, cache_1h_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionRowId, model, v.requests, v.input_tokens, v.output_tokens,
    v.cache_read_tokens, v.cache_5m_tokens, v.cache_1h_tokens, v.cost_usd);
}

beforeEach(() => {
  db = openDb(':memory:');
});

test('premium-heavy usage produces a model-mix recommendation citing model-switcher', () => {
  const projectId = insertProject();
  const sid = insertSession(projectId, 'aaaa-mix', { cost_usd: 500 });
  insertModelUsage(sid, 'claude-fable-5', {
    input_tokens: 20e6, output_tokens: 5e6, cache_read_tokens: 100e6, cost_usd: 480,
  });
  insertModelUsage(sid, 'claude-haiku-4-5', { input_tokens: 1e6, cost_usd: 20 });
  computeImprovements(db);

  const rows = db.prepare("SELECT * FROM improvements WHERE category = 'model-mix'").all();
  assert.ok(rows.length >= 1, 'expected a model-mix improvement');
  const global = rows.find((r) => r.scope === 'global');
  assert.ok(global);
  assert.match(global.description, /model-switcher/);
  assert.match(global.description, /github\.com\/jig21nesh\/model-switcher/);
  assert.ok(global.estimated_savings_usd > 0);
});

test('low cache hit rate produces a cache-efficiency recommendation', () => {
  const projectId = insertProject();
  const sid = insertSession(projectId, 'aaaa-cache', { cost_usd: 100 });
  // Lots of uncached input, few reads -> low hit rate.
  insertModelUsage(sid, 'claude-opus-4-8', {
    requests: 200, input_tokens: 50e6, cache_read_tokens: 10e6, cost_usd: 100,
  });
  computeImprovements(db);
  const rows = db.prepare("SELECT * FROM improvements WHERE category = 'cache-efficiency'").all();
  assert.ok(rows.length >= 1);
  assert.equal(rows.find((r) => r.scope === 'global').severity, 'high');
});

test('healthy usage produces no noise', () => {
  const projectId = insertProject();
  const sid = insertSession(projectId, 'aaaa-ok', { requests: 30, cost_usd: 5 });
  // Sonnet-tier, high cache hit rate, modest context.
  insertModelUsage(sid, 'claude-sonnet-5', {
    requests: 30, input_tokens: 1e6, cache_read_tokens: 30e6, output_tokens: 0.2e6, cost_usd: 5,
  });
  computeImprovements(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM improvements').get().n, 0);
});

test('context-heavy sessions produce a session-scoped recommendation', () => {
  const projectId = insertProject();
  insertSession(projectId, 'aaaa-bloat', {
    requests: 50,
    cache_read_tokens: 10e9, // 200M context tokens per request
    cost_usd: 200,
  });
  computeImprovements(db);
  const rows = db.prepare("SELECT * FROM improvements WHERE category = 'context-bloat'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scope, 'session');
  assert.equal(rows[0].severity, 'high');
});

test('many tiny sessions produce a fragmentation recommendation', () => {
  const projectId = insertProject();
  for (let i = 0; i < 12; i += 1) {
    insertSession(projectId, `aaaa-tiny-${i}`, {
      requests: 2, cache_5m_tokens: 2e6, cost_usd: 3,
    });
  }
  computeImprovements(db);
  const rows = db.prepare("SELECT * FROM improvements WHERE category = 'session-fragmentation'").all();
  assert.equal(rows.length, 1);
  assert.match(rows[0].description, /CLAUDE\.md/);
});

test('output-dominated spend produces an output-verbosity recommendation', () => {
  const projectId = insertProject();
  const sid = insertSession(projectId, 'aaaa-out', { cost_usd: 100 });
  insertModelUsage(sid, 'claude-opus-4-8', {
    input_tokens: 2e6, output_tokens: 3e6, cost_usd: 85, // output = $75 of ~$85
  });
  computeImprovements(db);
  const rows = db.prepare("SELECT * FROM improvements WHERE category = 'output-verbosity'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scope, 'global');
});
