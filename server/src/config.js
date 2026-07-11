import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : fallback;
}

export const API_PORT = intFromEnv('API_PORT', 15801);
export const API_HOST = '127.0.0.1';
export const CLAUDE_PROJECTS_DIR =
  process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
export const DB_PATH =
  process.env.ANALYSER_DB_PATH || path.join(HERE, '..', 'data', 'analyser.db');
export const SERVICE_NAME = 'claude-session-analyser';
export const PARSE_CONCURRENCY = 8;
export const FORECAST_DAYS_DEFAULT = 30;
export const FORECAST_DAYS_MAX = 90;
export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 200;
