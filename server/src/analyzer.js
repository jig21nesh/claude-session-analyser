import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { costForTokens } from './pricing.js';
import { setMeta } from './db.js';
import { logger } from './logger.js';

/**
 * Transcript layout under ~/.claude/projects/<project-dir>/:
 *   <session>.jsonl                              — main session transcript
 *   <session>/subagents/*.jsonl                  — subagent transcripts
 *   <session>/subagents/workflows/<wf>/*.jsonl   — workflow agent transcripts
 * A session's true cost is the union of all of them, deduplicated by requestId.
 */

function newCollector() {
  return {
    stats: {
      userMessages: 0,
      assistantEntries: 0,
      firstTs: null,
      lastTs: null,
      cwd: null,
      gitBranch: null,
      cliVersion: null,
      malformedLines: 0,
    },
    usageByRequest: new Map(),
    toolUseIds: new Set(),
    anonymousToolCalls: 0,
  };
}

/** Stream one JSONL file into the collector. Only usage metadata is read. */
async function collectFile(collector, filePath, { forceSidechain = false } = {}) {
  const { stats, usageByRequest, toolUseIds } = collector;
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
    if (!forceSidechain) {
      if (!stats.cwd && typeof entry.cwd === 'string') stats.cwd = entry.cwd;
      if (!stats.gitBranch && typeof entry.gitBranch === 'string') stats.gitBranch = entry.gitBranch;
      if (!stats.cliVersion && typeof entry.version === 'string') stats.cliVersion = entry.version;
    }

    if (entry.type === 'user' && !forceSidechain && !entry.isSidechain) {
      const content = entry.message?.content;
      const isToolResultOnly =
        Array.isArray(content) && content.length > 0 && content.every((c) => c?.type === 'tool_result');
      if (!isToolResultOnly) stats.userMessages += 1;
    } else if (entry.type === 'assistant') {
      stats.assistantEntries += 1;
      const message = entry.message;
      if (!message || typeof message !== 'object') continue;

      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block?.type !== 'tool_use') continue;
          // The same block can be re-emitted across streamed entries — dedupe by id.
          if (typeof block.id === 'string') toolUseIds.add(block.id);
          else collector.anonymousToolCalls += 1;
        }
      }

      const usage = message.usage;
      if (usage && typeof usage === 'object') {
        const key = entry.requestId || message.id || entry.uuid;
        // First write wins: repeats of a requestId (streamed blocks, or the
        // same request echoed in a subagent file) carry the same usage.
        if (usageByRequest.has(key)) continue;
        usageByRequest.set(key, {
          model: message.model || 'unknown',
          timestamp: entry.timestamp || null,
          sidechain: forceSidechain || entry.isSidechain === true,
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

function aggregate(collector) {
  const { stats, usageByRequest } = collector;
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

  return {
    ...stats,
    toolCalls: collector.toolUseIds.size + collector.anonymousToolCalls,
    requests: usageByRequest.size,
    totals,
    byModel,
    byDate,
  };
}

/** Parse a single transcript file (used directly by tests). */
export async function parseSessionFile(filePath) {
  const collector = newCollector();
  await collectFile(collector, filePath);
  return aggregate(collector);
}

/** Parse a whole session group: main transcript + nested subagent transcripts. */
export async function parseSessionGroup(group) {
  const collector = newCollector();
  if (group.mainFile) await collectFile(collector, group.mainFile);
  for (const sub of group.subFiles) {
    await collectFile(collector, sub, { forceSidechain: true });
  }
  return aggregate(collector);
}

/** Best-effort human name for a project directory when no cwd was recorded. */
export function projectNameFromDir(dirName) {
  const parts = dirName.split('-').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : dirName;
}

async function walkJsonl(dir, out) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkJsonl(full, out);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
  }
}

/**
 * Group every transcript under projectsDir by session.
 * Returns [{ dirName, sessionId, mainFile, subFiles }].
 */
export async function listSessionGroups(projectsDir) {
  const groups = [];
  let projectDirs = [];
  try {
    projectDirs = await fsp.readdir(projectsDir, { withFileTypes: true });
  } catch (err) {
    logger.warn('projects directory not readable', { dir: projectsDir, error: err.message });
    return groups;
  }

  for (const dirent of projectDirs) {
    if (!dirent.isDirectory()) continue;
    const projectPath = path.join(projectsDir, dirent.name);
    const bySession = new Map();
    let entries;
    try {
      entries = await fsp.readdir(projectPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const sessionId = entry.name.slice(0, -6);
        const group = getGroup(bySession, dirent.name, sessionId);
        group.mainFile = path.join(projectPath, entry.name);
      } else if (entry.isDirectory()) {
        const nested = [];
        await walkJsonl(path.join(projectPath, entry.name), nested);
        if (nested.length > 0) {
          const group = getGroup(bySession, dirent.name, entry.name);
          group.subFiles.push(...nested.sort());
        }
      }
    }
    groups.push(...bySession.values());
  }
  return groups;
}

function getGroup(bySession, dirName, sessionId) {
  let group = bySession.get(sessionId);
  if (!group) {
    group = { dirName, sessionId, mainFile: null, subFiles: [] };
    bySession.set(sessionId, group);
  }
  return group;
}

async function statGroup(group) {
  const files = [group.mainFile, ...group.subFiles].filter(Boolean);
  let size = 0;
  let mtime = 0;
  for (const file of files) {
    const st = await fsp.stat(file);
    size += st.size;
    if (st.mtimeMs > mtime) mtime = st.mtimeMs;
  }
  return { size, mtime: Math.round(mtime), count: files.length };
}

/** Last segment of a recorded cwd — transcripts may carry POSIX or Windows paths. */
function lastPathSegment(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function upsertProject(db, dirName, cwd) {
  const existing = db.prepare('SELECT id, path FROM projects WHERE dir_name = ?').get(dirName);
  const projectPath = cwd || existing?.path || dirName;
  const name = lastPathSegment(projectPath) && /[\\/]/.test(projectPath)
    ? lastPathSegment(projectPath)
    : projectNameFromDir(dirName);
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

function storeSession(db, group, groupStat, parsed) {
  const projectId = upsertProject(db, group.dirName, parsed.cwd);
  const models = JSON.stringify([...parsed.byModel.keys()].sort());

  db.prepare(`
    INSERT INTO sessions (
      session_id, project_id, file_path, file_mtime_ms, file_size, file_count,
      started_at, ended_at, user_messages, assistant_messages, tool_calls, requests,
      input_tokens, output_tokens, cache_read_tokens, cache_5m_tokens, cache_1h_tokens,
      cost_usd, sidechain_cost_usd, models, git_branch, cli_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      project_id = excluded.project_id,
      file_path = excluded.file_path,
      file_mtime_ms = excluded.file_mtime_ms,
      file_size = excluded.file_size,
      file_count = excluded.file_count,
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
  `).run(
    group.sessionId, projectId, group.mainFile || group.subFiles[0], groupStat.mtime, groupStat.size,
    groupStat.count, parsed.firstTs, parsed.lastTs, parsed.userMessages, parsed.assistantEntries,
    parsed.toolCalls, parsed.requests,
    parsed.totals.input, parsed.totals.output, parsed.totals.cacheRead,
    parsed.totals.cache5m, parsed.totals.cache1h,
    parsed.totals.cost, parsed.totals.sidechainCost, models, parsed.gitBranch, parsed.cliVersion
  );
  const sessionRowId = Number(
    db.prepare('SELECT id FROM sessions WHERE session_id = ?').get(group.sessionId).id
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
 * Scan every session group under projectsDir into the database.
 * Incremental: groups whose (total size, newest mtime, file count) are unchanged
 * are skipped unless force is set. Sessions whose files disappeared are removed.
 */
export async function scanAll(db, projectsDir, { force = false, concurrency = 8, onProgress = () => {} } = {}) {
  const startedAt = Date.now();
  const groups = await listSessionGroups(projectsDir);
  onProgress({ phase: 'listing', total: groups.length, processed: 0 });

  const known = new Map();
  for (const row of db.prepare('SELECT session_id, file_mtime_ms, file_size, file_count FROM sessions').all()) {
    known.set(row.session_id, row);
  }

  const seenSessionIds = new Set(groups.map((g) => g.sessionId));
  const removed = [...known.keys()].filter((id) => !seenSessionIds.has(id));
  for (const sessionId of removed) {
    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
  }

  let processed = 0;
  let parsedCount = 0;
  let skipped = 0;
  let errors = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const group = groups[cursor];
      cursor += 1;
      if (!group) return;
      try {
        const groupStat = await statGroup(group);
        const prior = known.get(group.sessionId);
        if (
          !force && prior &&
          prior.file_mtime_ms === groupStat.mtime &&
          prior.file_size === groupStat.size &&
          prior.file_count === groupStat.count
        ) {
          skipped += 1;
        } else {
          const parsed = await parseSessionGroup(group);
          storeSession(db, group, groupStat, parsed);
          parsedCount += 1;
        }
      } catch (err) {
        errors += 1;
        logger.warn('failed to analyse session group', { session: group.sessionId, error: err.message });
      }
      processed += 1;
      if (processed % 50 === 0 || processed === groups.length) {
        onProgress({ phase: 'parsing', total: groups.length, processed });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  setMeta(db, 'last_refresh_at', new Date().toISOString());
  const durationMs = Date.now() - startedAt;
  const summary = { sessions: groups.length, parsed: parsedCount, skipped, removed: removed.length, errors, durationMs };
  logger.info('scan complete', summary);
  return summary;
}
