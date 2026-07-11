export const MODEL_SWITCHER_URL = 'https://github.com/jig21nesh/model-switcher';

// Validated categorical palette (dark surface) — fixed slot order, never cycled.
export const SERIES = {
  gold: 'var(--series-1)',
  blue: 'var(--series-2)',
  aqua: 'var(--series-3)',
  violet: 'var(--series-4)',
  red: 'var(--series-5)',
  magenta: 'var(--series-6)',
};

// Colour follows the entity: each model family keeps its slot everywhere.
const MODEL_FAMILY_COLOURS = [
  ['claude-fable', SERIES.gold],
  ['claude-mythos', SERIES.gold],
  ['claude-opus', SERIES.violet],
  ['claude-sonnet', SERIES.blue],
  ['claude-haiku', SERIES.aqua],
];

export function modelColour(model) {
  const id = String(model || '').toLowerCase();
  for (const [prefix, colour] of MODEL_FAMILY_COLOURS) {
    if (id.startsWith(prefix)) return colour;
  }
  return SERIES.magenta;
}

export function shortModelName(model) {
  return String(model || 'unknown')
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '');
}

// Token composition slots (fixed identity → colour).
export const TOKEN_COLOURS = {
  cacheRead: SERIES.aqua,
  input: SERIES.blue,
  cacheWrite: SERIES.violet,
  output: SERIES.red,
};

export const IMPROVEMENT_CATEGORY_LABELS = {
  'model-mix': 'Model mix',
  'cache-efficiency': 'Prompt caching',
  'context-bloat': 'Context size',
  'session-fragmentation': 'Session habits',
  'output-verbosity': 'Output volume',
};
