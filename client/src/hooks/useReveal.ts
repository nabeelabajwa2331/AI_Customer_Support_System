import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Sets `data-visible` on elements with `[data-reveal]` inside the returned ref
 * once they scroll into view. An attribute (not a class) is used because React
 * rewrites `className` on re-render, which would hide revealed elements again.
 * Without IntersectionObserver (or with reduced motion) everything is shown
 * immediately, so content is never hidden.
 */
export function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));

    const reveal = (el: Element) => el.setAttribute('data-visible', '');

    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      targets.forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}

/** 0 → 1 as the page scrolls from top to bottom. */
export function usePageScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}

/** 0 → 1 as an element travels through the viewport (for scroll-linked effects). */
export function useElementScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(prefersReducedMotion() ? 1 : 0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const start = window.innerHeight * 0.8;
      const end = window.innerHeight * 0.35;
      const travelled = (start - rect.top) / (rect.height + start - end);
      setProgress(Math.max(0, Math.min(1, travelled)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return [ref, progress] as const;
}

/** Counts from 0 to `target` once `active` becomes true. */
export function useCountUp(target: number, active: boolean, durationMs = 1200): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      if (active) setValue(target);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, durationMs]);

  return value;
}

/** True once the element has been on screen (used to start count-ups). */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, inView] as const;
}
