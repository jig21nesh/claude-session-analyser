import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../utils/motion.js';

const DURATION_MS = 900;

/** Ease a number from 0 to its target on mount / when the target changes. */
export function useCountUp(target) {
  const value = Number(target) || 0;
  const [current, setCurrent] = useState(prefersReducedMotion() ? value : 0);
  const frame = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCurrent(value);
      return undefined;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      setCurrent(value * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return current;
}
