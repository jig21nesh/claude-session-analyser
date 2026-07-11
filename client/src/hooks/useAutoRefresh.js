import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Countdown that fires onTrigger every `seconds` seconds. Pausable via
 * toggle(); while `busy` is true (a scan is already running) the countdown
 * holds at full so an in-flight refresh is never re-triggered.
 */
export function useAutoRefresh({ seconds, busy = false, onTrigger }) {
  const [paused, setPaused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(seconds);
  const triggerRef = useRef(onTrigger);
  triggerRef.current = onTrigger;

  useEffect(() => {
    if (paused || busy) return undefined;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [paused, busy]);

  useEffect(() => {
    if (busy) setSecondsLeft(seconds);
  }, [busy, seconds]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      setSecondsLeft(seconds);
      triggerRef.current?.();
    }
  }, [secondsLeft, seconds]);

  const toggle = useCallback(() => setPaused((p) => !p), []);

  return { secondsLeft, paused, toggle };
}
