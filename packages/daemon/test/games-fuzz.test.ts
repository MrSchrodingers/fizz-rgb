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
  KeyboardCrawlEngine, diskCrawlStore, CursedKeyboardEngine,
  IdleGardenEngine, diskGardenStore, DeckBuilderEngine, diskDeckStore, FlappyEngine,
  type CrawlStore, type CrawlMeta,
} from '../src/games-interactive.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KEYCODE_BY_NAME, KEY_1, KEY_5, KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE, KEY_ENTER, KEY_BACKSPACE,
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
  it('keyboard-crawl', () => {
    expect(() => fuzz(() => { const e = new KeyboardCrawlEngine(memStore()); e.handleKey(KEY_1, 1); return e; })).not.toThrow();
  });
  it('cursed', () => {
    expect(() => fuzz(() => { const e = new CursedKeyboardEngine(); e.handleKey(KEY_1, 1); return e; })).not.toThrow();
  });
  it('garden', () => {
    expect(() => fuzz(() => new IdleGardenEngine({ load: () => ({ currency: 0, plots: 0, growth: 0 }), save: () => {} }))).not.toThrow();
  });
  it('deckbuilder', () => {
    expect(() => fuzz(() => { const e = new DeckBuilderEngine({ load: () => ({ bestFloor: 0, bonusHp: 0 }), save: () => {} }); e.handleKey(KEY_1, 1); return e; })).not.toThrow();
  });
  it('flappy', () => { expect(() => fuzz(() => new FlappyEngine())).not.toThrow(); });
});

describe('Flappy Bird', () => {
  it('a flap controller clears several pipes', () => {
    const e = new FlappyEngine();
    e.handleKey(KEY_SPACE, 1); // start
    for (let f = 0; f < 4000; f++) {
      e.step();
      const st = e.inspect();
      if (st.mode === 'dead') break;
      if (st.score >= 4) break;
      // Aim at the gap centre of the nearest pipe ahead (else mid-board).
      const ahead = st.pipes
        .filter((p) => p.cx >= st.birdCx - 0.6)
        .sort((a, b) => a.cx - b.cx)[0];
      const target = ahead ? ahead.gapTop + (st.gap - 1) / 2 : 2;
      // Flap whenever below the gap centre; with the gentle physics the swing
      // stays inside the gap.
      if (st.y > target) e.handleKey(KEY_SPACE, 1);
    }
    expect(e.inspect().score).toBeGreaterThanOrEqual(4);
  });

  it('starting then never flapping again falls and crashes', () => {
    const e = new FlappyEngine();
    e.handleKey(KEY_SPACE, 1); // start (and one flap)
    let dead = false;
    for (let f = 0; f < 300; f++) { e.step(); if (e.inspect().mode === 'dead') { dead = true; break; } }
    expect(dead).toBe(true);
  });

  it('never starves of pipes during a long run (no soft-lock)', () => {
    const e = new FlappyEngine();
    e.handleKey(KEY_SPACE, 1);
    let minPipes = Infinity;
    for (let f = 0; f < 3000; f++) {
      e.step();
      const st = e.inspect();
      if (st.mode === 'dead') { e.handleKey(KEY_SPACE, 1); continue; } // restart, keep stressing
      if (st.mode === 'play') minPipes = Math.min(minPipes, st.pipes.length);
      if (st.y > 2) e.handleKey(KEY_SPACE, 1); // keep it roughly alive
    }
    expect(minPipes).toBeGreaterThanOrEqual(1);
  });
});

describe('Deck-builder', () => {
  const noStore = () => ({ load: () => ({ bestFloor: 0, bonusHp: 0 }), save: () => {} });
  type HandCard = { type: string; cost: number; keycode: number };

  it('a sensible player clears rooms and progresses', () => {
    const e = new DeckBuilderEngine(noStore());
    e.handleKey(KEY_1, 1); // difficulty 1
    let safety = 0;
    while (e.inspect().cleared < 2 && e.inspect().mode !== 'dead' && safety++ < 6000) {
      const st = e.inspect();
      if (st.mode === 'reward') { e.handleKey(st.rewardKeycodes[0]!, 1); continue; }
      if (st.mode !== 'play') { e.step(); continue; }
      const playable = st.hand.filter((s): s is HandCard => s !== null && s.cost <= st.energy);
      if (playable.length > 0) {
        const atk = playable.find((s) => s.type === 'strike' || s.type === 'bash');
        e.handleKey((atk ?? playable[0]!).keycode, 1);
      } else {
        e.handleKey(st.endTurnKeycode, 1);
      }
    }
    expect(e.inspect().cleared).toBeGreaterThanOrEqual(2);
  });

  it('doing nothing but ending turns gets you killed', () => {
    const e = new DeckBuilderEngine(noStore());
    e.handleKey(KEY_5, 1); // hardest
    let dead = false;
    for (let i = 0; i < 300; i++) {
      const st = e.inspect();
      if (st.mode === 'dead') { dead = true; break; }
      e.handleKey(st.endTurnKeycode, 1);
      e.step();
    }
    expect(dead).toBe(true);
  });

  it('applies the persisted HP bonus to max HP', () => {
    const e = new DeckBuilderEngine({ load: () => ({ bestFloor: 2, bonusHp: 5 }), save: () => {} });
    e.handleKey(KEY_1, 1);
    expect(e.inspect().playerHp).toBe(40 + 5 * 6); // 70
  });

  it('persists meta to disk and reads it back (round-trip)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fizz-deck-'));
    const prev = process.env['XDG_CONFIG_HOME'];
    process.env['XDG_CONFIG_HOME'] = tmp;
    try {
      diskDeckStore().save({ bestFloor: 4, bonusHp: 3 });
      expect(diskDeckStore().load()).toEqual({ bestFloor: 4, bonusHp: 3 });
    } finally {
      if (prev === undefined) delete process.env['XDG_CONFIG_HOME'];
      else process.env['XDG_CONFIG_HOME'] = prev;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Idle garden', () => {
  const noStore = () => ({ load: () => ({ currency: 0, plots: 0, growth: 0 }), save: () => {} });

  it('a tapping gardener expands the garden', () => {
    const e = new IdleGardenEngine(noStore());
    const start = e.inspect().plotCount;
    for (let f = 0; f < 800; f++) {
      e.step();
      for (const kc of e.inspect().matureKeycodes) e.handleKey(kc, 1);
    }
    expect(e.inspect().plotCount).toBeGreaterThan(start);
  });

  it('idles forward on its own (auto-harvest income buys upgrades)', () => {
    const e = new IdleGardenEngine(noStore());
    const before = e.inspect();
    for (let f = 0; f < 3000; f++) e.step();
    const after = e.inspect();
    expect(after.plotCount + after.growth).toBeGreaterThan(before.plotCount + before.growth);
  });

  it('starts from persisted progress', () => {
    const e = new IdleGardenEngine({ load: () => ({ currency: 0, plots: 12, growth: 3 }), save: () => {} });
    expect(e.inspect().plotCount).toBe(12);
    expect(e.inspect().growth).toBe(3);
  });

  it('persists progress to disk and reads it back (round-trip)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fizz-garden-'));
    const prev = process.env['XDG_CONFIG_HOME'];
    process.env['XDG_CONFIG_HOME'] = tmp;
    try {
      diskGardenStore().save({ currency: 7, plots: 9, growth: 2 });
      expect(diskGardenStore().load()).toEqual({ currency: 7, plots: 9, growth: 2 });
    } finally {
      if (prev === undefined) delete process.env['XDG_CONFIG_HOME'];
      else process.env['XDG_CONFIG_HOME'] = prev;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Cursed keyboard', () => {
  it('a perfect cleanser contains the curse and survives', () => {
    const e = new CursedKeyboardEngine();
    e.handleKey(KEY_1, 1); // difficulty 1
    for (let f = 0; f < 800; f++) {
      e.step();
      for (const kc of e.inspect().infectedKeycodes) e.handleKey(kc, 1);
    }
    expect(e.inspect().mode).toBe('play'); // never overrun
  });

  it('left unattended on the hardest difficulty, the curse overruns the board', () => {
    const e = new CursedKeyboardEngine();
    e.handleKey(KEY_5, 1); // difficulty 5
    let lost = false;
    for (let f = 0; f < 3000; f++) {
      e.step();
      if (e.inspect().mode === 'lose') { lost = true; break; }
    }
    expect(lost).toBe(true);
  });
});

// In-memory CrawlStore so tests never touch the real save file.
function memStore(initial: CrawlMeta = { bestDepth: 0, hpBonus: 0 }): CrawlStore & { last: CrawlMeta | null } {
  let cur: CrawlMeta = { ...initial };
  const s = {
    last: null as CrawlMeta | null,
    load: () => ({ ...cur }),
    save: (m: CrawlMeta) => { cur = { ...m }; s.last = { ...m }; },
  };
  return s;
}

function bfsPath(
  world: number[][], start: { wr: number; wc: number }, goal: { wr: number; wc: number },
): Array<{ wr: number; wc: number }> | null {
  const WS = world.length;
  const prev: Array<Array<[number, number] | null>> = Array.from({ length: WS }, () => new Array(WS).fill(null));
  const seen = Array.from({ length: WS }, () => new Array<boolean>(WS).fill(false));
  seen[start.wr]![start.wc] = true;
  const q: Array<[number, number]> = [[start.wr, start.wc]];
  const D = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  while (q.length) {
    const [r, c] = q.shift()!;
    if (r === goal.wr && c === goal.wc) {
      const path: Array<{ wr: number; wc: number }> = [];
      let cur: [number, number] | null = [r, c];
      while (cur) { path.unshift({ wr: cur[0], wc: cur[1] }); cur = prev[cur[0]]![cur[1]]; }
      return path;
    }
    for (const [dr, dc] of D) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= WS || nc < 0 || nc >= WS) continue;
      if (world[nr]![nc] !== 1 || seen[nr]![nc]) continue;
      seen[nr]![nc] = true; prev[nr]![nc] = [r, c]; q.push([nr, nc]);
    }
  }
  return null;
}

describe('Keyboard Crawl', () => {
  it('every generated floor keeps the stairs reachable from the start (BFS, 200 maps)', () => {
    for (let trial = 0; trial < 200; trial++) {
      const e = new KeyboardCrawlEngine(memStore());
      e.handleKey(KEY_1, 1); // difficulty 1 → run starts, floor generated
      const st = e.inspect();
      expect(bfsPath(st.world, st.at, st.stairs)).not.toBeNull();
    }
  });

  it('a BFS bot descends to the next floor', () => {
    const e = new KeyboardCrawlEngine(memStore());
    e.handleKey(KEY_1, 1);
    const startDepth = e.inspect().depth;
    let descended = false;
    for (let turn = 0; turn < 2000; turn++) {
      const st = e.inspect();
      if (st.mode !== 'play') break;
      if (st.depth > startDepth) { descended = true; break; }
      const path = bfsPath(st.world, st.at, st.stairs);
      if (!path || path.length < 2) break;
      const next = path[1]!;
      const dr = Math.sign(next.wr - st.at.wr);
      const dc = Math.sign(next.wc - st.at.wc);
      const key = dr === -1 ? KEY_W : dr === 1 ? KEY_S : dc === -1 ? KEY_A : KEY_D;
      e.handleKey(key, 1); // moving into an enemy attacks it; we re-BFS next turn
    }
    expect(descended).toBe(true);
  });

  it('applies the persisted HP bonus to the starting HP (meta-progression)', () => {
    const e = new KeyboardCrawlEngine({ load: () => ({ bestDepth: 2, hpBonus: 4 }), save: () => {} });
    e.handleKey(KEY_1, 1);
    expect(e.inspect().hp).toBe(6 + 4); // base 6 + persisted bonus 4
  });

  it('persists meta-progression to disk and reads it back (round-trip)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fizz-crawl-'));
    const prev = process.env['XDG_CONFIG_HOME'];
    process.env['XDG_CONFIG_HOME'] = tmp;
    try {
      diskCrawlStore().save({ bestDepth: 3, hpBonus: 2 });
      expect(diskCrawlStore().load()).toEqual({ bestDepth: 3, hpBonus: 2 });
    } finally {
      if (prev === undefined) delete process.env['XDG_CONFIG_HOME'];
      else process.env['XDG_CONFIG_HOME'] = prev;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
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
