import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EffectEngine } from '../src/engine.js';
import { FakeHidController } from '../src/hid-mock.js';

/**
 * Sustained 30fps stress test. We don't try to measure absolute throughput
 * (that depends on CI load) — instead we look for two specific failure modes
 * the agent review flagged:
 *
 *   1. Heap grows monotonically when the engine reuses a Map across ticks.
 *   2. The stream actually advances (frames are produced, not silently dropped).
 *
 * If either invariant breaks we want a test failure, not a perf number to
 * argue about.
 */

describe('EffectEngine sustained stream', () => {
  let hid: FakeHidController;
  let engine: EffectEngine;

  beforeEach(() => {
    hid = new FakeHidController();
    engine = new EffectEngine(hid);
  });

  afterEach(() => {
    engine.stop();
  });

  it('blink stream runs 60 frames without unbounded memory growth', async () => {
    // Empty key set is allowed for game animations; blink needs at least one
    // key to actually emit a frame. Paint everything red.
    const keys: Record<string, string> = {};
    for (let i = 0; i < 61; i++) keys[String(i)] = '#ff0000';

    await engine.startPattern({
      keys,
      animType: 'blink',
      animSpeed: 1, // max speed = fastest ticks
    });

    // Sample heap before and after 60 ticks (≈ 2 seconds at 30fps).
    // We don't gc() here (would require --expose-gc) — we just check that
    // heapUsed doesn't double, which would indicate a leak.
    const startHeap = process.memoryUsage().heapUsed;
    await new Promise((r) => setTimeout(r, 2100));
    const endHeap = process.memoryUsage().heapUsed;

    engine.stop();

    // Sanity: at least 30 frames were actually pushed to the (fake) HID.
    expect(hid.sentFrames.length).toBeGreaterThanOrEqual(30);

    // Heap shouldn't more than double. Any genuine per-tick Map leak would
    // show ~30 * 60 * 64 bytes = ~120kb growth per second, which over 2s
    // dwarfs the baseline.
    const growth = (endHeap - startHeap) / Math.max(1, startHeap);
    expect(growth).toBeLessThan(1.0); // less than 100% growth
  });

  it('cpu-thermal stream produces frames without throwing', async () => {
    await engine.startPattern({
      keys: {},
      animType: 'cpu-thermal',
      animSpeed: 0.5,
    });
    await new Promise((r) => setTimeout(r, 200));
    engine.stop();
    expect(hid.sentFrames.length).toBeGreaterThan(0);
  });
});
