import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { costForTokens } from './pricing.js';
import { setMeta } from './db.js';
import { logger } from './logger.js';

/**
 * Parse one session transcript (JSONL) as a stream.
 * Only usage metadata is extracted — message text never leaves the file.
 * Usage is deduplicated by requestId: one API response can span several JSONL
 * entries that each repeat the same usage object.
 */
export async function parseSessionFile(filePath) {
  const stats = {
    userMessages: 0,
    assistantEntries: 0,
    toolCalls: 0,
    firstTs: null,
    lastTs: null,
    cwd: null,
    gitBranch: null,
    cliVersion: null,
    malformedLines: 0,
  };
  const usageByRequest = new Map();

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      stats.malformedLines += 1;
      continue;
    }
    if (entry === null || typeof entry !== 'object') continue;

    if (entry.timestamp) {
      if (stats.firstTs === null || entry.timestamp < stats.firstTs) stats.firstTs = entry.timestamp;
      if (stats.lastTs === null || entry.timestamp > stats.lastTs) stats.lastTs = entry.timestamp;
    }
    if (!stats.cwd && typeof entry.cwd === 'string') stats.cwd = entry.cwd;
    if (!stats.gitBranch && typeof entry.gitBranch === 'string') stats.gitBranch = entry.gitBranch;
    if (!stats.cliVersion && typeof entry.version === 'string') stats.cliVersion = entry.version;

    if (entry.type === 'user' && !entry.isSidechain) {
      const content = entry.message?.content;
      const isToolResultOnly =
        Array.isArray(content) && content.length > 0 && content.every((c) => c?.type === 'tool_result');
      if (!isToolResultOnly) stats.userMessages += 1;
    } else if (entry.type === 'assistant') {
      stats.assistantEntries += 1;
      const message = entry.message;
      if (message && typeof message === 'object') {
        if (Array.isArray(message.content)) {
          for (const block of message.content) {
            if (block?.type === 'tool_use') stats.toolCalls += 1;
          }
        }
        const usage = message.usage;
        if (usage && typeof usage === 'object') {
          const key = entry.requestId || message.id || entry.uuid;
          usageByRequest.set(key, {
            model: message.model || 'unknown',
            timestamp: entry.timestamp || null,
            sidechain: entry.isSidechain === true,
            input: usage.input_tokens || 0,
            output: usage.output_tokens || 0,
            cacheRead: usage.cache_read_input_tokens || 0,
            cache5m:
              usage.cache_creation?.ephemeral_5m_input_tokens ??
              (usage.cache_creation ? 0 : usage.cache_creation_input_tokens || 0),
            cache1h: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
          });
        }
      }
    }
  }

  return aggregateUsage(stats, usageByRequest);
}

function aggregateUsage(stats, usageByRequest) {
  const totals = { input: 0, output: 0, cacheRead: 0, cache5m: 0, cache1h: 0, cost: 0, sidechainCost: 0 };
  const byModel = new Map();
  const byDate = new Map();

  for (const record of usageByRequest.values()) {
    const tokens = {
      input: record.input,
      output: record.output,
      cacheRead: record.cacheRead,
      cache5m: record.cache5m,
      cache1h: record.cache1h,
    };
    const cost = costForTokens(record.model, tokens).total;

    totals.input += tokens.input;
    totals.output += tokens.output;
    totals.cacheRead += tokens.cacheRead;
    totals.cache5m += tokens.cache5m;
    totals.cache1h += tokens.cache1h;
    totals.cost += cost;
    if (record.sidechain) totals.sidechainCost += cost;

    let modelAgg = byModel.get(record.model);
    if (!modelAgg) {
      modelAgg = { requests: 0, input: 0, output: 0, cacheRead: 0, cache5m: 0, cache1h: 0, cost: 0 };
      byModel.set(record.model, modelAgg);
    }
    modelAgg.requests += 1;
    modelAgg.input += tokens.input;
    modelAgg.output += tokens.output;
    modelAgg.cacheRead += tokens.cacheRead;
    modelAgg.cache5m += tokens.cache5m;
    modelAgg.cache1h += tokens.cache1h;
    modelAgg.cost += cost;

    const date = record.timestamp ? record.timestamp.slice(0, 10) : null;
    if (date) {
      let dayAgg = byDate.get(date);
      if (!dayAgg) {
        dayAgg = { requests: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0 };
        byDate.set(date, dayAgg);
      }
      dayAgg.requests += 1;
      dayAgg.input += tokens.input;
      dayAgg.output += tokens.output;
      dayAgg.cacheRead += tokens.cacheRead;
      dayAgg.cacheCreate += tokens.cache5m + tokens.cache1h;
      dayAgg.cost += cost;
    }
  }

  return { ...stats, requests: usageByRequest.size, totals, byModel, byDate };
}

/** Best-effort human name for a project directory when no cwd was recorded. */
export function projectNameFromDir(dirName) {
  const parts = dirName.split('-').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : dirName;
}

async function listSessionFiles(projectsDir) {
  const out = [];
  let projectDirs = [];
  try {
    projectDirs = await fsp.readdir(projectsDir, { withFileTypes: true });
  } catch (err) {
    logger.warn('projects directory not readable', { dir: projectsDir, error: err.message });
    return out;
  }
  for (const dirent of projectDirs) {
    if (!dirent.isDirectory()) continue;
    const projectPath = path.join(projectsDir, dirent.name);
    let files;
    try {
      files = await fsp.readdir(projectPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      out.push({ dirName: dirent.name, filePath: path.join(projectPath, file), sessionId: file.slice(0, -6) });
    }
  }
  return out;
}

function upsertProject(db, dirName, cwd) {
  const existing = db.prepare('SELECT id, path FROM projects WHERE dir_name = ?').get(dirName);
  const projectPath = cwd || existing?.path || dirName;
  const name = projectPath.includes('/') ? path.basename(projectPath) : projectNameFromDir(dirName);
  if (existing) {
    if (cwd && existing.path !== cwd) {
      db.prepare('UPDATE projects SET path = ?, name = ? WHERE id = ?').run(projectPath, name, existing.id);
    }
    return existing.id;
  }
  const result = db
    .prepare('INSERT INTO projects (dir_name, path, name) VALUES (?, ?, ?)')
    .run(dirName, projectPath, name);
  return Number(result.lastInsertRowid);
}

function storeSession(db, file, fileStat, parsed) {
  const projectId = upsertProject(db, file.dirName, parsed.cwd);
  const models = JSON.stringify([...parsed.byModel.keys()].sort());

  const upsert = db.prepare(`
    INSERT INTO sessions (
      session_id, project_id, file_path, file_mtime_ms, file_size,
      started_at, ended_at, user_messages, assistant_messages, tool_calls, requests,
      input_tokens, output_tokens, cache_read_tokens, cache_5m_tokens, cache_1h_tokens,
      cost_usd, sidechain_cost_usd, models, git_branch, cli_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      project_id = excluded.project_id,
      file_path = excluded.file_path,
      file_mtime_ms = excluded.file_mtime_ms,
      file_size = excluded.file_size,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      user_messages = excluded.user_messages,
      assistant_messages = excluded.assistant_messages,
      tool_calls = excluded.tool_calls,
      requests = excluded.requests,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      cache_5m_tokens = excluded.cache_5m_tokens,
      cache_1h_tokens = excluded.cache_1h_tokens,
      cost_usd = excluded.cost_usd,
      sidechain_cost_usd = excluded.sidechain_cost_usd,
      models = excluded.models,
      git_branch = excluded.git_branch,
      cli_version = excluded.cli_version
  `);
  upsert.run(
    file.sessionId, projectId, file.filePath, Math.round(fileStat.mtimeMs), fileStat.size,
    parsed.firstTs, parsed.lastTs, parsed.userMessages, parsed.assistantEntries,
    parsed.toolCalls, parsed.requests,
    parsed.totals.input, parsed.totals.output, parsed.totals.cacheRead,
    parsed.totals.cache5m, parsed.totals.cache1h,
    parsed.totals.cost, parsed.totals.sidechainCost, models, parsed.gitBranch, parsed.cliVersion
  );
  const sessionRowId = Number(
    db.prepare('SELECT id FROM sessions WHERE session_id = ?').get(file.sessionId).id
  );

  db.prepare('DELETE FROM session_model_usage WHERE session_id = ?').run(sessionRowId);
  const insertModel = db.prepare(`
    INSERT INTO session_model_usage
      (session_id, model, requests, input_tokens, output_tokens, cache_read_tokens,
       cache_5m_tokens, cache_1h_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [model, agg] of parsed.byModel) {
    insertModel.run(sessionRowId, model, agg.requests, agg.input, agg.output, agg.cacheRead, agg.cache5m, agg.cache1h, agg.cost);
  }

  db.prepare('DELETE FROM session_daily_usage WHERE session_id = ?').run(sessionRowId);
  const insertDay = db.prepare(`
    INSERT INTO session_daily_usage
      (session_id, date, requests, input_tokens, output_tokens, cache_read_tokens,
       cache_create_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [date, agg] of parsed.byDate) {
    insertDay.run(sessionRowId, date, agg.requests, agg.input, agg.output, agg.cacheRead, agg.cacheCreate, agg.cost);
  }
}

/**
 * Scan every transcript under projectsDir into the database.
 * Incremental: files whose (mtime, size) match the stored session are skipped
 * unless force is set. Sessions whose files disappeared are removed.
 */
export async function scanAll(db, projectsDir, { force = false, concurrency = 8, onProgress = () => {} } = {}) {
  const startedAt = Date.now();
  const files = await listSessionFiles(projectsDir);
  onProgress({ phase: 'listing', total: files.length, processed: 0 });

  const known = new Map();
  for (const row of db.prepare('SELECT session_id, file_mtime_ms, file_size FROM sessions').all()) {
    known.set(row.session_id, row);
  }

  const seenSessionIds = new Set(files.map((f) => f.sessionId));
  const removed = [...known.keys()].filter((id) => !seenSessionIds.has(id));
  for (const sessionId of removed) {
    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
  }

  let processed = 0;
  let parsedCount = 0;
  let skipped = 0;
  let errors = 0;

  const queue = [...files];
  async function worker() {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      try {
        const fileStat = await fsp.stat(file.filePath);
        const prior = known.get(file.sessionId);
        if (!force && prior && prior.file_mtime_ms === Math.round(fileStat.mtimeMs) && prior.file_size === fileStat.size) {
          skipped += 1;
        } else {
          const parsed = await parseSessionFile(file.filePath);
          storeSession(db, file, fileStat, parsed);
          parsedCount += 1;
        }
      } catch (err) {
        errors += 1;
        logger.warn('failed to analyse session file', { file: file.filePath, error: err.message });
      }
      processed += 1;
      if (processed % 100 === 0 || processed === files.length) {
        onProgress({ phase: 'parsing', total: files.length, processed });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  setMeta(db, 'last_refresh_at', new Date().toISOString());
  const durationMs = Date.now() - startedAt;
  const summary = { files: files.length, parsed: parsedCount, skipped, removed: removed.length, errors, durationMs };
  logger.info('scan complete', summary);
  return summary;
}
