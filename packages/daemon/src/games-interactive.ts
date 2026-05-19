/**
 * Interactive game engines that respond to physical keyboard input from
 * fizzd's evdev listener. Each engine implements the InteractiveEngine
 * surface (step / render / handleKey).
 *
 * Layout convention: row 0 = scoreboard or HUD (top of keyboard, F-row),
 * rows 1..4 = play area, cols 0..13.
 */

import type { Color } from '@fizz/core';
import { K617_LAYOUT } from '@fizz/core';
import { gridToLed } from './game-grid.js';
import { log } from './log.js';
import {
  KEY_TAB, KEY_CAPSLOCK, KEY_LEFTSHIFT, KEY_LEFTCTRL,
  KEY_BACKSLASH, KEY_ENTER, KEY_RIGHTSHIFT, KEY_RIGHTCTRL,
  KEY_W, KEY_A, KEY_S, KEY_D,
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

export class PacmanEngine {
  private px = 7;
  private py = 2;
  private dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 } = { x: 1, y: 0 };
  private queuedDir: { x: -1 | 0 | 1; y: -1 | 0 | 1 } | null = null;
  private ghosts: Array<{ x: number; y: number; color: Color }> = [];
  private dots: Set<string> = new Set(); // "x,y" strings
  private score = 0;
  private deaths = 0;
  private tickCounter = 0;
  private ticksPerStep = 8;
  private mouthPhase = 0;

  constructor() {
    this.spawnGhosts();
    this.scatterDots();
  }

  setAnimSpeed(s: number): void {
    const clamped = Math.max(0, Math.min(1, s));
    this.ticksPerStep = Math.round(12 - clamped * 7);
  }

  private spawnGhosts(): void {
    this.ghosts = [
      { x: 1, y: 0, color: { r: 255, g: 0, b: 60 } },        // Blinky red
      { r: 0, y: 4, color: { r: 0, g: 200, b: 255 } } as unknown as { x: number; y: number; color: Color }, // placeholder
    ];
    // Fix: corrected above to use proper x,y. Use clean version:
    this.ghosts = [
      { x: 1, y: 0, color: { r: 255, g: 0, b: 60 } },
      { x: 13, y: 4, color: { r: 0, g: 200, b: 255 } },
    ];
  }

  private scatterDots(): void {
    this.dots.clear();
    // Place a dot on every grid cell, then remove player + ghost positions.
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 14; x++) {
        this.dots.add(`${x},${y}`);
      }
    }
    this.dots.delete(`${this.px},${this.py}`);
    for (const g of this.ghosts) this.dots.delete(`${g.x},${g.y}`);
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    let nx: -1 | 0 | 1 = this.dir.x;
    let ny: -1 | 0 | 1 = this.dir.y;
    if (keycode === KEY_W)      { nx = 0;  ny = -1; }
    else if (keycode === KEY_S) { nx = 0;  ny = 1; }
    else if (keycode === KEY_A) { nx = -1; ny = 0; }
    else if (keycode === KEY_D) { nx = 1;  ny = 0; }
    else return;
    this.queuedDir = { x: nx, y: ny };
  }

  step(): void {
    this.mouthPhase += 0.25;
    this.tickCounter++;
    if (this.tickCounter < this.ticksPerStep) return;
    this.tickCounter = 0;

    if (this.queuedDir) {
      this.dir = this.queuedDir;
      this.queuedDir = null;
    }

    // Move Pacman.
    this.px = (this.px + this.dir.x + 14) % 14;
    this.py = (this.py + this.dir.y + 5) % 5;
    this.dots.delete(`${this.px},${this.py}`);
    if (this.dots.size === 0) {
      this.score += 10;
      this.scatterDots();
    } else {
      this.score++;
    }

    // Move ghosts every other tick so they're slower than Pacman.
    if (Math.random() < 0.85) {
      for (const g of this.ghosts) {
        // Simple chase: move 1 step toward Pacman on the larger axis.
        const dx = this.px - g.x;
        const dy = this.py - g.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          g.x += Math.sign(dx);
        } else {
          g.y += Math.sign(dy);
        }
        g.x = (g.x + 14) % 14;
        g.y = (g.y + 5) % 5;
      }
    }

    // Collision with ghost — Pacman dies.
    for (const g of this.ghosts) {
      if (g.x === this.px && g.y === this.py) {
        this.deaths++;
        log.info({ score: this.score, deaths: this.deaths }, 'pacman: caught');
        this.px = 7;
        this.py = 2;
        this.dir = { x: 1, y: 0 };
        this.queuedDir = null;
        this.spawnGhosts();
        if (this.deaths >= 3) {
          this.score = 0;
          this.deaths = 0;
          this.scatterDots();
        }
        break;
      }
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Dots — dim white.
    for (const key of this.dots) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const led = gridToLed(x, y);
      if (led !== null) out.set(led, { r: 50, g: 50, b: 30 });
    }
    // Ghosts.
    for (const g of this.ghosts) {
      const led = gridToLed(g.x, g.y);
      if (led !== null) out.set(led, g.color);
    }
    // Pacman — yellow with a small "blink" to suggest mouth chomping.
    const ledP = gridToLed(this.px, this.py);
    if (ledP !== null) {
      const chomp = Math.sin(this.mouthPhase) > 0;
      out.set(ledP, chomp ? YELLOW : { r: 220, g: 170, b: 0 });
    }
    return out;
  }
}

// Suppress unused-import warnings for engines that don't use every keycode.
void ORANGE; void MAGENTA;
