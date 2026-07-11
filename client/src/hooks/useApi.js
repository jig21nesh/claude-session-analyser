import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

/** Fetch data on mount (and when deps change); expose reload for the Refresh flow. */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mySeq = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcher();
      if (seq.current === mySeq) setState({ data, loading: false, error: null });
    } catch (err) {
      if (seq.current === mySeq) setState({ data: null, loading: false, error: err.message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
    window.addEventListener('analysis-refreshed', load);
    return () => window.removeEventListener('analysis-refreshed', load);
  }, [load]);

  return { ...state, reload: load };
}

/**
 * Drives the Refresh button: triggers a re-analysis, polls progress until the
 * scan settles, then invokes onDone so pages can reload their data.
 */
export function useRefresh(onDone) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  const start = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setProgress(null);
    try {
      await api.refresh(true);
    } catch (err) {
      // 409 = already running; keep polling in that case too.
      if (!String(err.message).includes('already running')) {
        setRunning(false);
        return;
      }
    }
    for (;;) {
      await new Promise((r) => setTimeout(r, 700));
      try {
        const status = await api.refreshStatus();
        setProgress(status);
        if (!status.running) break;
      } catch {
        break;
      }
    }
    setRunning(false);
    onDone?.();
  }, [running, onDone]);

  return { running, progress, start };
}
