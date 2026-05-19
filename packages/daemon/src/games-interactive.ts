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
    // Blinky (red) spawns top-left, Inky (cyan) spawns bottom-right —
    // opposite corners from Pacman so the first second isn't an instant death.
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
      out.set(escLed, this.ammo > 0 ? CYAN : { r: 80, g: 40, b: 0 });
    }
    // 1..7 = kill counter for the current round (was HP — enemies don't
    // damage the player anymore, so HP was always full and uninformative).
    const KILL_KEYS = ['1', '2', '3', '4', '5', '6', '7'];
    for (let i = 0; i < this.kills && i < KILL_KEYS.length; i++) {
      const led = findKeyLed(KILL_KEYS[i]!);
      if (led !== null) out.set(led, GREEN);
    }
    // 8 = muzzle flash
    if (this.muzzleFlash > 0) {
      const led = findKeyLed('8');
      if (led !== null) out.set(led, WHITE);
    }
    // 0,Minus,Equal,Backspace = ammo (4 slots)
    const AMMO_KEYS = ['0', 'Minus', 'Equal', 'Backspace'];
    for (let i = 0; i < this.ammo && i < AMMO_KEYS.length; i++) {
      const led = findKeyLed(AMMO_KEYS[i]!);
      if (led !== null) out.set(led, YELLOW);
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
      const slice: Color = isEnemy
        ? { r: Math.round(255 * fade), g: 0, b: Math.round(80 * fade) }
        : { r: Math.round(110 * fade), g: Math.round(110 * fade), b: Math.round(160 * fade) };

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
      if (floorLed !== null) out.set(floorLed, { r: 60, g: 30, b: 5 });
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
    // Saturated palette — every channel pushed close to pure for maximum
    // contrast on the K617's white keycaps.
    const SKY_TOP: Color = { r: 0, g: 100, b: 255 };       // vivid royal blue
    const SKY_BOTTOM: Color = { r: 40, g: 180, b: 255 };   // sky cyan-blue
    const DIRT: Color = { r: 200, g: 90, b: 10 };          // rich brown
    const GRASS: Color = { r: 0, g: 255, b: 0 };           // pure green
    const SUN: Color = { r: 255, g: 110, b: 0 };           // orange (was yellow)
    const CLOUD: Color = { r: 255, g: 255, b: 255 };       // pure white

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
