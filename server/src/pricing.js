// USD per million tokens. Cache pricing follows Anthropic's published multipliers:
// reads 0.1x input, 5-minute-TTL writes 1.25x input, 1-hour-TTL writes 2x input.
const CACHE_READ_MULT = 0.1;
const CACHE_5M_MULT = 1.25;
const CACHE_1H_MULT = 2;

// Longest-prefix matched against the normalised model id.
const PRICE_TABLE = [
  ['claude-fable-5', { input: 10, output: 50 }],
  ['claude-mythos-5', { input: 10, output: 50 }],
  ['claude-mythos-preview', { input: 10, output: 50 }],
  ['claude-opus-4-8', { input: 5, output: 25 }],
  ['claude-opus-4-7', { input: 5, output: 25 }],
  ['claude-opus-4-6', { input: 5, output: 25 }],
  ['claude-opus-4-5', { input: 5, output: 25 }],
  ['claude-opus-4-1', { input: 15, output: 75 }],
  ['claude-opus-4-0', { input: 15, output: 75 }],
  ['claude-opus-4', { input: 15, output: 75 }],
  ['claude-3-opus', { input: 15, output: 75 }],
  ['claude-sonnet-5', { input: 3, output: 15 }],
  ['claude-sonnet-4-6', { input: 3, output: 15 }],
  ['claude-sonnet-4-5', { input: 3, output: 15 }],
  ['claude-sonnet-4-0', { input: 3, output: 15 }],
  ['claude-sonnet-4', { input: 3, output: 15 }],
  ['claude-3-7-sonnet', { input: 3, output: 15 }],
  ['claude-3-5-sonnet', { input: 3, output: 15 }],
  ['claude-haiku-4-5', { input: 1, output: 5 }],
  ['claude-3-5-haiku', { input: 0.8, output: 4 }],
  ['claude-3-haiku', { input: 0.25, output: 1.25 }],
];

const DEFAULT_PRICING = { input: 5, output: 25 };
const ZERO_COST_MODELS = new Set(['<synthetic>']);

export function normaliseModel(model) {
  if (typeof model !== 'string' || model.length === 0) return 'unknown';
  // Strip provider prefixes and region hints (bedrock/vertex style ids).
  return model
    .toLowerCase()
    .replace(/^(us|eu|apac)\./, '')
    .replace(/^anthropic\./, '')
    .replace(/@\d{8}$/, '');
}

export function resolvePricing(model) {
  const id = normaliseModel(model);
  if (ZERO_COST_MODELS.has(id)) {
    return { model: id, input: 0, output: 0, known: true, zeroCost: true };
  }
  for (const [prefix, price] of PRICE_TABLE) {
    if (id.startsWith(prefix)) {
      return { model: id, ...price, known: true, zeroCost: false };
    }
  }
  return { model: id, ...DEFAULT_PRICING, known: false, zeroCost: false };
}

/**
 * Cost in USD for one usage record.
 * tokens: { input, output, cacheRead, cache5m, cache1h } (raw token counts)
 */
export function costForTokens(model, tokens) {
  const price = resolvePricing(model);
  const perTok = price.input / 1e6;
  const inputCost = (tokens.input || 0) * perTok;
  const outputCost = ((tokens.output || 0) * price.output) / 1e6;
  const cacheReadCost = (tokens.cacheRead || 0) * perTok * CACHE_READ_MULT;
  const cache5mCost = (tokens.cache5m || 0) * perTok * CACHE_5M_MULT;
  const cache1hCost = (tokens.cache1h || 0) * perTok * CACHE_1H_MULT;
  const total = inputCost + outputCost + cacheReadCost + cache5mCost + cache1hCost;
  return { total, inputCost, outputCost, cacheReadCost, cache5mCost, cache1hCost, pricingKnown: price.known };
}

/**
 * What the cache-read tokens would have cost as plain input minus what they
 * actually cost — i.e. money already saved by prompt caching.
 */
export function cacheSavings(model, cacheReadTokens) {
  const price = resolvePricing(model);
  return ((cacheReadTokens || 0) * price.input * (1 - CACHE_READ_MULT)) / 1e6;
}

export { CACHE_READ_MULT, CACHE_5M_MULT, CACHE_1H_MULT };
