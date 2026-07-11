import { useCountUp } from '../hooks/useCountUp.js';

/** Number that counts up on load. `format` receives the in-flight value. */
export default function AnimatedValue({ value, format }) {
  const current = useCountUp(value);
  return <span>{format ? format(current) : Math.round(current).toLocaleString('en-US')}</span>;
}
