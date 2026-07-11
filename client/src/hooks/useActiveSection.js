import { useEffect, useState } from 'react';

/** Track which section id is currently in view (for doc navigation highlight). */
export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -60% 0px', threshold: 0 }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
