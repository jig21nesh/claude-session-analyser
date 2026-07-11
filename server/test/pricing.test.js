import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseModel, resolvePricing, costForTokens, cacheSavings } from '../src/pricing.js';

test('normaliseModel strips provider prefixes and version suffixes', () => {
  assert.equal(normaliseModel('us.anthropic.claude-opus-4-8'), 'claude-opus-4-8');
  assert.equal(normaliseModel('claude-opus-4-5@20251101'), 'claude-opus-4-5');
  assert.equal(normaliseModel('CLAUDE-FABLE-5'), 'claude-fable-5');
  assert.equal(normaliseModel(''), 'unknown');
  assert.equal(normaliseModel(null), 'unknown');
});

test('resolvePricing matches by longest prefix', () => {
  assert.equal(resolvePricing('claude-fable-5').input, 10);
  assert.equal(resolvePricing('claude-opus-4-8').input, 5);
  assert.equal(resolvePricing('claude-opus-4-1-20250805').input, 15);
  assert.equal(resolvePricing('claude-sonnet-5').output, 15);
  assert.equal(resolvePricing('claude-haiku-4-5-20251001').input, 1);
});

test('unknown models fall back to default pricing and are flagged', () => {
  const price = resolvePricing('claude-hyperion-9');
  assert.equal(price.known, false);
  assert.equal(price.input, 5);
});

test('synthetic model costs nothing', () => {
  const cost = costForTokens('<synthetic>', { input: 1e6, output: 1e6 });
  assert.equal(cost.total, 0);
});

test('costForTokens applies cache multipliers correctly', () => {
  // 1M of each bucket on a $10/$50 model
  const cost = costForTokens('claude-fable-5', {
    input: 1e6,
    output: 1e6,
    cacheRead: 1e6,
    cache5m: 1e6,
    cache1h: 1e6,
  });
  assert.equal(cost.inputCost, 10);
  assert.equal(cost.outputCost, 50);
  assert.equal(cost.cacheReadCost, 1); // 0.1x
  assert.equal(cost.cache5mCost, 12.5); // 1.25x
  assert.equal(cost.cache1hCost, 20); // 2x
  assert.equal(cost.total, 93.5);
});

test('cacheSavings is the 90% discount on cache reads', () => {
  assert.equal(cacheSavings('claude-fable-5', 1e6), 9);
  assert.equal(cacheSavings('claude-fable-5', 0), 0);
});
