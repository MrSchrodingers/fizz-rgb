/**
 * Interactive game engines that respond to physical keyboard input from
 * fizzd's evdev listener. Each engine implements the InteractiveEngine
 * surface (step / render / handleKey).
 *
 * Layout convention: row 0 = scoreboard or HUD (top of keyboard, F-row),
 * rows 1..4 = play area, cols 0..13.
 */

import type { Color } from '@fizz/core';
import { K617_LAYOUT, parseHex } from '@fizz/core';
import { gridToLed } from './game-grid.js';
import {
  ROW_COUNT, rowWidth, keyLed, keyCx, vNeighbor, colNearestCx, colOfName,
  KEY_MATRIX, type KeyCell,
} from './key-matrix.js';
import { log } from './log.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  KEY_TAB, KEY_CAPSLOCK, KEY_LEFTSHIFT, KEY_LEFTCTRL,
  KEY_BACKSLASH, KEY_ENTER, KEY_RIGHTSHIFT, KEY_RIGHTCTRL,
  KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE, KEY_BACKSPACE,
  KEY_1, KEY_2, KEY_3, KEY_4, KEY_5,
  KEYCODE_BY_NAME,
} from './key-capture.js';

const RED: Color = { r: 255, g: 0, b: 0 };
const BLUE: Color = { r: 0, g: 60, b: 255 };
const GREEN: Color = { r: 0, g: 255, b: 30 };
const YELLOW: Color = { r: 255, g: 220, b: 0 };
const WHITE: Color = { r: 255, g: 255, b: 255 };
const ORANGE: Color = { r: 255, g: 120, b: 0 };
const MAGENTA: Color = { r: 255, g: 0, b: 200 };
const CYAN: Color = { r: 0, g: 255, b: 255 };

function findKeyLed(name: string): number | null {
  const k = K617_LAYOUT.keys.find((x) => x.name === name);
  return k ? k.ledIndex : null;
}

// ─── Shared scaffolding for reactive effects ─────────────────────────────────
// Reverse map evdev keycode → physical cell, built from KEY_MATRIX (which
// carries the per-key led/row/col/cx) cross-referenced with KEYCODE_BY_NAME.
// Reactive effects (Ripple/Spark) use this to turn any physical keypress into
// a position on the board without collapsing the wide bottom row.
const KEYCODE_TO_CELL: Map<number, KeyCell> = (() => {
  const m = new Map<number, KeyCell>();
  for (const row of KEY_MATRIX) {
    for (const cell of row) {
      const kc = KEYCODE_BY_NAME[cell.name];
      if (kc !== undefined) m.set(kc, cell);
    }
  }
  return m;
})();

/** Full-saturation HSV (h in degrees) → Color. Shared by hue-based effects. */
function hsv(h: number): Color {
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((hh % 2) - 1);
  let r = 0, g = 0, b = 0;
  if (hh < 1) { r = 1; g = x; }
  else if (hh < 2) { r = x; g = 1; }
  else if (hh < 3) { g = 1; b = x; }
  else if (hh < 4) { g = x; b = 1; }
  else if (hh < 5) { r = x; b = 1; }
  else { r = 1; b = x; }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

// Fire gradient (black → dark-red → orange → yellow → white-hot). Shared by
// the Spark ember trail and the Doom PSX fire effect.
const FIRE_STOPS: ReadonlyArray<readonly [number, Color]> = [
  [0.00, { r: 0,   g: 0,   b: 0   }],
  [0.15, { r: 50,  g: 0,   b: 0   }],
  [0.35, { r: 190, g: 25,  b: 0   }],
  [0.55, { r: 255, g: 95,  b: 0   }],
  [0.78, { r: 255, g: 205, b: 0   }],
  [1.00, { r: 255, g: 255, b: 215 }],
];

/** Map heat 0..1 to the fire palette. Clamps out of range. */
function firePalette(heat: number): Color {
  const h = Math.max(0, Math.min(1, heat));
  for (let i = 1; i < FIRE_STOPS.length; i++) {
    const [hi, ci] = FIRE_STOPS[i]!;
    if (h <= hi) {
      const [lo, clo] = FIRE_STOPS[i - 1]!;
      const t = hi === lo ? 0 : (h - lo) / (hi - lo);
      return lerpColor(clo, ci, t);
    }
  }
  return FIRE_STOPS[FIRE_STOPS.length - 1]![1];
}

/** Squared physical distance between two cells, x in key-units, y scaled so a
 *  row step (~2.6 units) reads like one visual step. Mirrors Pacman's metric. */
function cellDist2(r1: number, cx1: number, r2: number, cx2: number): number {
  const dx = cx1 - cx2;
  const dy = (r1 - r2) * 2.6;
  return dx * dx + dy * dy;
}

// ─── Difficulty menu (shared by Pacman / Space Invaders / Mario) ─────────────
// Games start with difficulty = 0 (menu). The player presses a number key
// 1..5 to choose, which sets the engine's difficulty and starts play.

const KEY_DIGITS = [KEY_1, KEY_2, KEY_3, KEY_4, KEY_5];

/** Returns 1..5 if `keycode` is a digit key, else 0. */
function difficultyFromKeycode(keycode: number): number {
  const idx = KEY_DIGITS.indexOf(keycode);
  return idx >= 0 ? idx + 1 : 0;
}

// Easy → hard colour ramp shown on the number keys 1..5.
const DIFFICULTY_COLORS: Color[] = [
  { r: 0,   g: 255, b: 60  }, // 1 — green (easiest)
  { r: 150, g: 255, b: 0   }, // 2 — lime
  { r: 255, g: 210, b: 0   }, // 3 — yellow
  { r: 255, g: 110, b: 0   }, // 4 — orange
  { r: 255, g: 0,   b: 0   }, // 5 — red (hardest)
];

/** Render the difficulty-select screen: number keys 1..5 lit in a green→red
 *  gradient (pulsing), everything else dark. */
function renderDifficultyMenu(pulse: number): Map<number, Color> {
  const out = new Map<number, Color>();
  const b = 0.55 + 0.45 * Math.abs(Math.sin(pulse * 0.4));
  for (let i = 0; i < 5; i++) {
    const col = colOfName(0, String(i + 1)); // digit keys live on row 0
    const led = keyLed(0, col);
    if (led === null) continue;
    const c = DIFFICULTY_COLORS[i]!;
    out.set(led, { r: Math.round(c.r * b), g: Math.round(c.g * b), b: Math.round(c.b * b) });
  }
  return out;
}

// ─── Pong Multiplayer (P1 left, P2 right — both human) ──────────────────────

export class PongMultiplayerEngine {
  private p1Slot = 1;
  private p2Slot = 1;
  private ballCol = 7;
  private ballRow = 2;
  private prevBallCol = 7;
  private prevBallRow = 2;
  private ballVCol: -1 | 1 = 1;
  private ballVRow: -1 | 0 | 1 = 1;
  private scoreP1 = 0;
  private scoreP2 = 0;
  private resetCountdown = 30;
  private tickCounter = 0;
  private ticksPerStep = 10;
  private readonly MAX_SCORE = 4;
  private readonly PLAY_TOP = 1;
  private readonly PLAY_BOTTOM = 4;
  private readonly HIT_RADIUS = 1;

  setAnimSpeed(s: number): void {
    const clamped = Math.max(0, Math.min(1, s));
    this.ticksPerStep = Math.round(16 - clamped * 10);
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    // Player 1 — left edge
    const p1Map: Record<number, number> = {
      [KEY_TAB]: 0, [KEY_CAPSLOCK]: 1, [KEY_LEFTSHIFT]: 2, [KEY_LEFTCTRL]: 3,
    };
    if (p1Map[keycode] !== undefined) { this.p1Slot = p1Map[keycode]!; return; }
    // Player 2 — right edge
    const p2Map: Record<number, number> = {
      [KEY_BACKSLASH]: 0, [KEY_ENTER]: 1, [KEY_RIGHTSHIFT]: 2, [KEY_RIGHTCTRL]: 3,
    };
    if (p2Map[keycode] !== undefined) { this.p2Slot = p2Map[keycode]!; return; }
  }

  step(): void {
    if (this.resetCountdown > 0) { this.resetCountdown--; return; }
    this.tickCounter++;
    if (this.tickCounter < this.ticksPerStep) return;
    this.tickCounter = 0;

    this.prevBallCol = this.ballCol;
    this.prevBallRow = this.ballRow;
    this.ballCol += this.ballVCol;
    this.ballRow += this.ballVRow;
    if (this.ballRow < this.PLAY_TOP) { this.ballRow = this.PLAY_TOP; this.ballVRow = 1; }
    if (this.ballRow > this.PLAY_BOTTOM) { this.ballRow = this.PLAY_BOTTOM; this.ballVRow = -1; }

    const p1Row = this.p1Slot + 1;
    const p2Row = this.p2Slot + 1;

    if (this.ballCol <= 1) {
      this.ballCol = 1;
      if (Math.abs(this.ballRow - p1Row) <= this.HIT_RADIUS) {
        this.ballVCol = 1;
        this.ballVRow = this.pickBounceRow();
      } else {
        this.scoreP2++;
        log.info({ score: `${this.scoreP1}-${this.scoreP2}` }, 'pong-mp: P2 scores');
        this.resetServe(1);
      }
    }
    if (this.ballCol >= 13) {
      this.ballCol = 13;
      if (Math.abs(this.ballRow - p2Row) <= this.HIT_RADIUS) {
        this.ballVCol = -1;
        this.ballVRow = this.pickBounceRow();
      } else {
        this.scoreP1++;
        log.info({ score: `${this.scoreP1}-${this.scoreP2}` }, 'pong-mp: P1 scores');
        this.resetServe(-1);
      }
    }
  }

  private pickBounceRow(): -1 | 0 | 1 {
    const r = Math.random();
    if (r < 0.33) return -1;
    if (r < 0.66) return 0;
    return 1;
  }

  private resetServe(dir: -1 | 1): void {
    if (this.scoreP1 >= this.MAX_SCORE || this.scoreP2 >= this.MAX_SCORE) {
      this.scoreP1 = 0;
      this.scoreP2 = 0;
    }
    this.ballCol = 7;
    this.ballRow = 2 + Math.floor(Math.random() * 2);
    this.prevBallCol = this.ballCol;
    this.prevBallRow = this.ballRow;
    this.ballVCol = dir;
    this.ballVRow = Math.random() < 0.5 ? -1 : 1;
    this.resetCountdown = 15;
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (let i = 0; i < this.scoreP1 && i < this.MAX_SCORE; i++) {
      const led = findKeyLed(NUMS[i]!);
      if (led !== null) out.set(led, RED);
    }
    for (let i = 0; i < this.scoreP2 && i < this.MAX_SCORE; i++) {
      const led = findKeyLed(NUMS[8 - i]!);
      if (led !== null) out.set(led, BLUE);
    }
    if (this.resetCountdown > 0) {
      const led = findKeyLed('5');
      if (led !== null) out.set(led, WHITE);
    }
    const P1 = ['Tab', 'CapsLock', 'LShift', 'LCtrl'];
    const P2 = ['Backslash', 'Enter', 'RShift', 'RCtrl'];
    const p1 = findKeyLed(P1[this.p1Slot]!);
    if (p1 !== null) out.set(p1, RED);
    const p2 = findKeyLed(P2[this.p2Slot]!);
    if (p2 !== null) out.set(p2, BLUE);
    if (this.prevBallCol !== this.ballCol || this.prevBallRow !== this.ballRow) {
      const trail = gridToLed(this.prevBallCol, this.prevBallRow);
      if (trail !== null) out.set(trail, { r: 80, g: 80, b: 80 });
    }
    const ball = gridToLed(this.ballCol, this.ballRow);
    if (ball !== null) out.set(ball, WHITE);
    return out;
  }
}

// ─── Snake Interactive (WASD changes direction) ─────────────────────────────

export class SnakeInteractiveEngine {
  private body: Array<{ x: number; y: number }> = [
    { x: 7, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 2 },
  ];
  private dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 } = { x: 1, y: 0 };
  private queuedDir: { x: -1 | 0 | 1; y: -1 | 0 | 1 } | null = null;
  private food = { x: 10, y: 2 };
  private score = 0;
  private tickCounter = 0;
  private ticksPerStep = 8;
  private foodPulse = 0;

  setAnimSpeed(s: number): void {
    const clamped = Math.max(0, Math.min(1, s));
    this.ticksPerStep = Math.round(14 - clamped * 9);
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    // Queue direction so the player can buffer one input — applied on next step.
    // Reject 180-degree reversal (snake can't eat itself by going backwards).
    let nx: -1 | 0 | 1 = this.dir.x;
    let ny: -1 | 0 | 1 = this.dir.y;
    if (keycode === KEY_W)      { nx = 0;  ny = -1; }
    else if (keycode === KEY_S) { nx = 0;  ny = 1; }
    else if (keycode === KEY_A) { nx = -1; ny = 0; }
    else if (keycode === KEY_D) { nx = 1;  ny = 0; }
    else return;
    if (nx === -this.dir.x && ny === -this.dir.y) return;
    this.queuedDir = { x: nx, y: ny };
  }

  step(): void {
    this.foodPulse += 0.2;
    this.tickCounter++;
    if (this.tickCounter < this.ticksPerStep) return;
    this.tickCounter = 0;

    if (this.queuedDir) {
      this.dir = this.queuedDir;
      this.queuedDir = null;
    }

    const head = this.body[0]!;
    const newHead = {
      x: head.x + this.dir.x,
      y: head.y + this.dir.y,
    };
    // Walls: wrap around for forgiveness (could be game over instead).
    newHead.x = (newHead.x + 14) % 14;
    newHead.y = (newHead.y + 5) % 5;

    // Self-collision: ignore the tail (will be popped) but reset if hits body.
    const willHit = this.body.slice(0, -1).some(
      (s) => s.x === newHead.x && s.y === newHead.y,
    );
    if (willHit) {
      log.info({ score: this.score }, 'snake-interactive: died');
      this.body = [{ x: 7, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 2 }];
      this.dir = { x: 1, y: 0 };
      this.queuedDir = null;
      this.score = 0;
      this.spawnFood();
      return;
    }

    this.body.unshift(newHead);
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.score++;
      this.spawnFood();
    } else {
      this.body.pop();
    }
  }

  private spawnFood(): void {
    for (let i = 0; i < 200; i++) {
      const c = { x: Math.floor(Math.random() * 14), y: Math.floor(Math.random() * 5) };
      if (!this.body.some((s) => s.x === c.x && s.y === c.y)) {
        this.food = c;
        return;
      }
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Body — head bright, tail dimmer.
    for (let i = 0; i < this.body.length; i++) {
      const seg = this.body[i]!;
      const led = gridToLed(seg.x, seg.y);
      if (led === null) continue;
      const intensity = i === 0 ? 1.0 : Math.max(0.35, 1 - i * 0.08);
      const c = i === 0
        ? { r: 200, g: 255, b: 0 }
        : { r: Math.round(GREEN.r * intensity), g: Math.round(GREEN.g * intensity), b: Math.round(GREEN.b * intensity) };
      out.set(led, c);
    }
    // Food — red pulse.
    const foodLed = gridToLed(this.food.x, this.food.y);
    if (foodLed !== null) {
      const pulse = 0.6 + 0.4 * Math.sin(this.foodPulse);
      out.set(foodLed, {
        r: Math.round(255 * pulse),
        g: Math.round(20 * pulse),
        b: Math.round(20 * pulse),
      });
    }
    return out;
  }
}

// ─── Breakout Interactive (A/D moves paddle) ────────────────────────────────

export class BreakoutInteractiveEngine {
  private paddleCol = 6; // center of a 3-wide paddle, so cells paddleCol-1..+1
  private ballCol = 7;
  private ballRow = 3;
  private ballVCol: -1 | 1 = 1;
  private ballVRow: -1 | 1 = -1;
  private bricks: boolean[][] = []; // [row][col], rows 0..1
  private score = 0;
  private resetCountdown = 30;
  private tickCounter = 0;
  private ticksPerStep = 6;
  private readonly PADDLE_ROW = 4;
  private readonly PADDLE_HALF = 1; // half-width for the 3-cell paddle
  private brickColors: Color[] = [
    { r: 255, g: 0, b: 0 },
    { r: 255, g: 165, b: 0 },
  ];

  constructor() {
    this.resetBricks();
  }

  setAnimSpeed(s: number): void {
    const clamped = Math.max(0, Math.min(1, s));
    this.ticksPerStep = Math.round(10 - clamped * 6);
  }

  private resetBricks(): void {
    this.bricks = [
      new Array(14).fill(true),
      new Array(14).fill(true),
    ];
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (keycode === KEY_A) {
      this.paddleCol = Math.max(this.PADDLE_HALF, this.paddleCol - 2);
    } else if (keycode === KEY_D) {
      this.paddleCol = Math.min(13 - this.PADDLE_HALF, this.paddleCol + 2);
    }
  }

  step(): void {
    if (this.resetCountdown > 0) { this.resetCountdown--; return; }
    this.tickCounter++;
    if (this.tickCounter < this.ticksPerStep) return;
    this.tickCounter = 0;

    this.ballCol += this.ballVCol;
    this.ballRow += this.ballVRow;

    if (this.ballCol < 0) { this.ballCol = 0; this.ballVCol = 1; }
    if (this.ballCol > 13) { this.ballCol = 13; this.ballVCol = -1; }
    if (this.ballRow < 0) { this.ballRow = 0; this.ballVRow = 1; }

    // Brick collision (rows 0..1).
    if (this.ballRow >= 0 && this.ballRow <= 1) {
      const brick = this.bricks[this.ballRow]?.[this.ballCol];
      if (brick) {
        this.bricks[this.ballRow]![this.ballCol] = false;
        this.score++;
        this.ballVRow = 1;
        if (this.bricks.every((row) => row.every((b) => !b))) {
          // cleared all bricks — refill, harder! (not implemented; just reset)
          log.info({ score: this.score }, 'breakout-interactive: cleared');
          this.resetBricks();
        }
      }
    }

    // Paddle collision (row PADDLE_ROW).
    if (this.ballRow === this.PADDLE_ROW - 1 && this.ballVRow > 0) {
      const within = Math.abs(this.ballCol - this.paddleCol) <= this.PADDLE_HALF;
      if (within) {
        this.ballVRow = -1;
        // Angle nudge based on offset from paddle center.
        const offset = this.ballCol - this.paddleCol;
        if (offset < 0) this.ballVCol = -1;
        else if (offset > 0) this.ballVCol = 1;
      }
    }

    // Miss — ball below paddle.
    if (this.ballRow > this.PADDLE_ROW) {
      log.info({ score: this.score }, 'breakout-interactive: missed');
      this.score = 0;
      this.resetBricks();
      this.ballCol = 7;
      this.ballRow = 3;
      this.ballVCol = Math.random() < 0.5 ? -1 : 1;
      this.ballVRow = -1;
      this.resetCountdown = 20;
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Bricks: row 0 red, row 1 orange.
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 14; c++) {
        if (!this.bricks[r]?.[c]) continue;
        const led = gridToLed(c, r);
        if (led !== null) out.set(led, this.brickColors[r]!);
      }
    }
    // Paddle (3 cells on row 4): cyan.
    for (let dx = -this.PADDLE_HALF; dx <= this.PADDLE_HALF; dx++) {
      const led = gridToLed(this.paddleCol + dx, this.PADDLE_ROW);
      if (led !== null) out.set(led, CYAN);
    }
    // Ball.
    const ball = gridToLed(this.ballCol, this.ballRow);
    if (ball !== null) out.set(ball, WHITE);
    return out;
  }
}

// ─── Pacman (key-matrix maze) ───────────────────────────────────────────────

type Dir = 'left' | 'right' | 'up' | 'down';
const REVERSE: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };
const ALL_DIRS: Dir[] = ['left', 'right', 'up', 'down'];

/**
 * Pacman on the physical key matrix — one key = one cell, so nothing
 * collapses on the wide bottom row. Pacman pulses bright yellow so you can
 * always find yourself; ghosts are solid saturated colours; walls are dim
 * and dots very dim. WASD queues a turn (committed at the next legal step).
 * Power pellets in the four corners turn the three ghosts edible (blue).
 * 5 phases ramp ghost speed and shrink fright time; 3 lives.
 *
 * Palette slots: pacman, dot, pellet, wall, ghost-1, ghost-2, ghost-3,
 * ghost-fright.
 */
export class PacmanEngine {
  private pac = { row: 2, col: 6 };
  private dir: Dir = 'left';
  private queued: Dir | null = null;

  private ghosts: Array<{
    row: number; col: number; dir: Dir;
    home: { row: number; col: number };
    personality: 'chase' | 'ambush' | 'random';
    slot: string;
    eaten: number;
  }> = [];

  private walls = new Set<string>();
  private dots = new Set<string>();
  private pellets = new Set<string>();

  private score = 0;
  private lives = 3;
  private phase = 0;
  private frightTicks = 0;
  private deathAnim = 0;
  private clearAnim = 0;
  private pulse = 0;

  private tick = 0;
  private baseStep = 9;
  private stepTicks = 9;
  private ghostTick = 0;
  private ghostStepTicks = 12;

  private difficulty = 0;   // 0 = difficulty menu; 1..5 once chosen
  private ghostCount = 1;

  private overrides: Record<string, string> = {};

  // Sparse wall layouts per phase (by key name). The key graph stays richly
  // connected (left/right wrap + vertical neighbours), so every dot remains
  // reachable; density rises with phase for difficulty.
  private readonly WALL_NAMES: ReadonlyArray<ReadonlyArray<string>> = [
    ['E', 'I', 'F', 'K'],
    ['W', 'O', 'D', 'L', 'G'],
    ['Q', 'R', 'U', 'P', 'S', 'J', 'C', 'Period'],
    ['2', '5', '8', 'Minus', 'X', 'V', 'N', 'Comma'],
    ['3', '6', '9', 'T', 'Y', 'H', 'K', 'V', 'M', 'L'],
  ];

  constructor() { this.resetLevel(); }

  /** Difficulty 1..5 → ghost count (1/1/2/2/3). Ghost speed is folded into
   *  applyPhase() below. The user asked for just one ghost on the easy end. */
  private applyDifficulty(): void {
    this.ghostCount = this.difficulty <= 2 ? 1 : this.difficulty <= 4 ? 2 : 3;
  }

  setColorOverrides(o: Record<string, string>): void { this.overrides = o ?? {}; }
  private color(slot: string, fb: Color): Color {
    const hex = this.overrides[slot];
    return hex ? parseHex(hex) : fb;
  }

  setAnimSpeed(s: number): void {
    const c = Math.max(0, Math.min(1, s));
    this.baseStep = Math.round(13 - c * 7); // 13..6 ticks/step
    this.applyPhase();
  }
  private applyPhase(): void {
    this.stepTicks = this.baseStep;
    // Ghost lag (extra ticks vs Pacman) shrinks with both difficulty and
    // phase, so easy/early = sluggish ghosts, hard/late = near parity.
    const diff = this.difficulty > 0 ? this.difficulty : 1;
    this.ghostStepTicks = this.stepTicks + Math.max(1, 7 - diff - this.phase);
  }

  private cellKey(r: number, c: number): string { return `${r},${c}`; }

  private resetLevel(): void {
    this.applyPhase();
    this.walls.clear();
    const names = this.WALL_NAMES[this.phase] ?? [];
    for (let row = 0; row < ROW_COUNT; row++) {
      for (const nm of names) {
        const col = colOfName(row, nm);
        if (col >= 0) this.walls.add(this.cellKey(row, col));
      }
    }
    this.dots.clear();
    this.pellets.clear();
    for (let row = 0; row < ROW_COUNT; row++) {
      for (let col = 0; col < rowWidth(row); col++) {
        const k = this.cellKey(row, col);
        if (!this.walls.has(k)) this.dots.add(k);
      }
    }
    const corners: Array<[number, number]> = [
      [0, 0], [0, rowWidth(0) - 1],
      [ROW_COUNT - 1, 0], [ROW_COUNT - 1, rowWidth(ROW_COUNT - 1) - 1],
    ];
    for (const [r, c] of corners) {
      const k = this.cellKey(r, c);
      this.walls.delete(k);
      this.dots.delete(k);
      this.pellets.add(k);
    }
    this.pac = { row: 2, col: Math.floor(rowWidth(2) / 2) };
    this.dir = 'left';
    this.queued = null;
    this.dots.delete(this.cellKey(this.pac.row, this.pac.col));
    this.walls.delete(this.cellKey(this.pac.row, this.pac.col));
    this.spawnGhosts();
    for (const g of this.ghosts) {
      this.dots.delete(this.cellKey(g.row, g.col));
      this.walls.delete(this.cellKey(g.row, g.col));
    }
    this.frightTicks = 0;
  }

  private spawnGhosts(): void {
    const spawns: Array<{ row: number; col: number; personality: 'chase' | 'ambush' | 'random'; slot: string }> = [
      { row: 0, col: 7,                         personality: 'chase',  slot: 'ghost-1' },
      { row: 4, col: Math.floor(rowWidth(4) / 2), personality: 'ambush', slot: 'ghost-2' },
      { row: 0, col: 11,                        personality: 'random', slot: 'ghost-3' },
    ];
    // Only as many ghosts as the chosen difficulty calls for.
    this.ghosts = spawns.slice(0, Math.max(1, this.ghostCount)).map((s) => ({
      row: s.row, col: s.col, dir: 'left' as Dir,
      home: { row: s.row, col: s.col },
      personality: s.personality, slot: s.slot, eaten: 0,
    }));
  }

  private neighbor(row: number, col: number, dir: Dir): { row: number; col: number } | null {
    if (dir === 'left') {
      const c = col - 1;
      return { row, col: c < 0 ? rowWidth(row) - 1 : c };
    }
    if (dir === 'right') {
      const c = col + 1;
      return { row, col: c >= rowWidth(row) ? 0 : c };
    }
    if (dir === 'up') {
      if (row - 1 < 0) return null;
      return { row: row - 1, col: vNeighbor(row, col, row - 1) };
    }
    if (row + 1 >= ROW_COUNT) return null;
    return { row: row + 1, col: vNeighbor(row, col, row + 1) };
  }

  private isWall(row: number, col: number): boolean {
    return this.walls.has(this.cellKey(row, col));
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.applyDifficulty(); this.resetLevel(); }
      return;
    }
    if (this.deathAnim > 0 || this.clearAnim > 0) return;
    if (keycode === KEY_W) this.queued = 'up';
    else if (keycode === KEY_S) this.queued = 'down';
    else if (keycode === KEY_A) this.queued = 'left';
    else if (keycode === KEY_D) this.queued = 'right';
  }

  step(): void {
    this.pulse += 0.3;
    if (this.difficulty === 0) return; // waiting on difficulty menu
    if (this.deathAnim > 0) {
      this.deathAnim--;
      if (this.deathAnim === 0) {
        if (this.lives > 0) {
          this.pac = { row: 2, col: Math.floor(rowWidth(2) / 2) };
          this.dir = 'left'; this.queued = null; this.spawnGhosts();
        } else {
          this.lives = 3; this.score = 0; this.phase = 0; this.resetLevel();
        }
      }
      return;
    }
    if (this.clearAnim > 0) {
      this.clearAnim--;
      if (this.clearAnim === 0) {
        this.phase = (this.phase + 1) % this.WALL_NAMES.length;
        this.resetLevel();
      }
      return;
    }
    if (this.frightTicks > 0) this.frightTicks--;

    this.tick++;
    if (this.tick >= this.stepTicks) {
      this.tick = 0;
      this.movePac();
      if (this.checkCollision()) return;
    }
    this.ghostTick++;
    if (this.ghostTick >= this.ghostStepTicks) {
      this.ghostTick = 0;
      this.moveGhosts();
      this.checkCollision();
    }
  }

  private movePac(): void {
    if (this.queued) {
      const n = this.neighbor(this.pac.row, this.pac.col, this.queued);
      if (n && !this.isWall(n.row, n.col)) { this.dir = this.queued; this.queued = null; }
    }
    const n = this.neighbor(this.pac.row, this.pac.col, this.dir);
    if (!n || this.isWall(n.row, n.col)) return;
    this.pac = n;
    const k = this.cellKey(this.pac.row, this.pac.col);
    if (this.pellets.has(k)) {
      this.pellets.delete(k);
      this.score += 50;
      this.frightTicks = Math.max(45, 100 - this.phase * 12);
    } else if (this.dots.has(k)) {
      this.dots.delete(k);
      this.score += 1;
    }
    if (this.dots.size === 0 && this.pellets.size === 0) {
      this.score += 100 * (this.phase + 1);
      this.clearAnim = 26;
      log.info({ score: this.score, phase: this.phase + 1 }, 'pacman: phase clear');
    }
  }

  private cellDist(r1: number, c1: number, r2: number, c2: number): number {
    const dx = keyCx(r1, c1) - keyCx(r2, c2);
    const dy = (r1 - r2) * 2.6;
    return dx * dx + dy * dy;
  }

  private moveGhosts(): void {
    for (const g of this.ghosts) {
      if (g.eaten > 0) { g.eaten--; continue; }
      const cands: Array<{ row: number; col: number; dir: Dir }> = [];
      for (const d of ALL_DIRS) {
        if (d === REVERSE[g.dir]) continue;
        const n = this.neighbor(g.row, g.col, d);
        if (n && !this.isWall(n.row, n.col)) cands.push({ row: n.row, col: n.col, dir: d });
      }
      if (cands.length === 0) {
        const n = this.neighbor(g.row, g.col, REVERSE[g.dir]);
        if (n && !this.isWall(n.row, n.col)) cands.push({ row: n.row, col: n.col, dir: REVERSE[g.dir] });
        else continue;
      }
      if (this.frightTicks > 0) {
        let best = cands[0]!; let bestD = -Infinity;
        for (const c of cands) {
          const d = this.cellDist(c.row, c.col, this.pac.row, this.pac.col);
          if (d > bestD) { bestD = d; best = c; }
        }
        g.row = best.row; g.col = best.col; g.dir = best.dir;
        continue;
      }
      let target = { row: this.pac.row, col: this.pac.col };
      if (g.personality === 'ambush') {
        let t = { row: this.pac.row, col: this.pac.col };
        for (let i = 0; i < 2; i++) { const n = this.neighbor(t.row, t.col, this.dir); if (n) t = n; }
        target = t;
      } else if (g.personality === 'random') {
        if (Math.random() < 0.35) {
          const c = cands[Math.floor(Math.random() * cands.length)]!;
          g.row = c.row; g.col = c.col; g.dir = c.dir;
          continue;
        }
      }
      let best = cands[0]!; let bestD = Infinity;
      for (const c of cands) {
        const d = this.cellDist(c.row, c.col, target.row, target.col);
        if (d < bestD) { bestD = d; best = c; }
      }
      g.row = best.row; g.col = best.col; g.dir = best.dir;
    }
  }

  private checkCollision(): boolean {
    for (const g of this.ghosts) {
      if (g.eaten > 0) continue;
      if (g.row === this.pac.row && g.col === this.pac.col) {
        if (this.frightTicks > 0) {
          g.row = g.home.row; g.col = g.home.col; g.dir = 'left'; g.eaten = 28;
          this.score += 200;
        } else {
          this.lives--;
          this.deathAnim = 28;
          log.info({ score: this.score, lives: this.lives }, 'pacman: caught');
          return true;
        }
      }
    }
    return false;
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    const WALL = this.color('wall', { r: 12, g: 12, b: 70 });
    const DOT = this.color('dot', { r: 45, g: 40, b: 22 });
    const PELLET = this.color('pellet', { r: 255, g: 210, b: 180 });
    const PAC = this.color('pacman', { r: 255, g: 235, b: 0 });
    const FRIGHT = this.color('ghost-fright', { r: 20, g: 60, b: 255 });

    if (this.deathAnim > 0) {
      const i = this.deathAnim % 8 < 4 ? 1 : 0.2;
      for (let r = 0; r < ROW_COUNT; r++) {
        for (let c = 0; c < rowWidth(r); c++) {
          const led = keyLed(r, c);
          if (led !== null) out.set(led, { r: Math.round(200 * i), g: 0, b: 0 });
        }
      }
      for (let i2 = 0; i2 < this.lives; i2++) {
        const led = keyLed(0, i2);
        if (led !== null) out.set(led, PAC);
      }
      return out;
    }
    if (this.clearAnim > 0) {
      const i = this.clearAnim % 6 < 3 ? 1 : 0.25;
      for (let r = 0; r < ROW_COUNT; r++) {
        for (let c = 0; c < rowWidth(r); c++) {
          const led = keyLed(r, c);
          if (led !== null) out.set(led, { r: 0, g: Math.round(200 * i), b: 30 });
        }
      }
      const next = ((this.phase + 1) % this.WALL_NAMES.length) + 1;
      for (let i2 = 0; i2 < next; i2++) {
        const led = keyLed(0, i2);
        if (led !== null) out.set(led, { r: 255, g: 255, b: 0 });
      }
      return out;
    }

    for (const k of this.walls) {
      const parts = k.split(','); const r = Number(parts[0]); const c = Number(parts[1]);
      const led = keyLed(r, c); if (led !== null) out.set(led, WALL);
    }
    for (const k of this.dots) {
      const parts = k.split(','); const r = Number(parts[0]); const c = Number(parts[1]);
      const led = keyLed(r, c); if (led !== null) out.set(led, DOT);
    }
    const pp = 0.6 + 0.4 * Math.sin(this.pulse * 0.5);
    for (const k of this.pellets) {
      const parts = k.split(','); const r = Number(parts[0]); const c = Number(parts[1]);
      const led = keyLed(r, c);
      if (led !== null) out.set(led, { r: Math.round(PELLET.r * pp), g: Math.round(PELLET.g * pp), b: Math.round(PELLET.b * pp) });
    }
    for (const g of this.ghosts) {
      const led = keyLed(g.row, g.col); if (led === null) continue;
      let col: Color;
      if (g.eaten > 0) col = { r: 110, g: 110, b: 140 };
      else if (this.frightTicks > 0) {
        const fl = this.frightTicks < 30 && this.frightTicks % 8 < 4;
        col = fl ? { r: 255, g: 255, b: 255 } : FRIGHT;
      } else {
        col = this.color(g.slot,
          g.slot === 'ghost-1' ? { r: 255, g: 0, b: 50 } :
          g.slot === 'ghost-2' ? { r: 255, g: 90, b: 200 } :
                                 { r: 0, g: 220, b: 255 });
      }
      out.set(led, col);
    }
    const pacLed = keyLed(this.pac.row, this.pac.col);
    if (pacLed !== null) {
      const b = 0.7 + 0.3 * Math.abs(Math.sin(this.pulse * 0.5));
      out.set(pacLed, { r: Math.round(PAC.r * b), g: Math.round(PAC.g * b), b: Math.round(PAC.b * b) });
    }
    return out;
  }
}

// ─── DOOM (raycaster FPS on a 14×5 LED grid) ────────────────────────────────

/**
 * Doom-flavoured raycaster. The world is an 8×8 grid of walls and open
 * floor; the player navigates with WASD (W/S = forward/back, A/D = turn)
 * and shoots with Space. The 14-column LED viewport renders one ray per
 * column, with wall slice height proportional to 1/distance. Enemies
 * (imps) are rendered in red when a ray hits them first.
 *
 * HUD on row 0:
 *   keys 1-7   = HP bar (red)
 *   key  8     = kill flash + muzzle flash
 *   keys 0,-,=,Backspace = ammo bar (yellow, max 4)
 *   key Esc    = weapon ready indicator (cyan if armed)
 * Row 4 is the floor (dim brown).
 */
export class DoomEngine {
  // World map: 1 = wall, 0 = empty. 8×8 box with two pillars.
  private map: number[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ];

  // Player
  private px = 4;
  private py = 4;
  private angle = 0;   // radians, 0 = facing +x
  private hp = 7;
  private ammo = 4;
  private kills = 0;

  // Enemies
  private enemies: Array<{ x: number; y: number; hp: number }> = [];

  // Animation state
  private muzzleFlash = 0;
  private damageFlash = 0;
  private deathScreen = 0;
  private tickCounter = 0;
  private ticksPerStep = 3;
  private overrides: Record<string, string> = {};

  // Constants
  private readonly FOV = Math.PI / 2.5;   // ~72° — slightly wider for a small viewport
  private readonly MOVE_SPEED = 0.25;
  private readonly TURN_SPEED = 0.30;
  private readonly MAX_DIST = 7.0;
  private readonly ENEMY_SPEED = 0.06;
  private readonly MAX_AMMO = 4;
  private readonly MAX_HP = 7;

  constructor() {
    this.spawnEnemies();
  }

  setColorOverrides(o: Record<string, string>): void {
    this.overrides = o ?? {};
  }

  private color(slot: string, fallback: Color): Color {
    const hex = this.overrides[slot];
    return hex ? parseHex(hex) : fallback;
  }

  setAnimSpeed(s: number): void {
    const c = Math.max(0, Math.min(1, s));
    this.ticksPerStep = Math.round(5 - c * 3);
  }

  private spawnEnemies(): void {
    this.enemies = [
      { x: 2.5, y: 2.5, hp: 1 },
      { x: 5.5, y: 5.5, hp: 1 },
      { x: 6.5, y: 1.5, hp: 1 },
    ];
  }

  private isWall(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= 8 || iy < 0 || iy >= 8) return true;
    return this.map[iy]![ix] === 1;
  }

  private normalize(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.deathScreen > 0) return; // can't act while dying
    if (keycode === KEY_W) this.moveForward(this.MOVE_SPEED);
    else if (keycode === KEY_S) this.moveForward(-this.MOVE_SPEED);
    else if (keycode === KEY_A) this.angle = this.normalize(this.angle - this.TURN_SPEED);
    else if (keycode === KEY_D) this.angle = this.normalize(this.angle + this.TURN_SPEED);
    else if (keycode === KEY_SPACE) this.shoot();
  }

  private moveForward(amount: number): void {
    const nx = this.px + Math.cos(this.angle) * amount;
    const ny = this.py + Math.sin(this.angle) * amount;
    // Slide along walls: try X and Y axes independently.
    if (!this.isWall(nx, this.py)) this.px = nx;
    if (!this.isWall(this.px, ny)) this.py = ny;
  }

  private shoot(): void {
    if (this.ammo <= 0) return;
    this.ammo--;
    this.muzzleFlash = 6;
    // Find nearest enemy whose angle from player is within ±0.2 rad of player angle.
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const eAngle = Math.atan2(dy, dx);
      const diff = Math.abs(this.normalize(eAngle - this.angle));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (diff < 0.2 && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      this.enemies[bestIdx]!.hp--;
      if (this.enemies[bestIdx]!.hp <= 0) {
        this.enemies.splice(bestIdx, 1);
        this.kills++;
        this.ammo = Math.min(this.MAX_AMMO, this.ammo + 1); // ammo refund on kill
        log.info({ kills: this.kills, remaining: this.enemies.length }, 'doom: kill');
        if (this.enemies.length === 0) {
          // Round clear — reset the per-round kill bar in the HUD and refill
          // ammo. Spawn a fresh wave with one more imp than before so it
          // ramps up over time.
          this.kills = 0;
          this.ammo = this.MAX_AMMO;
          this.spawnEnemies();
        }
      }
    }
  }

  step(): void {
    if (this.muzzleFlash > 0) this.muzzleFlash--;
    if (this.damageFlash > 0) this.damageFlash--;
    if (this.deathScreen > 0) {
      this.deathScreen--;
      if (this.deathScreen === 0) this.respawn();
      return;
    }
    this.tickCounter++;
    if (this.tickCounter < this.ticksPerStep) return;
    this.tickCounter = 0;

    // Enemy AI: shuffle around the room slowly, but DON'T damage the player
    // on contact — turret mode (user request: "eles não atacarem, pois fica
    // muito difícil no teclado"). The enemies still move so they're a
    // moving target, but stop short of the player to avoid blocking shots.
    for (const e of this.enemies) {
      const dx = this.px - e.x;
      const dy = this.py - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Keep at least 1.2 cells from the player — close enough to be visible,
      // far enough that they don't crowd the camera.
      if (dist < 1.2) continue;
      const nx = e.x + (dx / dist) * this.ENEMY_SPEED;
      const ny = e.y + (dy / dist) * this.ENEMY_SPEED;
      if (!this.isWall(nx, e.y)) e.x = nx;
      if (!this.isWall(e.x, ny)) e.y = ny;
    }
  }

  private respawn(): void {
    this.px = 4;
    this.py = 4;
    this.angle = 0;
    this.hp = this.MAX_HP;
    this.ammo = this.MAX_AMMO;
    this.kills = 0;
    this.spawnEnemies();
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();

    // Resolve palette slots once per frame. Walls/enemies still multiply
    // by a distance fade, so these are the BASE colors at fade=1.
    const wallBase   = this.color('wall',         { r: 110, g: 110, b: 160 });
    const enemyBase  = this.color('enemy',        { r: 255, g: 0,   b: 80  });
    const FLOOR      = this.color('floor',        { r: 60,  g: 30,  b: 5   });
    const AMMO_COLOR = this.color('ammo',         YELLOW);
    const KILL_COLOR = this.color('kill',         GREEN);
    const READY      = this.color('weapon-ready', CYAN);
    const MUZZLE     = this.color('muzzle',       WHITE);

    // Death screen: full red, ignore everything else.
    if (this.deathScreen > 0) {
      for (const k of K617_LAYOUT.keys) {
        out.set(k.ledIndex, { r: 200, g: 0, b: 0 });
      }
      return out;
    }

    // ── HUD row 0 ──────────────────────────────────────────────────────
    // Esc = weapon ready (cyan when has ammo)
    const escLed = findKeyLed('Escape');
    if (escLed !== null) {
      out.set(escLed, this.ammo > 0 ? READY : { r: 80, g: 40, b: 0 });
    }
    // 1..7 = kill counter for the current round (was HP — enemies don't
    // damage the player anymore, so HP was always full and uninformative).
    const KILL_KEYS = ['1', '2', '3', '4', '5', '6', '7'];
    for (let i = 0; i < this.kills && i < KILL_KEYS.length; i++) {
      const led = findKeyLed(KILL_KEYS[i]!);
      if (led !== null) out.set(led, KILL_COLOR);
    }
    // 8 = muzzle flash
    if (this.muzzleFlash > 0) {
      const led = findKeyLed('8');
      if (led !== null) out.set(led, MUZZLE);
    }
    // 0,Minus,Equal,Backspace = ammo (4 slots)
    const AMMO_KEYS = ['0', 'Minus', 'Equal', 'Backspace'];
    for (let i = 0; i < this.ammo && i < AMMO_KEYS.length; i++) {
      const led = findKeyLed(AMMO_KEYS[i]!);
      if (led !== null) out.set(led, AMMO_COLOR);
    }

    // ── 3D viewport — rays for cols 0..13, rows 1..3 ───────────────────
    const COLS = 14;
    for (let col = 0; col < COLS; col++) {
      const rayAngle = this.angle + ((col / (COLS - 1)) - 0.5) * this.FOV;
      const rdx = Math.cos(rayAngle);
      const rdy = Math.sin(rayAngle);

      // DDA: step forward until we hit a wall or hit MAX_DIST.
      let dist = 0;
      while (dist < this.MAX_DIST) {
        dist += 0.05;
        if (this.isWall(this.px + rdx * dist, this.py + rdy * dist)) break;
      }

      // Check if any enemy lies along this ray BEFORE the wall.
      let enemyDist = Infinity;
      for (const e of this.enemies) {
        const ex = e.x - this.px;
        const ey = e.y - this.py;
        const eD = Math.sqrt(ex * ex + ey * ey);
        const eA = Math.atan2(ey, ex);
        const diff = Math.abs(this.normalize(eA - rayAngle));
        // Tighter angle tolerance for distant enemies (perspective)
        const tol = Math.max(0.08, 0.18 - eD * 0.02);
        if (diff < tol && eD < dist && eD < enemyDist) enemyDist = eD;
      }

      const useDist = enemyDist < Infinity ? enemyDist : dist;
      const isEnemy = enemyDist < Infinity;
      // Distance-based fade: closer = brighter.
      const fade = Math.max(0.2, 1 - useDist / this.MAX_DIST);
      const base = isEnemy ? enemyBase : wallBase;
      const slice: Color = {
        r: Math.round(base.r * fade),
        g: Math.round(base.g * fade),
        b: Math.round(base.b * fade),
      };

      // Slice height: closer = taller. 3 rows max (rows 1..3).
      const sliceHeight = useDist < 1.0 ? 3 : useDist < 2.5 ? 2 : useDist < 5.0 ? 1 : 0;
      // Center the slice on row 2.
      const startRow = sliceHeight === 3 ? 1 : sliceHeight === 2 ? 1 : 2;
      const endRow = startRow + sliceHeight - 1;
      for (let row = startRow; row <= endRow; row++) {
        const led = gridToLed(col, row);
        if (led !== null) out.set(led, slice);
      }

      // Floor on row 4.
      const floorLed = gridToLed(col, 4);
      if (floorLed !== null) out.set(floorLed, FLOOR);
    }

    // ── Damage flash overlay (red wash) ────────────────────────────────
    if (this.damageFlash > 0) {
      const i = this.damageFlash / 8;
      out.forEach((c, idx) => {
        out.set(idx, {
          r: Math.min(255, Math.round(c.r * (1 - i * 0.4) + 220 * i)),
          g: Math.round(c.g * (1 - i * 0.7)),
          b: Math.round(c.b * (1 - i * 0.7)),
        });
      });
    }

    return out;
  }
}

// ─── Minecraft "just clouds" (eternal day) ──────────────────────────────────

/**
 * Variant of MinecraftDayEngine that stays at high noon forever — sky stays
 * day-blue, sun stays at the center top, clouds drift across rows 0-1. Same
 * grass + dirt layers on rows 3-4. Useful as a calm ambient mode without the
 * dusk/night transitions.
 */
export class MinecraftCloudsEngine {
  private tickCounter = 0;
  private overrides: Record<string, string> = {};

  setColorOverrides(o: Record<string, string>): void {
    this.overrides = o ?? {};
  }

  private color(slot: string, fallback: Color): Color {
    const hex = this.overrides[slot];
    return hex ? parseHex(hex) : fallback;
  }

  // Five clouds drifting at independent speeds so the sky looks lively
  // (was three at very slow rates — barely visible motion). Each tick is
  // one frame at 30fps; CLOUD_CYCLE controls how long a cloud takes to
  // cross the keyboard end-to-end.
  private readonly clouds = [
    { offset: 0.00, rate: 1.0, row: 0 },
    { offset: 0.25, rate: 1.4, row: 1 },
    { offset: 0.50, rate: 0.8, row: 0 },
    { offset: 0.75, rate: 1.1, row: 1 },
    { offset: 0.15, rate: 1.7, row: 0 },
  ];
  // ~10s per slowest cloud crossing — clearly animated motion.
  private readonly CLOUD_CYCLE = 300;

  step(): void { this.tickCounter++; }

  handleKey(_keycode: number, _value: number): void { /* no input */ }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Defaults: vivid + darker sky per user request. Each slot is editable
    // via pattern.colorOverrides — see GUI's statefulPalettes for the slot
    // names and friendly labels.
    const SKY_TOP    = this.color('sky-top',    { r: 0,   g: 40,  b: 180 }); // darker royal
    const SKY_BOTTOM = this.color('sky-bottom', { r: 0,   g: 100, b: 220 }); // mid-blue
    const DIRT       = this.color('dirt',       { r: 180, g: 70,  b: 0   });
    const GRASS      = this.color('grass',      { r: 0,   g: 255, b: 0   });
    const SUN        = this.color('sun',        { r: 255, g: 60,  b: 0   }); // intense orange-red
    const CLOUD      = this.color('cloud',      { r: 255, g: 255, b: 255 });

    // Continuous cloud drift parameter.
    const phase = (this.tickCounter / this.CLOUD_CYCLE) % 1;
    const cloudPositions = this.clouds.map((c) => ({
      col: ((phase * c.rate + c.offset) * 18) % 18 - 2,
      row: c.row,
    }));

    // Sun parked at the top center.
    const sunCol = 7;
    const sunRow = 0;

    for (const k of K617_LAYOUT.keys) {
      const cx = k.col + k.width / 2;
      let color: Color;
      if (k.row === 0) color = SKY_TOP;
      else if (k.row === 1) color = SKY_BOTTOM;
      else if (k.row === 2) color = SKY_BOTTOM;
      else if (k.row === 3) color = GRASS;
      else color = DIRT;

      // Sun glow at top-center — 2-key wide warm orange.
      if (k.row === sunRow) {
        const d = Math.abs(cx - sunCol);
        if (d < 2.0) color = lerpColor(color, SUN, Math.max(0, 1 - d / 2.0));
      }

      // Clouds — wider (2-key radius) and much more opaque so the motion
      // reads clearly even from a quick glance.
      if (k.row <= 1) {
        for (const c of cloudPositions) {
          if (c.row !== k.row) continue;
          const d = Math.abs(cx - c.col);
          if (d < 2.0) {
            const puff = (1 - d / 2.0) * 0.85;
            color = lerpColor(color, CLOUD, puff);
          }
        }
      }

      out.set(k.ledIndex, color);
    }
    return out;
  }
}

// ─── Space Invaders (key matrix) ─────────────────────────────────────────────

/**
 * Space Invaders on the physical key matrix. Aliens occupy the top rows
 * (0-1, 14 keys each) in a marching formation; the ship is one of the 8
 * bottom-row keys. Bullets travel vertically and are rendered to the key
 * nearest their physical x on each row, so nothing collapses. The ship
 * pulses bright so you can always spot yourself. 4 waves, 3 lives.
 *
 * Palette slots: alien, ship, player-bullet, alien-bullet.
 */
export class SpaceInvadersEngine {
  private aliens: Array<{ row: number; col: number; alive: boolean }> = [];
  private dir: -1 | 1 = 1;
  private shipCol = 3;
  private playerBullet: { cx: number; row: number } | null = null;
  private alienBullets: Array<{ cx: number; row: number }> = [];

  private lives = 3;
  private score = 0;
  private wave = 0;
  private deathAnim = 0;
  private clearAnim = 0;
  private gameOverAnim = 0;
  private pulse = 0;
  private difficulty = 0;   // 0 = difficulty menu; 1..5 once chosen
  private bounces = 0;      // edge bounces since the last downward drop

  private tick = 0;
  private bulletTick = 0;
  private overrides: Record<string, string> = {};

  // Only the formation shape varies per wave; speeds/fire come from the
  // chosen difficulty (and a gentle per-wave ramp). Formation lives in a
  // 13-wide lane space (0..12) so it fits the narrowest occupied row.
  private readonly WAVES: ReadonlyArray<{ rows: number; cols: number }> = [
    { rows: 2, cols: 5 },
    { rows: 2, cols: 6 },
    { rows: 2, cols: 7 },
    { rows: 2, cols: 7 },
  ];

  constructor() { /* wait in difficulty menu */ this.spawnWave(); }
  setColorOverrides(o: Record<string, string>): void { this.overrides = o ?? {}; }
  private color(slot: string, fb: Color): Color { const h = this.overrides[slot]; return h ? parseHex(h) : fb; }
  setAnimSpeed(s: number): void { void s; }

  // Difficulty- and wave-scaled timings. Higher difficulty = faster march,
  // faster bullets, more fire, and dropping a row on fewer bounces.
  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }
  private marchTicks(): number { return Math.max(7, 30 - this.diff * 3 - this.wave * 2); }
  private bulletTicks(): number { return Math.max(4, 9 - this.diff); }
  private fireRate(): number { return (0.0025 + this.diff * 0.0014) * (1 + this.wave * 0.25); }
  // The descent is the headline complaint: with only 5 rows it drops too
  // fast. Now the formation just reverses at the edge and only steps DOWN
  // every Nth bounce — N is large on easy so it descends gently.
  private dropEvery(): number { return Math.max(1, 6 - this.diff); }

  private spawnWave(): void {
    const w = this.WAVES[this.wave]!;
    this.aliens = [];
    const span = w.cols * 2 - 1;
    const start = Math.max(0, Math.floor((13 - span) / 2));
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        this.aliens.push({ row: r, col: start + c * 2, alive: true });
      }
    }
    this.dir = 1;
    this.bounces = 0;
    this.playerBullet = null;
    this.alienBullets = [];
    this.shipCol = Math.floor(rowWidth(4) / 2);
    this.tick = 0;
    this.bulletTick = 0;
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.wave = 0; this.lives = 3; this.score = 0; this.spawnWave(); }
      return;
    }
    if (this.deathAnim > 0 || this.clearAnim > 0 || this.gameOverAnim > 0) return;
    if (keycode === KEY_A) this.shipCol = Math.max(0, this.shipCol - 1);
    else if (keycode === KEY_D) this.shipCol = Math.min(rowWidth(4) - 1, this.shipCol + 1);
    else if (keycode === KEY_SPACE) {
      if (!this.playerBullet) this.playerBullet = { cx: keyCx(4, this.shipCol), row: 3 };
    }
  }

  step(): void {
    this.pulse += 0.3;
    if (this.difficulty === 0) return; // waiting on difficulty menu
    if (this.gameOverAnim > 0) {
      this.gameOverAnim--;
      if (this.gameOverAnim === 0) { this.lives = 3; this.score = 0; this.wave = 0; this.spawnWave(); }
      return;
    }
    if (this.deathAnim > 0) {
      this.deathAnim--;
      if (this.deathAnim === 0) {
        if (this.lives > 0) { this.playerBullet = null; this.alienBullets = []; this.shipCol = Math.floor(rowWidth(4) / 2); }
        else this.gameOverAnim = 48;
      }
      return;
    }
    if (this.clearAnim > 0) {
      this.clearAnim--;
      if (this.clearAnim === 0) { this.wave = (this.wave + 1) % this.WAVES.length; this.spawnWave(); }
      return;
    }

    this.bulletTick++;
    if (this.bulletTick >= this.bulletTicks()) {
      this.bulletTick = 0;
      if (this.playerBullet) {
        this.playerBullet.row--;
        if (this.playerBullet.row < 0) this.playerBullet = null;
        else {
          const bc = colNearestCx(this.playerBullet.row, this.playerBullet.cx);
          for (const a of this.aliens) {
            if (a.alive && a.row === this.playerBullet.row && a.col === bc) {
              a.alive = false; this.playerBullet = null; this.score += 10; break;
            }
          }
        }
      }
      const surv: Array<{ cx: number; row: number }> = [];
      for (const b of this.alienBullets) {
        b.row++;
        if (b.row > 4) continue;
        if (b.row === 4 && colNearestCx(4, b.cx) === this.shipCol) {
          this.lives--; this.deathAnim = 24; this.alienBullets = []; this.playerBullet = null;
          log.info({ score: this.score, lives: this.lives }, 'invaders: hit');
          return;
        }
        surv.push(b);
      }
      this.alienBullets = surv;
    }

    this.tick++;
    if (this.tick >= this.marchTicks()) {
      this.tick = 0;
      const alive = this.aliens.filter((a) => a.alive);
      if (alive.length === 0) {
        this.clearAnim = 30; this.score += 200 * (this.wave + 1);
        log.info({ score: this.score, wave: this.wave + 1 }, 'invaders: wave clear');
        return;
      }
      let minC = Infinity, maxC = -Infinity;
      for (const a of alive) { if (a.col < minC) minC = a.col; if (a.col > maxC) maxC = a.col; }
      const right = this.dir === 1;
      const overflow = right ? maxC + 1 >= 13 : minC - 1 < 0;
      if (overflow) {
        // Reverse on every edge hit, but only DROP a row every Nth bounce so
        // the descent is gentle (few rows on this keyboard).
        this.dir = right ? -1 : 1;
        this.bounces++;
        if (this.bounces >= this.dropEvery()) {
          this.bounces = 0;
          for (const a of this.aliens) if (a.alive) a.row++;
          for (const a of this.aliens) if (a.alive && a.row >= 4) {
            this.lives = 0; this.gameOverAnim = 48;
            log.info({ score: this.score }, 'invaders: landed');
            return;
          }
        }
      } else {
        for (const a of this.aliens) if (a.alive) a.col += this.dir;
      }
    }

    const fr = this.fireRate();
    const colsBusy = new Set(this.alienBullets.map((b) => Math.round(b.cx)));
    for (const a of this.aliens) {
      if (!a.alive) continue;
      if (Math.random() < fr) {
        let low = a;
        for (const o of this.aliens) if (o.alive && o.col === a.col && o.row > low.row) low = o;
        const cx = keyCx(low.row, low.col);
        const key = Math.round(cx);
        if (!colsBusy.has(key)) { this.alienBullets.push({ cx, row: low.row + 1 }); colsBusy.add(key); }
      }
    }
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    const ALIEN = this.color('alien', { r: 0, g: 255, b: 90 });
    const SHIP = this.color('ship', { r: 90, g: 200, b: 255 });
    const PB = this.color('player-bullet', { r: 255, g: 255, b: 255 });
    const AB = this.color('alien-bullet', { r: 255, g: 70, b: 20 });

    if (this.gameOverAnim > 0) {
      const i = this.gameOverAnim % 8 < 4 ? 1 : 0.3;
      for (let r = 0; r < ROW_COUNT; r++) for (let c = 0; c < rowWidth(r); c++) { const led = keyLed(r, c); if (led !== null) out.set(led, { r: Math.round(200 * i), g: 0, b: 0 }); }
      return out;
    }
    if (this.clearAnim > 0) {
      const i = this.clearAnim % 6 < 3 ? 1 : 0.3;
      for (let r = 0; r < ROW_COUNT; r++) for (let c = 0; c < rowWidth(r); c++) { const led = keyLed(r, c); if (led !== null) out.set(led, { r: 0, g: Math.round(180 * i), b: Math.round(80 * i) }); }
      const next = ((this.wave + 1) % this.WAVES.length) + 1;
      for (let k = 0; k < next; k++) { const led = keyLed(0, k); if (led !== null) out.set(led, { r: 255, g: 255, b: 0 }); }
      return out;
    }

    for (const a of this.aliens) { if (!a.alive) continue; const led = keyLed(a.row, a.col); if (led !== null) out.set(led, ALIEN); }
    if (this.playerBullet) { const c = colNearestCx(this.playerBullet.row, this.playerBullet.cx); const led = keyLed(this.playerBullet.row, c); if (led !== null) out.set(led, PB); }
    for (const b of this.alienBullets) { if (b.row < 0 || b.row > 4) continue; const c = colNearestCx(b.row, b.cx); const led = keyLed(b.row, c); if (led !== null) out.set(led, AB); }
    const shipLed = keyLed(4, this.shipCol);
    if (shipLed !== null) {
      const fl = this.deathAnim > 0 && this.deathAnim % 4 < 2;
      const b = 0.75 + 0.25 * Math.abs(Math.sin(this.pulse * 0.5));
      out.set(shipLed, fl ? { r: 255, g: 80, b: 0 } : { r: Math.round(SHIP.r * b), g: Math.round(SHIP.g * b), b: Math.round(SHIP.b * b) });
    }
    for (let i = 0; i < this.lives; i++) { const led = keyLed(0, i); if (led !== null && !out.has(led)) out.set(led, { r: 70, g: 70, b: 70 }); }
    return out;
  }
}

// ─── Super Mario (key-matrix hopper) ─────────────────────────────────────────

/**
 * Single-screen platformer on the physical key matrix. The floor is the
 * bottom row (8 keys); a level marks some floor keys as pits (rendered as
 * a dim-red gap so they're clearly visible) and adds platform tiles on the
 * rows above. Mario walks on row-3 lanes above the floor; his support is
 * the floor/platform key directly under his physical x. A/D walk, Space
 * jumps (hold for a higher arc). Stomp goombas, grab coins, reach the
 * green flag. 2 levels, 3 lives. Mario pulses bright so you can find him.
 *
 * Palette slots: mario, ground, platform, coin, goomba, flag.
 */
export class MarioEngine {
  private readonly LEVELS: ReadonlyArray<{
    pits: ReadonlyArray<number>;
    platforms: ReadonlyArray<readonly [number, number]>;
    coins: ReadonlyArray<readonly [number, number]>;
    goombas: ReadonlyArray<number>;
    flagLane: number;
  }> = [
    {
      pits: [],
      platforms: [[2, 5], [2, 6], [1, 9]],
      coins: [[3, 2], [2, 5], [1, 9], [3, 8]],
      goombas: [6],
      flagLane: 11,
    },
    {
      pits: [5],
      platforms: [[2, 3], [2, 4], [2, 8], [1, 6]],
      coins: [[3, 1], [2, 3], [1, 6], [2, 8], [3, 10]],
      goombas: [4, 9],
      flagLane: 11,
    },
  ];

  private level = 0;
  private mcol = 0;
  private my = 3;
  private vy = 0;
  private facing: -1 | 1 = 1;
  private aHeld = false;
  private dHeld = false;
  private jumpHeld = false;
  private jumpReleased = true;
  private jumpBoost = 0;
  private lives = 3;
  private coins = 0;
  private score = 0;
  private deathAnim = 0;
  private clearAnim = 0;
  private gameOverAnim = 0;
  private pulse = 0;
  private difficulty = 0;   // 0 = difficulty menu; 1..5 once chosen

  private solids = new Set<string>();
  private liveCoins = new Set<string>();
  private goombas: Array<{ lane: number; dir: -1 | 1 }> = [];

  private tick = 0;
  private stepTicks = 2;
  private goombaTick = 0;
  private goombaTicks = 7;   // ticks per goomba step; lower = faster (set by difficulty)
  private overrides: Record<string, string> = {};

  private readonly JUMP_VY = -0.9;
  private readonly GRAVITY = 0.30;
  private readonly MAX_FALL = 1.2;
  private readonly BOOST = -0.12;
  private readonly BOOST_TICKS = 5;

  constructor() { this.loadLevel(); }
  setColorOverrides(o: Record<string, string>): void { this.overrides = o ?? {}; }
  private color(slot: string, fb: Color): Color { const h = this.overrides[slot]; return h ? parseHex(h) : fb; }
  setAnimSpeed(s: number): void { const c = Math.max(0, Math.min(1, s)); this.stepTicks = Math.max(1, Math.round(4 - c * 3)); }

  private loadLevel(): void {
    const L = this.LEVELS[this.level]!;
    this.solids.clear();
    for (let c = 0; c < rowWidth(4); c++) if (!L.pits.includes(c)) this.solids.add(`4,${c}`);
    for (const [r, c] of L.platforms) this.solids.add(`${r},${c}`);
    this.liveCoins = new Set(L.coins.map(([r, c]) => `${r},${c}`));
    this.goombas = L.goombas.map((lane) => ({ lane, dir: -1 as -1 }));
    this.mcol = 0;
    this.my = 3;
    this.vy = 0;
    this.facing = 1;
    this.jumpBoost = 0;
  }

  private marioCx(): number { return keyCx(3, this.mcol); }

  private solidAtRow(row: number, cx: number): boolean {
    if (row < 0 || row >= ROW_COUNT) return false;
    return this.solids.has(`${row},${colNearestCx(row, cx)}`);
  }

  private isOnGround(): boolean {
    return this.vy === 0 && this.solidAtRow(Math.round(this.my) + 1, this.marioCx());
  }

  /** Difficulty 1..5 → goomba speed (slow on easy, brisk on hard). */
  private applyDifficulty(): void {
    this.goombaTicks = Math.max(3, 11 - this.difficulty * 1.5) | 0;
  }

  handleKey(keycode: number, value: number): void {
    const pressed = value === 1;
    if (this.difficulty === 0) {
      if (!pressed) return;
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.applyDifficulty(); this.lives = 3; this.score = 0; this.coins = 0; this.level = 0; this.loadLevel(); }
      return;
    }
    if (this.deathAnim > 0 || this.clearAnim > 0 || this.gameOverAnim > 0) return;
    if (keycode === KEY_A) this.aHeld = pressed;
    else if (keycode === KEY_D) this.dHeld = pressed;
    else if (keycode === KEY_SPACE) {
      this.jumpHeld = pressed;
      if (pressed && this.jumpReleased && this.isOnGround()) {
        this.vy = this.JUMP_VY; this.jumpBoost = this.BOOST_TICKS; this.jumpReleased = false;
      }
      if (!pressed) this.jumpReleased = true;
    }
  }

  step(): void {
    this.pulse += 0.3;
    if (this.difficulty === 0) return; // waiting on difficulty menu
    if (this.gameOverAnim > 0) { this.gameOverAnim--; if (this.gameOverAnim === 0) { this.lives = 3; this.score = 0; this.coins = 0; this.level = 0; this.loadLevel(); } return; }
    if (this.clearAnim > 0) { this.clearAnim--; if (this.clearAnim === 0) { this.level = (this.level + 1) % this.LEVELS.length; this.loadLevel(); } return; }
    if (this.deathAnim > 0) { this.deathAnim--; if (this.deathAnim === 0) { if (this.lives > 0) this.loadLevel(); else this.gameOverAnim = 48; } return; }

    this.tick++;
    if (this.tick < this.stepTicks) return;
    this.tick = 0;

    if (this.aHeld && !this.dHeld) { this.mcol = Math.max(0, this.mcol - 1); this.facing = -1; }
    else if (this.dHeld && !this.aHeld) { this.mcol = Math.min(rowWidth(3) - 1, this.mcol + 1); this.facing = 1; }

    if (this.jumpHeld && this.jumpBoost > 0 && this.vy < 0) { this.vy += this.BOOST; this.jumpBoost--; }
    else this.jumpBoost = 0;

    this.vy = Math.min(this.MAX_FALL, this.vy + this.GRAVITY);
    const cx = this.marioCx();
    const newY = this.my + this.vy;
    if (this.vy > 0) {
      const target = Math.floor(newY);
      let landed: number | null = null;
      for (let r = Math.floor(this.my) + 1; r <= target + 1; r++) {
        if (this.solidAtRow(r, cx)) { landed = r - 1; break; }
      }
      if (landed !== null) { this.my = landed; this.vy = 0; }
      else this.my = newY;
      if (this.my > 4) { this.die(); return; }
    } else {
      this.my = Math.max(0, newY);
    }

    const mr = Math.round(this.my);
    const mc = colNearestCx(mr, cx);
    const ck = `${mr},${mc}`;
    if (this.liveCoins.has(ck)) { this.liveCoins.delete(ck); this.coins++; this.score += 50; }

    this.goombaTick++;
    if (this.goombaTick >= this.goombaTicks) {
      this.goombaTick = 0;
      for (const g of this.goombas) {
        const nl = g.lane + g.dir;
        const ncx = keyCx(3, Math.max(0, Math.min(rowWidth(3) - 1, nl)));
        if (nl < 0 || nl >= rowWidth(3) || !this.solidAtRow(4, ncx)) g.dir = (g.dir === -1 ? 1 : -1);
        else g.lane = nl;
      }
    }

    for (let i = 0; i < this.goombas.length; i++) {
      const g = this.goombas[i]!;
      if (g.lane === this.mcol && mr >= 3) {
        if (this.vy > 0.3 || Math.round(this.my) < 3) { this.goombas.splice(i, 1); this.vy = this.JUMP_VY * 0.6; this.score += 100; break; }
        else { this.die(); return; }
      }
    }

    if (this.mcol >= this.LEVELS[this.level]!.flagLane && this.isOnGround()) {
      this.score += 500; this.clearAnim = 32;
      log.info({ level: this.level + 1, score: this.score, coins: this.coins }, 'mario: level clear');
    }
  }

  private die(): void { this.lives--; this.deathAnim = 28; log.info({ lives: this.lives }, 'mario: died'); }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    const MARIO = this.color('mario', { r: 255, g: 40, b: 0 });
    const GROUND = this.color('ground', { r: 150, g: 70, b: 12 });
    const PLAT = this.color('platform', { r: 120, g: 90, b: 45 });
    const COIN = this.color('coin', { r: 255, g: 220, b: 0 });
    const GOOMBA = this.color('goomba', { r: 180, g: 90, b: 0 });
    const FLAG = this.color('flag', { r: 0, g: 255, b: 60 });

    if (this.gameOverAnim > 0) {
      const i = this.gameOverAnim % 8 < 4 ? 1 : 0.3;
      for (let r = 0; r < ROW_COUNT; r++) for (let c = 0; c < rowWidth(r); c++) { const led = keyLed(r, c); if (led !== null) out.set(led, { r: Math.round(200 * i), g: 0, b: 0 }); }
      return out;
    }
    if (this.clearAnim > 0) {
      const i = this.clearAnim % 6 < 3 ? 1 : 0.3;
      for (let r = 0; r < ROW_COUNT; r++) for (let c = 0; c < rowWidth(r); c++) { const led = keyLed(r, c); if (led !== null) out.set(led, { r: Math.round(120 * i), g: Math.round(220 * i), b: 0 }); }
      const next = ((this.level + 1) % this.LEVELS.length) + 1;
      for (let k = 0; k < next; k++) { const led = keyLed(0, k); if (led !== null) out.set(led, { r: 255, g: 255, b: 255 }); }
      return out;
    }

    for (const k of this.solids) {
      const parts = k.split(','); const r = Number(parts[0]); const c = Number(parts[1]);
      const led = keyLed(r, c); if (led !== null) out.set(led, r === 4 ? GROUND : PLAT);
    }
    const L = this.LEVELS[this.level]!;
    for (const c of L.pits) { const led = keyLed(4, c); if (led !== null) out.set(led, { r: 25, g: 0, b: 0 }); }
    const pp = 0.6 + 0.4 * Math.sin(this.pulse * 0.5);
    for (const k of this.liveCoins) {
      const parts = k.split(','); const r = Number(parts[0]); const c = Number(parts[1]);
      const led = keyLed(r, c); if (led !== null) out.set(led, { r: Math.round(COIN.r * pp), g: Math.round(COIN.g * pp), b: Math.round(COIN.b * pp) });
    }
    const flagCx = keyCx(3, L.flagLane);
    for (let r = 0; r < ROW_COUNT; r++) { const c = colNearestCx(r, flagCx); const led = keyLed(r, c); if (led !== null && !out.has(led)) out.set(led, FLAG); }
    for (const g of this.goombas) { const led = keyLed(3, g.lane); if (led !== null) out.set(led, GOOMBA); }
    const mr = Math.round(this.my);
    const mc = colNearestCx(mr, this.marioCx());
    const led = keyLed(mr, mc);
    if (led !== null) {
      const fl = this.deathAnim > 0 && this.deathAnim % 4 < 2;
      const b = 0.75 + 0.25 * Math.abs(Math.sin(this.pulse * 0.5));
      out.set(led, fl ? { r: 255, g: 255, b: 0 } : { r: Math.round(MARIO.r * b), g: Math.round(MARIO.g * b), b: Math.round(MARIO.b * b) });
    }
    return out;
  }
}

// ─── Genius / Simon (whole-keyboard memory game) ─────────────────────────────

/**
 * Genius (the Brazilian "Simon"): the whole keyboard is dark, then a growing
 * random sequence FLASHES across it — any key can light up. The player
 * repeats the sequence by pressing those exact keys from memory. Each key
 * has its own hue so colour + position both help. One correct full repeat
 * grows the sequence by one.
 *
 * Difficulty 1-5 (chosen at start) sets the playback speed. A wrong press
 * flashes the board red and restarts; the score is the longest sequence
 * reached. Everything stays OFF except the key currently flashing.
 */
export class GeniusEngine {
  private difficulty = 0;
  // Every physical key with a usable keycode is a potential pad.
  private pads: Array<{ led: number; keycode: number; color: Color }> = [];
  private keyToPad = new Map<number, number>();

  private sequence: number[] = [];
  private mode: 'show' | 'input' | 'fail' | 'levelup' = 'show';
  private showIndex = 0;
  private showTimer = 0;
  private showOn = false;
  private inputIndex = 0;
  private flashPad = -1;
  private flashTimer = 0;
  private failTimer = 0;
  private levelupTimer = 0;
  private score = 0;
  private pulse = 0;
  private overrides: Record<string, string> = {};

  constructor() { this.buildPads(); }

  setColorOverrides(o: Record<string, string>): void { this.overrides = o ?? {}; }
  setAnimSpeed(s: number): void { void s; }

  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }
  private onTicks(): number { return Math.max(9, 30 - this.diff * 3); }
  private gapTicks(): number { return Math.max(5, (this.onTicks() / 2) | 0); }

  private hsv(h: number): Color {
    const c = 1;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  /** Every key on the board (that emits an evdev event) becomes a pad, with
   *  a rainbow hue by its LED position so each flash has its own colour. */
  private buildPads(): void {
    this.pads = [];
    this.keyToPad.clear();
    const total = K617_LAYOUT.keys.length;
    for (const k of K617_LAYOUT.keys) {
      const keycode = KEYCODE_BY_NAME[k.name];
      if (keycode === undefined) continue; // e.g. Fn — no evdev event
      const idx = this.pads.length;
      this.pads.push({ led: k.ledIndex, keycode, color: this.hsv((k.ledIndex / total) * 360) });
      this.keyToPad.set(keycode, idx);
    }
  }

  private randPad(): number { return Math.floor(Math.random() * this.pads.length); }

  private startGame(): void {
    this.sequence = [this.randPad()];
    this.score = 0;
    this.inputIndex = 0;
    this.beginShow();
  }
  private beginShow(): void {
    this.mode = 'show';
    this.showIndex = 0;
    this.showOn = true;
    this.showTimer = this.onTicks();
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.startGame(); }
      return;
    }
    if (this.mode !== 'input') return;
    const pad = this.keyToPad.get(keycode);
    if (pad === undefined) return; // a key with no LED/keycode — ignore
    this.flashPad = pad;
    this.flashTimer = 8;
    if (pad === this.sequence[this.inputIndex]) {
      this.inputIndex++;
      if (this.inputIndex >= this.sequence.length) {
        this.score = this.sequence.length;
        this.mode = 'levelup';
        this.levelupTimer = 24;
        log.info({ score: this.score }, 'genius: round clear');
      }
    } else {
      this.mode = 'fail';
      this.failTimer = 36;
      log.info({ score: this.score }, 'genius: wrong');
    }
  }

  step(): void {
    this.pulse += 0.3;
    if (this.difficulty === 0) return;
    if (this.flashTimer > 0) this.flashTimer--;

    if (this.mode === 'fail') {
      if (--this.failTimer <= 0) this.startGame();
      return;
    }
    if (this.mode === 'levelup') {
      if (--this.levelupTimer <= 0) {
        this.sequence.push(this.randPad());
        this.inputIndex = 0;
        this.beginShow();
      }
      return;
    }
    if (this.mode === 'show') {
      if (--this.showTimer <= 0) {
        if (this.showOn) {
          this.showOn = false;
          this.showTimer = this.gapTicks();
        } else {
          this.showIndex++;
          if (this.showIndex >= this.sequence.length) {
            this.mode = 'input';
            this.inputIndex = 0;
          } else {
            this.showOn = true;
            this.showTimer = this.onTicks();
          }
        }
      }
    }
    // 'input' is untimed — the player presses at their own pace.
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();

    // Whole-board flashes for the two end states.
    if (this.mode === 'fail') {
      const f = this.failTimer % 8 < 4 ? 1 : 0.15;
      for (const p of this.pads) out.set(p.led, { r: Math.round(230 * f), g: 0, b: 0 });
      return out;
    }
    if (this.mode === 'levelup') {
      const f = this.levelupTimer % 6 < 3 ? 1 : 0.25;
      for (const p of this.pads) out.set(p.led, { r: 0, g: Math.round(230 * f), b: 35 });
      return out;
    }

    // Otherwise everything is OFF except the single key flashing right now
    // (either the sequence playback, or the player's last press).
    let activePad = -1;
    if (this.mode === 'show' && this.showOn) activePad = this.sequence[this.showIndex]!;
    else if (this.flashTimer > 0) activePad = this.flashPad;

    if (activePad >= 0 && activePad < this.pads.length) {
      out.set(this.pads[activePad]!.led, this.pads[activePad]!.color);
    }
    return out;
  }
}

// ─── Ripple (reactive: keypress emits an expanding ring) ─────────────────────

/**
 * Each physical keypress spawns an expanding ring of light centred on that
 * key, coloured by the key's position hue. Rings grow at animSpeed and fade as
 * they widen, dropping once they pass the board's far corner. No menu, no
 * input gating — every key contributes. Rendered on the physical matrix so
 * the ring reads correctly across the ragged rows.
 */
export class RippleEngine {
  private ripples: Array<{ cx: number; row: number; age: number; color: Color }> = [];
  private ringSpeed = 0.8;            // units the ring radius grows per frame
  private readonly RING_WIDTH = 1.7;  // crest thickness in distance units
  private readonly MAX_RADIUS = 22;   // ~board diagonal; rings retire past this

  setAnimSpeed(s: number): void {
    const c = Math.max(0, Math.min(1, s));
    this.ringSpeed = 0.45 + c * 0.9;  // 0.45..1.35 units/frame
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    const cell = KEYCODE_TO_CELL.get(keycode);
    if (!cell) return;
    this.ripples.push({ cx: cell.cx, row: cell.row, age: 0, color: hsv((cell.led / 61) * 360) });
    if (this.ripples.length > 24) this.ripples.shift(); // bound memory under mashing
  }

  step(): void {
    for (const r of this.ripples) r.age++;
    this.ripples = this.ripples.filter((r) => r.age * this.ringSpeed <= this.MAX_RADIUS);
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    if (this.ripples.length === 0) return out;
    for (const row of KEY_MATRIX) {
      for (const cell of row) {
        let best: Color | null = null;
        let bestB = 0;
        for (const rp of this.ripples) {
          const radius = rp.age * this.ringSpeed;
          const d = Math.sqrt(cellDist2(cell.row, cell.cx, rp.row, rp.cx));
          const ring = Math.abs(d - radius);
          if (ring > this.RING_WIDTH) continue;
          const edge = 1 - ring / this.RING_WIDTH;             // 1 at the ring crest
          const fade = Math.max(0, 1 - radius / this.MAX_RADIUS); // dims as it widens
          const b = edge * fade;
          if (b > bestB) { bestB = b; best = rp.color; }
        }
        if (best) {
          out.set(cell.led, {
            r: Math.round(best.r * bestB),
            g: Math.round(best.g * bestB),
            b: Math.round(best.b * bestB),
          });
        }
      }
    }
    return out;
  }
}

// ─── Spark (reactive: pressed key glows hot then cools like an ember) ────────

/**
 * Typing trail. A pressed key flashes white-hot and then cools through the
 * fire palette (orange → red → off) over the next frames, with a small bloom
 * to its matrix neighbours so each stroke feels like a spark. animSpeed sets
 * the cool-down rate (faster = shorter trails). No menu.
 */
export class SparkEngine {
  private heat = new Map<number, number>();
  private decay = 0.90;

  setAnimSpeed(s: number): void {
    const c = Math.max(0, Math.min(1, s));
    this.decay = 0.96 - c * 0.12; // 0.96 (long trails) .. 0.84 (snappy)
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    const cell = KEYCODE_TO_CELL.get(keycode);
    if (!cell) return;
    this.heat.set(cell.led, 1);
    const neighbours = [
      keyLed(cell.row, cell.col - 1),
      keyLed(cell.row, cell.col + 1),
      keyLed(cell.row - 1, vNeighbor(cell.row, cell.col, cell.row - 1)),
      keyLed(cell.row + 1, vNeighbor(cell.row, cell.col, cell.row + 1)),
    ];
    for (const led of neighbours) {
      if (led === null) continue;
      this.heat.set(led, Math.max(this.heat.get(led) ?? 0, 0.45));
    }
  }

  step(): void {
    for (const [led, h] of this.heat) {
      const nh = h * this.decay;
      if (nh < 0.02) this.heat.delete(led);
      else this.heat.set(led, nh);
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    for (const [led, h] of this.heat) out.set(led, firePalette(h));
    return out;
  }
}

// ─── Binary clock (BCD) ──────────────────────────────────────────────────────

/**
 * Wall-clock time as six binary-coded-decimal columns: H-tens, H-ones,
 * M-tens, M-ones, S-tens, S-ones. Each field is a vertical stack of up to 4
 * bits (bit0 at the bottom row, bit3 near the top) at a fixed physical x, so
 * the columns line up across the ragged rows. Hours are red, minutes green,
 * seconds azure; set bits are bright, clear bits dim. No input — `now` is
 * injectable for deterministic tests.
 */
export class BinaryClockEngine {
  private readonly now: () => number;
  private readonly FIELD_CX = [1, 3.4, 5.8, 8.2, 10.6, 13];     // spread across the board
  private readonly FIELD_HUE = [0, 0, 120, 120, 210, 210];      // H,H · M,M · S,S
  // bit0..bit3 → rows 3,2,1,0 (LSB low, MSB high). We deliberately skip the
  // 8-key bottom row (row 4): it can't host 6 distinct columns, so two fields'
  // bit0 would collide on the spacebar. Rows 0-3 all have ≥12 keys, so every
  // field fans out to its own readable column on every bit.
  private readonly BIT_ROWS = [3, 2, 1, 0];

  constructor(nowFn: () => number = Date.now) { this.now = nowFn; }

  setAnimSpeed(_s: number): void { /* runs in real time */ }
  handleKey(_keycode: number, _value: number): void { /* no input */ }
  step(): void { /* time is sampled live in render */ }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const d = new Date(this.now());
    const digits = [
      Math.floor(d.getHours() / 10), d.getHours() % 10,
      Math.floor(d.getMinutes() / 10), d.getMinutes() % 10,
      Math.floor(d.getSeconds() / 10), d.getSeconds() % 10,
    ];
    for (let f = 0; f < 6; f++) {
      const base = hsv(this.FIELD_HUE[f]!);
      const value = digits[f]!;
      for (let bit = 0; bit < 4; bit++) {
        const row = this.BIT_ROWS[bit]!;
        const col = colNearestCx(row, this.FIELD_CX[f]!);
        const led = keyLed(row, col);
        if (led === null) continue;
        const on = ((value >> bit) & 1) === 1;
        out.set(led, on
          ? base
          : { r: Math.round(base.r * 0.06), g: Math.round(base.g * 0.06), b: Math.round(base.b * 0.06) });
      }
    }
    return out;
  }
}

// ─── Doom PSX fire ───────────────────────────────────────────────────────────

/**
 * The classic Doom fire algorithm on the physical matrix. The bottom row is
 * permanently seeded at max heat; every frame each cell inherits the heat of
 * the cell physically below it minus a random decay, with a slight sideways
 * drift, so flames flicker upward and cool to dark near the top. Heat maps to
 * the shared fire palette (white → yellow → orange → red → dark). animSpeed
 * controls the decay (taller, hungrier flames). No input.
 */
export class DoomFireEngine {
  private heat: number[][] = [];
  private decayMax = 0.28;

  constructor() {
    for (let r = 0; r < ROW_COUNT; r++) this.heat.push(new Array(rowWidth(r)).fill(0));
    this.seedBottom();
  }

  setAnimSpeed(s: number): void {
    const c = Math.max(0, Math.min(1, s));
    this.decayMax = 0.18 + c * 0.22; // 0.18..0.40
  }

  private seedBottom(): void {
    const bottom = ROW_COUNT - 1;
    this.heat[bottom] = new Array(rowWidth(bottom)).fill(1);
  }

  handleKey(_keycode: number, _value: number): void { /* no input */ }

  step(): void {
    this.seedBottom();
    for (let r = 0; r < ROW_COUNT - 1; r++) {
      const below = r + 1;
      const w = rowWidth(r);
      const next = new Array<number>(w).fill(0);
      for (let c = 0; c < w; c++) {
        const decay = Math.random() * this.decayMax;
        let v = (this.heat[below]![vNeighbor(r, c, below)] ?? 0) - decay;
        if (Math.random() < 0.3) {
          const nc = Math.max(0, Math.min(w - 1, c + (Math.random() < 0.5 ? -1 : 1)));
          v = Math.max(v, (this.heat[below]![vNeighbor(r, nc, below)] ?? 0) - decay - 0.05);
        }
        next[c] = Math.max(0, v);
      }
      this.heat[r] = next;
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    for (let r = 0; r < ROW_COUNT; r++) {
      for (let c = 0; c < rowWidth(r); c++) {
        const led = keyLed(r, c);
        if (led !== null) out.set(led, firePalette(this.heat[r]![c] ?? 0));
      }
    }
    return out;
  }
}

// ─── Whac-A-Mole (reflex) ────────────────────────────────────────────────────

/**
 * Random keys light up as "moles"; press the exact key before it vanishes to
 * score. A mole that times out is a miss; three misses ends the round. The
 * difficulty 1-5 (chosen at start) raises the spawn rate and shortens how long
 * each mole stays up. Hits flash green, misses flash red, on an otherwise dark
 * board; lives remaining show on the top-left keys.
 */
export class WhacAMoleEngine {
  private difficulty = 0;
  private moles: Array<{ led: number; keycode: number; ttl: number; hue: number }> = [];
  private readonly spawnable: Array<{ led: number; keycode: number }> = [];
  private score = 0;
  private misses = 0;
  private readonly MAX_MISSES = 3;
  private spawnTick = 0;
  private hitFlash = new Map<number, number>();
  private missFlash = new Map<number, number>();
  private gameOverAnim = 0;
  private pulse = 0;

  constructor() {
    for (const [keycode, cell] of KEYCODE_TO_CELL) this.spawnable.push({ led: cell.led, keycode });
  }

  setAnimSpeed(_s: number): void { /* pace comes from difficulty */ }
  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }
  private spawnInterval(): number { return Math.max(7, 38 - this.diff * 6); }
  private moleTtl(): number { return Math.max(18, 70 - this.diff * 9); }
  private maxMoles(): number { return Math.min(5, 1 + Math.floor(this.diff / 2)); }

  /** Active mole keycodes + score — exposed for the headless reflex bot. */
  inspect(): { moleKeycodes: number[]; score: number; misses: number } {
    return { moleKeycodes: this.moles.map((m) => m.keycode), score: this.score, misses: this.misses };
  }

  private startRound(): void {
    this.moles = []; this.score = 0; this.misses = 0; this.spawnTick = 0;
    this.hitFlash.clear(); this.missFlash.clear(); this.gameOverAnim = 0;
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.startRound(); }
      return;
    }
    if (this.gameOverAnim > 0) return;
    const idx = this.moles.findIndex((m) => m.keycode === keycode);
    if (idx >= 0) {
      const m = this.moles[idx]!;
      this.score++;
      this.hitFlash.set(m.led, 8);
      this.moles.splice(idx, 1);
    }
  }

  private decayFlash(map: Map<number, number>): void {
    for (const [led, f] of map) { if (f <= 1) map.delete(led); else map.set(led, f - 1); }
  }

  step(): void {
    this.pulse += 0.3;
    this.decayFlash(this.hitFlash);
    this.decayFlash(this.missFlash);
    if (this.difficulty === 0) return;
    if (this.gameOverAnim > 0) { this.gameOverAnim--; if (this.gameOverAnim === 0) this.startRound(); return; }

    const survivors: typeof this.moles = [];
    for (const m of this.moles) {
      m.ttl--;
      if (m.ttl > 0) survivors.push(m);
      else { this.missFlash.set(m.led, 10); this.misses++; }
    }
    this.moles = survivors;
    if (this.misses >= this.MAX_MISSES) {
      this.gameOverAnim = 48;
      log.info({ score: this.score }, 'whac-a-mole: game over');
      return;
    }
    this.spawnTick++;
    if (this.spawnTick >= this.spawnInterval() && this.moles.length < this.maxMoles()) {
      this.spawnTick = 0;
      this.spawnMole();
    }
  }

  private spawnMole(): void {
    for (let i = 0; i < 40; i++) {
      const c = this.spawnable[Math.floor(Math.random() * this.spawnable.length)]!;
      if (this.moles.some((m) => m.led === c.led)) continue;
      if (this.hitFlash.has(c.led) || this.missFlash.has(c.led)) continue;
      this.moles.push({ led: c.led, keycode: c.keycode, ttl: this.moleTtl(), hue: Math.random() * 360 });
      return;
    }
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    if (this.gameOverAnim > 0) {
      const i = this.gameOverAnim % 8 < 4 ? 1 : 0.25;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: Math.round(200 * i), g: 0, b: 0 });
      return out;
    }
    for (const m of this.moles) {
      const blink = m.ttl < 12 && m.ttl % 4 < 2; // about to vanish
      out.set(m.led, blink ? { r: 60, g: 50, b: 0 } : hsv(m.hue));
    }
    for (const [led, f] of this.hitFlash) out.set(led, { r: 0, g: Math.round(255 * Math.min(1, f / 8)), b: 40 });
    for (const [led, f] of this.missFlash) out.set(led, { r: Math.round(255 * Math.min(1, f / 10)), g: 0, b: 0 });
    const lives = this.MAX_MISSES - this.misses;
    for (let i = 0; i < lives; i++) {
      const led = keyLed(0, i);
      if (led !== null && !out.has(led)) out.set(led, { r: 40, g: 40, b: 40 });
    }
    return out;
  }
}

// ─── Bullet-hell (dodge) ─────────────────────────────────────────────────────

/**
 * You are one bright pulsing key; projectiles stream in from the edges and you
 * dodge with WASD (up/down hop to the visually-aligned key on the next row).
 * Touching a bullet's cell is death (brief flash, then respawn). Score is how
 * long you survive. Difficulty 1-5 scales bullet speed, spawn rate and how
 * many fly at once; from level 3 some shots are aimed at you.
 */
export class BulletHellEngine {
  private difficulty = 0;
  private player = { row: 2, col: 0 };
  private bullets: Array<{ cx: number; rowF: number; vx: number; vy: number }> = [];
  private survival = 0;
  private spawnTick = 0;
  private deathAnim = 0;
  private pulse = 0;

  setAnimSpeed(_s: number): void { /* pace comes from difficulty */ }
  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }
  private bulletSpeed(): number { return 0.16 + this.diff * 0.06; }
  private spawnInterval(): number { return Math.max(5, 30 - this.diff * 4); }
  private maxBullets(): number { return 2 + this.diff * 2; }

  /** Player + bullet cells (current and one-step-ahead) + alive flag —
   *  exposed for the headless dodge bot. The next-cell mirrors how step()
   *  advances + checkHit() rounds, so a bot can dodge with 1-frame lookahead. */
  inspect(): {
    player: { row: number; col: number };
    bullets: Array<{ row: number; col: number; nextRow: number; nextCol: number }>;
    alive: boolean;
  } {
    const bullets: Array<{ row: number; col: number; nextRow: number; nextCol: number }> = [];
    for (const b of this.bullets) {
      const row = Math.round(b.rowF);
      const nextRow = Math.round(b.rowF + b.vy);
      const onBoard = row >= 0 && row < ROW_COUNT;
      const nextOnBoard = nextRow >= 0 && nextRow < ROW_COUNT;
      if (!onBoard && !nextOnBoard) continue;
      bullets.push({
        row: onBoard ? row : nextRow,
        col: onBoard ? colNearestCx(row, b.cx) : colNearestCx(nextRow, b.cx + b.vx),
        nextRow: nextOnBoard ? nextRow : row,
        nextCol: nextOnBoard ? colNearestCx(nextRow, b.cx + b.vx) : colNearestCx(row, b.cx),
      });
    }
    return { player: { ...this.player }, bullets, alive: this.deathAnim === 0 };
  }

  private respawn(): void {
    this.player = { row: 2, col: Math.floor(rowWidth(2) / 2) };
    this.bullets = [];
    this.survival = 0;
    this.spawnTick = 0;
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.respawn(); }
      return;
    }
    if (this.deathAnim > 0) return;
    const p = this.player;
    if (keycode === KEY_A) p.col = Math.max(0, p.col - 1);
    else if (keycode === KEY_D) p.col = Math.min(rowWidth(p.row) - 1, p.col + 1);
    else if (keycode === KEY_W && p.row > 0) { const nc = vNeighbor(p.row, p.col, p.row - 1); p.row -= 1; p.col = nc; }
    else if (keycode === KEY_S && p.row < ROW_COUNT - 1) { const nc = vNeighbor(p.row, p.col, p.row + 1); p.row += 1; p.col = nc; }
  }

  private spawnBullet(): void {
    const sp = this.bulletSpeed();
    const edge = Math.floor(Math.random() * 4);
    const aimed = this.diff >= 3 && Math.random() < 0.4;
    const pcx = keyCx(this.player.row, this.player.col);
    const prow = this.player.row;
    let cx = 0, rowF = 0, vx = 0, vy = 0;
    if (edge === 0)      { cx = -1; rowF = Math.random() * 4; vx = sp;  vy = aimed ? Math.sign(prow - rowF) * sp * 0.5 : 0; }
    else if (edge === 1) { cx = 15; rowF = Math.random() * 4; vx = -sp; vy = aimed ? Math.sign(prow - rowF) * sp * 0.5 : 0; }
    else if (edge === 2) { cx = Math.random() * 14; rowF = -1; vy = sp;  vx = aimed ? Math.sign(pcx - cx) * sp * 0.5 : 0; }
    else                 { cx = Math.random() * 14; rowF = 5;  vy = -sp; vx = aimed ? Math.sign(pcx - cx) * sp * 0.5 : 0; }
    this.bullets.push({ cx, rowF, vx, vy });
  }

  step(): void {
    this.pulse += 0.3;
    if (this.difficulty === 0) return;
    if (this.deathAnim > 0) { this.deathAnim--; if (this.deathAnim === 0) this.respawn(); return; }

    this.survival++;
    for (const b of this.bullets) { b.cx += b.vx; b.rowF += b.vy; }
    this.bullets = this.bullets.filter((b) => b.cx > -2 && b.cx < 17 && b.rowF > -2 && b.rowF < 6.5);

    if (this.checkHit()) { this.deathAnim = 30; log.info({ survived: this.survival }, 'bullet-hell: hit'); return; }

    this.spawnTick++;
    if (this.spawnTick >= this.spawnInterval() && this.bullets.length < this.maxBullets()) {
      this.spawnTick = 0;
      this.spawnBullet();
    }
  }

  private checkHit(): boolean {
    for (const b of this.bullets) {
      const row = Math.round(b.rowF);
      if (row < 0 || row >= ROW_COUNT) continue;
      if (row === this.player.row && colNearestCx(row, b.cx) === this.player.col) return true;
    }
    return false;
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    if (this.deathAnim > 0) {
      const i = this.deathAnim % 6 < 3 ? 1 : 0.2;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: Math.round(220 * i), g: 0, b: 0 });
      return out;
    }
    for (const b of this.bullets) {
      const row = Math.round(b.rowF);
      if (row < 0 || row >= ROW_COUNT) continue;
      const led = keyLed(row, colNearestCx(row, b.cx));
      if (led !== null) out.set(led, ORANGE);
    }
    const pled = keyLed(this.player.row, this.player.col);
    if (pled !== null) {
      const b = 0.6 + 0.4 * Math.abs(Math.sin(this.pulse * 0.6));
      out.set(pled, { r: 0, g: Math.round(220 * b), b: Math.round(255 * b) });
    }
    return out;
  }
}

// ─── Drag Race ("Shift-it") ──────────────────────────────────────────────────

/**
 * Tachometer drag racing. Hold Space to rev: the RPM bar fills across the top
 * row (green → yellow → red). Press Enter to upshift when you're in the sweet
 * zone (high revs, just before redline) — that banks a gear and drops the
 * revs. Let the needle hit redline without shifting and you blow the engine
 * (lose). Bank all the gears to finish (win). Difficulty 1-5 makes the revs
 * climb faster and narrows the shift window. A start-light countdown launches
 * each run.
 */
export class DragRaceEngine {
  private difficulty = 0;
  private mode: 'menu' | 'countdown' | 'race' | 'blown' | 'finish' = 'menu';
  private rpm = 0;
  private gear = 1;
  private readonly MAX_GEAR = 6;
  private spaceHeld = false;
  private countdown = 0;
  private animTimer = 0;
  private pulse = 0;

  setAnimSpeed(_s: number): void { /* pace comes from difficulty */ }
  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }
  private revRate(): number { return 0.012 + this.diff * 0.006; }
  private readonly DECAY = 0.02;
  private shiftLo(): number { return 0.62 + this.diff * 0.04; }

  /** Race mode/rpm/gear — exposed for the headless racing bot. */
  inspect(): { mode: string; rpm: number; gear: number } {
    return { mode: this.mode, rpm: this.rpm, gear: this.gear };
  }

  private startRun(): void {
    this.mode = 'countdown';
    this.countdown = 90; // ~3s of start lights
    this.rpm = 0;
    this.gear = 1;
    this.spaceHeld = false;
  }

  handleKey(keycode: number, value: number): void {
    if (this.difficulty === 0) {
      if (value !== 1) return;
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.startRun(); }
      return;
    }
    if (keycode === KEY_SPACE) { this.spaceHeld = value === 1; return; }
    if (keycode === KEY_ENTER && value === 1 && this.mode === 'race') this.shift();
  }

  private shift(): void {
    if (this.rpm >= this.shiftLo() && this.rpm < 1) {
      this.gear++;
      this.rpm = 0.32;
      if (this.gear > this.MAX_GEAR) { this.mode = 'finish'; this.animTimer = 60; log.info('drag-race: finished'); }
    } else {
      this.rpm = Math.max(0.1, this.rpm * 0.4); // bog down on a mistimed shift
    }
  }

  step(): void {
    this.pulse += 0.3;
    if (this.difficulty === 0) return;
    if (this.mode === 'countdown') { if (--this.countdown <= 0) this.mode = 'race'; return; }
    if (this.mode === 'blown' || this.mode === 'finish') { if (--this.animTimer <= 0) this.startRun(); return; }
    // race
    if (this.spaceHeld) this.rpm += this.revRate();
    else this.rpm = Math.max(0, this.rpm - this.DECAY);
    if (this.rpm >= 1) { this.mode = 'blown'; this.animTimer = 60; this.rpm = 1; log.info({ gear: this.gear }, 'drag-race: blown engine'); }
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    if (this.mode === 'blown') {
      const i = this.animTimer % 8 < 4 ? 1 : 0.25;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: Math.round(220 * i), g: 0, b: 0 });
      return out;
    }
    if (this.mode === 'finish') {
      const i = this.animTimer % 6 < 3 ? 1 : 0.3;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: 0, g: Math.round(220 * i), b: 40 });
      return out;
    }
    if (this.mode === 'countdown') {
      const go = this.countdown <= 15;
      const seq = Math.floor((90 - this.countdown) / 25); // 0..3 reds light up
      const mid = Math.floor(rowWidth(2) / 2) - 1;
      for (let i = 0; i < 3; i++) {
        const led = keyLed(2, mid + i);
        if (led === null) continue;
        out.set(led, go ? GREEN : i <= seq ? RED : { r: 40, g: 0, b: 0 });
      }
      return out;
    }
    // race — tachometer across row 0
    const w0 = rowWidth(0);
    const sweet = this.shiftLo();
    for (let c = 0; c < w0; c++) {
      const p = w0 === 1 ? 0 : c / (w0 - 1);
      const led = keyLed(0, c);
      if (led === null) continue;
      if (p <= this.rpm) out.set(led, p < 0.6 ? GREEN : p < 0.85 ? YELLOW : RED);
      else if (Math.abs(p - sweet) < 0.5 / w0) out.set(led, { r: 0, g: 55, b: 0 }); // sweet-zone hint
    }
    // gear-progress bar on row 4 (cyan)
    const w4 = rowWidth(4);
    const filled = Math.round((this.gear - 1) / this.MAX_GEAR * w4);
    for (let c = 0; c < filled && c < w4; c++) {
      const led = keyLed(4, c);
      if (led !== null) out.set(led, CYAN);
    }
    // current gear as N lit keys on row 2
    for (let i = 0; i < this.gear && i < rowWidth(2); i++) {
      const led = keyLed(2, i);
      if (led !== null && !out.has(led)) out.set(led, { r: 80, g: 80, b: 120 });
    }
    return out;
  }
}

// ─── Frogger ─────────────────────────────────────────────────────────────────

/**
 * Cross the traffic to the top. Row 4 (bottom) is the safe start, row 0 (top)
 * is the goal, rows 1-3 are lanes of cars sliding left/right at per-lane speed,
 * wrapping around. WASD moves the frog one key at a time (up/down hop to the
 * visually-aligned key on the next row via vNeighbor). A car on the frog's key
 * costs a life; reaching the top scores a crossing and starts a faster, denser
 * level. 3 lives, difficulty 1-5 scales car speed and density.
 */
export class FroggerEngine {
  private difficulty = 0;
  private frog = { row: 4, col: 0 };
  private lanes: Array<{ row: number; dir: -1 | 1; speed: number; cars: number[]; hue: number }> = [];
  private lives = 3;
  private score = 0;
  private level = 0;
  private deathAnim = 0;
  private winAnim = 0;
  private gameOverAnim = 0;
  private pulse = 0;
  private readonly LANE_ROWS = [1, 2, 3];
  private readonly LANE_HUES = [25, 50, 0]; // orange, amber, red

  setAnimSpeed(_s: number): void { /* pace comes from difficulty */ }
  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }

  /** Frog + car cells (current and one-step-ahead) — exposed for the bot. */
  inspect(): {
    frog: { row: number; col: number };
    cars: Array<{ row: number; col: number; nextCol: number }>;
    lives: number; score: number;
  } {
    const cars: Array<{ row: number; col: number; nextCol: number }> = [];
    for (const lane of this.lanes) {
      for (const cx of lane.cars) {
        cars.push({
          row: lane.row,
          col: colNearestCx(lane.row, cx),
          nextCol: colNearestCx(lane.row, this.wrap(cx + lane.dir * lane.speed)),
        });
      }
    }
    return { frog: { ...this.frog }, cars, lives: this.lives, score: this.score };
  }

  private wrap(cx: number): number {
    let x = cx % 16;
    if (x < 0) x += 16;
    return x;
  }

  private startGame(): void {
    this.lives = 3; this.score = 0; this.level = 0;
    this.buildLanes(); this.resetFrog();
    this.deathAnim = 0; this.winAnim = 0; this.gameOverAnim = 0;
  }

  private resetFrog(): void { this.frog = { row: 4, col: Math.floor(rowWidth(4) / 2) }; }

  private buildLanes(): void {
    const baseSpeed = 0.12 + this.diff * 0.03 + this.level * 0.02;
    const carsPer = Math.min(5, 2 + Math.floor(this.diff / 2) + Math.floor(this.level / 2));
    this.lanes = this.LANE_ROWS.map((row, i) => {
      const cars: number[] = [];
      for (let c = 0; c < carsPer; c++) cars.push((c * 16) / carsPer + Math.random() * 2);
      return {
        row, dir: (i % 2 === 0 ? 1 : -1) as -1 | 1,
        speed: baseSpeed * (0.85 + i * 0.18), cars, hue: this.LANE_HUES[i] ?? 25,
      };
    });
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.startGame(); }
      return;
    }
    if (this.deathAnim > 0 || this.winAnim > 0 || this.gameOverAnim > 0) return;
    const f = this.frog;
    if (keycode === KEY_W && f.row > 0) { const nc = vNeighbor(f.row, f.col, f.row - 1); f.row -= 1; f.col = nc; }
    else if (keycode === KEY_S && f.row < ROW_COUNT - 1) { const nc = vNeighbor(f.row, f.col, f.row + 1); f.row += 1; f.col = nc; }
    else if (keycode === KEY_A) f.col = Math.max(0, f.col - 1);
    else if (keycode === KEY_D) f.col = Math.min(rowWidth(f.row) - 1, f.col + 1);
    if (f.row === 0) {
      this.score++;
      this.winAnim = 24;
      log.info({ score: this.score, level: this.level + 1 }, 'frogger: crossed');
    } else if (this.carOnFrog()) {
      this.die();
    }
  }

  private carOnFrog(): boolean {
    const lane = this.lanes.find((l) => l.row === this.frog.row);
    if (!lane) return false;
    return lane.cars.some((cx) => colNearestCx(lane.row, cx) === this.frog.col);
  }

  private die(): void {
    this.lives--;
    if (this.lives <= 0) { this.gameOverAnim = 48; log.info({ score: this.score }, 'frogger: game over'); }
    else { this.deathAnim = 24; }
  }

  step(): void {
    this.pulse += 0.3;
    if (this.difficulty === 0) return;
    if (this.gameOverAnim > 0) { this.gameOverAnim--; if (this.gameOverAnim === 0) this.startGame(); return; }
    if (this.winAnim > 0) { this.winAnim--; if (this.winAnim === 0) { this.level++; this.buildLanes(); this.resetFrog(); } return; }
    if (this.deathAnim > 0) { this.deathAnim--; if (this.deathAnim === 0) this.resetFrog(); return; }

    for (const lane of this.lanes) {
      for (let i = 0; i < lane.cars.length; i++) lane.cars[i] = this.wrap(lane.cars[i]! + lane.dir * lane.speed);
    }
    if (this.carOnFrog()) this.die();
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    if (this.gameOverAnim > 0) {
      const i = this.gameOverAnim % 8 < 4 ? 1 : 0.25;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: Math.round(200 * i), g: 0, b: 0 });
      return out;
    }
    if (this.winAnim > 0) {
      const i = this.winAnim % 6 < 3 ? 1 : 0.3;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: 0, g: Math.round(220 * i), b: 40 });
      return out;
    }
    // Goal row dim gold.
    for (let c = 0; c < rowWidth(0); c++) { const led = keyLed(0, c); if (led !== null) out.set(led, { r: 40, g: 32, b: 0 }); }
    // Cars per lane.
    for (const lane of this.lanes) {
      for (const cx of lane.cars) {
        const led = keyLed(lane.row, colNearestCx(lane.row, cx));
        if (led !== null) out.set(led, hsv(lane.hue));
      }
    }
    // Lives as dim-green pips on the start row's left keys.
    for (let i = 0; i < this.lives && i < rowWidth(4); i++) {
      const led = keyLed(4, i);
      if (led !== null && !(i === this.frog.col && this.frog.row === 4)) out.set(led, { r: 0, g: 45, b: 8 });
    }
    // Frog: bright green pulse (drawn last so it's always visible). On a hit
    // it flashes red on the on-beat and goes dark on the off-beat.
    const fled = keyLed(this.frog.row, this.frog.col);
    if (fled !== null) {
      if (this.deathAnim > 0) {
        if (this.deathAnim % 4 < 2) out.set(fled, { r: 255, g: 0, b: 0 });
      } else {
        const b = 0.7 + 0.3 * Math.abs(Math.sin(this.pulse * 0.5));
        out.set(fled, { r: Math.round(40 * b), g: Math.round(255 * b), b: Math.round(40 * b) });
      }
    }
    return out;
  }
}

// ─── Physical Wordle ─────────────────────────────────────────────────────────

// Letter ↔ keycode ↔ LED maps for the Wordle board, derived from the layout.
const WORDLE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_BY_KEYCODE = new Map<number, string>();
const LED_BY_LETTER = new Map<string, number>();
for (const ch of WORDLE_LETTERS) {
  const kc = KEYCODE_BY_NAME[ch];
  const led = findKeyLed(ch);
  if (kc !== undefined) LETTER_BY_KEYCODE.set(kc, ch);
  if (led !== null) LED_BY_LETTER.set(ch, led);
}

// Answer pool (also the only thing that needs to be a "real" word — guesses
// are accepted freely so a screenless player isn't silently rejected).
const WORDLE_WORDS = [
  'APPLE', 'BRAVE', 'CRANE', 'DRIVE', 'EAGLE', 'FLAME', 'GRAPE', 'HOUSE',
  'IVORY', 'JOLLY', 'KNIFE', 'LEMON', 'MONEY', 'NOBLE', 'OCEAN', 'PIANO',
  'QUERY', 'RIVER', 'STONE', 'TIGER', 'ULTRA', 'VIVID', 'WHALE', 'YACHT',
  'ZEBRA', 'BREAD', 'CHAIR', 'DANCE', 'EARTH', 'FAITH', 'GHOST', 'HEART',
  'INPUT', 'JUICE', 'LIGHT', 'MAGIC', 'NIGHT', 'OPERA', 'PEARL', 'QUEEN',
  'ROBOT', 'SUGAR', 'TRAIN', 'UNITY', 'VENOM', 'WATER', 'YOUTH', 'BRICK',
  'CLOUD', 'DREAM', 'FROST', 'GLORY', 'HONEY', 'MUSIC', 'PLANT', 'SMILE',
  'STORM', 'SWORD', 'TOWER', 'WORLD',
];

type LetterStatus = 'green' | 'yellow' | 'gray';
const STATUS_RANK: Record<LetterStatus, number> = { gray: 0, yellow: 1, green: 2 };

/**
 * Wordle on the physical keys. Type a 5-letter word and press Enter; each
 * letter KEY then lights green (right spot), yellow (in the word, wrong spot)
 * or dark (absent), keeping the best-known status per letter — the classic
 * keyboard hint, but on the real keyboard. Backspace erases. Six guesses; all
 * green wins, otherwise the answer's letters flash on a loss. The number row
 * shows guesses used. No difficulty menu. Guesses are not dictionary-checked.
 */
export class WordleEngine {
  private answer = '';
  private guess = '';
  private rows = 0;            // completed guesses 0..6
  private readonly MAX_ROWS = 6;
  private status = new Map<string, LetterStatus>();
  private mode: 'play' | 'win' | 'lose' = 'play';
  private animTimer = 0;
  private pulse = 0;

  constructor() { this.newGame(); }

  setAnimSpeed(_s: number): void { /* untimed — paced by the player */ }

  /** Answer + mode + progress — exposed for the headless solver bot. */
  inspect(): { answer: string; guess: string; rows: number; mode: string } {
    return { answer: this.answer, guess: this.guess, rows: this.rows, mode: this.mode };
  }

  private newGame(): void {
    this.answer = WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)]!;
    this.guess = '';
    this.rows = 0;
    this.status.clear();
    this.mode = 'play';
    this.animTimer = 0;
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.mode !== 'play') return; // animation owns the board until it ends
    if (keycode === KEY_BACKSPACE) { this.guess = this.guess.slice(0, -1); return; }
    if (keycode === KEY_ENTER) { if (this.guess.length === 5) this.submit(); return; }
    const ch = LETTER_BY_KEYCODE.get(keycode);
    if (ch && this.guess.length < 5) this.guess += ch;
  }

  /** Standard Wordle scoring with duplicate handling. */
  private score(guess: string): LetterStatus[] {
    const res: LetterStatus[] = ['gray', 'gray', 'gray', 'gray', 'gray'];
    const ans = this.answer.split('');
    const used = [false, false, false, false, false];
    for (let i = 0; i < 5; i++) {
      if (guess[i] === ans[i]) { res[i] = 'green'; used[i] = true; }
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] === 'green') continue;
      for (let j = 0; j < 5; j++) {
        if (!used[j] && guess[i] === ans[j]) { res[i] = 'yellow'; used[j] = true; break; }
      }
    }
    return res;
  }

  private submit(): void {
    const result = this.score(this.guess);
    for (let i = 0; i < 5; i++) {
      const ch = this.guess[i]!;
      const prev = this.status.get(ch);
      if (!prev || STATUS_RANK[result[i]!] > STATUS_RANK[prev]) this.status.set(ch, result[i]!);
    }
    this.rows++;
    if (this.guess === this.answer) {
      this.mode = 'win'; this.animTimer = 48;
      log.info({ answer: this.answer, rows: this.rows }, 'wordle: win');
    } else if (this.rows >= this.MAX_ROWS) {
      this.mode = 'lose'; this.animTimer = 60;
      log.info({ answer: this.answer }, 'wordle: lose');
    }
    this.guess = '';
  }

  step(): void {
    this.pulse += 0.3;
    if (this.mode === 'win' || this.mode === 'lose') {
      if (--this.animTimer <= 0) this.newGame();
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const GREEN_S: Color = { r: 0, g: 200, b: 40 };
    const YELLOW_S: Color = { r: 220, g: 180, b: 0 };
    const GRAY_S: Color = { r: 6, g: 6, b: 6 };
    const UNKNOWN: Color = { r: 30, g: 30, b: 36 };

    if (this.mode === 'win') {
      const i = this.animTimer % 6 < 3 ? 1 : 0.3;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: 0, g: Math.round(220 * i), b: Math.round(40 * i) });
      return out;
    }
    if (this.mode === 'lose') {
      // Reveal: the answer's letter keys flash red, everything else dark.
      const on = this.animTimer % 8 < 4;
      for (const ch of new Set(this.answer.split(''))) {
        const led = LED_BY_LETTER.get(ch);
        if (led !== undefined) out.set(led, on ? { r: 230, g: 0, b: 0 } : { r: 40, g: 0, b: 0 });
      }
      return out;
    }

    // Letter keys coloured by best-known status (unknown = dim white).
    for (const [ch, led] of LED_BY_LETTER) {
      const st = this.status.get(ch);
      out.set(led, st === 'green' ? GREEN_S : st === 'yellow' ? YELLOW_S : st === 'gray' ? GRAY_S : UNKNOWN);
    }
    // The letters currently being typed pulse white over their status.
    const p = 0.55 + 0.45 * Math.abs(Math.sin(this.pulse * 0.6));
    for (const ch of this.guess) {
      const led = LED_BY_LETTER.get(ch);
      if (led !== undefined) out.set(led, { r: Math.round(220 * p), g: Math.round(220 * p), b: Math.round(235 * p) });
    }
    // Guesses used on the number row (1..6 = orange).
    const NUMS = ['1', '2', '3', '4', '5', '6'];
    for (let i = 0; i < this.MAX_ROWS; i++) {
      const led = findKeyLed(NUMS[i]!);
      if (led === null) continue;
      out.set(led, i < this.rows ? { r: 200, g: 90, b: 0 } : { r: 25, g: 18, b: 0 });
    }
    return out;
  }
}

// ─── Keyboard Crawl (roguelite) ──────────────────────────────────────────────

/** Persisted meta-progression for Keyboard Crawl. */
export interface CrawlMeta { bestDepth: number; hpBonus: number; }
/** Storage seam so tests can run without touching the real save file. */
export interface CrawlStore { load(): CrawlMeta; save(m: CrawlMeta): void; }

/** Default store: ~/.config/fizz-rgb/saves/keyboard-crawl.json (best-effort;
 *  any fs error degrades to in-memory defaults so the daemon never crashes). */
export function diskCrawlStore(): CrawlStore {
  const base = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
  const dir = join(base, 'fizz-rgb', 'saves');
  const file = join(dir, 'keyboard-crawl.json');
  return {
    load(): CrawlMeta {
      try {
        const m = JSON.parse(readFileSync(file, 'utf8')) as Partial<CrawlMeta>;
        return { bestDepth: Number(m.bestDepth) || 0, hpBonus: Number(m.hpBonus) || 0 };
      } catch { return { bestDepth: 0, hpBonus: 0 }; }
    },
    save(m: CrawlMeta): void {
      try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(m)); }
      catch { /* read-only fs / no home — keep playing without persistence */ }
    },
  };
}

/**
 * Turn-based dungeon crawler. The dungeon is larger than the board; the view
 * is a torch-lit window that follows the @ (row 0 is the HP/weapon HUD, rows
 * 1-4 are the viewport). WASD moves one cell per turn — into a wall does
 * nothing, into an enemy attacks it, onto an item grabs it, onto the stairs
 * descends to a harder floor. Enemies step toward you each turn and bump for
 * damage. Permadeath; reaching a new best depth banks a persistent +1 starting
 * HP (roguelite meta-progression). Difficulty 1-5 scales enemy density.
 */
const CRAWL_WS = 16;          // world is CRAWL_WS × CRAWL_WS
const CRAWL_FOG = 3;          // chebyshev torch radius
const CRAWL_D4: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export class KeyboardCrawlEngine {
  private difficulty = 0;
  private world: number[][] = [];   // 0 = wall, 1 = floor
  private at = { wr: 8, wc: 8 };
  private stairs = { wr: 8, wc: 8 };
  private enemies: Array<{ wr: number; wc: number; hp: number }> = [];
  private items: Array<{ wr: number; wc: number; kind: 'heal' | 'weapon' }> = [];
  private hp = 6;
  private maxHp = 6;
  private atk = 1;
  private depth = 1;
  private mode: 'menu' | 'play' | 'dead' = 'menu';
  private animTimer = 0;
  private pulse = 0;
  private meta: CrawlMeta;
  private readonly store: CrawlStore;

  constructor(store: CrawlStore = diskCrawlStore()) {
    this.store = store;
    this.meta = this.store.load();
  }

  setAnimSpeed(_s: number): void { /* turn-based — no continuous speed */ }
  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }

  /** Map + entities + stats — exposed for the headless crawler bot. */
  inspect(): {
    world: number[][]; at: { wr: number; wc: number }; stairs: { wr: number; wc: number };
    enemies: Array<{ wr: number; wc: number }>; hp: number; depth: number; mode: string;
  } {
    return {
      world: this.world.map((row) => row.slice()),
      at: { ...this.at }, stairs: { ...this.stairs },
      enemies: this.enemies.map((e) => ({ wr: e.wr, wc: e.wc })),
      hp: this.hp, depth: this.depth, mode: this.mode,
    };
  }

  private startRun(): void {
    this.depth = 1;
    this.maxHp = 6 + this.meta.hpBonus;
    this.hp = this.maxHp;
    this.atk = 1;
    this.mode = 'play';
    this.genFloor();
  }

  private genFloor(): void {
    // Drunkard's walk from the centre carves a guaranteed-connected region.
    this.world = Array.from({ length: CRAWL_WS }, () => new Array<number>(CRAWL_WS).fill(0));
    let wr = CRAWL_WS >> 1, wc = CRAWL_WS >> 1;
    this.world[wr]![wc] = 1;
    let carved = 1;
    const target = 90;
    for (let steps = 0; carved < target && steps < 6000; steps++) {
      const d = CRAWL_D4[Math.floor(Math.random() * 4)]!;
      wr = Math.max(1, Math.min(CRAWL_WS - 2, wr + d[0]));
      wc = Math.max(1, Math.min(CRAWL_WS - 2, wc + d[1]));
      if (this.world[wr]![wc] === 0) { this.world[wr]![wc] = 1; carved++; }
    }
    this.at = { wr: CRAWL_WS >> 1, wc: CRAWL_WS >> 1 };
    this.stairs = this.farthestFloor(this.at.wr, this.at.wc); // BFS-farthest ⇒ reachable

    // Place enemies and items on distinct floor cells away from @ and stairs.
    const floors: Array<[number, number]> = [];
    for (let r = 0; r < CRAWL_WS; r++) for (let c = 0; c < CRAWL_WS; c++) {
      if (this.world[r]![c] !== 1) continue;
      if (r === this.at.wr && c === this.at.wc) continue;
      if (r === this.stairs.wr && c === this.stairs.wc) continue;
      // Don't spawn enemies right on top of the player's start.
      if (Math.abs(r - this.at.wr) + Math.abs(c - this.at.wc) <= 2) continue;
      floors.push([r, c]);
    }
    for (let i = floors.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [floors[i], floors[j]] = [floors[j]!, floors[i]!]; }

    const enemyCount = Math.min(8, this.diff + this.depth - 1);
    const enemyHp = 1 + Math.floor((this.depth - 1) / 3);
    this.enemies = [];
    for (let i = 0; i < enemyCount && i < floors.length; i++) {
      const [r, c] = floors[i]!; this.enemies.push({ wr: r, wc: c, hp: enemyHp });
    }
    this.items = [];
    const used = Math.min(enemyCount, floors.length); // slot after the enemies actually placed
    if (floors[used]) this.items.push({ wr: floors[used]![0], wc: floors[used]![1], kind: 'heal' });
    if (this.depth % 2 === 1 && floors[used + 1]) this.items.push({ wr: floors[used + 1]![0], wc: floors[used + 1]![1], kind: 'weapon' });
  }

  private farthestFloor(sr: number, sc: number): { wr: number; wc: number } {
    const dist = Array.from({ length: CRAWL_WS }, () => new Array<number>(CRAWL_WS).fill(-1));
    dist[sr]![sc] = 0;
    const q: Array<[number, number]> = [[sr, sc]];
    let far: [number, number] = [sr, sc], farD = 0;
    while (q.length) {
      const [r, c] = q.shift()!;
      for (const [dr, dc] of CRAWL_D4) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= CRAWL_WS || nc < 0 || nc >= CRAWL_WS) continue;
        if (this.world[nr]![nc] !== 1 || dist[nr]![nc] !== -1) continue;
        dist[nr]![nc] = dist[r]![c]! + 1;
        if (dist[nr]![nc]! > farD) { farD = dist[nr]![nc]!; far = [nr, nc]; }
        q.push([nr, nc]);
      }
    }
    return { wr: far[0], wc: far[1] };
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.startRun(); }
      return;
    }
    if (this.mode !== 'play') return;
    if (keycode === KEY_W) this.tryMove(-1, 0);
    else if (keycode === KEY_S) this.tryMove(1, 0);
    else if (keycode === KEY_A) this.tryMove(0, -1);
    else if (keycode === KEY_D) this.tryMove(0, 1);
  }

  private tryMove(dr: number, dc: number): void {
    const nr = this.at.wr + dr, nc = this.at.wc + dc;
    if (nr < 0 || nr >= CRAWL_WS || nc < 0 || nc >= CRAWL_WS) return;
    if (this.world[nr]![nc] !== 1) return; // wall: no move, no turn
    const enemy = this.enemies.find((e) => e.wr === nr && e.wc === nc);
    if (enemy) {
      enemy.hp -= this.atk;
      if (enemy.hp <= 0) this.enemies = this.enemies.filter((e) => e !== enemy);
    } else {
      this.at = { wr: nr, wc: nc };
      const itemIdx = this.items.findIndex((it) => it.wr === nr && it.wc === nc);
      if (itemIdx >= 0) {
        const it = this.items[itemIdx]!;
        if (it.kind === 'heal') this.hp = Math.min(this.maxHp, this.hp + 3);
        else this.atk += 1;
        this.items.splice(itemIdx, 1);
      }
      if (nr === this.stairs.wr && nc === this.stairs.wc) { this.descend(); return; }
    }
    this.enemyTurn();
  }

  private descend(): void {
    this.depth++;
    this.genFloor();
  }

  private enemyTurn(): void {
    for (const e of this.enemies) {
      const adj = Math.abs(e.wr - this.at.wr) + Math.abs(e.wc - this.at.wc) === 1;
      if (adj) { this.hp -= 1; if (this.hp <= 0) { this.die(); return; } continue; }
      // Step toward @ along the floor neighbour that minimises distance and
      // isn't occupied by another enemy or the player.
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (const [dr, dc] of CRAWL_D4) {
        const nr = e.wr + dr, nc = e.wc + dc;
        if (nr < 0 || nr >= CRAWL_WS || nc < 0 || nc >= CRAWL_WS) continue;
        if (this.world[nr]![nc] !== 1) continue;
        if (nr === this.at.wr && nc === this.at.wc) continue;
        if (this.enemies.some((o) => o !== e && o.wr === nr && o.wc === nc)) continue;
        const d = Math.abs(nr - this.at.wr) + Math.abs(nc - this.at.wc);
        if (d < bestD) { bestD = d; best = [nr, nc]; }
      }
      if (best) { e.wr = best[0]; e.wc = best[1]; }
    }
  }

  private die(): void {
    this.mode = 'dead';
    this.animTimer = 48;
    if (this.depth > this.meta.bestDepth) {
      this.meta.bestDepth = this.depth;
      this.meta.hpBonus = Math.min(6, this.meta.hpBonus + 1);
    }
    this.store.save(this.meta);
    log.info({ depth: this.depth, bestDepth: this.meta.bestDepth, hpBonus: this.meta.hpBonus }, 'crawl: died');
  }

  step(): void {
    this.pulse += 0.3;
    if (this.mode === 'dead') {
      if (--this.animTimer <= 0) { this.difficulty = 0; this.mode = 'menu'; }
    }
  }

  private tileColor(wr: number, wc: number): Color | null {
    if (wr < 0 || wr >= CRAWL_WS || wc < 0 || wc >= CRAWL_WS) return null;
    if (wr === this.at.wr && wc === this.at.wc) {
      const b = 0.7 + 0.3 * Math.abs(Math.sin(this.pulse * 0.5));
      return { r: Math.round(220 * b), g: Math.round(255 * b), b: Math.round(220 * b) };
    }
    if (this.enemies.some((e) => e.wr === wr && e.wc === wc)) return { r: 255, g: 30, b: 30 };
    if (wr === this.stairs.wr && wc === this.stairs.wc) return { r: 0, g: 220, b: 255 };
    const item = this.items.find((it) => it.wr === wr && it.wc === wc);
    if (item) return item.kind === 'heal' ? { r: 255, g: 215, b: 0 } : { r: 255, g: 110, b: 0 };
    if (this.world[wr]![wc] === 1) return { r: 4, g: 4, b: 7 };  // dim floor
    return { r: 8, g: 8, b: 36 };                                 // dim wall (blue)
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    if (this.mode === 'dead') {
      const i = this.animTimer % 8 < 4 ? 1 : 0.25;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: Math.round(160 * i), g: 0, b: 0 });
      return out;
    }
    // Camera: rows 1-4 are the viewport, @ centred at board (row 2, col 6).
    const camRow = this.at.wr - 1; // board row 1 → world camRow
    const camCol = this.at.wc - 6; // board col 0 → world camCol
    for (let r = 1; r < ROW_COUNT; r++) {
      for (let c = 0; c < rowWidth(r); c++) {
        const wr = camRow + (r - 1);
        const wc = camCol + c;
        // Torch fog: only cells within chebyshev radius of @ are lit.
        if (Math.max(Math.abs(wr - this.at.wr), Math.abs(wc - this.at.wc)) > CRAWL_FOG) continue;
        const col = this.tileColor(wr, wc);
        const led = keyLed(r, c);
        if (col && led !== null) out.set(led, col);
      }
    }
    // HUD row 0: HP (red) from the left, weapon level (orange) from the right.
    for (let i = 0; i < this.hp && i < rowWidth(0); i++) {
      const led = keyLed(0, i);
      if (led !== null) out.set(led, { r: 220, g: 0, b: 30 });
    }
    const w0 = rowWidth(0);
    for (let i = 0; i < this.atk - 1 && i < 4; i++) {
      const led = keyLed(0, w0 - 1 - i);
      if (led !== null) out.set(led, { r: 255, g: 110, b: 0 });
    }
    return out;
  }
}

// ─── Cursed keyboard (contagion) ─────────────────────────────────────────────

// Contagion graph over CLEANSABLE keys only (keys with a keycode; Fn has none
// and is excluded so every infected key can always be pressed to cleanse it).
const CURSED_KEYS: Array<{ led: number; keycode: number }> = [];
const CURSED_LED_BY_KEYCODE = new Map<number, number>();
const CURSED_NEIGHBORS = new Map<number, number[]>();   // led → cleansable matrix neighbours
(() => {
  const cleansable = new Set<number>();
  for (const [keycode, cell] of KEYCODE_TO_CELL) {
    CURSED_KEYS.push({ led: cell.led, keycode });
    CURSED_LED_BY_KEYCODE.set(keycode, cell.led);
    cleansable.add(cell.led);
  }
  for (const cell of KEYCODE_TO_CELL.values()) {
    const cand = [
      keyLed(cell.row, cell.col - 1),
      keyLed(cell.row, cell.col + 1),
      keyLed(cell.row - 1, vNeighbor(cell.row, cell.col, cell.row - 1)),
      keyLed(cell.row + 1, vNeighbor(cell.row, cell.col, cell.row + 1)),
    ];
    const nbrs: number[] = [];
    for (const n of cand) if (n !== null && n !== cell.led && cleansable.has(n)) nbrs.push(n);
    CURSED_NEIGHBORS.set(cell.led, nbrs);
  }
})();

/**
 * A red curse spreads key-to-key across the physical matrix; press an infected
 * key to cleanse it. It starts on one key and every spread tick jumps to
 * neighbouring keys. If the infected fraction reaches the lose threshold the
 * board is overrun (you lose); otherwise survive as long as you can. The board
 * stays dark except infected keys (red, brighter as they fester) and cleanse
 * flashes (green). Difficulty 1-5 raises the spread speed and probability.
 */
export class CursedKeyboardEngine {
  private difficulty = 0;
  private infected = new Map<number, number>();   // led → age in frames
  private cleanseFlash = new Map<number, number>();
  private survived = 0;
  private cleanses = 0;
  private spreadTick = 0;
  private gameOverAnim = 0;
  private pulse = 0;
  private readonly LOSE_FRAC = 0.7;

  setAnimSpeed(_s: number): void { /* pace comes from difficulty */ }
  private get diff(): number { return this.difficulty > 0 ? this.difficulty : 1; }
  private spreadInterval(): number { return Math.max(6, 40 - this.diff * 6); }
  private spreadProb(): number { return Math.min(0.9, 0.22 + this.diff * 0.12); }
  private get total(): number { return CURSED_KEYS.length; }

  /** Infected keycodes + status — exposed for the headless bot. */
  inspect(): { infectedKeycodes: number[]; mode: string; survived: number; cleanses: number } {
    const infectedKeycodes: number[] = [];
    for (const { led, keycode } of CURSED_KEYS) if (this.infected.has(led)) infectedKeycodes.push(keycode);
    const mode = this.difficulty === 0 ? 'menu' : this.gameOverAnim > 0 ? 'lose' : 'play';
    return { infectedKeycodes, mode, survived: this.survived, cleanses: this.cleanses };
  }

  private startRound(): void {
    this.infected.clear();
    this.cleanseFlash.clear();
    this.survived = 0; this.cleanses = 0; this.spreadTick = 0; this.gameOverAnim = 0;
    this.seedOne();
  }

  private seedOne(): void {
    for (let i = 0; i < 40; i++) {
      const k = CURSED_KEYS[Math.floor(Math.random() * CURSED_KEYS.length)]!;
      if (!this.infected.has(k.led)) { this.infected.set(k.led, 0); return; }
    }
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.difficulty === 0) {
      const d = difficultyFromKeycode(keycode);
      if (d > 0) { this.difficulty = d; this.startRound(); }
      return;
    }
    if (this.gameOverAnim > 0) return;
    const led = CURSED_LED_BY_KEYCODE.get(keycode);
    if (led === undefined) return;
    if (this.infected.has(led)) { this.infected.delete(led); this.cleanseFlash.set(led, 8); this.cleanses++; }
  }

  step(): void {
    this.pulse += 0.3;
    for (const [led, f] of this.cleanseFlash) { if (f <= 1) this.cleanseFlash.delete(led); else this.cleanseFlash.set(led, f - 1); }
    if (this.difficulty === 0) return;
    if (this.gameOverAnim > 0) { this.gameOverAnim--; if (this.gameOverAnim === 0) this.difficulty = 0; return; }

    this.survived++;
    for (const led of this.infected.keys()) this.infected.set(led, this.infected.get(led)! + 1);

    this.spreadTick++;
    if (this.spreadTick >= this.spreadInterval()) {
      this.spreadTick = 0;
      if (this.infected.size === 0) {
        this.seedOne();
      } else {
        const newly: number[] = [];
        const prob = this.spreadProb();
        for (const led of this.infected.keys()) {
          for (const n of CURSED_NEIGHBORS.get(led) ?? []) {
            if (!this.infected.has(n) && Math.random() < prob) newly.push(n);
          }
        }
        for (const n of newly) if (!this.infected.has(n)) this.infected.set(n, 0);
      }
      if (this.infected.size / this.total >= this.LOSE_FRAC) {
        this.gameOverAnim = 48;
        log.info({ survived: this.survived, cleanses: this.cleanses }, 'cursed: overrun');
      }
    }
  }

  render(): Map<number, Color> {
    if (this.difficulty === 0) return renderDifficultyMenu(this.pulse);
    const out = new Map<number, Color>();
    if (this.gameOverAnim > 0) {
      const i = this.gameOverAnim % 8 < 4 ? 1 : 0.2;
      for (const row of KEY_MATRIX) for (const cell of row) out.set(cell.led, { r: Math.round(220 * i), g: 0, b: 0 });
      return out;
    }
    for (const [led, age] of this.infected) {
      const b = 0.5 + 0.5 * Math.abs(Math.sin(this.pulse * 0.4 + age * 0.2));
      out.set(led, { r: Math.round(120 + 135 * b), g: Math.round(20 * b), b: Math.round(10 * b) });
    }
    for (const [led, f] of this.cleanseFlash) out.set(led, { r: 0, g: Math.round(255 * Math.min(1, f / 8)), b: 40 });
    return out;
  }
}

// ─── Idle garden ─────────────────────────────────────────────────────────────

/** Persisted idle-garden progress. */
export interface GardenSave { currency: number; plots: number; growth: number; }
export interface GardenStore { load(): GardenSave; save(s: GardenSave): void; }

/** Default store: ~/.config/fizz-rgb/saves/garden.json (best-effort). */
export function diskGardenStore(): GardenStore {
  const base = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
  const dir = join(base, 'fizz-rgb', 'saves');
  const file = join(dir, 'garden.json');
  return {
    load(): GardenSave {
      try {
        const s = JSON.parse(readFileSync(file, 'utf8')) as Partial<GardenSave>;
        return { currency: Number(s.currency) || 0, plots: Number(s.plots) || 0, growth: Number(s.growth) || 0 };
      } catch { return { currency: 0, plots: 0, growth: 0 }; }
    },
    save(s: GardenSave): void {
      try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(s)); }
      catch { /* read-only fs — keep playing without persistence */ }
    },
  };
}

/**
 * A passive garden across the keys. Each plot grows seed → sprout → mature
 * over real time; tap a mature key to harvest it for a bonus, or leave it and
 * it auto-harvests for a smaller idle yield. Currency auto-buys more plots and
 * faster growth, so the garden expands while you work. Progress persists to
 * disk between sessions. No menu — it just grows.
 */
const GARDEN_AUTO_HARVEST = 90; // ticks a mature plot waits before auto-yield

export class IdleGardenEngine {
  private plots: Array<{ led: number; keycode: number; stage: 0 | 1 | 2; timer: number }> = [];
  private currency = 0;
  private growth = 0;
  private pulse = 0;
  private readonly store: GardenStore;

  constructor(store: GardenStore = diskGardenStore()) {
    this.store = store;
    const s = this.store.load();
    this.currency = s.currency;
    this.growth = s.growth;
    const count = Math.max(4, Math.min(CURSED_KEYS.length, s.plots || 0));
    for (let i = 0; i < count; i++) this.addPlot();
  }

  setAnimSpeed(_s: number): void { /* real-time idle pace */ }

  /** Plot count + economy + mature keys — exposed for the headless bot. */
  inspect(): { plotCount: number; growth: number; currency: number; matureKeycodes: number[] } {
    const matureKeycodes: number[] = [];
    for (const p of this.plots) if (p.stage === 2) matureKeycodes.push(p.keycode);
    return { plotCount: this.plots.length, growth: this.growth, currency: this.currency, matureKeycodes };
  }

  private growTicks(): number { return Math.max(12, 50 - this.growth * 4); }
  private plotCost(): number { return 3 * Math.max(1, this.plots.length); }
  private growthCost(): number { return 5 * (this.growth + 1); }

  private addPlot(): void {
    const slot = CURSED_KEYS[this.plots.length];
    if (!slot) return;
    this.plots.push({ led: slot.led, keycode: slot.keycode, stage: 0, timer: 0 });
  }

  private persist(): void { this.store.save({ currency: this.currency, plots: this.plots.length, growth: this.growth }); }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    const plot = this.plots.find((p) => p.keycode === keycode && p.stage === 2);
    if (plot) { this.currency += 3; plot.stage = 0; plot.timer = 0; this.persist(); } // tapped harvest = bonus yield
  }

  step(): void {
    this.pulse += 0.3;
    const grow = this.growTicks();
    for (const p of this.plots) {
      p.timer++;
      if (p.stage < 2 && p.timer >= grow) { p.stage++; p.timer = 0; }
      else if (p.stage === 2 && p.timer >= GARDEN_AUTO_HARVEST) { this.currency += 1; p.stage = 0; p.timer = 0; } // idle yield
    }
    // Auto-buy the cheapest affordable upgrade (idle progression).
    let bought = false;
    for (let guard = 0; guard < 64; guard++) {
      const canPlot = this.plots.length < CURSED_KEYS.length && this.currency >= this.plotCost();
      const canGrow = this.growth < 9 && this.currency >= this.growthCost();
      if (canPlot && (!canGrow || this.plotCost() <= this.growthCost())) { this.currency -= this.plotCost(); this.addPlot(); bought = true; }
      else if (canGrow) { this.currency -= this.growthCost(); this.growth++; bought = true; }
      else break;
    }
    if (bought) this.persist();
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const pp = 0.55 + 0.45 * Math.abs(Math.sin(this.pulse * 0.5));
    for (const p of this.plots) {
      let c: Color;
      if (p.stage === 0) c = { r: 30, g: 18, b: 6 };       // seed (dim soil)
      else if (p.stage === 1) c = { r: 0, g: 160, b: 30 };  // sprout (green)
      else c = { r: Math.round(255 * pp), g: Math.round(200 * pp), b: 0 }; // mature (gold pulse)
      out.set(p.led, c);
    }
    return out;
  }
}

function lerpColor(a: Color, b: Color, t: number): Color {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

// Suppress unused-import warnings for engines that don't use every keycode.
void ORANGE; void MAGENTA;
