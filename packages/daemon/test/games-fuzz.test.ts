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
  WhacAMoleEngine, BulletHellEngine, DragRaceEngine, FroggerEngine, WordleEngine,
} from '../src/games-interactive.js';
import {
  KEYCODE_BY_NAME, KEY_1, KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE, KEY_ENTER, KEY_BACKSPACE,
} from '../src/key-capture.js';
import { KEY_MATRIX, keyLed, keyCx, colNearestCx, vNeighbor, rowWidth } from '../src/key-matrix.js';

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

describe('arcade games — fuzz (no crash, valid frames)', () => {
  // Pick a difficulty up front so the games leave the menu and run for real.
  it('whac-a-mole', () => {
    expect(() => fuzz(() => { const e = new WhacAMoleEngine(); e.handleKey(KEY_1, 1); return e; })).not.toThrow();
  });
  it('bullet-hell', () => {
    expect(() => fuzz(() => { const e = new BulletHellEngine(); e.handleKey(KEY_1, 1); return e; })).not.toThrow();
  });
  it('drag-race', () => {
    expect(() => fuzz(() => { const e = new DragRaceEngine(); e.handleKey(KEY_1, 1); return e; })).not.toThrow();
  });
  it('frogger', () => {
    expect(() => fuzz(() => { const e = new FroggerEngine(); e.handleKey(KEY_1, 1); return e; })).not.toThrow();
  });
  it('wordle', () => { expect(() => fuzz(() => new WordleEngine())).not.toThrow(); });
});

describe('Wordle', () => {
  const typeWord = (e: WordleEngine, word: string) => {
    for (const ch of word) e.handleKey(KEYCODE_BY_NAME[ch]!, 1);
    e.handleKey(KEY_ENTER, 1);
  };

  it('typing the answer wins in one guess', () => {
    const e = new WordleEngine();
    const answer = e.inspect().answer;
    expect(answer).toHaveLength(5);
    typeWord(e, answer);
    const st = e.inspect();
    expect(st.mode).toBe('win');
    expect(st.rows).toBe(1);
  });

  it('six wrong guesses lose the game', () => {
    const e = new WordleEngine();
    const answer = e.inspect().answer;
    // A guess that differs at every position (shift each letter by one).
    const wrong = answer.split('').map((c) =>
      String.fromCharCode(((c.charCodeAt(0) - 65 + 1) % 26) + 65)).join('');
    expect(wrong).not.toBe(answer);
    for (let i = 0; i < 6; i++) typeWord(e, wrong);
    expect(e.inspect().mode).toBe('lose');
  });

  it('backspace erases the in-progress guess', () => {
    const e = new WordleEngine();
    e.handleKey(KEYCODE_BY_NAME['A']!, 1);
    e.handleKey(KEYCODE_BY_NAME['B']!, 1);
    e.handleKey(KEY_BACKSPACE, 1);
    expect(e.inspect().guess).toBe('A');
  });
});

describe('Frogger', () => {
  it('a lookahead bot crosses the traffic to the goal', () => {
    const e = new FroggerEngine();
    e.handleKey(KEY_1, 1); // difficulty 1
    let crossed = false;
    for (let f = 0; f < 1500; f++) {
      e.step();
      const st = e.inspect();
      if (st.score >= 1) { crossed = true; break; }
      const fr = st.frog;
      const occupied = (row: number, col: number, useNext: boolean) =>
        st.cars.some((c) => c.row === row && (useNext ? c.nextCol === col : c.col === col));
      const safe = (row: number, col: number) => !occupied(row, col, false) && !occupied(row, col, true);
      const cands: Array<{ key: number | null; row: number; col: number; pref: number }> = [];
      if (fr.row > 0) cands.push({ key: KEY_W, row: fr.row - 1, col: vNeighbor(fr.row, fr.col, fr.row - 1), pref: 3 });
      cands.push({ key: null, row: fr.row, col: fr.col, pref: 1 });
      cands.push({ key: KEY_A, row: fr.row, col: Math.max(0, fr.col - 1), pref: 0 });
      cands.push({ key: KEY_D, row: fr.row, col: Math.min(rowWidth(fr.row) - 1, fr.col + 1), pref: 0 });
      const safeCands = cands.filter((c) => safe(c.row, c.col));
      const pick = safeCands.length > 0
        ? safeCands.reduce((a, b) => (b.pref > a.pref ? b : a))
        : (cands.find((c) => c.key === KEY_W) ?? cands[0]!); // desperate: push up
      if (pick.key !== null) e.handleKey(pick.key, 1);
    }
    expect(crossed).toBe(true);
  });
});

describe('Whac-A-Mole', () => {
  it('a perfect whacker scores and never misses', () => {
    const e = new WhacAMoleEngine();
    e.handleKey(KEY_1, 1); // difficulty 1
    for (let f = 0; f < 400; f++) {
      e.step();
      for (const kc of e.inspect().moleKeycodes) e.handleKey(kc, 1);
    }
    const st = e.inspect();
    expect(st.score).toBeGreaterThan(5);
    expect(st.misses).toBe(0);
  });
});

describe('Bullet-hell', () => {
  it('a greedy dodger survives on the easiest difficulty', () => {
    const e = new BulletHellEngine();
    e.handleKey(KEY_1, 1); // difficulty 1
    const ROWS = KEY_MATRIX.length;
    let aliveFrames = 0;
    for (let f = 0; f < 300; f++) {
      e.step();
      const st = e.inspect();
      if (!st.alive) break;
      aliveFrames++;
      // 1-frame-lookahead dodge: never move into a cell a bullet will occupy
      // next step; among safe cells, maximise distance to the nearest bullet.
      const p = st.player;
      const cands: Array<{ key: number | null; row: number; col: number }> = [
        { key: null, row: p.row, col: p.col },
        { key: KEY_A, row: p.row, col: Math.max(0, p.col - 1) },
        { key: KEY_D, row: p.row, col: Math.min(rowWidth(p.row) - 1, p.col + 1) },
      ];
      if (p.row > 0) cands.push({ key: KEY_W, row: p.row - 1, col: vNeighbor(p.row, p.col, p.row - 1) });
      if (p.row < ROWS - 1) cands.push({ key: KEY_S, row: p.row + 1, col: vNeighbor(p.row, p.col, p.row + 1) });
      const unsafe = (row: number, col: number) =>
        st.bullets.some((b) => b.nextRow === row && b.nextCol === col);
      const minDist = (row: number, col: number) => {
        let minD = Infinity;
        for (const b of st.bullets) {
          const dx = keyCx(row, col) - keyCx(b.row, b.col);
          const dy = (row - b.row) * 2.6;
          const d = dx * dx + dy * dy;
          if (d < minD) minD = d;
        }
        return minD;
      };
      const safe = cands.filter((c) => !unsafe(c.row, c.col));
      const pool = safe.length > 0 ? safe : cands;
      let best = pool[0]!;
      let bestScore = -Infinity;
      for (const cand of pool) {
        const score = minDist(cand.row, cand.col) + (cand.key === null ? 0.01 : 0);
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      if (best.key !== null) e.handleKey(best.key, 1);
    }
    expect(aliveFrames).toBeGreaterThanOrEqual(290);
  });
});

describe('Drag Race', () => {
  it('revving and shifting in the sweet zone finishes the race', () => {
    const e = new DragRaceEngine();
    e.handleKey(KEY_1, 1);     // difficulty 1 → countdown
    e.handleKey(KEY_SPACE, 1); // hold the throttle
    const shiftLo = 0.62 + 1 * 0.04; // diff 1 sweet-zone start
    let finished = false;
    for (let f = 0; f < 3000; f++) {
      e.step();
      const st = e.inspect();
      if (st.mode === 'finish') { finished = true; break; }
      if (st.mode === 'race' && st.rpm >= shiftLo + 0.03 && st.rpm < 0.97) e.handleKey(KEY_ENTER, 1);
    }
    expect(finished).toBe(true);
  });

  it('redlining without shifting blows the engine', () => {
    const e = new DragRaceEngine();
    e.handleKey(KEY_1, 1);
    e.handleKey(KEY_SPACE, 1);
    let blown = false;
    for (let f = 0; f < 3000; f++) {
      e.step();
      if (e.inspect().mode === 'blown') { blown = true; break; }
    }
    expect(blown).toBe(true);
  });
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
