import { encodeFirmwareEffect, encodePerKeyFrame } from '@fizz/core/encoder';
import type { FirmwareEffectName, FirmwareEffectParams } from '@fizz/core';
import { computeFrameInto, K617_LAYOUT } from '@fizz/core';
import type { Color, Pattern } from '@fizz/core';
import type { HidController } from './hid.js';
import { log } from './log.js';
import { gridToLed, GRID_HEIGHT } from './game-grid.js';
import {
  KeyCapture,
  PADDLE_KEYCODES,
  KEY_TAB, KEY_CAPSLOCK, KEY_LEFTSHIFT, KEY_LEFTCTRL,
} from './key-capture.js';
import {
  PongMultiplayerEngine,
  SnakeInteractiveEngine,
  BreakoutInteractiveEngine,
  PacmanEngine,
  DoomEngine,
  MinecraftCloudsEngine,
  SpaceInvadersEngine,
  MarioEngine,
  GeniusEngine,
  RippleEngine,
  SparkEngine,
  BinaryClockEngine,
  DoomFireEngine,
  WhacAMoleEngine,
  BulletHellEngine,
  DragRaceEngine,
  FroggerEngine,
  WordleEngine,
  KeyboardCrawlEngine,
  CursedKeyboardEngine,
} from './games-interactive.js';

/** Common surface every interactive engine implements so EffectEngine can
 *  dispatch physical-keyboard events uniformly. */
interface InteractiveEngine {
  step(): void;
  render(): Map<number, Color>;
  /** Called on every keydown (value === 1). Engines that want key-up should
   *  inspect value themselves; most don't. */
  handleKey(keycode: number, value: number): void;
  /** Optional: receive per-palette-slot color overrides from
   *  pattern.colorOverrides so the GUI can recolor stateful animations. */
  setColorOverrides?(overrides: Record<string, string>): void;
}

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

/**
 * Apply the user's vibrancy multiplier to every color in a frame. Called by
 * the stream loops right before encoding so the global tonality slider on
 * the GUI affects stateful animations too — without this, Minecraft / games
 * / Aquarium ignored vibrancy completely (they generate colors from internal
 * state and never touched the client-side transform).
 */
function applyVibrancyInPlace(colors: Map<number, Color>, v: number): void {
  if (v === 1) return;
  if (v <= 1) {
    colors.forEach((c, k) => {
      colors.set(k, {
        r: Math.round(c.r * v),
        g: Math.round(c.g * v),
        b: Math.round(c.b * v),
      });
    });
    return;
  }
  const boost = Math.min(1, v - 1);
  colors.forEach((c, k) => {
    const max = Math.max(c.r, c.g, c.b);
    const isMax = (n: number) => n >= max - 1;
    colors.set(k, {
      r: Math.round(isMax(c.r) ? c.r + (255 - c.r) * boost : c.r * (1 - boost * 0.5)),
      g: Math.round(isMax(c.g) ? c.g + (255 - c.g) * boost : c.g * (1 - boost * 0.5)),
      b: Math.round(isMax(c.b) ? c.b + (255 - c.b) * boost : c.b * (1 - boost * 0.5)),
    });
  });
}

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

// ─── CPU thermal heatmap ─────────────────────────────────────────────────────

/**
 * Reads each `/sys/class/thermal/thermal_zone{N}/temp` once per second and
 * paints the keyboard with a heat gradient (cool blue → warm yellow → hot red).
 *
 * No external dependency: Linux exposes thermals as plain text under /sys.
 * If we can't read any zones we keep the seeded value so the user still sees
 * something instead of a dark keyboard.
 */
class CpuThermalEngine {
  private temp = 40; // °C, seeded warm so the first frame doesn't look "off"
  private cursor = 0;
  private readonly GRADIENT: Color[] = [
    { r: 0, g: 80, b: 255 },     // < 35°C — pure blue
    { r: 0, g: 255, b: 255 },    // 35-50°C — cyan
    { r: 0, g: 255, b: 0 },      // 50-65°C — pure green
    { r: 255, g: 200, b: 0 },    // 65-75°C — yellow
    { r: 255, g: 100, b: 0 },    // 75-85°C — orange
    { r: 255, g: 0, b: 0 },      // > 85°C — pure red
  ];

  step(): void {
    this.cursor = (this.cursor + 1) % 30;
    if (this.cursor !== 0) return; // only sample once per second at 30fps
    try {
      // Lazy require so the daemon can still boot if /sys isn't present.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs');
      const zonesDir = '/sys/class/thermal';
      let maxTempC = -Infinity;
      for (const entry of fs.readdirSync(zonesDir)) {
        if (!entry.startsWith('thermal_zone')) continue;
        try {
          const raw = fs.readFileSync(`${zonesDir}/${entry}/temp`, 'utf8').trim();
          const milliC = Number(raw);
          if (!Number.isFinite(milliC)) continue;
          const c = milliC / 1000;
          if (c > maxTempC) maxTempC = c;
        } catch { /* zone unreadable, skip */ }
      }
      if (maxTempC > -Infinity) this.temp = maxTempC;
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'thermal sample failed');
    }
  }

  private colorForTemp(c: number): Color {
    if (c < 35) return this.GRADIENT[0]!;
    if (c < 50) return this.GRADIENT[1]!;
    if (c < 65) return this.GRADIENT[2]!;
    if (c < 75) return this.GRADIENT[3]!;
    if (c < 85) return this.GRADIENT[4]!;
    return this.GRADIENT[5]!;
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const base = this.colorForTemp(this.temp);
    // Temperature gauge: hotter temp → more rows lit at full intensity from
    // the bottom up. Below the cutoff stays dim so the "fill level" reads
    // clearly. heat in [0..1] across 30..90°C.
    const heat = Math.min(1, Math.max(0, (this.temp - 30) / 60));
    for (let x = 0; x < 14; x++) {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        const rowHeat = (GRID_HEIGHT - 1 - y) / (GRID_HEIGHT - 1);
        // Full intensity below the fill line, dim (15%) above — readable gauge.
        const intensity = rowHeat < heat ? 1.0 : 0.15;
        const c: Color = {
          r: Math.round(base.r * intensity),
          g: Math.round(base.g * intensity),
          b: Math.round(base.b * intensity),
        };
        const led = gridToLed(x, y);
        if (led !== null) out.set(led, c);
      }
    }
    return out;
  }
}

// ─── Minecraft day/night cycle ───────────────────────────────────────────────

function lerpColor(a: Color, b: Color, t: number): Color {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

/**
 * Minecraft-themed day/night cycle. ~30 seconds per full cycle at default
 * speed. Layout-aware: bottom rows are grass + dirt, top rows are the sky.
 * The sun arcs across rows 0-1 during the day; at night the moon does the
 * same and three columns of stars twinkle deterministically.
 *
 * Three drifting clouds (3-key-wide white puffs at different rows + speeds)
 * cross the sky during the day and dissolve into the dusk palette as it
 * gets late.
 */
class MinecraftDayEngine {
  private tickCounter = 0;
  // Phase 0..1 = one full day/night cycle. 30s default → 900 ticks @ 30fps.
  private phase = 0;
  private readonly TICKS_PER_CYCLE = 900;

  // Three independent clouds: starting offset (in column space) + drift rate.
  // Different rates / starting points so they never overlap perfectly.
  private readonly clouds = [
    { offset: 0.0, rate: 1.0, row: 0 },
    { offset: 0.35, rate: 1.3, row: 1 },
    { offset: 0.7, rate: 0.7, row: 0 },
  ];

  step(): void {
    this.tickCounter = (this.tickCounter + 1) % this.TICKS_PER_CYCLE;
    this.phase = this.tickCounter / this.TICKS_PER_CYCLE;
  }

  private skyColor(): { top: Color; bottom: Color } {
    const p = this.phase;
    // Palette anchors saturated for the K617's white keycaps — pastel sky
    // gets dominated by keycap plastic and looks washed out.
    const NIGHT_TOP: Color = { r: 4, g: 0, b: 48 };
    const NIGHT_BOTTOM: Color = { r: 12, g: 0, b: 90 };
    const DAWN_TOP: Color = { r: 140, g: 60, b: 200 };
    const DAWN_BOTTOM: Color = { r: 255, g: 120, b: 60 };
    const DAY_TOP: Color = { r: 0, g: 140, b: 255 };
    const DAY_BOTTOM: Color = { r: 80, g: 200, b: 255 };
    const DUSK_TOP: Color = { r: 180, g: 40, b: 120 };
    const DUSK_BOTTOM: Color = { r: 255, g: 90, b: 30 };

    if (p < 0.06) {
      // Dawn (0.00 - 0.06): night → dawn
      const k = p / 0.06;
      return { top: lerpColor(NIGHT_TOP, DAWN_TOP, k), bottom: lerpColor(NIGHT_BOTTOM, DAWN_BOTTOM, k) };
    }
    if (p < 0.12) {
      // Sunrise (0.06 - 0.12): dawn → day
      const k = (p - 0.06) / 0.06;
      return { top: lerpColor(DAWN_TOP, DAY_TOP, k), bottom: lerpColor(DAWN_BOTTOM, DAY_BOTTOM, k) };
    }
    if (p < 0.6) {
      // Full day (0.12 - 0.60): stable blue
      return { top: DAY_TOP, bottom: DAY_BOTTOM };
    }
    if (p < 0.68) {
      // Sunset (0.60 - 0.68): day → dusk
      const k = (p - 0.6) / 0.08;
      return { top: lerpColor(DAY_TOP, DUSK_TOP, k), bottom: lerpColor(DAY_BOTTOM, DUSK_BOTTOM, k) };
    }
    if (p < 0.75) {
      // Twilight (0.68 - 0.75): dusk → night
      const k = (p - 0.68) / 0.07;
      return { top: lerpColor(DUSK_TOP, NIGHT_TOP, k), bottom: lerpColor(DUSK_BOTTOM, NIGHT_BOTTOM, k) };
    }
    return { top: NIGHT_TOP, bottom: NIGHT_BOTTOM };
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const { top: skyTop, bottom: skyBottom } = this.skyColor();
    // Saturated earth-tones so they punch through the white K617 keycaps.
    const DIRT: Color = { r: 160, g: 80, b: 20 };
    const GRASS: Color = { r: 0, g: 255, b: 40 };

    // Daylight visibility 0..1 — clouds/sun fade in/out with the day.
    const dayVisibility =
      this.phase < 0.06 ? 0
        : this.phase < 0.12 ? (this.phase - 0.06) / 0.06
          : this.phase < 0.6 ? 1
            : this.phase < 0.68 ? 1 - (this.phase - 0.6) / 0.08
              : 0;
    const nightVisibility = this.phase > 0.72 ? Math.min(1, (this.phase - 0.72) / 0.05) : 0;

    // Sun arc across columns during day (0..0.6 in phase = day proper).
    let sunCol = -10;
    let sunArcRow = 1; // row 1 = lower sky band
    if (this.phase >= 0.06 && this.phase <= 0.6) {
      const dayT = (this.phase - 0.06) / 0.54; // 0..1 across day
      sunCol = dayT * 14; // travel left → right across keyboard cols
      // Arc: sin(πt) gives 0..1..0; > 0.55 → top row, otherwise lower band
      sunArcRow = Math.sin(dayT * Math.PI) > 0.55 ? 0 : 1;
    }

    // Moon arc during night (0.72..1.0).
    let moonCol = -10;
    if (this.phase >= 0.72) {
      const nightT = (this.phase - 0.72) / 0.28;
      moonCol = nightT * 14;
    }

    // Cloud positions (drift left → right, wrap around).
    const cloudPositions = this.clouds.map((c) => ({
      col: ((this.phase * c.rate + c.offset) * 16) % 16 - 1, // -1..15 so they enter from the edge
      row: c.row,
    }));

    for (const k of K617_LAYOUT.keys) {
      const cx = k.col + k.width / 2;

      // Five distinct layers, no blending — eliminates the double-green
      // strip that was making row 2 read as a second grass layer.
      // Order from top of keyboard to bottom:
      //   row 0 = sky high   (F-row / number row)
      //   row 1 = sky low    (QWERTY)
      //   row 2 = sky low    (ASDF) — kept as sky so there's ONE grass row
      //   row 3 = grass      (ZXCV) — the surface
      //   row 4 = dirt       (Ctrl / Alt / Space) — underground
      let color: Color;
      if (k.row === 0) color = skyTop;
      else if (k.row === 1) color = skyBottom;
      else if (k.row === 2) color = skyBottom; // still sky — no horizon blend
      else if (k.row === 3) color = GRASS;
      else color = DIRT;

      // Sun: 1-key-wide bright yellow at the arc position.
      if (sunArcRow === k.row && k.row <= 1) {
        const dSun = Math.abs(cx - sunCol);
        if (dSun < 1.0) {
          const halo = 1 - dSun;
          color = lerpColor(color, { r: 255, g: 220, b: 0 }, Math.max(0, halo));
        }
      }

      // Moon at night (top row only).
      if (k.row === 0 && this.phase >= 0.72) {
        const dMoon = Math.abs(cx - moonCol);
        if (dMoon < 0.9) {
          const halo = 1 - dMoon;
          color = lerpColor(color, { r: 230, g: 230, b: 245 }, halo);
        }
      }

      // Stars (deterministic twinkle on rows 0-1 during night).
      if (k.row <= 1 && nightVisibility > 0) {
        // Hash key position into a pseudo-random "star" flag — only some
        // keys are stars at all.
        const hash = Math.sin((cx + 1) * 12.9898 + (k.row + 1) * 78.233) * 43758.5453;
        const isStar = (hash - Math.floor(hash)) > 0.78;
        if (isStar) {
          const twinkle = 0.5 + 0.5 * Math.sin(this.phase * 60 + cx * 4 + k.row * 3);
          color = lerpColor(color, { r: 255, g: 255, b: 230 }, twinkle * nightVisibility);
        }
      }

      // Clouds (rows 0-1 during day). 40% opacity max so the sky still reads
      // as blue instead of washing out to white.
      if (k.row <= 1 && dayVisibility > 0) {
        for (const c of cloudPositions) {
          if (c.row !== k.row) continue;
          const dCloud = Math.abs(cx - c.col);
          if (dCloud < 1.2) {
            const puff = (1 - dCloud / 1.2) * 0.4 * dayVisibility;
            color = lerpColor(color, { r: 255, g: 255, b: 255 }, puff);
          }
        }
      }

      out.set(k.ledIndex, color);
    }
    return out;
  }
}

// ─── Aquarium ────────────────────────────────────────────────────────────────

/**
 * Underwater scene: blue gradient, bubbles rising from the bottom, and a
 * lone fish slowly traversing the middle rows every cycle.
 *
 * Each bubble is a small bright-cyan tile that climbs from row 4 → row 0
 * over ~3 seconds. A pool of 6 bubbles is recycled at random columns.
 */
interface Bubble { col: number; t: number; speed: number; }

class AquariumEngine {
  private tickCounter = 0;
  private bubbles: Bubble[] = [];
  private fishPhase = 0;
  private readonly BUBBLE_DURATION_TICKS = 90; // 3s at 30fps to traverse top→bottom
  private readonly POOL = 6;

  constructor() {
    for (let i = 0; i < this.POOL; i++) this.spawn(i / this.POOL);
  }

  private spawn(initialT = 0): void {
    this.bubbles.push({
      col: 0.5 + Math.random() * 13,
      t: initialT,
      speed: 0.7 + Math.random() * 0.6,
    });
  }

  step(): void {
    this.tickCounter++;
    this.fishPhase = (this.fishPhase + 1 / 240) % 1; // ~8s per fish trip

    // Advance bubbles; respawn when they reach the top.
    for (const b of this.bubbles) {
      b.t += b.speed / this.BUBBLE_DURATION_TICKS;
      if (b.t > 1) {
        b.t = 0;
        b.col = 0.5 + Math.random() * 13;
        b.speed = 0.7 + Math.random() * 0.6;
      }
    }
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    // Saturated underwater palette so the depth gradient is readable even
    // on the K617's white keycaps.
    const SURFACE: Color = { r: 40, g: 220, b: 255 };
    const MID: Color = { r: 0, g: 120, b: 230 };
    const FLOOR: Color = { r: 0, g: 30, b: 130 };
    const SAND: Color = { r: 255, g: 200, b: 60 };

    // Fish position — sinusoidal sway in row, linear sweep across cols.
    const fishCol = -1 + this.fishPhase * 16; // -1..15 so it enters/exits
    const fishRow = 2 + Math.round(Math.sin(this.fishPhase * Math.PI * 2) * 0.5);

    for (const k of K617_LAYOUT.keys) {
      const cx = k.col + k.width / 2;

      // Base depth gradient — full SAND on row 4 so the floor is unmistakeably
      // sandy yellow, not muddied by FLOOR blue.
      let color: Color;
      if (k.row === 0) color = SURFACE;
      else if (k.row === 1) color = lerpColor(SURFACE, MID, 0.5);
      else if (k.row === 2) color = MID;
      else if (k.row === 3) color = FLOOR;
      else color = SAND;

      // Bubbles climb. Bright cyan so they pop against the deep blue water.
      for (const b of this.bubbles) {
        const bubbleRow = 4 - b.t * 4;
        const dRow = Math.abs(k.row - bubbleRow);
        const dCol = Math.abs(cx - b.col);
        if (dRow < 0.8 && dCol < 0.8) {
          const intensity = (1 - dRow / 0.8) * (1 - dCol / 0.8);
          color = lerpColor(color, { r: 200, g: 255, b: 255 }, intensity);
        }
      }

      // Fish: orange against blue → maximum contrast.
      if (k.row === fishRow) {
        const dFish = cx - fishCol;
        if (dFish >= -0.4 && dFish <= 1.6) {
          const t = 1 - Math.min(1, Math.abs(dFish - 0.5));
          color = lerpColor(color, { r: 255, g: 100, b: 0 }, t);
        }
      }

      out.set(k.ledIndex, color);
    }
    return out;
  }
}

// ─── Interactive Pong (player vs forgiving AI) ──────────────────────────────

/**
 * Pong variant where the LEFT paddle is the player and the RIGHT paddle is
 * a deliberately fallible AI. Layout on the K617:
 *   - Number row (1-9):       scoreboard. Left half (1-4) = player (red),
 *                             right half (6-9) = AI (blue). Key 5 = center.
 *   - Left edge (Tab/Caps/LShift/LCtrl): player paddle slots 0..3
 *   - Col 13 (Backslash/Enter area): AI paddle (col 13, follows ball)
 *   - Middle play area (rows 1-3): ball bounces here
 *
 * Player input flows in via `setPaddleSlot(0..3)` from the IPC handler.
 * "Permissible" AI: each tick when the ball is heading right, the AI moves
 * toward it but with a configurable miss rate so the player can actually
 * score.
 */
/**
 * Pong variant where the LEFT paddle is the player and the RIGHT paddle is
 * a deliberately fallible AI. Layout on the K617:
 *   - Number row 1-4 (left half):    player score (red)
 *   - Number row 6-9 (right half):   AI score (blue)
 *   - Number row 5 (center):         serve indicator (white pulse)
 *   - Left edge (Tab/Caps/LShift/LCtrl): player paddle, slot 0..3 = row 1..4
 *   - Right edge (Backslash/Enter/RShift/RCtrl): AI paddle
 *   - Play area: rows 1..4 (cols 1..13) — the four physical key rows below
 *     the scoreboard. Integer ball coordinates so the render maps cleanly
 *     to one key per frame.
 *
 * Player input flows in via setPaddleSlot(0..3). AI is "permissible": it
 * recomputes its target every few ticks and only follows the ball with a
 * configurable miss rate, so the player can actually score.
 */
class PongInteractiveEngine {
  // ── Player + AI paddle slots (0..3 → rows 1..4) ──────────────────────────
  private paddleSlot = 1;
  private aiSlot = 1;
  private aiTargetSlot = 1;

  // ── Integer ball state ──────────────────────────────────────────────────
  private ballCol = 7;
  private ballRow = 2;
  private prevBallCol = 7; // previous position for trail rendering
  private prevBallRow = 2;
  private ballVCol: -1 | 1 = 1;
  private ballVRow: -1 | 0 | 1 = 1;

  private scorePlayer = 0;
  private scoreAi = 0;
  private resetCountdown = 30;
  private tickCounter = 0;
  private aiTargetCooldown = 0;
  private ticksPerStep = 10; // can be tuned via setAnimSpeed (lower = faster)

  private readonly AI_TARGET_LAG = 4;    // AI re-targets every 4 ticks
  private readonly AI_MISS_RATE = 0.5;   // 50% miss → very permissive
  private readonly MAX_SCORE = 4;        // first to 4 wins → match resets
  private readonly PLAY_TOP = 1;         // ball lives in rows 1..4
  private readonly PLAY_BOTTOM = 4;
  /** Player's paddle catches the ball if ballRow is within ±1 of paddleRow.
   *  Generous on purpose: the ball jumps cell-to-cell at low fps so strict
   *  equality felt like the AI was cheating. */
  private readonly PLAYER_HIT_RADIUS = 1;
  private readonly AI_HIT_RADIUS = 0;   // AI must match exactly (no help)

  setPaddleSlot(slot: number): void {
    if (Number.isInteger(slot) && slot >= 0 && slot <= 3) {
      this.paddleSlot = slot;
    }
  }

  handleKey(keycode: number, value: number): void {
    if (value !== 1) return;
    const slot = PADDLE_KEYCODES[keycode];
    if (slot !== undefined) this.setPaddleSlot(slot);
  }

  /** Tune ball speed from the pattern.animSpeed (0..1). Slower = larger
   *  ticksPerStep. Default speed 0.5 → ticksPerStep=10 (3 steps/sec). */
  setAnimSpeed(s: number): void {
    const clamped = Math.max(0, Math.min(1, s));
    // animSpeed 0 → 16 ticks (1.87 steps/sec), animSpeed 1 → 6 ticks (5/sec)
    this.ticksPerStep = Math.round(16 - clamped * 10);
  }

  step(): void {
    if (this.resetCountdown > 0) { this.resetCountdown--; return; }
    this.tickCounter++;
    if (this.tickCounter < this.ticksPerStep) return;
    this.tickCounter = 0;

    // Stash for trail rendering before mutating.
    this.prevBallCol = this.ballCol;
    this.prevBallRow = this.ballRow;

    // ── Advance ball ──────────────────────────────────────────────────────
    this.ballCol += this.ballVCol;
    this.ballRow += this.ballVRow;
    if (this.ballRow < this.PLAY_TOP) {
      this.ballRow = this.PLAY_TOP;
      this.ballVRow = 1;
    }
    if (this.ballRow > this.PLAY_BOTTOM) {
      this.ballRow = this.PLAY_BOTTOM;
      this.ballVRow = -1;
    }

    // ── AI update ────────────────────────────────────────────────────────
    // Only re-target when the ball is moving toward the AI, and even then
    // throttle by AI_TARGET_LAG so the AI lags. AI_MISS_RATE intentionally
    // sends it to a wrong row sometimes.
    if (this.ballVCol > 0) {
      this.aiTargetCooldown--;
      if (this.aiTargetCooldown <= 0) {
        this.aiTargetCooldown = this.AI_TARGET_LAG;
        const correctSlot = this.ballRow - 1; // row 1..4 → slot 0..3
        if (Math.random() < this.AI_MISS_RATE) {
          // pick an adjacent slot to miss
          const offset = Math.random() < 0.5 ? -1 : 1;
          this.aiTargetSlot = Math.max(0, Math.min(3, correctSlot + offset));
        } else {
          this.aiTargetSlot = Math.max(0, Math.min(3, correctSlot));
        }
      }
      if (this.aiSlot < this.aiTargetSlot) this.aiSlot++;
      else if (this.aiSlot > this.aiTargetSlot) this.aiSlot--;
    }

    // ── Hit detection ────────────────────────────────────────────────────
    const playerRow = this.paddleSlot + 1;
    const aiRow = this.aiSlot + 1;

    if (this.ballCol <= 1) {
      this.ballCol = 1;
      const distance = Math.abs(this.ballRow - playerRow);
      if (distance <= this.PLAYER_HIT_RADIUS) {
        this.ballVCol = 1;
        this.ballVRow = this.pickBounceRow();
        log.info({ paddleSlot: this.paddleSlot, ballRow: this.ballRow }, 'pong: player HIT');
      } else {
        this.scoreAi += 1;
        log.info({ paddleSlot: this.paddleSlot, ballRow: this.ballRow, score: `${this.scorePlayer}-${this.scoreAi}` }, 'pong: AI scores');
        this.resetServe(1);
      }
    }
    if (this.ballCol >= 13) {
      this.ballCol = 13;
      const distance = Math.abs(this.ballRow - aiRow);
      if (distance <= this.AI_HIT_RADIUS) {
        this.ballVCol = -1;
        this.ballVRow = this.pickBounceRow();
        log.info({ aiSlot: this.aiSlot, ballRow: this.ballRow }, 'pong: AI HIT');
      } else {
        this.scorePlayer += 1;
        log.info({ aiSlot: this.aiSlot, ballRow: this.ballRow, score: `${this.scorePlayer}-${this.scoreAi}` }, 'pong: player scores');
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
    if (this.scorePlayer >= this.MAX_SCORE || this.scoreAi >= this.MAX_SCORE) {
      this.scorePlayer = 0;
      this.scoreAi = 0;
    }
    this.ballCol = 7;
    this.ballRow = 2 + Math.floor(Math.random() * 2); // 2 or 3
    this.prevBallCol = this.ballCol;
    this.prevBallRow = this.ballRow;
    this.ballVCol = dir;
    this.ballVRow = Math.random() < 0.5 ? -1 : 1;
    this.resetCountdown = 15; // ~0.5s pause between serves (was 0.83s)
    this.aiTargetCooldown = 0;
  }

  render(): Map<number, Color> {
    const out = new Map<number, Color>();
    const RED: Color = { r: 255, g: 0, b: 0 };
    const BLUE: Color = { r: 0, g: 60, b: 255 };
    const WHITE: Color = { r: 255, g: 255, b: 255 };

    // ── Scoreboard on the number row ─────────────────────────────────────
    const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    // Player score: keys 1..N from the LEFT.
    for (let i = 0; i < this.scorePlayer && i < this.MAX_SCORE; i++) {
      const k = K617_LAYOUT.keys.find((x) => x.name === NUMS[i]);
      if (k) out.set(k.ledIndex, RED);
    }
    // AI score: keys 9..(9-M+1) from the RIGHT.
    for (let i = 0; i < this.scoreAi && i < this.MAX_SCORE; i++) {
      const k = K617_LAYOUT.keys.find((x) => x.name === NUMS[8 - i]);
      if (k) out.set(k.ledIndex, BLUE);
    }
    // Center key 5 flashes white during the serve countdown.
    if (this.resetCountdown > 0) {
      const k = K617_LAYOUT.keys.find((x) => x.name === '5');
      if (k) out.set(k.ledIndex, WHITE);
    }

    // ── Player paddle: exactly one key on the left edge ──────────────────
    const PLAYER_KEYS = ['Tab', 'CapsLock', 'LShift', 'LCtrl'];
    const playerName = PLAYER_KEYS[this.paddleSlot];
    if (playerName) {
      const k = K617_LAYOUT.keys.find((x) => x.name === playerName);
      if (k) out.set(k.ledIndex, RED);
    }

    // ── AI paddle: exactly one key on the right edge ─────────────────────
    const AI_KEYS = ['Backslash', 'Enter', 'RShift', 'RCtrl'];
    const aiName = AI_KEYS[this.aiSlot];
    if (aiName) {
      const k = K617_LAYOUT.keys.find((x) => x.name === aiName);
      if (k) out.set(k.ledIndex, BLUE);
    }

    // ── Ball + 1-cell trail for motion blur ──────────────────────────────
    // Render the previous position first at low intensity so that when the
    // current and previous overlap, the bright WHITE wins.
    if (this.prevBallCol !== this.ballCol || this.prevBallRow !== this.ballRow) {
      const trailLed = gridToLed(this.prevBallCol, this.prevBallRow);
      if (trailLed !== null) out.set(trailLed, { r: 80, g: 80, b: 80 });
    }
    const ballLed = gridToLed(this.ballCol, this.ballRow);
    if (ballLed !== null) out.set(ballLed, WHITE);

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
  /** Reference to the currently-active interactive engine, if any. Allows
   *  IPC handlers (perkey.gameInput) + the evdev capture loop to forward
   *  player input. Any of the interactive engines implements the common
   *  InteractiveEngine surface. */
  private interactiveEngine: InteractiveEngine | null = null;
  /** evdev capture for physical key presses — opened lazily when an
   *  interactive game starts, torn down when it stops. */
  private keyCapture: KeyCapture | null = null;

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
      this.interactiveEngine = null;
      if (this.keyCapture) {
        this.keyCapture.stop();
        this.keyCapture = null;
      }
      log.info('stream stopped');
      this.notifyPerkey({ mode: 'off' });
    }
  }

  /** Forward a player input (from the GUI's virtual-key click) to the active
   *  interactive engine. Encoded as a synthetic keycode so any engine can
   *  interpret it the same way as a physical keypress. The legacy paddleSlot
   *  parameter is preserved for backwards-compat with the original Pong:
   *  the GUI sends 0..3 → we map back to Tab/Caps/LShift/LCtrl keycodes. */
  setGamePaddleSlot(slot: number): void {
    const KEYCODE_BY_SLOT = [KEY_TAB, KEY_CAPSLOCK, KEY_LEFTSHIFT, KEY_LEFTCTRL];
    const keycode = KEYCODE_BY_SLOT[slot];
    if (keycode !== undefined) this.interactiveEngine?.handleKey(keycode, 1);
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
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('pong stream started');
      return;
    }

    if (pattern.animType === 'snake') {
      const game = new SnakeEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('snake stream started');
      return;
    }

    if (pattern.animType === 'tetris') {
      const game = new TetrisEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('tetris stream started');
      return;
    }

    if (pattern.animType === 'matrix-rain') {
      const game = new MatrixRainEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Matrix Rain stream started');
      return;
    }

    if (pattern.animType === 'breakout') {
      const game = new BreakoutEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Breakout stream started');
      return;
    }

    if (pattern.animType === 'fireworks') {
      const game = new FireworksEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Fireworks stream started');
      return;
    }

    if (pattern.animType === 'dvd') {
      const game = new DvdBouncerEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('DVD bouncer stream started');
      return;
    }

    if (pattern.animType === 'heart-rate') {
      const game = new HeartRateEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Heart rate stream started');
      return;
    }

    if (pattern.animType === 'equalizer') {
      const game = new EqualizerEngine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Equalizer stream started');
      return;
    }

    if (pattern.animType === 'rule30') {
      const game = new Rule30Engine();
      this.streamInterval = setInterval(() => {
        game.step();
        const colors = game.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Rule 30 stream started');
      return;
    }

    if (pattern.animType === 'cpu-thermal') {
      const eng = new CpuThermalEngine();
      this.streamInterval = setInterval(() => {
        eng.step();
        const colors = eng.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('CPU thermal stream started');
      return;
    }

    if (pattern.animType === 'minecraft-day') {
      const eng = new MinecraftDayEngine();
      this.streamInterval = setInterval(() => {
        eng.step();
        const colors = eng.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Minecraft day/night stream started');
      return;
    }

    // Interactive games share a setup pattern: instantiate the engine,
    // hook KeyCapture if the engine implements handleKey, then schedule
    // the 30fps render → encode → send loop.
    const interactiveBuilders: Record<string, () => InteractiveEngine> = {
      'pong-interactive': () => {
        const e = new PongInteractiveEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'pong-multiplayer': () => {
        const e = new PongMultiplayerEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'snake-interactive': () => {
        const e = new SnakeInteractiveEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'breakout-interactive': () => {
        const e = new BreakoutInteractiveEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'pacman': () => {
        const e = new PacmanEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'doom': () => {
        const e = new DoomEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'space-invaders': () => {
        const e = new SpaceInvadersEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'mario': () => {
        const e = new MarioEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'genius': () => {
        const e = new GeniusEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'ripple': () => {
        const e = new RippleEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'spark': () => {
        const e = new SparkEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'binary-clock': () => new BinaryClockEngine(),
      'doom-fire': () => {
        const e = new DoomFireEngine();
        e.setAnimSpeed(pattern.animSpeed);
        return e;
      },
      'whac-a-mole': () => new WhacAMoleEngine(),
      'bullet-hell': () => new BulletHellEngine(),
      'drag-race': () => new DragRaceEngine(),
      'frogger': () => new FroggerEngine(),
      'wordle': () => new WordleEngine(),
      'keyboard-crawl': () => new KeyboardCrawlEngine(),
      'cursed': () => new CursedKeyboardEngine(),
      'minecraft-clouds': () => new MinecraftCloudsEngine(),
    };
    const builder = interactiveBuilders[pattern.animType];
    if (builder) {
      const eng = builder();
      // Hand off any per-slot color overrides from the pattern before the
      // first render. Engines that don't care silently ignore.
      if (pattern.colorOverrides && eng.setColorOverrides) {
        eng.setColorOverrides(pattern.colorOverrides);
      }
      this.interactiveEngine = eng;
      const capture = new KeyCapture();
      capture.onKey((keycode, value) => eng.handleKey(keycode, value));
      if (capture.start()) this.keyCapture = capture;
      this.streamInterval = setInterval(() => {
        eng.step();
        const colors = eng.render();
        applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1);
        const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info({ animType: pattern.animType }, 'Interactive game stream started');
      return;
    }

    if (pattern.animType === 'aquarium') {
      const eng = new AquariumEngine();
      this.streamInterval = setInterval(() => {
        eng.step();
        const colors = eng.render(); applyVibrancyInPlace(colors, this.currentPattern?.vibrancy ?? 1); const frame = encodePerKeyFrame(colors);
        this.hid.sendFeatureReport(frame).catch(() => this.stopStreamLoop());
      }, 1000 / 30);
      log.info('Aquarium stream started');
      return;
    }

    if (pattern.animType === 'solid') {
      // Just send one frame, no loop needed
      const colors = new Map<number, Color>();
      computeFrameInto(pattern, 0, colors);
      const frame = encodePerKeyFrame(colors);
      await this.hid.sendFeatureReport(frame);
      log.info({ animType: 'solid', keys: Object.keys(pattern.keys).length }, 'pattern (solid) applied');
      return;
    }

    // Start 30fps stream. Reuse a single Map across ticks — animations.ts'
    // computeFrameInto mutates it in place, avoiding ~30 allocations/sec.
    const tickIntervalMs = 1000 / 30;
    const frameBuf = new Map<number, Color>();
    let pendingSend = false; // simple backpressure flag
    this.streamInterval = setInterval(() => {
      if (!this.currentPattern) return;
      if (pendingSend) return; // last frame still in-flight; skip this tick
      const t = (performance.now() - this.streamStart) / 1000;
      computeFrameInto(this.currentPattern, t, frameBuf);
      const frame = encodePerKeyFrame(frameBuf);
      pendingSend = true;
      this.hid.sendFeatureReport(frame).then(() => {
        pendingSend = false;
      }).catch((err) => {
        pendingSend = false;
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
