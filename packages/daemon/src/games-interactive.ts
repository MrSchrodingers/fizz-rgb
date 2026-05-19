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
} from './key-matrix.js';
import { log } from './log.js';
import {
  KEY_TAB, KEY_CAPSLOCK, KEY_LEFTSHIFT, KEY_LEFTCTRL,
  KEY_BACKSLASH, KEY_ENTER, KEY_RIGHTSHIFT, KEY_RIGHTCTRL,
  KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE,
  KEY_1, KEY_2, KEY_3, KEY_4, KEY_5,
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
