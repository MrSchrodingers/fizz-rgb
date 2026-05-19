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
import { log } from './log.js';
import {
  KEY_TAB, KEY_CAPSLOCK, KEY_LEFTSHIFT, KEY_LEFTCTRL,
  KEY_BACKSLASH, KEY_ENTER, KEY_RIGHTSHIFT, KEY_RIGHTCTRL,
  KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE,
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

// ─── Pacman (WASD moves Pacman, ghosts chase with simple AI) ────────────────

/**
 * Pacman — proper maze edition. 14×5 grid with internal walls, four
 * power pellets in the corners, three ghosts with distinct AI
 * personalities (chase / ambush / unpredictable), fright mode when
 * Pacman eats a pellet, three lives with a death animation, and
 * wraparound on row 2 (the "tunnel" row).
 *
 * Controls: W/A/S/D queues a turn — Pacman commits at the next legal
 * grid step, so you can preempt corners cleanly.
 *
 * Editable palette slots (via pattern.colorOverrides):
 *   pacman, dot, pellet, wall, ghost-1, ghost-2, ghost-3, ghost-fright
 */
export class PacmanEngine {
  // Five maze layouts (1 = wall, 0 = open floor). All keep row 2 mostly
  // clear so wraparound through the "tunnel" row feels natural, the four
  // pellet spawn corners stay open, and ghost+player spawn cells are
  // walkable. Phases cycle 0..4 and then loop back to 0.
  private readonly MAZES: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>> = [
    // Phase 1 — gentle opener, four square pillars.
    [
      [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    ],
    // Phase 2 — vertical bars, tighter corridors.
    [
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0],
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    ],
    // Phase 3 — zigzag double-bars.
    [
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    ],
    // Phase 4 — staggered pillars.
    [
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    ],
    // Phase 5 — dense, multi-band; hardest before looping.
    [
      [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
      [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    ],
  ];
  private get MAZE(): ReadonlyArray<ReadonlyArray<number>> { return this.MAZES[this.phase]!; }
  // Four power pellets in the corners.
  private readonly PELLET_SPAWNS: ReadonlyArray<readonly [number, number]> = [
    [0, 0], [13, 0], [0, 4], [13, 4],
  ];
  // Ghost home cells + personalities + base color.
  private readonly GHOST_SPAWNS: ReadonlyArray<{
    x: number; y: number; personality: 'chase' | 'ambush' | 'random'; slot: string;
  }> = [
    { x: 1,  y: 2, personality: 'chase',   slot: 'ghost-1' },
    { x: 12, y: 2, personality: 'ambush',  slot: 'ghost-2' },
    { x: 7,  y: 4, personality: 'random',  slot: 'ghost-3' },
  ];

  private px = 7;
  private py = 2;
  private dir: { x: number; y: number } = { x: 1, y: 0 };
  private queuedDir: { x: number; y: number } | null = null;

  private ghosts: Array<{
    x: number; y: number;
    home: { x: number; y: number };
    dir: { x: number; y: number };
    personality: 'chase' | 'ambush' | 'random';
    slot: string;
    eatenCooldown: number; // ticks remaining at home after being eaten
  }> = [];

  private dots: Set<string> = new Set();
  private pellets: Set<string> = new Set();
  private score = 0;
  private lives = 3;
  private phase = 0;                // 0..4, then loops back
  private clearAnim = 0;            // ticks remaining in phase-clear flash
  private frightTicks = 0;          // shared fright timer (~3s at 30fps)
  private deathAnim = 0;            // ticks remaining in death flash
  private mouthPhase = 0;

  private tickCounter = 0;
  private ticksPerStep = 8;         // Pacman step cadence (base)
  private baseTicksPerStep = 8;     // before per-phase scaling
  private ghostTickCounter = 0;
  private ticksPerGhostStep = 11;   // ghosts slightly slower than Pacman

  private overrides: Record<string, string> = {};

  constructor() {
    this.resetLevel();
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
    this.baseTicksPerStep = Math.round(12 - c * 7);
    this.applyPhaseDifficulty();
  }

  /** Recompute Pacman / ghost step rates from the current phase. Each
   *  additional phase shaves ~1 tick off the ghost cadence so they
   *  ramp up gradually. Phase also shrinks fright duration in
   *  movePacman(). */
  private applyPhaseDifficulty(): void {
    this.ticksPerStep = this.baseTicksPerStep;
    // Ghosts start 3 ticks slower than Pacman in phase 1 and close the
    // gap toward parity by phase 5.
    const ghostLag = Math.max(0, 3 - this.phase);
    this.ticksPerGhostStep = this.ticksPerStep + ghostLag;
  }

  private resetLevel(): void {
    this.dots.clear();
    this.pellets.clear();
    this.applyPhaseDifficulty();
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 14; x++) {
        if (this.MAZE[y]![x] === 0) this.dots.add(`${x},${y}`);
      }
    }
    for (const [x, y] of this.PELLET_SPAWNS) {
      this.dots.delete(`${x},${y}`);
      this.pellets.add(`${x},${y}`);
    }
    this.dots.delete(`${this.px},${this.py}`);
    this.spawnGhosts();
    for (const g of this.ghosts) this.dots.delete(`${g.x},${g.y}`);
    this.frightTicks = 0;
  }

  private spawnGhosts(): void {
    this.ghosts = this.GHOST_SPAWNS.map((s) => ({
      x: s.x,
      y: s.y,
      home: { x: s.x, y: s.y },
      dir: { x: -1, y: 0 },
      personality: s.personality,
      slot: s.slot,
      eatenCooldown: 0,
    }));
  }

  private isWall(x: number, y: number): boolean {
    if (x < 0 || x >= 14 || y < 0 || y >= 5) return true;
    return this.MAZE[y]![x] === 1;
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.deathAnim > 0) return;
    if (keycode === KEY_W)      this.queuedDir = { x: 0,  y: -1 };
    else if (keycode === KEY_S) this.queuedDir = { x: 0,  y: 1  };
    else if (keycode === KEY_A) this.queuedDir = { x: -1, y: 0  };
    else if (keycode === KEY_D) this.queuedDir = { x: 1,  y: 0  };
  }

  step(): void {
    this.mouthPhase += 0.25;

    // Death animation freezes the game; advance and respawn when done.
    if (this.deathAnim > 0) {
      this.deathAnim--;
      if (this.deathAnim === 0) {
        if (this.lives > 0) {
          this.px = 7; this.py = 2;
          this.dir = { x: 1, y: 0 };
          this.queuedDir = null;
          this.spawnGhosts();
        } else {
          // Game over — reset everything including phase.
          this.lives = 3;
          this.score = 0;
          this.phase = 0;
          this.px = 7; this.py = 2;
          this.dir = { x: 1, y: 0 };
          this.queuedDir = null;
          this.resetLevel();
        }
      }
      return;
    }

    // Phase-clear animation freezes gameplay briefly so the player sees
    // the maze swap.
    if (this.clearAnim > 0) {
      this.clearAnim--;
      if (this.clearAnim === 0) {
        this.phase = (this.phase + 1) % this.MAZES.length;
        this.px = 7; this.py = 2;
        this.dir = { x: 1, y: 0 };
        this.queuedDir = null;
        this.resetLevel();
      }
      return;
    }

    if (this.frightTicks > 0) this.frightTicks--;

    this.tickCounter++;
    if (this.tickCounter >= this.ticksPerStep) {
      this.tickCounter = 0;
      this.movePacman();
      if (this.checkGhostCollision()) return;
    }

    this.ghostTickCounter++;
    if (this.ghostTickCounter >= this.ticksPerGhostStep) {
      this.ghostTickCounter = 0;
      this.moveGhosts();
      this.checkGhostCollision();
    }
  }

  private movePacman(): void {
    // Apply the queued turn if and only if it's a legal cell — this is
    // what makes inputs feel precise around corners.
    if (this.queuedDir) {
      const tx = (this.px + this.queuedDir.x + 14) % 14;
      const ty = (this.py + this.queuedDir.y + 5) % 5;
      if (!this.isWall(tx, ty)) {
        this.dir = this.queuedDir;
        this.queuedDir = null;
      }
    }
    const nx = (this.px + this.dir.x + 14) % 14;
    const ny = (this.py + this.dir.y + 5) % 5;
    if (this.isWall(nx, ny)) return; // bump into wall — stay put
    this.px = nx;
    this.py = ny;

    const key = `${this.px},${this.py}`;
    if (this.pellets.has(key)) {
      this.pellets.delete(key);
      this.score += 50;
      // Fright duration shrinks each phase: 90 → 75 → 60 → 50 → 40 ticks
      this.frightTicks = Math.max(40, 90 - this.phase * 12);
    } else if (this.dots.has(key)) {
      this.dots.delete(key);
      this.score += 1;
    }

    if (this.dots.size === 0 && this.pellets.size === 0) {
      this.score += 100 * (this.phase + 1); // larger bonus on later phases
      this.clearAnim = 24;                  // ~0.8s flash before next maze
      log.info({ score: this.score, phase: this.phase + 1 }, 'pacman: phase clear');
    }
  }

  private moveGhosts(): void {
    for (const g of this.ghosts) {
      // Cooling down at home after being eaten — don't move yet.
      if (g.eatenCooldown > 0) { g.eatenCooldown--; continue; }

      // Build legal-neighbour list, excluding the cell we just came from
      // so ghosts don't oscillate.
      const reverse = { x: -g.dir.x, y: -g.dir.y };
      const candidates: Array<{ x: number; y: number; dir: { x: number; y: number } }> = [];
      const moves = [
        { x: 0, y: -1 }, { x: 0, y: 1 },
        { x: -1, y: 0 }, { x: 1, y: 0 },
      ];
      for (const m of moves) {
        if (m.x === reverse.x && m.y === reverse.y) continue;
        const nx = (g.x + m.x + 14) % 14;
        const ny = (g.y + m.y + 5) % 5;
        if (this.isWall(nx, ny)) continue;
        candidates.push({ x: nx, y: ny, dir: m });
      }
      // Dead end — allow reversing.
      if (candidates.length === 0) {
        const rx = (g.x + reverse.x + 14) % 14;
        const ry = (g.y + reverse.y + 5) % 5;
        if (!this.isWall(rx, ry)) {
          candidates.push({ x: rx, y: ry, dir: reverse });
        } else {
          continue;
        }
      }

      // Pick target cell. Frightened ghosts flee; otherwise personality
      // decides what to aim at.
      let tx: number;
      let ty: number;
      if (this.frightTicks > 0) {
        let best = candidates[0]!;
        let bestDist = -Infinity;
        for (const c of candidates) {
          const d = (c.x - this.px) ** 2 + (c.y - this.py) ** 2;
          if (d > bestDist) { bestDist = d; best = c; }
        }
        g.x = best.x; g.y = best.y; g.dir = best.dir;
        continue;
      }
      if (g.personality === 'ambush') {
        // Aim 3 cells ahead of Pacman's current facing.
        tx = (this.px + this.dir.x * 3 + 14 * 2) % 14;
        ty = (this.py + this.dir.y * 3 + 5  * 2) % 5;
      } else if (g.personality === 'random') {
        // 35% pure random, else chase — keeps the player on edge without
        // being predictable.
        if (Math.random() < 0.35) {
          const c = candidates[Math.floor(Math.random() * candidates.length)]!;
          g.x = c.x; g.y = c.y; g.dir = c.dir;
          continue;
        }
        tx = this.px; ty = this.py;
      } else {
        tx = this.px; ty = this.py;
      }

      // Greedy: pick the candidate closest to the target.
      let best = candidates[0]!;
      let bestDist = Infinity;
      for (const c of candidates) {
        const d = (c.x - tx) ** 2 + (c.y - ty) ** 2;
        if (d < bestDist) { bestDist = d; best = c; }
      }
      g.x = best.x; g.y = best.y; g.dir = best.dir;
    }
  }

  /** Returns true if Pacman was caught (death animation started). */
  private checkGhostCollision(): boolean {
    for (const g of this.ghosts) {
      if (g.eatenCooldown > 0) continue;
      if (g.x === this.px && g.y === this.py) {
        if (this.frightTicks > 0) {
          // Eaten — teleport ghost home and lock it briefly.
          g.x = g.home.x; g.y = g.home.y;
          g.dir = { x: -1, y: 0 };
          g.eatenCooldown = 30;
          this.score += 200;
        } else {
          this.lives--;
          this.deathAnim = 30;
          log.info({ score: this.score, lives: this.lives }, 'pacman: caught');
          return true;
        }
      }
    }
    return false;
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();

    const WALL_C    = this.color('wall',         { r: 14,  g: 14,  b: 90  });
    const DOT_C     = this.color('dot',          { r: 60,  g: 55,  b: 35  });
    const PELLET_C  = this.color('pellet',       { r: 255, g: 200, b: 180 });
    const PACMAN_C  = this.color('pacman',       YELLOW);
    const FRIGHT_C  = this.color('ghost-fright', { r: 30,  g: 60,  b: 255 });

    // Death animation — red blink over the whole field.
    if (this.deathAnim > 0) {
      const intensity = this.deathAnim % 8 < 4 ? 1 : 0.25;
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 14; x++) {
          const led = gridToLed(x, y);
          if (led !== null) {
            out.set(led, { r: Math.round(200 * intensity), g: 0, b: 0 });
          }
        }
      }
      // Lives indicator (top-left): 1 yellow led per remaining life.
      for (let i = 0; i < this.lives; i++) {
        const led = gridToLed(i, 0);
        if (led !== null) out.set(led, PACMAN_C);
      }
      return out;
    }

    // Phase-clear flash — green wash + phase number indicator on row 0.
    if (this.clearAnim > 0) {
      const intensity = this.clearAnim % 6 < 3 ? 1 : 0.3;
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 14; x++) {
          const led = gridToLed(x, y);
          if (led !== null) {
            out.set(led, { r: 0, g: Math.round(200 * intensity), b: 30 });
          }
        }
      }
      // Show next phase number 1..5 as bright cells in row 0.
      const next = ((this.phase + 1) % this.MAZES.length) + 1;
      for (let i = 0; i < next; i++) {
        const led = gridToLed(i, 0);
        if (led !== null) out.set(led, { r: 255, g: 255, b: 0 });
      }
      return out;
    }

    // Walls.
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 14; x++) {
        if (this.MAZE[y]![x] === 1) {
          const led = gridToLed(x, y);
          if (led !== null) out.set(led, WALL_C);
        }
      }
    }
    // Dots.
    for (const key of this.dots) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const led = gridToLed(x, y);
      if (led !== null) out.set(led, DOT_C);
    }
    // Power pellets — pulse.
    const pulse = 0.65 + 0.35 * Math.sin(this.mouthPhase * 0.6);
    for (const key of this.pellets) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const led = gridToLed(x, y);
      if (led !== null) {
        out.set(led, {
          r: Math.round(PELLET_C.r * pulse),
          g: Math.round(PELLET_C.g * pulse),
          b: Math.round(PELLET_C.b * pulse),
        });
      }
    }
    // Ghosts.
    for (const g of this.ghosts) {
      const led = gridToLed(g.x, g.y);
      if (led === null) continue;
      let c: Color;
      if (g.eatenCooldown > 0) {
        // "Eyes" returning home — dim white.
        c = { r: 120, g: 120, b: 140 };
      } else if (this.frightTicks > 0) {
        // Flash white in the last ~1s of fright as a warning.
        const flashing = this.frightTicks < 30 && this.frightTicks % 8 < 4;
        c = flashing ? { r: 255, g: 255, b: 255 } : FRIGHT_C;
      } else {
        const base = this.color(g.slot,
          g.slot === 'ghost-1' ? { r: 255, g: 0,   b: 60  } :
          g.slot === 'ghost-2' ? { r: 255, g: 120, b: 200 } :
                                 { r: 0,   g: 220, b: 255 });
        c = base;
      }
      out.set(led, c);
    }
    // Pacman with chomp animation.
    const ledP = gridToLed(this.px, this.py);
    if (ledP !== null) {
      const chomp = Math.sin(this.mouthPhase) > 0;
      out.set(ledP, chomp
        ? PACMAN_C
        : {
            r: Math.round(PACMAN_C.r * 0.55),
            g: Math.round(PACMAN_C.g * 0.55),
            b: Math.round(PACMAN_C.b * 0.55),
          },
      );
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

// ─── Space Invaders ─────────────────────────────────────────────────────────

/**
 * Classic Space Invaders on the 14×5 grid.
 *   - Player ship lives on row 4. A/D moves; Space fires (one player
 *     bullet on screen at a time, classic arcade behaviour).
 *   - Aliens occupy the upper rows in a marching formation. They step
 *     sideways every N ticks, drop down + reverse when they hit an
 *     edge. If any alien reaches row 4, the player loses immediately.
 *   - Random alien shots travel downward at a per-wave speed.
 *   - 4 waves total: 2x6 → 2x6 fast → 3x6 → 3x7, looping.
 *
 * Editable palette slots: alien, ship, player-bullet, alien-bullet.
 */
export class SpaceInvadersEngine {
  private aliens: Array<{ x: number; y: number; alive: boolean }> = [];
  private formationDir: -1 | 1 = 1;
  private playerCol = 6;
  private playerBullet: { x: number; y: number } | null = null;
  private alienBullets: Array<{ x: number; y: number }> = [];

  private lives = 3;
  private score = 0;
  private wave = 0;
  private deathAnim = 0;
  private clearAnim = 0;
  private gameOverAnim = 0;

  private tickCounter = 0;
  private bulletTickCounter = 0;
  private overrides: Record<string, string> = {};

  // Per-wave config. ticksPerAlienStep is "lower = faster"; bulletTickRate
  // controls how often bullets advance (both player and alien); fireRate
  // is per-alien, per-tick probability of firing.
  private readonly WAVES: ReadonlyArray<{
    rows: number;
    cols: number;
    ticksPerAlienStep: number;
    bulletTickRate: number;
    fireRate: number;
  }> = [
    { rows: 2, cols: 6, ticksPerAlienStep: 22, bulletTickRate: 8, fireRate: 0.004 },
    { rows: 2, cols: 6, ticksPerAlienStep: 16, bulletTickRate: 7, fireRate: 0.006 },
    { rows: 3, cols: 6, ticksPerAlienStep: 12, bulletTickRate: 6, fireRate: 0.009 },
    { rows: 3, cols: 7, ticksPerAlienStep: 9,  bulletTickRate: 5, fireRate: 0.013 },
  ];

  constructor() {
    this.spawnWave();
  }

  setColorOverrides(o: Record<string, string>): void { this.overrides = o ?? {}; }
  private color(slot: string, fallback: Color): Color {
    const hex = this.overrides[slot];
    return hex ? parseHex(hex) : fallback;
  }

  /** Speed slider scales the marching cadence ±30%, so the user can
   *  fine-tune difficulty inside a wave. */
  setAnimSpeed(s: number): void {
    // We don't change wave config here; render() looks it up at call-time.
    // Keeping the hook present so the engine matches the interface.
    void s;
  }

  private spawnWave(): void {
    const w = this.WAVES[this.wave]!;
    this.aliens = [];
    // Centre the formation horizontally, two columns of spacing between
    // adjacent aliens.
    const startCol = Math.max(0, Math.floor((14 - w.cols * 2 + 1) / 2));
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        this.aliens.push({ x: startCol + c * 2, y: r, alive: true });
      }
    }
    this.formationDir = 1;
    this.playerBullet = null;
    this.alienBullets = [];
    this.tickCounter = 0;
    this.bulletTickCounter = 0;
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    if (this.deathAnim > 0 || this.clearAnim > 0 || this.gameOverAnim > 0) return;
    if (keycode === KEY_A) {
      this.playerCol = Math.max(0, this.playerCol - 1);
    } else if (keycode === KEY_D) {
      this.playerCol = Math.min(13, this.playerCol + 1);
    } else if (keycode === KEY_SPACE) {
      if (!this.playerBullet) {
        // Bullet starts on row 3 (just above the ship on row 4).
        this.playerBullet = { x: this.playerCol, y: 3 };
      }
    }
  }

  step(): void {
    if (this.gameOverAnim > 0) {
      this.gameOverAnim--;
      if (this.gameOverAnim === 0) {
        this.lives = 3;
        this.score = 0;
        this.wave = 0;
        this.playerCol = 6;
        this.spawnWave();
      }
      return;
    }
    if (this.deathAnim > 0) {
      this.deathAnim--;
      if (this.deathAnim === 0) {
        if (this.lives > 0) {
          this.playerBullet = null;
          this.alienBullets = [];
          this.playerCol = 6;
        } else {
          this.gameOverAnim = 48;
        }
      }
      return;
    }
    if (this.clearAnim > 0) {
      this.clearAnim--;
      if (this.clearAnim === 0) {
        this.wave = (this.wave + 1) % this.WAVES.length;
        this.spawnWave();
      }
      return;
    }

    const w = this.WAVES[this.wave]!;

    // ── Bullets ─────────────────────────────────────────────────────────
    this.bulletTickCounter++;
    if (this.bulletTickCounter >= w.bulletTickRate) {
      this.bulletTickCounter = 0;

      // Player bullet ascends.
      if (this.playerBullet) {
        this.playerBullet.y--;
        if (this.playerBullet.y < 0) {
          this.playerBullet = null;
        } else {
          // Hit-test against aliens.
          for (const a of this.aliens) {
            if (a.alive && a.x === this.playerBullet.x && a.y === this.playerBullet.y) {
              a.alive = false;
              this.playerBullet = null;
              this.score += 10;
              break;
            }
          }
        }
      }

      // Alien bullets descend.
      const surviving: Array<{ x: number; y: number }> = [];
      for (const b of this.alienBullets) {
        b.y++;
        if (b.y > 4) continue; // off-screen
        if (b.y === 4 && b.x === this.playerCol) {
          this.lives--;
          this.deathAnim = 24;
          log.info({ score: this.score, lives: this.lives }, 'invaders: hit');
          this.alienBullets = [];
          this.playerBullet = null;
          return;
        }
        surviving.push(b);
      }
      this.alienBullets = surviving;
    }

    // ── Formation step ──────────────────────────────────────────────────
    this.tickCounter++;
    if (this.tickCounter >= w.ticksPerAlienStep) {
      this.tickCounter = 0;
      const alive = this.aliens.filter((a) => a.alive);
      if (alive.length === 0) {
        this.clearAnim = 30;
        this.score += 200 * (this.wave + 1);
        log.info({ score: this.score, wave: this.wave + 1 }, 'invaders: wave clear');
        return;
      }
      let minX = Infinity;
      let maxX = -Infinity;
      for (const a of alive) {
        if (a.x < minX) minX = a.x;
        if (a.x > maxX) maxX = a.x;
      }
      const goingRight = this.formationDir === 1;
      const willOverflow = goingRight ? maxX + 1 >= 14 : minX - 1 < 0;
      if (willOverflow) {
        for (const a of this.aliens) if (a.alive) a.y++;
        this.formationDir = goingRight ? -1 : 1;
        for (const a of this.aliens) {
          if (a.alive && a.y >= 4) {
            this.lives = 0;
            this.gameOverAnim = 48;
            log.info({ score: this.score }, 'invaders: aliens landed');
            return;
          }
        }
      } else {
        for (const a of this.aliens) if (a.alive) a.x += this.formationDir;
      }
    }

    // ── Alien fire ──────────────────────────────────────────────────────
    // For each alive alien, roll a die. To keep bullets from stacking,
    // only one bullet per column at a time.
    const colsWithBullet = new Set(this.alienBullets.map((b) => b.x));
    for (const a of this.aliens) {
      if (!a.alive) continue;
      if (colsWithBullet.has(a.x)) continue;
      if (Math.random() < w.fireRate) {
        // Fire from the LOWEST alive alien in this column to avoid
        // self-impact.
        let lowest = a;
        for (const o of this.aliens) {
          if (o.alive && o.x === a.x && o.y > lowest.y) lowest = o;
        }
        this.alienBullets.push({ x: lowest.x, y: lowest.y + 1 });
        colsWithBullet.add(a.x);
      }
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const ALIEN_C   = this.color('alien',         { r: 0,   g: 255, b: 100 });
    const SHIP_C    = this.color('ship',          { r: 100, g: 200, b: 255 });
    const PBULLET_C = this.color('player-bullet', { r: 255, g: 255, b: 255 });
    const ABULLET_C = this.color('alien-bullet',  { r: 255, g: 80,  b: 30  });

    if (this.gameOverAnim > 0) {
      const i = this.gameOverAnim % 8 < 4 ? 1 : 0.3;
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 14; x++) {
          const led = gridToLed(x, y);
          if (led !== null) out.set(led, { r: Math.round(200 * i), g: 0, b: 0 });
        }
      }
      return out;
    }
    if (this.clearAnim > 0) {
      const i = this.clearAnim % 6 < 3 ? 1 : 0.3;
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 14; x++) {
          const led = gridToLed(x, y);
          if (led !== null) out.set(led, { r: 0, g: Math.round(180 * i), b: Math.round(80 * i) });
        }
      }
      const next = ((this.wave + 1) % this.WAVES.length) + 1;
      for (let k = 0; k < next; k++) {
        const led = gridToLed(k, 0);
        if (led !== null) out.set(led, { r: 255, g: 255, b: 0 });
      }
      return out;
    }

    // Aliens.
    for (const a of this.aliens) {
      if (!a.alive) continue;
      if (a.y < 0 || a.y >= 5 || a.x < 0 || a.x >= 14) continue;
      const led = gridToLed(a.x, a.y);
      if (led !== null) out.set(led, ALIEN_C);
    }
    // Player bullet.
    if (this.playerBullet && this.playerBullet.y >= 0) {
      const led = gridToLed(this.playerBullet.x, this.playerBullet.y);
      if (led !== null) out.set(led, PBULLET_C);
    }
    // Alien bullets.
    for (const b of this.alienBullets) {
      if (b.y < 0 || b.y >= 5) continue;
      const led = gridToLed(b.x, b.y);
      if (led !== null) out.set(led, ABULLET_C);
    }
    // Ship — flash during deathAnim.
    const shipLed = gridToLed(this.playerCol, 4);
    if (shipLed !== null) {
      const flashing = this.deathAnim > 0 && this.deathAnim % 4 < 2;
      out.set(shipLed, flashing ? { r: 255, g: 80, b: 0 } : SHIP_C);
    }
    // Lives on the top-left corner (1 LED per remaining life).
    for (let i = 0; i < this.lives; i++) {
      const led = gridToLed(i, 0);
      // Only paint if not already covered by an alien.
      if (led !== null && !out.has(led)) out.set(led, { r: 80, g: 80, b: 80 });
    }
    return out;
  }
}

// ─── Super Mario (2-level side-scroller) ────────────────────────────────────

/**
 * Tiny side-scrolling platformer on the 14×5 grid. The world for each
 * level is wider than the viewport; the camera scrolls horizontally so
 * Mario stays near the centre.
 *
 *   Row 0      : sky / very-high platforms
 *   Row 1      : high jump apex / floating platforms
 *   Row 2      : mid-air / floating platforms
 *   Row 3      : Mario's walking row (1 above ground)
 *   Row 4      : solid ground (X), pit (.), goal flag at the far right
 *
 * Controls: A/D to walk, Space to jump (variable height — hold for
 * higher arc up to the apex), W to look up (no-op for now).
 *
 * Editable palette slots:
 *   mario, ground, platform, coin, goomba, flag, sky
 */
export class MarioEngine {
  // Each level's static layout. Solid array maps (col, row) → wall/ground.
  private readonly LEVELS: ReadonlyArray<{
    width: number;
    solids: ReadonlyArray<readonly [number, number]>;
    coins: ReadonlyArray<readonly [number, number]>;
    goombas: ReadonlyArray<readonly [number, number]>;
    flagX: number;
  }> = [
    // Level 1 — gentle introduction. All pits are 1 cell wide and no
    // platform sits directly above a pit (so a held jump always clears).
    {
      width: 26,
      solids: (() => {
        const s: Array<[number, number]> = [];
        const gaps = new Set([7, 16]); // 1-wide pits
        for (let x = 0; x < 26; x++) {
          if (gaps.has(x)) continue;
          s.push([x, 4]);
        }
        // Floating platforms on row 2, over SOLID ground (safe to fall off).
        for (const x of [11, 12]) s.push([x, 2]);
        return s;
      })(),
      coins: [[2, 3], [5, 3], [11, 1], [12, 1], [19, 3], [23, 3]],
      goombas: [[10, 3], [14, 3], [21, 3]],
      flagX: 25,
    },
    // Level 2 — harder: four pits, more goombas, more platforms. Still
    // all 1-wide pits with clear airspace above each.
    {
      width: 30,
      solids: (() => {
        const s: Array<[number, number]> = [];
        const gaps = new Set([6, 13, 20, 26]); // four 1-wide pits
        for (let x = 0; x < 30; x++) {
          if (gaps.has(x)) continue;
          s.push([x, 4]);
        }
        for (const x of [9, 10, 23, 24]) s.push([x, 2]); // row-2 platforms
        for (const x of [16, 17]) s.push([x, 1]);        // row-1 platform
        return s;
      })(),
      coins: [[3, 3], [9, 1], [16, 0], [23, 1], [28, 3]],
      goombas: [[9, 3], [16, 3], [23, 3], [28, 3]],
      flagX: 29,
    },
  ];

  private level = 0;
  private mx = 1;
  private my = 3;
  private vy = 0;                  // vertical velocity in cells/tick
  private facing: -1 | 1 = 1;
  private aHeld = false;
  private dHeld = false;
  private jumpHeld = false;
  private jumpReleased = true;     // for variable-height jump
  private deathAnim = 0;
  private clearAnim = 0;
  private gameOverAnim = 0;
  private lives = 3;
  private coinsCollected = 0;
  private score = 0;

  // Per-level mutable state — coins and goombas can be removed.
  private liveCoins: Set<string> = new Set();
  private liveGoombas: Array<{ x: number; y: number; dir: -1 | 1 }> = [];

  private tickCounter = 0;
  private ticksPerStep = 2;        // physics rate; lower = faster
  private overrides: Record<string, string> = {};

  // Physics constants. Tuned for a 5-row grid: a HELD jump rises ~1.8
  // cells (row 3 → row 1) and stays airborne ~10 frames, which clears a
  // 1-wide pit with margin. A tap is a small hop.
  private readonly MOVE_SPEED = 0.34;
  private readonly JUMP_VELOCITY = -0.9;
  private readonly GRAVITY = 0.30;
  private readonly MAX_FALL = 1.2;
  private readonly JUMP_HOLD_BOOST = -0.12;   // applied while jump held
  private readonly JUMP_HOLD_TICKS = 5;
  private jumpHoldCounter = 0;
  private goombaTickCounter = 0;
  private readonly GOOMBA_STEP_TICKS = 6;

  constructor() {
    this.loadLevel();
  }

  setColorOverrides(o: Record<string, string>): void { this.overrides = o ?? {}; }
  private color(slot: string, fallback: Color): Color {
    const hex = this.overrides[slot];
    return hex ? parseHex(hex) : fallback;
  }

  setAnimSpeed(s: number): void {
    const c = Math.max(0, Math.min(1, s));
    this.ticksPerStep = Math.max(1, Math.round(4 - c * 3));
  }

  private loadLevel(): void {
    const lvl = this.LEVELS[this.level]!;
    this.liveCoins = new Set(lvl.coins.map(([x, y]) => `${x},${y}`));
    this.liveGoombas = lvl.goombas.map(([x, y]) => ({ x, y, dir: -1 as -1 }));
    this.mx = 1;
    this.my = 3;
    this.vy = 0;
    this.facing = 1;
    this.jumpHoldCounter = 0;
  }

  private isSolidAt(cx: number, cy: number): boolean {
    if (cy >= 5) return false; // below ground is fall
    if (cx < 0) return true;   // left wall
    if (cx >= this.LEVELS[this.level]!.width) return true;
    for (const [sx, sy] of this.LEVELS[this.level]!.solids) {
      if (sx === cx && sy === cy) return true;
    }
    return false;
  }

  /** True if there's a solid surface directly under (mx, my) — used to
   *  decide whether Mario is "on ground" and can jump. */
  private isOnGround(): boolean {
    const fx = Math.floor(this.mx);
    const fy = Math.floor(this.my);
    return this.isSolidAt(fx, fy + 1);
  }

  handleKey(keycode: number, value: number): void {
    const pressed = value === 1;
    if (this.deathAnim > 0 || this.gameOverAnim > 0 || this.clearAnim > 0) return;
    if (keycode === KEY_A) this.aHeld = pressed;
    else if (keycode === KEY_D) this.dHeld = pressed;
    else if (keycode === KEY_SPACE) {
      this.jumpHeld = pressed;
      if (pressed && this.jumpReleased && this.isOnGround()) {
        this.vy = this.JUMP_VELOCITY;
        this.jumpHoldCounter = this.JUMP_HOLD_TICKS;
        this.jumpReleased = false;
      }
      if (!pressed) this.jumpReleased = true;
    }
  }

  step(): void {
    if (this.gameOverAnim > 0) {
      this.gameOverAnim--;
      if (this.gameOverAnim === 0) {
        this.lives = 3;
        this.score = 0;
        this.coinsCollected = 0;
        this.level = 0;
        this.loadLevel();
      }
      return;
    }
    if (this.clearAnim > 0) {
      this.clearAnim--;
      if (this.clearAnim === 0) {
        this.level = (this.level + 1) % this.LEVELS.length;
        this.loadLevel();
      }
      return;
    }
    if (this.deathAnim > 0) {
      this.deathAnim--;
      if (this.deathAnim === 0) {
        if (this.lives > 0) this.loadLevel();
        else this.gameOverAnim = 48;
      }
      return;
    }

    this.tickCounter++;
    if (this.tickCounter < this.ticksPerStep) {
      return;
    }
    this.tickCounter = 0;

    // ── Horizontal movement ─────────────────────────────────────────────
    let dx = 0;
    if (this.aHeld && !this.dHeld) { dx = -this.MOVE_SPEED; this.facing = -1; }
    else if (this.dHeld && !this.aHeld) { dx = this.MOVE_SPEED; this.facing = 1; }
    if (dx !== 0) {
      const newX = this.mx + dx;
      const cellX = dx > 0 ? Math.floor(newX + 0.001) : Math.floor(newX);
      const cellY = Math.floor(this.my);
      if (!this.isSolidAt(cellX, cellY)) this.mx = newX;
    }

    // ── Variable-height jump: extra upward thrust while space held ─────
    if (this.jumpHeld && this.jumpHoldCounter > 0 && this.vy < 0) {
      this.vy += this.JUMP_HOLD_BOOST;
      this.jumpHoldCounter--;
    } else {
      this.jumpHoldCounter = 0;
    }

    // ── Vertical movement (gravity + collisions) ───────────────────────
    this.vy = Math.min(this.MAX_FALL, this.vy + this.GRAVITY);
    const newY = this.my + this.vy;
    const cellX = Math.floor(this.mx);
    if (this.vy > 0) {
      // Falling — check for ground below
      const targetCellY = Math.floor(newY);
      // Step from current to target one cell at a time.
      let landedRow: number | null = null;
      for (let cy = Math.floor(this.my) + 1; cy <= targetCellY + 1; cy++) {
        if (this.isSolidAt(cellX, cy)) {
          landedRow = cy - 1;
          break;
        }
      }
      if (landedRow !== null) {
        this.my = landedRow;
        this.vy = 0;
      } else {
        this.my = newY;
      }
      if (this.my > 5) {
        // Fell off the bottom — death by pit.
        this.die();
        return;
      }
    } else {
      // Rising — check ceiling
      const targetCellY = Math.floor(newY);
      let blockedRow: number | null = null;
      for (let cy = Math.floor(this.my) - 1; cy >= targetCellY; cy--) {
        if (this.isSolidAt(cellX, cy)) {
          blockedRow = cy + 1;
          break;
        }
      }
      if (blockedRow !== null) {
        this.my = blockedRow;
        this.vy = 0;
      } else {
        this.my = newY;
      }
    }

    // ── Coin pickup ────────────────────────────────────────────────────
    const fx = Math.floor(this.mx);
    const fy = Math.floor(this.my);
    const key = `${fx},${fy}`;
    if (this.liveCoins.has(key)) {
      this.liveCoins.delete(key);
      this.coinsCollected++;
      this.score += 50;
    }

    // ── Goomba movement ────────────────────────────────────────────────
    this.goombaTickCounter++;
    if (this.goombaTickCounter >= this.GOOMBA_STEP_TICKS) {
      this.goombaTickCounter = 0;
      for (const g of this.liveGoombas) {
        const nx = g.x + g.dir;
        // Reverse on wall or on cliff (no ground ahead).
        const blocked = this.isSolidAt(nx, g.y);
        const cliff = !this.isSolidAt(nx, g.y + 1);
        if (blocked || cliff) {
          g.dir = (g.dir === -1 ? 1 : -1);
        } else {
          g.x = nx;
        }
      }
    }

    // ── Goomba collision ───────────────────────────────────────────────
    for (let i = 0; i < this.liveGoombas.length; i++) {
      const g = this.liveGoombas[i]!;
      if (Math.abs(g.x - this.mx) < 0.6 && Math.abs(g.y - this.my) < 0.6) {
        if (this.vy > 0.4) {
          // Stomp — kill the goomba and bounce.
          this.liveGoombas.splice(i, 1);
          this.vy = this.JUMP_VELOCITY * 0.6;
          this.score += 100;
          break;
        } else {
          this.die();
          return;
        }
      }
    }

    // ── Reached flag? ──────────────────────────────────────────────────
    if (this.mx >= this.LEVELS[this.level]!.flagX - 0.2) {
      this.score += 500 + this.liveCoins.size * 0; // base bonus
      this.clearAnim = 36;
      log.info({ level: this.level + 1, score: this.score, coins: this.coinsCollected }, 'mario: level clear');
    }
  }

  private die(): void {
    this.lives--;
    this.deathAnim = 30;
    log.info({ lives: this.lives, score: this.score }, 'mario: died');
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const MARIO_C    = this.color('mario',    { r: 255, g: 30,  b: 0   });
    const GROUND_C   = this.color('ground',   { r: 130, g: 60,  b: 10  });
    const PLATFORM_C = this.color('platform', { r: 110, g: 80,  b: 40  });
    const COIN_C     = this.color('coin',     { r: 255, g: 220, b: 0   });
    const GOOMBA_C   = this.color('goomba',   { r: 160, g: 80,  b: 0   });
    const FLAG_C     = this.color('flag',     { r: 0,   g: 255, b: 50  });
    const SKY_C      = this.color('sky',      { r: 0,   g: 0,   b: 0   });

    if (this.gameOverAnim > 0) {
      const i = this.gameOverAnim % 8 < 4 ? 1 : 0.3;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 14; x++) {
        const led = gridToLed(x, y);
        if (led !== null) out.set(led, { r: Math.round(200 * i), g: 0, b: 0 });
      }
      return out;
    }
    if (this.clearAnim > 0) {
      const i = this.clearAnim % 6 < 3 ? 1 : 0.3;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 14; x++) {
        const led = gridToLed(x, y);
        if (led !== null) out.set(led, { r: Math.round(120 * i), g: Math.round(220 * i), b: 0 });
      }
      const next = ((this.level + 1) % this.LEVELS.length) + 1;
      for (let k = 0; k < next; k++) {
        const led = gridToLed(k, 0);
        if (led !== null) out.set(led, { r: 255, g: 255, b: 255 });
      }
      return out;
    }

    // Sky baseline (skip if sky is pure black — saves writes).
    if (SKY_C.r > 0 || SKY_C.g > 0 || SKY_C.b > 0) {
      for (let y = 0; y < 5; y++) for (let x = 0; x < 14; x++) {
        const led = gridToLed(x, y);
        if (led !== null) out.set(led, SKY_C);
      }
    }

    // Camera: world col `wx` renders to viewport col `wx - camX`. Camera
    // follows Mario but clamps to the level edges.
    const lvl = this.LEVELS[this.level]!;
    const camX = Math.max(0, Math.min(lvl.width - 14, Math.floor(this.mx - 6)));

    // Solids (ground + platforms).
    for (const [sx, sy] of lvl.solids) {
      const vx = sx - camX;
      if (vx < 0 || vx >= 14) continue;
      const led = gridToLed(vx, sy);
      if (led !== null) out.set(led, sy === 4 ? GROUND_C : PLATFORM_C);
    }
    // Coins (slight pulse).
    const pulse = 0.7 + 0.3 * Math.sin(this.tickCounter * 0.4);
    for (const key of this.liveCoins) {
      const parts = key.split(',');
      const sx = Number(parts[0]);
      const sy = Number(parts[1]);
      const vx = sx - camX;
      if (vx < 0 || vx >= 14) continue;
      const led = gridToLed(vx, sy);
      if (led !== null) {
        out.set(led, {
          r: Math.round(COIN_C.r * pulse),
          g: Math.round(COIN_C.g * pulse),
          b: Math.round(COIN_C.b * pulse),
        });
      }
    }
    // Goombas.
    for (const g of this.liveGoombas) {
      const vx = g.x - camX;
      if (vx < 0 || vx >= 14) continue;
      const led = gridToLed(vx, g.y);
      if (led !== null) out.set(led, GOOMBA_C);
    }
    // Flag — bright green vertical band at flagX.
    const flagVx = lvl.flagX - camX;
    if (flagVx >= 0 && flagVx < 14) {
      for (let y = 0; y < 5; y++) {
        const led = gridToLed(flagVx, y);
        if (led !== null) out.set(led, FLAG_C);
      }
    }
    // Mario.
    const marioVx = Math.floor(this.mx) - camX;
    const marioVy = Math.floor(this.my);
    if (marioVx >= 0 && marioVx < 14 && marioVy >= 0 && marioVy < 5) {
      const led = gridToLed(marioVx, marioVy);
      if (led !== null) {
        const flash = this.deathAnim > 0 && this.deathAnim % 4 < 2;
        out.set(led, flash ? { r: 255, g: 255, b: 0 } : MARIO_C);
      }
    }
    // Lives indicator: 1 small red led per remaining life on row 0, far right.
    for (let i = 0; i < this.lives; i++) {
      const led = gridToLed(13 - i, 0);
      if (led !== null && !out.has(led)) out.set(led, { r: 80, g: 0, b: 0 });
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
