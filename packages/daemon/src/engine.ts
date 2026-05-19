import { encodeFirmwareEffect, encodePerKeyFrame } from '@fizz/core/encoder';
import type { FirmwareEffectName, FirmwareEffectParams } from '@fizz/core';
import { computeFrame } from '@fizz/core';
import type { Color, Pattern } from '@fizz/core';
import type { HidController } from './hid.js';
import { log } from './log.js';
import { gridToLed, GRID_HEIGHT } from './game-grid.js';

export interface CurrentEffect {
  name: FirmwareEffectName;
  params: FirmwareEffectParams;
  startedAt: string; // ISO
}

type Listener = (cur: CurrentEffect | null) => void;

/** Snapshot of the host-streamed per-key state for live mirroring in GUIs.
 *  - 'pattern' = an animated stream (chase/wave/games/etc.) is running
 *  - 'static'  = a frozen color map sent via setPerKey
 *  - 'off'     = no perkey activity; firmware effect (or none) owns the LEDs
 */
export type PerkeyState =
  | { mode: 'pattern'; pattern: Pattern }
  | { mode: 'static'; colors: Record<string, string> }
  | { mode: 'off' };

type PerkeyListener = (state: PerkeyState) => void;

function colorMapToHexRecord(colors: Map<number, Color>): Record<string, string> {
  const out: Record<string, string> = {};
  colors.forEach((c, idx) => {
    out[String(idx)] = '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('');
  });
  return out;
}

// ─── Pong game engine ────────────────────────────────────────────────────────

const PADDLE_LEN = 2;

class PongEngine {
  private paddleLeft = 0;  // top Y of left paddle
  private paddleRight = 0; // top Y of right paddle
  private ballX = 7;
  private ballY = 2;
  private ballVX = 1;
  private ballVY = 1;
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 3; // move every 3 frames (~10 Hz at 30fps)

  step(): void {
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    this.ballX += this.ballVX;
    this.ballY += this.ballVY;

    // Bounce top/bottom walls
    if (this.ballY < 0) { this.ballY = 0; this.ballVY = -this.ballVY; }
    if (this.ballY > GRID_HEIGHT - 1) { this.ballY = GRID_HEIGHT - 1; this.ballVY = -this.ballVY; }

    const maxPaddleY = GRID_HEIGHT - PADDLE_LEN;

    // AI: left paddle tracks ball when ball going left
    if (this.ballVX < 0) {
      const mid = this.paddleLeft + PADDLE_LEN / 2;
      if (mid < this.ballY) this.paddleLeft = Math.min(this.paddleLeft + 1, maxPaddleY);
      else if (mid > this.ballY) this.paddleLeft = Math.max(this.paddleLeft - 1, 0);
    } else {
      // Right paddle tracks ball when ball going right
      const mid = this.paddleRight + PADDLE_LEN / 2;
      if (mid < this.ballY) this.paddleRight = Math.min(this.paddleRight + 1, maxPaddleY);
      else if (mid > this.ballY) this.paddleRight = Math.max(this.paddleRight - 1, 0);
    }

    // Left wall: paddle bounce or score
    if (this.ballX <= 0) {
      if (this.ballY >= this.paddleLeft && this.ballY < this.paddleLeft + PADDLE_LEN) {
        this.ballX = 0;
        this.ballVX = -this.ballVX;
      } else {
        this.reset(-1);
      }
    }

    // Right wall: paddle bounce or score
    if (this.ballX >= 13) {
      if (this.ballY >= this.paddleRight && this.ballY < this.paddleRight + PADDLE_LEN) {
        this.ballX = 13;
        this.ballVX = -this.ballVX;
      } else {
        this.reset(1);
      }
    }
  }

  private reset(dir: -1 | 1): void {
    this.ballX = 7;
    this.ballY = 2;
    this.ballVX = dir;
    this.ballVY = Math.random() > 0.5 ? 1 : -1;
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const blue: Color = { r: 80, g: 80, b: 255 };
    const red: Color = { r: 255, g: 80, b: 80 };
    const white: Color = { r: 255, g: 255, b: 255 };

    // Left paddle (col 0, blue)
    for (let i = 0; i < PADDLE_LEN; i++) {
      const led = gridToLed(0, this.paddleLeft + i);
      if (led !== null) out.set(led, blue);
    }
    // Right paddle (col 13, red)
    for (let i = 0; i < PADDLE_LEN; i++) {
      const led = gridToLed(13, this.paddleRight + i);
      if (led !== null) out.set(led, red);
    }
    // Ball (white)
    const ballLed = gridToLed(Math.floor(this.ballX), Math.floor(this.ballY));
    if (ballLed !== null) out.set(ballLed, white);

    return out;
  }
}

// ─── Snake game engine ───────────────────────────────────────────────────────

class SnakeEngine {
  private body: Array<{ x: number; y: number }> = [
    { x: 7, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 2 },
  ];
  private dir = { x: 1, y: 0 };
  private food = { x: 10, y: 2 };
  private tickCounter = 0;
  private foodPulse = 0;
  private readonly TICKS_PER_STEP = 4; // ~7 Hz at 30fps

  step(): void {
    this.foodPulse += 0.15;
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    const head = this.body[0]!;
    const dx = this.food.x - head.x;
    const dy = this.food.y - head.y;

    // Simple AI: prefer larger axis; avoid 180-degree reversal
    if (Math.abs(dx) >= Math.abs(dy)) {
      const newDir = { x: dx > 0 ? 1 : -1, y: 0 };
      if (newDir.x !== -this.dir.x || this.body.length === 1) this.dir = newDir;
    } else if (dy !== 0) {
      const newDir = { x: 0, y: dy > 0 ? 1 : -1 };
      if (newDir.y !== -this.dir.y || this.body.length === 1) this.dir = newDir;
    }

    const newHead = {
      x: (head.x + this.dir.x + 14) % 14,
      y: (head.y + this.dir.y + 5) % 5,
    };

    // Self-collision: check all but last segment (it will be removed)
    const willCollide = this.body.slice(0, -1).some(
      (s) => s.x === newHead.x && s.y === newHead.y,
    );
    if (willCollide) {
      this.body = [{ x: 7, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 2 }];
      this.dir = { x: 1, y: 0 };
      this.spawnFood();
      return;
    }

    this.body.unshift(newHead);
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.spawnFood(); // grow: don't pop tail
    } else {
      this.body.pop();
    }
  }

  private spawnFood(): void {
    for (let attempts = 0; attempts < 200; attempts++) {
      const candidate = {
        x: Math.floor(Math.random() * 14),
        y: Math.floor(Math.random() * 5),
      };
      const onBody = this.body.some((s) => s.x === candidate.x && s.y === candidate.y);
      if (!onBody && gridToLed(candidate.x, candidate.y) !== null) {
        this.food = candidate;
        return;
      }
    }
    // Fallback: pick first available cell
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 14; x++) {
        const onBody = this.body.some((s) => s.x === x && s.y === y);
        if (!onBody && gridToLed(x, y) !== null) {
          this.food = { x, y };
          return;
        }
      }
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();

    // Snake body: head bright green, segments fade
    this.body.forEach((seg, i) => {
      const led = gridToLed(seg.x, seg.y);
      if (led === null) return;
      const intensity = i === 0 ? 1 : Math.max(0.3, 1 - i * 0.05);
      out.set(led, {
        r: Math.round(50 * intensity),
        g: Math.round(255 * intensity),
        b: Math.round(50 * intensity),
      });
    });

    // Food: red pulse
    const foodLed = gridToLed(this.food.x, this.food.y);
    if (foodLed !== null) {
      const pulse = 0.5 + 0.5 * Math.sin(this.foodPulse * 2);
      out.set(foodLed, { r: Math.round(255 * pulse), g: 0, b: 0 });
    }

    return out;
  }
}

// ─── Tetris game engine ──────────────────────────────────────────────────────

const TETROMINOES: Record<string, { cells: Array<[number, number]>; color: Color }> = {
  I: { cells: [[0,0],[0,1],[0,2],[0,3]], color: { r: 0,   g: 200, b: 220 } },
  O: { cells: [[0,0],[0,1],[1,0],[1,1]], color: { r: 220, g: 200, b: 0   } },
  T: { cells: [[0,0],[0,1],[0,2],[1,1]], color: { r: 180, g: 0,   b: 220 } },
  S: { cells: [[0,1],[0,2],[1,0],[1,1]], color: { r: 0,   g: 220, b: 0   } },
  Z: { cells: [[0,0],[0,1],[1,1],[1,2]], color: { r: 220, g: 0,   b: 0   } },
  L: { cells: [[0,0],[0,1],[0,2],[1,0]], color: { r: 220, g: 100, b: 0   } },
  J: { cells: [[0,0],[0,1],[0,2],[1,2]], color: { r: 0,   g: 0,   b: 220 } },
};

class TetrisEngine {
  // field[col][row] = color or null
  private field: Array<Array<Color | null>> = Array.from({ length: 14 }, () => Array(5).fill(null));
  private current: { shape: string; x: number; y: number; color: Color; cells: Array<[number, number]> } | null = null;
  private tickCounter = 0;
  private readonly TICKS_PER_FALL = 8; // gravity tick = ~3.75 Hz (move every 8 frames at 30fps)
  private flashFrames = 0; // line clear flash counter
  private flashCols: number[] = [];

  constructor() {
    this.spawnPiece();
  }

  private spawnPiece(): void {
    const shapeNames = Object.keys(TETROMINOES);
    const shape = shapeNames[Math.floor(Math.random() * shapeNames.length)]!;
    const tet = TETROMINOES[shape]!;
    // Spawn at right edge — find a Y position that doesn't immediately collide
    const maxY = 5 - Math.max(...tet.cells.map(([, dy]) => dy)) - 1;
    const y = Math.floor(Math.random() * Math.max(1, maxY + 1));
    this.current = {
      shape,
      x: 13, // right edge
      y,
      color: tet.color,
      cells: tet.cells,
    };
    // If spawn collides with existing stack, game over → reset field
    if (this.collides(this.current.x, this.current.y, this.current.cells)) {
      this.field = Array.from({ length: 14 }, () => Array(5).fill(null));
      this.current = { ...this.current, x: 13, y };
    }
  }

  private collides(x: number, y: number, cells: Array<[number, number]>): boolean {
    for (const [dx, dy] of cells) {
      const cx = x - dx; // moving LEFT means subtracting dx
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cy >= 5) return true;
      if (this.field[cx]![cy] !== null) return true;
    }
    return false;
  }

  private lockPiece(): void {
    if (!this.current) return;
    for (const [dx, dy] of this.current.cells) {
      const cx = this.current.x - dx;
      const cy = this.current.y + dy;
      if (cx >= 0 && cx < 14 && cy >= 0 && cy < 5) {
        this.field[cx]![cy] = this.current.color;
      }
    }
    // Check for full columns (a "line" in sideways Tetris)
    const fullCols: number[] = [];
    for (let cx = 0; cx < 14; cx++) {
      if (this.field[cx]!.every((cell) => cell !== null)) fullCols.push(cx);
    }
    if (fullCols.length > 0) {
      this.flashCols = fullCols;
      this.flashFrames = 6; // flash for 6 frames before removing
    }
    this.current = null;
  }

  private clearFullCols(): void {
    if (this.flashCols.length === 0) return;
    // Remove the full columns and shift the rest toward the right (stack grows from left)
    const newField: Array<Array<Color | null>> = Array.from({ length: 14 }, () => Array(5).fill(null));
    let writeCol = 13;
    for (let readCol = 13; readCol >= 0; readCol--) {
      if (this.flashCols.includes(readCol)) continue; // skip cleared
      newField[writeCol] = this.field[readCol]!;
      writeCol--;
    }
    this.field = newField;
    this.flashCols = [];
  }

  step(): void {
    this.tickCounter++;
    if (this.flashFrames > 0) {
      this.flashFrames--;
      if (this.flashFrames === 0) {
        this.clearFullCols();
        this.spawnPiece();
      }
      return;
    }
    if (this.tickCounter < this.TICKS_PER_FALL) return;
    this.tickCounter = 0;

    if (!this.current) {
      this.spawnPiece();
      return;
    }

    // Try moving leftward
    const newX = this.current.x - 1;
    if (this.collides(newX, this.current.y, this.current.cells)) {
      // Lock in place
      this.lockPiece();
    } else {
      this.current.x = newX;
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Draw locked field
    for (let cx = 0; cx < 14; cx++) {
      for (let cy = 0; cy < 5; cy++) {
        const cell = this.field[cx]![cy];
        if (cell != null) {
          // If this col is flashing, alternate bright white
          const isFlashing = this.flashCols.includes(cx);
          const intensity: Color = isFlashing && this.flashFrames % 2 === 0
            ? { r: 255, g: 255, b: 255 }
            : cell;
          const led = gridToLed(cx, cy);
          if (led !== null) out.set(led, intensity);
        }
      }
    }
    // Draw active piece
    if (this.current && this.flashFrames === 0) {
      for (const [dx, dy] of this.current.cells) {
        const cx = this.current.x - dx;
        const cy = this.current.y + dy;
        if (cx >= 0 && cx < 14 && cy >= 0 && cy < 5) {
          const led = gridToLed(cx, cy);
          if (led !== null) out.set(led, this.current.color);
        }
      }
    }
    return out;
  }
}

// ─── Matrix Rain animation ───────────────────────────────────────────────────

class MatrixRainEngine {
  // Each column has a stream with a head Y position and length.
  private streams: Array<{ y: number; len: number; speed: number } | null> = new Array(14).fill(null);
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 3;  // 10Hz update

  step(): void {
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    // Spawn new streams randomly in empty columns
    for (let x = 0; x < 14; x++) {
      if (this.streams[x] === null && Math.random() < 0.15) {
        this.streams[x] = { y: 0, len: 2 + Math.floor(Math.random() * 4), speed: 1 };
      }
    }
    // Advance each stream
    for (let x = 0; x < 14; x++) {
      const s = this.streams[x];
      if (s) {
        s.y += s.speed;
        // Once the head has passed the bottom AND the trail too, retire
        if (s.y - s.len > 5) {
          this.streams[x] = null;
        }
      }
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    for (let x = 0; x < 14; x++) {
      const s = this.streams[x];
      if (!s) continue;
      for (let trail = 0; trail < s.len; trail++) {
        const y = s.y - trail;
        if (y < 0 || y >= 5) continue;
        // Head = bright white-green, trail fades to dim green
        const intensity = trail === 0 ? 1 : Math.max(0.1, 1 - trail / s.len);
        const isHead = trail === 0;
        const color: Color = isHead
          ? { r: 200, g: 255, b: 200 }
          : { r: 0, g: Math.round(220 * intensity), b: Math.round(60 * intensity) };
        const led = gridToLed(x, y);
        if (led !== null) out.set(led, color);
      }
    }
    return out;
  }
}

// ─── Breakout animation ──────────────────────────────────────────────────────

class BreakoutEngine {
  private paddleX = 6;  // gridX, left edge of paddle (paddle is 3 cells wide)
  private readonly PADDLE_WIDTH = 3;
  private ballX = 7;
  private ballY = 3;
  private ballVX = 1;
  private ballVY = -1;  // start moving up
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 4;  // 7.5Hz
  // Bricks at rows 0-1
  private bricks: Array<{ x: number; y: number; color: Color }> = [];

  constructor() {
    this.seedBricks();
  }

  private seedBricks() {
    this.bricks = [];
    const colors: Color[] = [
      { r: 220, g: 30, b: 30 },   // red
      { r: 220, g: 140, b: 0 },   // orange
    ];
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 14; x++) {
        if (Math.random() < 0.85) {  // 85% chance per brick
          this.bricks.push({ x, y, color: colors[y]! });
        }
      }
    }
  }

  step(): void {
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    // Move paddle toward ball
    const ballCenter = this.ballX;
    const paddleCenter = this.paddleX + 1;
    if (ballCenter < paddleCenter && this.paddleX > 0) this.paddleX--;
    else if (ballCenter > paddleCenter && this.paddleX < 14 - this.PADDLE_WIDTH) this.paddleX++;

    // Move ball
    let nx = this.ballX + this.ballVX;
    let ny = this.ballY + this.ballVY;

    // Bounce off left/right walls
    if (nx < 0) { nx = 0; this.ballVX = -this.ballVX; }
    if (nx > 13) { nx = 13; this.ballVX = -this.ballVX; }
    // Bounce off top wall
    if (ny < 0) { ny = 0; this.ballVY = -this.ballVY; }

    // Bounce off paddle (row 4, cells paddleX..paddleX+2)
    if (ny === 4 && nx >= this.paddleX && nx < this.paddleX + this.PADDLE_WIDTH) {
      ny = 4;
      this.ballVY = -this.ballVY;
      // Add some english based on where it hit
      const hitOffset = nx - (this.paddleX + 1);  // -1, 0, or 1
      this.ballVX = Math.sign(hitOffset || this.ballVX);
    }
    // Missed — reset
    if (ny > 4) {
      this.ballX = 7; this.ballY = 3;
      this.ballVX = Math.random() > 0.5 ? 1 : -1;
      this.ballVY = -1;
      return;
    }

    // Brick collision
    const brickIdx = this.bricks.findIndex((b) => b.x === nx && b.y === ny);
    if (brickIdx >= 0) {
      this.bricks.splice(brickIdx, 1);
      this.ballVY = -this.ballVY;
    }

    this.ballX = nx;
    this.ballY = ny;

    // Reseed bricks if all cleared
    if (this.bricks.length === 0) this.seedBricks();
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Bricks
    for (const b of this.bricks) {
      const led = gridToLed(b.x, b.y);
      if (led !== null) out.set(led, b.color);
    }
    // Paddle (white)
    for (let i = 0; i < this.PADDLE_WIDTH; i++) {
      const led = gridToLed(this.paddleX + i, 4);
      if (led !== null) out.set(led, { r: 200, g: 200, b: 220 });
    }
    // Ball (cyan)
    const ballLed = gridToLed(this.ballX, this.ballY);
    if (ballLed !== null) out.set(ballLed, { r: 80, g: 255, b: 255 });
    return out;
  }
}

// ─── HSV helper ─────────────────────────────────────────────────────────────

function hsvToColor(h: number, s: number, v: number): Color {
  const c = v * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1)      { r = c; g = x; }
  else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; }
  else             { r = c; b = x; }
  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// ─── Fireworks animation ─────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;     // 0..1, decreases each step
  color: Color;
}

class FireworksEngine {
  private particles: Particle[] = [];
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 3;  // ~10Hz physics
  private readonly LAUNCH_INTERVAL = 18;  // every ~0.6s a new firework
  private launchCounter = 0;

  private spawnFirework(): void {
    const cx = Math.random() * 13;
    const cy = Math.random() * 4;
    const baseHue = Math.random() * 360;
    const count = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.6;
      const color = hsvToColor(baseHue + (Math.random() - 0.5) * 30, 1, 1);
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color,
      });
    }
  }

  step(): void {
    this.tickCounter++;
    this.launchCounter++;
    if (this.launchCounter >= this.LAUNCH_INTERVAL) {
      this.launchCounter = 0;
      this.spawnFirework();
    }
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    // Update particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;  // gravity
      p.life -= 0.05;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < 6 && p.x >= -1 && p.x <= 14);
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    for (const p of this.particles) {
      const gx = Math.round(p.x);
      const gy = Math.round(p.y);
      const led = gridToLed(gx, gy);
      if (led === null) continue;
      const dim = {
        r: Math.round(p.color.r * p.life),
        g: Math.round(p.color.g * p.life),
        b: Math.round(p.color.b * p.life),
      };
      // If multiple particles overlap, take the brightest
      const existing = out.get(led);
      if (existing) {
        out.set(led, {
          r: Math.max(existing.r, dim.r),
          g: Math.max(existing.g, dim.g),
          b: Math.max(existing.b, dim.b),
        });
      } else {
        out.set(led, dim);
      }
    }
    return out;
  }
}

// ─── DVD Bouncer animation ───────────────────────────────────────────────────

class DvdBouncerEngine {
  private x = 4;
  private y = 2;
  private vx = 1;
  private vy = 1;
  private hue = 200;
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 5;  // 6Hz movement

  step(): void {
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    let nx = this.x + this.vx;
    let ny = this.y + this.vy;
    let bounced = false;

    if (nx < 0) { nx = 0; this.vx = -this.vx; bounced = true; }
    if (nx > 13) { nx = 13; this.vx = -this.vx; bounced = true; }
    if (ny < 0) { ny = 0; this.vy = -this.vy; bounced = true; }
    if (ny > 4) { ny = 4; this.vy = -this.vy; bounced = true; }

    if (bounced) {
      this.hue = (this.hue + 47) % 360;  // shift color on each bounce
    }

    this.x = nx;
    this.y = ny;
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const led = gridToLed(this.x, this.y);
    if (led !== null) out.set(led, hsvToColor(this.hue, 1, 1));
    return out;
  }
}

// ─── Heart Rate (ECG) animation ──────────────────────────────────────────────

class HeartRateEngine {
  private cursor = 0;           // current X position of the scan line
  private wave: number[] = [];  // ECG waveform values (-1..1)
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 2;  // 15Hz scan

  constructor() {
    // Generate a 14-column ECG-like waveform: flat baseline + spike pattern
    this.wave = new Array(14).fill(0);
    this.wave[3] = 0.3;   // P wave
    this.wave[4] = 0.2;
    this.wave[6] = -0.4;  // Q
    this.wave[7] = 1.0;   // R (big spike up)
    this.wave[8] = -0.6;  // S
    this.wave[10] = 0.4;  // T wave
    this.wave[11] = 0.3;
  }

  step(): void {
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;
    this.cursor = (this.cursor + 1) % 14;
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    for (let x = 0; x < 14; x++) {
      const wavY = this.wave[x] ?? 0;
      // Map wave (-1..1) to grid Y (0..4), center at row 2
      const gy = Math.max(0, Math.min(4, Math.round(2 - wavY * 2)));
      // Distance from cursor — closer = brighter
      const dist = (this.cursor - x + 14) % 14;
      const intensity = dist === 0 ? 1 : Math.max(0.15, 1 - dist / 8);
      const color: Color = {
        r: Math.round(0 * intensity),
        g: Math.round(255 * intensity),
        b: Math.round(20 * intensity),
      };
      const led = gridToLed(x, gy);
      if (led !== null) out.set(led, color);
    }
    return out;
  }
}

// ─── Equalizer animation ─────────────────────────────────────────────────────

class EqualizerEngine {
  private bars: Array<{ height: number; target: number }> = [];
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 2;  // 15Hz update

  constructor() {
    for (let i = 0; i < 14; i++) {
      this.bars.push({ height: 0, target: 0 });
    }
    this.shuffleTargets();
  }

  private shuffleTargets(): void {
    for (const b of this.bars) {
      b.target = Math.random() * 5;
    }
  }

  step(): void {
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    // Occasionally reshuffle targets (simulates beat changes)
    if (Math.random() < 0.05) this.shuffleTargets();

    // Smoothly approach targets
    for (const b of this.bars) {
      const diff = b.target - b.height;
      b.height += diff * 0.4;
      // Small random jitter for liveliness
      b.height += (Math.random() - 0.5) * 0.3;
      b.height = Math.max(0, Math.min(5, b.height));
      // Pick a new target sometimes
      if (Math.random() < 0.1) b.target = Math.random() * 5;
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Each column: paint bottom-up cells in gradient (green→yellow→red)
    for (let x = 0; x < 14; x++) {
      const h = this.bars[x]!.height;
      for (let y = 0; y < 5; y++) {
        const cellHeight = 5 - y;  // y=4 (bottom) is height 1, y=0 (top) is height 5
        if (cellHeight > h) continue;
        // Color: green at bottom, red at top
        const norm = (4 - y) / 4;
        const color: Color =
          norm < 0.5
            ? { r: Math.round(255 * (norm * 2)), g: 255, b: 0 }
            : { r: 255, g: Math.round(255 * (1 - (norm - 0.5) * 2)), b: 0 };
        const led = gridToLed(x, y);
        if (led !== null) out.set(led, color);
      }
    }
    return out;
  }
}

// ─── Rule 30 cellular automaton ──────────────────────────────────────────────

class Rule30Engine {
  private rows: boolean[][] = [];  // history, oldest first; max 5 rows
  private tickCounter = 0;
  private readonly TICKS_PER_STEP = 12;  // ~2.5Hz new generation

  constructor() {
    // Seed with a single cell in the middle
    const seed = new Array(14).fill(false);
    seed[7] = true;
    this.rows = [seed];
  }

  private nextRow(prev: boolean[]): boolean[] {
    const out = new Array(14).fill(false);
    for (let i = 0; i < 14; i++) {
      const left = prev[(i - 1 + 14) % 14] ? 1 : 0;
      const center = prev[i] ? 1 : 0;
      const right = prev[(i + 1) % 14] ? 1 : 0;
      const pattern = (left << 2) | (center << 1) | right;
      // Rule 30 truth table: 00011110 → outputs for patterns 7,6,5,4,3,2,1,0
      const rule = 0b00011110;
      out[i] = ((rule >> pattern) & 1) === 1;
    }
    return out;
  }

  step(): void {
    this.tickCounter++;
    if (this.tickCounter < this.TICKS_PER_STEP) return;
    this.tickCounter = 0;

    const last = this.rows[this.rows.length - 1]!;
    const next = this.nextRow(last);

    // If pattern stabilizes to all-false or all-true, reseed
    const allDead = next.every((c) => !c);
    const allAlive = next.every((c) => c);
    if (allDead || allAlive) {
      const seed = new Array(14).fill(false);
      seed[Math.floor(Math.random() * 14)] = true;
      this.rows = [seed];
      return;
    }

    this.rows.push(next);
    if (this.rows.length > 5) this.rows.shift();
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Render history bottom-up: newest row at bottom (y=4), oldest at top
    const totalRows = this.rows.length;
    for (let i = 0; i < totalRows; i++) {
      const y = 5 - totalRows + i;  // align bottom
      if (y < 0 || y >= 5) continue;
      const row = this.rows[i]!;
      const age = i / totalRows;  // 0=oldest, 1=newest
      for (let x = 0; x < 14; x++) {
        if (row[x]) {
          // Fade older rows
          const intensity = 0.3 + age * 0.7;
          const color: Color = {
            r: Math.round(200 * intensity),
            g: Math.round(80 * intensity),
            b: Math.round(255 * intensity),
          };
          const led = gridToLed(x, y);
          if (led !== null) out.set(led, color);
        }
      }
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class EffectEngine {
  private state: CurrentEffect | null = null;
  private listeners: Listener[] = [];
  private streamInterval: ReturnType<typeof setInterval> | null = null;
  private streamStart = 0;
  private currentPattern: Pattern | null = null;

  // Persistent state for reconnect restoration — mutually exclusive
  private lastPattern: Pattern | null = null;
  private lastPerKeyColors: Map<number, Color> | null = null;
  private lastNamedEffect: { name: FirmwareEffectName; params: FirmwareEffectParams } | null = null;

  constructor(private readonly hid: HidController) {
    this.hid.on('connect', () => {
      log.info('HID reconnected — restoring last state');
      this.restoreLastState().catch((err) => log.warn({ err: (err as Error).message }, 'restore failed'));
    });
  }

  private async restoreLastState(): Promise<void> {
    if (this.lastPattern) {
      log.info({ animType: this.lastPattern.animType }, 'restoring pattern stream');
      await this.startPattern(this.lastPattern);
    } else if (this.lastPerKeyColors && this.lastPerKeyColors.size > 0) {
      log.info({ keys: this.lastPerKeyColors.size }, 'restoring per-key colors');
      const frame = encodePerKeyFrame(this.lastPerKeyColors);
      await this.hid.sendFeatureReport(frame);
    } else if (this.lastNamedEffect) {
      log.info({ name: this.lastNamedEffect.name }, 'restoring named effect');
      await this.runEffect(this.lastNamedEffect.name, this.lastNamedEffect.params);
    }
  }

  current(): CurrentEffect | null { return this.state; }

  onChange(listener: Listener): void { this.listeners.push(listener); }

  private perkeyListeners: PerkeyListener[] = [];
  onPerkeyChange(listener: PerkeyListener): void { this.perkeyListeners.push(listener); }
  private notifyPerkey(s: PerkeyState): void {
    for (const l of this.perkeyListeners) {
      try { l(s); } catch (err) { log.warn({ err }, 'perkey listener threw'); }
    }
  }
  /** Current host-side perkey snapshot — used by clients to mirror state. */
  currentPerkey(): PerkeyState {
    if (this.currentPattern) return { mode: 'pattern', pattern: this.currentPattern };
    if (this.lastPerKeyColors && this.lastPerKeyColors.size > 0) {
      return { mode: 'static', colors: colorMapToHexRecord(this.lastPerKeyColors) };
    }
    return { mode: 'off' };
  }

  stopStreamLoop(): void {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
      this.currentPattern = null;
      log.info('stream stopped');
      this.notifyPerkey({ mode: 'off' });
    }
  }

  async runEffect(name: FirmwareEffectName, params: FirmwareEffectParams): Promise<void> {
    this.stopStreamLoop();
    this.lastNamedEffect = { name, params };
    this.lastPattern = null;
    this.lastPerKeyColors = null;
    const frames = encodeFirmwareEffect(name, params);
    await this.hid.sendFrames(frames);
    this.state = { name, params, startedAt: new Date().toISOString() };
    log.info({ name, params }, 'effect started');
    this.notify();
  }

  stop(): void {
    this.stopStreamLoop();
    this.lastPattern = null;
    this.lastPerKeyColors = null;
    this.lastNamedEffect = null;
    if (this.state) {
      log.info({ name: this.state.name }, 'effect stopped');
      this.state = null;
      this.notify();
    }
  }

  /**
   * Send a per-key color map to the keyboard using the Sinodragon protocol.
   * Clears any active named effect from state (the keyboard is now in per-key
   * mode; there is no FirmwareEffectName for this — we null out state).
   * Phase 3 TODO: extend CurrentEffect to carry a 'perkey' variant instead.
   */
  async setPerKey(colors: Map<number, Color>): Promise<void> {
    this.stopStreamLoop();
    this.lastPerKeyColors = new Map(colors);
    this.lastPattern = null;
    this.lastNamedEffect = null;
    const frame = encodePerKeyFrame(colors);
    await this.hid.sendFeatureReport(frame);
    // Per-key mode does not correspond to a named firmware effect; clear state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.state = null; // caller owns per-key state; daemon tracks nothing for now
    log.info({ keys: colors.size }, 'static frame sent (perkey.set)');
    this.notify();
    this.notifyPerkey(
      colors.size === 0
        ? { mode: 'off' }
        : { mode: 'static', colors: colorMapToHexRecord(colors) },
    );
  }

  async startPattern(pattern: Pattern): Promise<void> {
    this.stopStreamLoop();
    this.lastPattern = pattern;
    this.lastPerKeyColors = null;
    this.lastNamedEffect = null;
    this.currentPattern = pattern;
    this.streamStart = performance.now();
    this.notifyPerkey({ mode: 'pattern', pattern });

    if (pattern.animType === 'pong') {
      const game = new PongEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('pong stream started');
      return;
    }

    if (pattern.animType === 'snake') {
      const game = new SnakeEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('snake stream started');
      return;
    }

    if (pattern.animType === 'tetris') {
      const game = new TetrisEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('tetris stream started');
      return;
    }

    if (pattern.animType === 'matrix-rain') {
      const game = new MatrixRainEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Matrix Rain stream started');
      return;
    }

    if (pattern.animType === 'breakout') {
      const game = new BreakoutEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Breakout stream started');
      return;
    }

    if (pattern.animType === 'fireworks') {
      const game = new FireworksEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Fireworks stream started');
      return;
    }

    if (pattern.animType === 'dvd') {
      const game = new DvdBouncerEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('DVD bouncer stream started');
      return;
    }

    if (pattern.animType === 'heart-rate') {
      const game = new HeartRateEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Heart rate stream started');
      return;
    }

    if (pattern.animType === 'equalizer') {
      const game = new EqualizerEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Equalizer stream started');
      return;
    }

    if (pattern.animType === 'rule30') {
      const game = new Rule30Engine();
      this.streamInterval = setInterval(() => {
        game.step();
        const frame = encodePerKeyFrame(game.render());
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Rule 30 stream started');
      return;
    }

    if (pattern.animType === 'solid') {
      // Just send one frame, no loop needed
      const colors = computeFrame(pattern, 0, 61);
      const frame = encodePerKeyFrame(colors);
      await this.hid.sendFeatureReport(frame);
      log.info({ animType: 'solid', keys: Object.keys(pattern.keys).length }, 'pattern (solid) applied');
      return;
    }

    // Start 30fps stream
    const tickIntervalMs = 1000 / 30;
    this.streamInterval = setInterval(() => {
      if (!this.currentPattern) return;
      const t = (performance.now() - this.streamStart) / 1000;
      const colors = computeFrame(this.currentPattern, t, 61);
      const frame = encodePerKeyFrame(colors);
      this.hid.sendFeatureReport(frame).catch((err) => {
        log.warn({ err: (err as Error).message }, 'frame send failed; stopping stream (will auto-resume on reconnect via lastPattern)');
        this.stopStreamLoop();
      });
    }, tickIntervalMs);

    log.info(
      { animType: pattern.animType, keys: Object.keys(pattern.keys).length, speed: pattern.animSpeed },
      'stream started (perkey.startPattern)',
    );
  }

  async stopPattern(): Promise<void> {
    this.stopStreamLoop();
    this.lastPattern = null;
    this.lastPerKeyColors = null;
    this.lastNamedEffect = null;
    // Send all-black to clear
    const colors = new Map<number, { r: number; g: number; b: number }>();
    const frame = encodePerKeyFrame(colors);
    await this.hid.sendFeatureReport(frame);
    log.info('pattern stopped, all keys off');
  }

  private notify(): void { for (const l of this.listeners) l(this.state); }
}
