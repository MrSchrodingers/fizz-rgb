/**
 * Headless bots for the interactive engines.
 *
 *  - `fuzz()` hammers an engine with thousands of frames of random key input
 *    and asserts every rendered frame is valid: led indexes in [0,60], every
 *    r/g/b an integer in [0,255], no NaN, and render() never throws.
 *  - per-engine "directed" bots prove the engine actually does its job
 *    (a ripple grows then clears, an ember cools, the clock shows the right
 *    BCD bits, fire is hotter at the bottom than the top).
 *
 * New engines should be added here as they land so the suite keeps proving
 * crash-freedom + winnability/progression for the whole catalogue.
 */
import { describe, it, expect } from 'vitest';
import type { Color } from '@fizz/core';
import {
  RippleEngine, SparkEngine, BinaryClockEngine, DoomFireEngine,
} from '../src/games-interactive.js';
import { KEYCODE_BY_NAME } from '../src/key-capture.js';
import { KEY_MATRIX, keyLed, colNearestCx } from '../src/key-matrix.js';

interface Engine {
  step(): void;
  render(): Map<number, Color>;
  handleKey(keycode: number, value: number): void;
  setAnimSpeed?(s: number): void;
}

const KEYCODES = Object.values(KEYCODE_BY_NAME);

/** Throws on the first invalid cell so fuzz stays cheap (no per-cell expect). */
function checkFrame(frame: Map<number, Color>): void {
  for (const [led, c] of frame) {
    if (!Number.isInteger(led) || led < 0 || led > 60) {
      throw new Error(`bad led index: ${led}`);
    }
    for (const ch of [c.r, c.g, c.b] as const) {
      if (!Number.isInteger(ch) || ch < 0 || ch > 255) {
        throw new Error(`bad channel ${ch} at led ${led}`);
      }
    }
  }
}

/** Run an engine for `frames` ticks with random key input + anim speed. */
function fuzz(make: () => Engine, frames = 4000): void {
  const e = make();
  e.setAnimSpeed?.(Math.random());
  checkFrame(e.render());
  for (let i = 0; i < frames; i++) {
    if (Math.random() < 0.4) {
      const kc = Math.random() < 0.85
        ? KEYCODES[Math.floor(Math.random() * KEYCODES.length)]!
        : Math.floor(Math.random() * 300); // also exercise out-of-range codes
      e.handleKey(kc, Math.random() < 0.5 ? 1 : 0);
    }
    if (Math.random() < 0.02) e.setAnimSpeed?.(Math.random());
    e.step();
    checkFrame(e.render());
  }
}

describe('reactive effects — fuzz (no crash, valid frames)', () => {
  it('ripple', () => { expect(() => fuzz(() => new RippleEngine())).not.toThrow(); });
  it('spark', () => { expect(() => fuzz(() => new SparkEngine())).not.toThrow(); });
  it('binary-clock', () => { expect(() => fuzz(() => new BinaryClockEngine())).not.toThrow(); });
  it('doom-fire', () => { expect(() => fuzz(() => new DoomFireEngine())).not.toThrow(); });
});

describe('Ripple', () => {
  it('emits a ring that grows from the pressed key, then clears', () => {
    const e = new RippleEngine();
    e.setAnimSpeed(0.5);
    e.handleKey(KEYCODE_BY_NAME['G']!, 1);
    let sawLit = false;
    for (let i = 0; i < 8; i++) { e.step(); if (e.render().size > 0) sawLit = true; }
    expect(sawLit).toBe(true);
    for (let i = 0; i < 80; i++) e.step();
    expect(e.render().size).toBe(0); // ring retired past the board
  });
});

describe('Spark', () => {
  it('lights the pressed key (white-hot) then cools to nothing', () => {
    const e = new SparkEngine();
    e.setAnimSpeed(0.5);
    e.handleKey(KEYCODE_BY_NAME['G']!, 1);
    const first = e.render();
    expect(first.size).toBeGreaterThan(0); // key + neighbour bloom
    for (let i = 0; i < 80; i++) e.step();
    expect(e.render().size).toBe(0); // fully cooled
  });
});

describe('Binary clock', () => {
  it('renders the correct BCD bits for a fixed time', () => {
    // 13:47:25 → digits [1,3,4,7,2,5].
    const fixed = new Date(2026, 4, 20, 13, 47, 25).getTime();
    const e = new BinaryClockEngine(() => fixed);
    const frame = e.render();

    // Same geometry the engine uses (kept in sync intentionally).
    const FIELD_CX = [1, 3.4, 5.8, 8.2, 10.6, 13];
    const BIT_ROWS = [3, 2, 1, 0];
    const cellOf = (field: number, bit: number) => {
      const row = BIT_ROWS[bit]!;
      return keyLed(row, colNearestCx(row, FIELD_CX[field]!));
    };
    const RED = { r: 255, g: 0, b: 0 };
    const GREEN = { r: 0, g: 255, b: 0 };
    const dimRed = { r: 15, g: 0, b: 0 };
    const dimGreen = { r: 0, g: 15, b: 0 };

    // hours-ones = 3 → 0011 (bit0,bit1 set; bit2 clear)
    expect(frame.get(cellOf(1, 1)!)).toEqual(RED);       // bit1 set
    expect(frame.get(cellOf(1, 2)!)).toEqual(dimRed);    // bit2 clear
    // minutes-ones = 7 → 0111 (bit2 set; bit3 clear)
    expect(frame.get(cellOf(3, 2)!)).toEqual(GREEN);     // bit2 set
    expect(frame.get(cellOf(3, 3)!)).toEqual(dimGreen);  // bit3 clear

    // Regression guard: on every bit row, the six fields must land on six
    // DISTINCT keys — no two digits may collide (the old layout collapsed two
    // fields onto the spacebar on the 8-key bottom row).
    for (let bit = 0; bit < 4; bit++) {
      const leds = [0, 1, 2, 3, 4, 5].map((f) => cellOf(f, bit));
      expect(new Set(leds).size).toBe(6);
    }
  });
});

describe('Doom fire', () => {
  it('burns hotter at the bottom than the top (fire rises)', () => {
    const e = new DoomFireEngine();
    e.setAnimSpeed(0.5);
    for (let i = 0; i < 40; i++) e.step(); // warm up

    const rows = KEY_MATRIX.length;
    const sum = new Array<number>(rows).fill(0);
    const cnt = new Array<number>(rows).fill(0);
    for (let f = 0; f < 40; f++) {
      e.step();
      const frame = e.render();
      for (let r = 0; r < rows; r++) {
        for (const cell of KEY_MATRIX[r]!) {
          const c = frame.get(cell.led);
          if (c) sum[r]! += c.r + c.g + c.b;
          cnt[r]!++;
        }
      }
    }
    const avg = sum.map((s, r) => s / cnt[r]!);
    expect(avg[rows - 1]!).toBeGreaterThan(avg[0]!); // bottom brighter than top
  });
});
