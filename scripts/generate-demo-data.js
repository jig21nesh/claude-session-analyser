/**
 * Generate a synthetic ~/.claude/projects folder with fake projects and
 * realistic usage, for demos and screenshots without exposing real data.
 *
 *   node scripts/generate-demo-data.js <output-dir>
 *
 * Deterministic (seeded PRNG), no dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/generate-demo-data.js <output-dir>');
  process.exit(1);
}

// mulberry32 — small seeded PRNG so demo data is reproducible.
function prng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20260711);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('');
const uuid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;

const PROJECTS = [
  { name: 'acme-storefront', sessions: 14, premium: 0.9, scale: 1.6 },
  { name: 'payments-api', sessions: 11, premium: 0.7, scale: 1.3 },
  { name: 'mobile-companion', sessions: 9, premium: 0.5, scale: 1.0 },
  { name: 'data-pipeline', sessions: 8, premium: 0.6, scale: 0.9 },
  { name: 'infra-terraform', sessions: 7, premium: 0.4, scale: 0.6 },
  { name: 'docs-site', sessions: 6, premium: 0.2, scale: 0.35 },
];
const BRANCHES = ['main', 'feat/checkout', 'feat/webhooks', 'fix/rate-limit', 'chore/upgrade', 'feat/dark-mode'];
const PREMIUM_MODELS = ['claude-fable-5', 'claude-opus-4-8'];
const CHEAP_MODELS = ['claude-sonnet-5', 'claude-haiku-4-5'];
// Weekday rhythm so the Holt-Winters forecast has a season to find.
const WEEKDAY_FACTOR = [0.15, 1.0, 1.25, 1.35, 1.2, 0.9, 0.25]; // Sun..Sat

const DAYS = 70;
const START = Date.now() - DAYS * 86400000;

function entry(ts, requestId, model, cwd, branch, tokens) {
  return JSON.stringify({
    type: 'assistant',
    uuid: uuid(),
    requestId,
    isSidechain: false,
    timestamp: new Date(ts).toISOString(),
    cwd,
    gitBranch: branch,
    version: '2.1.207',
    message: {
      id: `msg_${hex(20)}`,
      role: 'assistant',
      model,
      content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: `toolu_${hex(16)}`, name: 'Bash', input: {} }],
      usage: {
        input_tokens: tokens.input,
        output_tokens: tokens.output,
        cache_read_input_tokens: tokens.cacheRead,
        cache_creation_input_tokens: tokens.cache5m,
        cache_creation: { ephemeral_5m_input_tokens: tokens.cache5m, ephemeral_1h_input_tokens: 0 },
      },
    },
  });
}

function userEntry(ts, cwd) {
  return JSON.stringify({
    type: 'user',
    uuid: uuid(),
    timestamp: new Date(ts).toISOString(),
    cwd,
    message: { role: 'user', content: 'demo prompt' },
  });
}

fs.rmSync(OUT, { recursive: true, force: true });
let sessionCount = 0;

for (const project of PROJECTS) {
  const cwd = `/Users/demo/dev/${project.name}`;
  const dir = path.join(OUT, `-Users-demo-dev-${project.name.replaceAll('.', '-')}`);
  fs.mkdirSync(dir, { recursive: true });

  for (let s = 0; s < project.sessions; s += 1) {
    const dayOffset = Math.floor(between(0, DAYS - 1));
    let ts = START + dayOffset * 86400000 + between(8, 18) * 3600000;
    const weekday = new Date(ts).getUTCDay();
    const activity = WEEKDAY_FACTOR[weekday] * project.scale;
    const requests = Math.max(3, Math.round(between(10, 90) * activity));
    const branch = pick(BRANCHES);
    const lines = [userEntry(ts, cwd)];

    for (let r = 0; r < requests; r += 1) {
      ts += between(20, 180) * 1000;
      const model = rand() < project.premium ? pick(PREMIUM_MODELS) : pick(CHEAP_MODELS);
      lines.push(
        entry(ts, `req_${hex(18)}`, model, cwd, branch, {
          input: Math.round(between(400, 8000)),
          output: Math.round(between(200, 4000)),
          cacheRead: Math.round(between(30000, 700000) * activity),
          cache5m: Math.round(between(500, 25000)),
        })
      );
      if (rand() < 0.25) lines.push(userEntry(ts + 1000, cwd));
    }
    fs.writeFileSync(path.join(dir, `${uuid()}.jsonl`), lines.join('\n'));
    sessionCount += 1;
  }
}

console.log(`demo data: ${PROJECTS.length} projects, ${sessionCount} sessions -> ${OUT}`);
