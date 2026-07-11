/** Single source of truth for motion preference (CSS handles its own via media query). */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const CHART_ANIMATION = {
  isAnimationActive: !prefersReducedMotion(),
  animationDuration: 700,
};
