import { scanAll } from './analyzer.js';
import { computeImprovements } from './improvements.js';
import { computeAndStoreForecast } from './forecast-service.js';
import { PARSE_CONCURRENCY } from './config.js';
import { logger } from './logger.js';

/**
 * Serialises analysis runs: only one scan at a time, progress is observable,
 * and improvements are recomputed after every successful scan.
 */
export function createScanService(db, projectsDir) {
  const state = {
    running: false,
    phase: 'idle',
    total: 0,
    processed: 0,
    startedAt: null,
    finishedAt: null,
    lastResult: null,
    lastError: null,
  };

  async function run({ force = false } = {}) {
    if (state.running) return false;
    state.running = true;
    state.phase = 'starting';
    state.total = 0;
    state.processed = 0;
    state.startedAt = new Date().toISOString();
    state.lastError = null;
    try {
      const result = await scanAll(db, projectsDir, {
        force,
        concurrency: PARSE_CONCURRENCY,
        onProgress: ({ phase, total, processed }) => {
          state.phase = phase;
          state.total = total;
          state.processed = processed;
        },
      });
      state.phase = 'improvements';
      computeImprovements(db);
      state.phase = 'forecast';
      computeAndStoreForecast(db);
      state.lastResult = result;
      state.phase = 'idle';
    } catch (err) {
      state.lastError = err.message;
      state.phase = 'error';
      logger.error('scan failed', { error: err.message });
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
    return true;
  }

  return {
    /** Fire-and-forget; returns false if a scan is already running. */
    trigger(options) {
      if (state.running) return false;
      run(options); // intentionally not awaited
      return true;
    },
    /** Awaitable variant used by tests and initial boot. */
    runAndWait: run,
    status: () => ({ ...state }),
  };
}
