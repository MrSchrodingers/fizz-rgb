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
  private readonly TICKS_PER_FALL = 6; // gravity tick = ~5 Hz (move every 6 frames at 30fps)
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

  stopStreamLoop(): void {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
      this.currentPattern = null;
      log.info('stream stopped');
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
  }

  async startPattern(pattern: Pattern): Promise<void> {
    this.stopStreamLoop();
    this.lastPattern = pattern;
    this.lastPerKeyColors = null;
    this.lastNamedEffect = null;
    this.currentPattern = pattern;
    this.streamStart = performance.now();

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
