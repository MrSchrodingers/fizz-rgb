import { useEffect, useState } from 'react';

/**
 * Single requestAnimationFrame loop driving every thumbnail's animation.
 *
 * Each subscriber gets the same `t` (seconds since module init) so animations
 * are visually in phase across the gallery. Without a shared clock, 40
 * thumbnails would spawn 40 RAF loops with slight per-tick drift — same cost,
 * uglier result.
 */

const subscribers = new Set<(t: number) => void>();
let started = false;
const startedAt = performance.now();

function tick(): void {
  const t = (performance.now() - startedAt) / 1000;
  subscribers.forEach((cb) => cb(t));
  if (subscribers.size > 0) requestAnimationFrame(tick);
  else started = false;
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  requestAnimationFrame(tick);
}

/**
 * Subscribe to the shared clock. Throttle re-renders to ~15fps for previews
 * (no human eye notices the difference at 50x50px, and we save ~half the CPU
 * vs 60fps).
 */
export function useSharedClock(targetFps = 15): number {
  const [t, setT] = useState(() => (performance.now() - startedAt) / 1000);
  useEffect(() => {
    let lastEmit = 0;
    const interval = 1 / targetFps;
    const cb = (now: number) => {
      if (now - lastEmit >= interval) {
        lastEmit = now;
        setT(now);
      }
    };
    subscribers.add(cb);
    ensureStarted();
    return () => {
      subscribers.delete(cb);
    };
  }, [targetFps]);
  return t;
}
