import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  dir_name TEXT NOT NULL UNIQUE,
  path     TEXT NOT NULL,
  name     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id         TEXT NOT NULL UNIQUE,
  project_id         INTEGER NOT NULL REFERENCES projects(id),
  file_path          TEXT NOT NULL,
  file_mtime_ms      INTEGER NOT NULL,
  file_size          INTEGER NOT NULL,
  started_at         TEXT,
  ended_at           TEXT,
  user_messages      INTEGER NOT NULL DEFAULT 0,
  assistant_messages INTEGER NOT NULL DEFAULT 0,
  tool_calls         INTEGER NOT NULL DEFAULT 0,
  requests           INTEGER NOT NULL DEFAULT 0,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_5m_tokens    INTEGER NOT NULL DEFAULT 0,
  cache_1h_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd           REAL NOT NULL DEFAULT 0,
  sidechain_cost_usd REAL NOT NULL DEFAULT 0,
  models             TEXT NOT NULL DEFAULT '[]',
  git_branch         TEXT,
  cli_version        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

CREATE TABLE IF NOT EXISTS session_model_usage (
  session_id        INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  model             TEXT NOT NULL,
  requests          INTEGER NOT NULL DEFAULT 0,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_5m_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_1h_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, model)
);

CREATE TABLE IF NOT EXISTS session_daily_usage (
  session_id          INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date                TEXT NOT NULL,
  requests            INTEGER NOT NULL DEFAULT 0,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_create_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd            REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON session_daily_usage(date);

CREATE TABLE IF NOT EXISTS improvements (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  scope                 TEXT NOT NULL CHECK (scope IN ('global', 'project', 'session')),
  project_id            INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  session_id            INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  category              TEXT NOT NULL,
  severity              TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  estimated_savings_usd REAL
);
CREATE INDEX IF NOT EXISTS idx_improvements_project ON improvements(project_id);
CREATE INDEX IF NOT EXISTS idx_improvements_session ON improvements(session_id);
`;

export function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setMeta(db, key, value) {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}
