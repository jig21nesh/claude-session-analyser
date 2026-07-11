import { resolvePricing, cacheSavings } from './pricing.js';

const MODEL_SWITCHER_URL = 'https://github.com/jig21nesh/model-switcher';
const PREMIUM_PREFIXES = ['claude-fable', 'claude-mythos', 'claude-opus'];
const SONNET_INPUT = 3;
const SONNET_OUTPUT = 15;
// Conservative assumption: roughly 40% of prompts sent to a premium model are
// simple enough (small edits, questions, formatting) to run on a Sonnet-class model.
const ROUTABLE_SHARE = 0.4;
const CACHE_HIT_TARGET = 0.85;
const CONTEXT_BLOAT_INPUT_PER_REQUEST = 120000;
const FRAGMENT_SESSION_REQUESTS = 4;

function isPremium(model) {
  const id = resolvePricing(model).model;
  return PREMIUM_PREFIXES.some((p) => id.startsWith(p));
}

function usd(x) {
  return `$${x.toFixed(2)}`;
}

/**
 * Recompute all improvement recommendations from stored aggregates.
 * Pure DB-in/DB-out: deletes and re-inserts the improvements table.
 */
export function computeImprovements(db) {
  db.prepare('DELETE FROM improvements').run();
  const insert = db.prepare(`
    INSERT INTO improvements
      (scope, project_id, session_id, category, severity, title, description, estimated_savings_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const add = (item) =>
    insert.run(
      item.scope, item.projectId ?? null, item.sessionId ?? null, item.category,
      item.severity, item.title, item.description, item.savings ?? null
    );

  const modelRows = db.prepare(`
    SELECT s.project_id AS project_id, u.model AS model,
           SUM(u.requests) AS requests,
           SUM(u.input_tokens) AS input_tokens,
           SUM(u.output_tokens) AS output_tokens,
           SUM(u.cache_read_tokens) AS cache_read_tokens,
           SUM(u.cache_5m_tokens) AS cache_5m_tokens,
           SUM(u.cache_1h_tokens) AS cache_1h_tokens,
           SUM(u.cost_usd) AS cost_usd
    FROM session_model_usage u
    JOIN sessions s ON s.id = u.session_id
    GROUP BY s.project_id, u.model
  `).all();

  emitModelMix(modelRows, add);
  emitCacheEfficiency(modelRows, add);
  emitContextBloat(db, add);
  emitFragmentation(db, add);
  emitOutputShare(modelRows, add);
}

function emitModelMix(modelRows, add) {
  const global = { premiumCost: 0, premiumInput: 0, premiumOutput: 0, totalCost: 0 };
  const perProject = new Map();

  for (const row of modelRows) {
    global.totalCost += row.cost_usd;
    let proj = perProject.get(row.project_id);
    if (!proj) {
      proj = { premiumCost: 0, premiumInput: 0, premiumOutput: 0, totalCost: 0 };
      perProject.set(row.project_id, proj);
    }
    proj.totalCost += row.cost_usd;
    if (isPremium(row.model)) {
      const price = resolvePricing(row.model);
      global.premiumCost += row.cost_usd;
      proj.premiumCost += row.cost_usd;
      // Savings if routable share had run on Sonnet pricing instead.
      const premiumSpendOnRoutable =
        (row.input_tokens / 1e6) * price.input + (row.output_tokens / 1e6) * price.output;
      const sonnetSpendOnRoutable =
        (row.input_tokens / 1e6) * SONNET_INPUT + (row.output_tokens / 1e6) * SONNET_OUTPUT;
      const delta = Math.max(0, (premiumSpendOnRoutable - sonnetSpendOnRoutable) * ROUTABLE_SHARE);
      global.premiumInput += delta; // reuse field as accumulated savings
      proj.premiumInput += delta;
    }
  }

  const emit = (scope, projectId, agg) => {
    if (agg.totalCost <= 0) return;
    const share = agg.premiumCost / agg.totalCost;
    if (share < 0.3 || agg.premiumInput < 0.5) return;
    add({
      scope, projectId,
      category: 'model-mix',
      severity: share > 0.7 ? 'high' : 'medium',
      title: 'Route simple prompts to a cheaper model with model-switcher',
      description:
        `${Math.round(share * 100)}% of this ${scope === 'global' ? 'account' : 'project'}'s spend ` +
        `(${usd(agg.premiumCost)}) runs on premium models (Opus/Fable tier). ` +
        `Many prompts — small edits, quick questions, formatting — do not need that tier. ` +
        `model-switcher (${MODEL_SWITCHER_URL}) classifies each prompt's complexity and keeps the session on a ` +
        `low-cost model, delegating only COMPLEX prompts to a heavy model via a subagent. ` +
        `Assuming ~${Math.round(ROUTABLE_SHARE * 100)}% of premium prompts are routable to Sonnet-class pricing, ` +
        `estimated savings ≈ ${usd(agg.premiumInput)}.`,
      savings: agg.premiumInput,
    });
  };

  emit('global', null, global);
  for (const [projectId, agg] of perProject) emit('project', projectId, agg);
}

function emitCacheEfficiency(modelRows, add) {
  const perProject = new Map();
  const global = { read: 0, uncachedInput: 0, missedSavings: 0, requests: 0 };

  for (const row of modelRows) {
    let proj = perProject.get(row.project_id);
    if (!proj) {
      proj = { read: 0, uncachedInput: 0, missedSavings: 0, requests: 0 };
      perProject.set(row.project_id, proj);
    }
    for (const agg of [global, proj]) {
      agg.read += row.cache_read_tokens;
      agg.uncachedInput += row.input_tokens;
      agg.requests += row.requests;
      // If uncached input had been served as cache reads it would cost 90% less.
      agg.missedSavings += cacheSavings(row.model, row.input_tokens);
    }
  }

  const emit = (scope, projectId, agg) => {
    const denominator = agg.read + agg.uncachedInput;
    if (denominator < 1e6 || agg.requests < 50) return;
    const hitRate = agg.read / denominator;
    if (hitRate >= CACHE_HIT_TARGET) return;
    const potential = agg.missedSavings * (CACHE_HIT_TARGET - hitRate);
    if (potential < 0.5) return;
    add({
      scope, projectId,
      category: 'cache-efficiency',
      severity: hitRate < 0.6 ? 'high' : 'medium',
      title: 'Improve prompt-cache hit rate',
      description:
        `Cache hit rate is ${Math.round(hitRate * 100)}% (target ≥ ${Math.round(CACHE_HIT_TARGET * 100)}%). ` +
        `Cache reads cost 10% of fresh input tokens, so every miss is paid ~10×. ` +
        `Common causes: gaps longer than the cache TTL between prompts (default 5 min), editing CLAUDE.md or ` +
        `settings mid-session (invalidates the prefix), and many short sessions each paying a fresh cache write. ` +
        `Work in focused bursts and keep long-lived sessions per task. ` +
        `Raising the hit rate to ${Math.round(CACHE_HIT_TARGET * 100)}% would have saved ≈ ${usd(potential)}.`,
      savings: potential,
    });
  };

  emit('global', null, global);
  for (const [projectId, agg] of perProject) emit('project', projectId, agg);
}

function emitContextBloat(db, add) {
  const rows = db.prepare(`
    SELECT id, project_id, session_id, requests, cost_usd,
           (input_tokens + cache_read_tokens + cache_5m_tokens + cache_1h_tokens) AS context_tokens
    FROM sessions
    WHERE requests >= 20
  `).all();

  for (const row of rows) {
    const perRequest = row.context_tokens / row.requests;
    if (perRequest < CONTEXT_BLOAT_INPUT_PER_REQUEST) continue;
    // A /clear or /compact at half-way would roughly halve context on later requests: ~30% of session cost.
    const savings = row.cost_usd * 0.3;
    if (savings < 1) continue;
    add({
      scope: 'session',
      projectId: row.project_id,
      sessionId: row.id,
      category: 'context-bloat',
      severity: perRequest > 2 * CONTEXT_BLOAT_INPUT_PER_REQUEST ? 'high' : 'medium',
      title: 'Very large context carried on every request',
      description:
        `This session averaged ${Math.round(perRequest / 1000)}k context tokens per request across ` +
        `${row.requests} requests. Even cached, that volume is billed on every call. ` +
        `Use /compact at natural checkpoints, /clear between unrelated tasks, and split long-running work ` +
        `into fresh sessions. A mid-session compaction here would have saved ≈ ${usd(savings)}.`,
      savings,
    });
  }
}

function emitFragmentation(db, add) {
  const rows = db.prepare(`
    SELECT project_id,
           COUNT(*) AS session_count,
           SUM(CASE WHEN requests > 0 AND requests <= ${FRAGMENT_SESSION_REQUESTS} THEN 1 ELSE 0 END) AS tiny_sessions,
           SUM(CASE WHEN requests > 0 AND requests <= ${FRAGMENT_SESSION_REQUESTS}
                    THEN cache_5m_tokens + cache_1h_tokens ELSE 0 END) AS tiny_cache_writes,
           SUM(cost_usd) AS cost_usd
    FROM sessions
    GROUP BY project_id
  `).all();

  for (const row of rows) {
    if (row.session_count < 10 || row.tiny_sessions / row.session_count < 0.5) continue;
    // Each tiny session pays a fresh cache write for the system prompt + CLAUDE.md.
    const savings = (row.tiny_cache_writes / 1e6) * 5 * 0.8; // premium-ish input rate, most writes avoidable
    if (savings < 0.5) continue;
    add({
      scope: 'project',
      projectId: row.project_id,
      category: 'session-fragmentation',
      severity: 'medium',
      title: 'Many tiny sessions re-pay the startup cache write',
      description:
        `${row.tiny_sessions} of ${row.session_count} sessions in this project made ≤ ${FRAGMENT_SESSION_REQUESTS} ` +
        `requests. Every new session re-writes the system prompt, CLAUDE.md and rules into the prompt cache ` +
        `(billed at 1.25–2× input rate) before any work happens. Batch related quick asks into one session ` +
        `(or use --continue / --resume) to reuse the warm cache. Estimated avoidable spend ≈ ${usd(savings)}. ` +
        `Also consider trimming CLAUDE.md/rules — they are re-cached in every session of every project.`,
      savings,
    });
  }
}

function emitOutputShare(modelRows, add) {
  let outputCost = 0;
  let totalCost = 0;
  for (const row of modelRows) {
    const price = resolvePricing(row.model);
    outputCost += (row.output_tokens / 1e6) * price.output;
    totalCost += row.cost_usd;
  }
  if (totalCost < 20) return;
  const share = outputCost / totalCost;
  if (share < 0.35) return;
  const savings = outputCost * 0.25;
  add({
    scope: 'global',
    category: 'output-verbosity',
    severity: share > 0.5 ? 'medium' : 'low',
    title: 'Output tokens dominate spend',
    description:
      `${Math.round(share * 100)}% of total cost is output tokens, which are priced 5× input. ` +
      `Long narrations, full-file rewrites and verbose explanations all bill as output. ` +
      `Ask for diffs instead of whole files, add "be concise" guidance to CLAUDE.md, and prefer targeted ` +
      `edits over regeneration. Trimming a quarter of output volume would save ≈ ${usd(savings)}.`,
    savings,
  });
}

export { MODEL_SWITCHER_URL, ROUTABLE_SHARE, CACHE_HIT_TARGET };
