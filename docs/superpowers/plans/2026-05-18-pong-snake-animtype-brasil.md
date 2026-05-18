# Pong + Snake + AnimType Re-stream + Brasil T/Y Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pong and Snake live game animations to K617 LEDs, fix animType toolbar to hot-swap streams, and add T/Y to the Brasil preset blue center.

**Architecture:** Three isolated changes: (1) trivial preset edit, (2) UX fix in PaintToolbar.tsx adding re-stream on type/speed change, (3) stateful game engines in daemon/engine.ts + new `AnimType` union in core. Game engines are special-cased in `startPattern` — `computeFrame` falls back to empty map for unknown types.

**Tech Stack:** TypeScript/Node, Zustand (GUI store), Vitest (tests), `setInterval` game loops at 30fps in daemon.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/core/src/presets.ts` | Modify | Add T, Y to blue center of theme-brazil |
| `packages/core/src/animations.ts` | Modify | Extend `AnimType` union; fallback in `computeFrame` for pong/snake |
| `packages/core/src/ipc.ts` | Modify | Extend `AnimTypeSchema` to include 'pong' and 'snake' |
| `packages/gui/src/stores/paintStore.ts` | Modify | Extend `AnimType` union |
| `packages/gui/src/components/PaintToolbar.tsx` | Modify | `handleAnimTypeChange` + `handleSpeedChange` + add pong/snake buttons |
| `packages/daemon/src/game-grid.ts` | Create | Grid helper: `GRID`, `gridToLed()` |
| `packages/daemon/src/engine.ts` | Modify | `PongEngine`, `SnakeEngine`, special-case in `startPattern` |
| `packages/core/src/presets.ts` | Modify | Add game-pong and game-snake presets |
| `packages/core/test/animations.test.ts` | Modify | Test pong/snake animTypes fall back to empty map |
| `packages/core/test/presets.test.ts` | Modify | Test game-pong and game-snake presets exist; fix "non-empty key maps" assertion for game presets |

---

### Task 1: Brasil preset — add T and Y to blue center

**Files:**
- Modify: `packages/core/src/presets.ts`

- [ ] **Step 1: Locate the blue center comment in theme-brazil and add T, Y**

In `packages/core/src/presets.ts`, find the block:
```ts
// Blue center circle (overrides yellow at G/H)
['G', '#002776'], ['H', '#002776'],
```
Change it to:
```ts
// Blue center circle (overrides yellow at T/Y/G/H — 2×2 square)
['T', '#002776'], ['Y', '#002776'], ['G', '#002776'], ['H', '#002776'],
```

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
cd /home/ti/projects/fizz-rgb && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: all 107 tests pass (the brasil preset test only checks `animType === 'flag-wave'`, so this is safe).

- [ ] **Step 3: Commit**

```bash
cd /home/ti/projects/fizz-rgb
git add packages/core/src/presets.ts
git commit -m "fix: add T, Y to brasil preset blue center (2x2 square)"
```

---

### Task 2: Extend AnimType in core (animations.ts + ipc.ts)

**Files:**
- Modify: `packages/core/src/animations.ts`
- Modify: `packages/core/src/ipc.ts`

- [ ] **Step 1: Write the failing test for pong/snake animType fallback**

In `packages/core/test/animations.test.ts`, add at the end of the describe block:

```ts
it('pong and snake are valid animTypes (fallback to empty map)', () => {
  // computeFrame is stateless — for game types it falls back to empty map
  const p1 = computeFrame({ keys: {}, animType: 'pong' as AnimType, animSpeed: 0.5 }, 0, 61);
  const p2 = computeFrame({ keys: {}, animType: 'snake' as AnimType, animSpeed: 0.5 }, 0, 61);
  expect(p1.size).toBe(0);
  expect(p2.size).toBe(0);
});
```

Also add the import for `AnimType`:
```ts
import { computeFrame, type AnimType } from '../src/animations.js';
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/ti/projects/fizz-rgb && npm test -- packages/core/test/animations.test.ts 2>&1 | tail -20
```
Expected: TypeScript compile error — `'pong'` not assignable to `AnimType`.

- [ ] **Step 3: Extend AnimType union in animations.ts**

In `packages/core/src/animations.ts`, change:
```ts
export type AnimType = 'solid' | 'blink' | 'chase' | 'wave' | 'typewriter' | 'marquee' | 'flag-wave';
```
To:
```ts
export type AnimType = 'solid' | 'blink' | 'chase' | 'wave' | 'typewriter' | 'marquee' | 'flag-wave' | 'pong' | 'snake';
```

The existing fallback at the bottom of `computeFrame` already returns solid (keys from `p.keys`) for unknown types. For pong/snake with empty `keys: {}`, this returns an empty map — correct behavior.

- [ ] **Step 4: Extend AnimTypeSchema in ipc.ts**

In `packages/core/src/ipc.ts`, change:
```ts
export const AnimTypeSchema = z.enum(['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave']);
```
To:
```ts
export const AnimTypeSchema = z.enum(['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave', 'pong', 'snake']);
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /home/ti/projects/fizz-rgb && npm test -- packages/core/test/animations.test.ts 2>&1 | tail -20
```
Expected: all animations tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/ti/projects/fizz-rgb
git add packages/core/src/animations.ts packages/core/src/ipc.ts packages/core/test/animations.test.ts
git commit -m "feat: extend AnimType union with pong and snake; fallback in computeFrame"
```

---

### Task 3: Extend AnimType in GUI store + add game-pong and game-snake presets

**Files:**
- Modify: `packages/gui/src/stores/paintStore.ts`
- Modify: `packages/core/src/presets.ts`
- Modify: `packages/core/test/presets.test.ts`

- [ ] **Step 1: Write failing test for new presets**

In `packages/core/test/presets.test.ts`, add two tests:

```ts
it('has game-pong and game-snake', () => {
  expect(getPresetById('game-pong')?.pattern.animType).toBe('pong');
  expect(getPresetById('game-snake')?.pattern.animType).toBe('snake');
});
```

Also, the existing test `'all presets have non-empty key maps'` will fail for game presets (they have empty `keys: {}`). Change it to skip game-category presets:

```ts
it('all non-game presets have non-empty key maps', () => {
  for (const p of BUILTIN_PRESETS) {
    if (p.category === 'game' && (p.pattern.animType === 'pong' || p.pattern.animType === 'snake')) continue;
    expect(Object.keys(p.pattern.keys).length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/ti/projects/fizz-rgb && npm test -- packages/core/test/presets.test.ts 2>&1 | tail -20
```
Expected: `game-pong` and `game-snake` not found.

- [ ] **Step 3: Add game-pong and game-snake presets to presets.ts**

In `packages/core/src/presets.ts`, at the end of `BUILTIN_PRESETS` array (before the closing `]`), add after the `game-mmo` entry:

```ts
{
  id: 'game-pong',
  name: 'Pong',
  description: 'Pong rodando de verdade — paddles e bola correndo no teclado',
  category: 'game',
  pattern: {
    keys: {},
    animType: 'pong',
    animSpeed: 0.5,
  },
},
{
  id: 'game-snake',
  name: 'Snake',
  description: 'Cobrinha AI come comida pulsante e cresce',
  category: 'game',
  pattern: {
    keys: {},
    animType: 'snake',
    animSpeed: 0.5,
  },
},
```

- [ ] **Step 4: Extend AnimType in paintStore.ts**

In `packages/gui/src/stores/paintStore.ts`, change:
```ts
export type AnimType = 'solid' | 'blink' | 'chase' | 'wave' | 'typewriter' | 'marquee' | 'flag-wave';
```
To:
```ts
export type AnimType = 'solid' | 'blink' | 'chase' | 'wave' | 'typewriter' | 'marquee' | 'flag-wave' | 'pong' | 'snake';
```

- [ ] **Step 5: Run the preset tests to verify they pass**

```bash
cd /home/ti/projects/fizz-rgb && npm test -- packages/core/test/presets.test.ts 2>&1 | tail -20
```
Expected: all preset tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/ti/projects/fizz-rgb
git add packages/core/src/presets.ts packages/core/test/presets.test.ts packages/gui/src/stores/paintStore.ts
git commit -m "feat: add game-pong and game-snake presets; extend GUI AnimType"
```

---

### Task 4: UX fix — PaintToolbar re-streams on animType and speed change

**Files:**
- Modify: `packages/gui/src/components/PaintToolbar.tsx`

- [ ] **Step 1: Add `handleAnimTypeChange` wrapper**

In `PaintToolbar.tsx`, in the component body AFTER the existing store subscriptions (after the `setAnimSpeed` line), add:

```tsx
const handleAnimTypeChange = async (newType: AnimType) => {
  setAnimType(newType);
  if (keyColors.size === 0 || !window.fizz) return;
  const colors: Record<string, string> = {};
  keyColors.forEach((hex, idx) => { colors[String(idx)] = hex; });
  try {
    if (newType === 'solid') {
      await window.fizz.perkeySet(colors);
    } else {
      await window.fizz.perkeyStartPattern({
        keys: colors,
        animType: newType,
        animSpeed,
        sequence: lastSequence.length > 0 ? lastSequence : undefined,
      });
    }
  } catch (err) {
    console.warn('animType change failed', err);
  }
};
```

- [ ] **Step 2: Add `handleSpeedChange` wrapper**

After `handleAnimTypeChange`, add:

```tsx
const handleSpeedChange = async (newSpeed: number) => {
  setAnimSpeed(newSpeed);
  if (keyColors.size === 0 || !window.fizz || animType === 'solid') return;
  const colors: Record<string, string> = {};
  keyColors.forEach((hex, idx) => { colors[String(idx)] = hex; });
  try {
    await window.fizz.perkeyStartPattern({
      keys: colors,
      animType,
      animSpeed: newSpeed,
      sequence: lastSequence.length > 0 ? lastSequence : undefined,
    });
  } catch (err) {
    console.warn('speed change failed', err);
  }
};
```

- [ ] **Step 3: Wire animation type buttons to `handleAnimTypeChange`**

In the JSX, find:
```tsx
{(['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave'] as const).map((t: AnimType) => (
  <button
    key={t}
    type="button"
    onClick={() => setAnimType(t)}
```

Change to:
```tsx
{(['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave', 'pong', 'snake'] as const).map((t: AnimType) => (
  <button
    key={t}
    type="button"
    onClick={() => void handleAnimTypeChange(t)}
```

- [ ] **Step 4: Wire Speed slider to `handleSpeedChange`**

Find:
```tsx
onChange={(e) => setAnimSpeed(Number(e.target.value))}
```
Change to:
```tsx
onChange={(e) => void handleSpeedChange(Number(e.target.value))}
```

- [ ] **Step 5: Run full test suite (TypeScript compile check)**

```bash
cd /home/ti/projects/fizz-rgb && npm run build 2>&1 | tail -30
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /home/ti/projects/fizz-rgb
git add packages/gui/src/components/PaintToolbar.tsx
git commit -m "fix: animType buttons and speed slider re-stream to hardware immediately"
```

---

### Task 5: Create game-grid.ts helper in daemon

**Files:**
- Create: `packages/daemon/src/game-grid.ts`

- [ ] **Step 1: Create the file**

Create `/home/ti/projects/fizz-rgb/packages/daemon/src/game-grid.ts`:

```ts
import { K617_LAYOUT } from '@fizz/core';

export const GRID_WIDTH = 14;
export const GRID_HEIGHT = 5;

/**
 * Maps (gridX, gridY) → ledIndex for the K617 5×14 coarse game grid.
 * Cells with no matching key store -1.
 */
const GRID: number[] = (() => {
  const g: number[] = new Array(GRID_WIDTH * GRID_HEIGHT).fill(-1);
  for (const k of K617_LAYOUT.keys) {
    const gridX = Math.min(GRID_WIDTH - 1, Math.floor(k.col + k.width / 2));
    const gridY = k.row;
    const cell = gridY * GRID_WIDTH + gridX;
    if (g[cell] === -1) g[cell] = k.ledIndex; // first key wins for overlapping cols
  }
  return g;
})();

/** Returns the ledIndex for grid cell (x, y), or null if no key lives there. */
export function gridToLed(x: number, y: number): number | null {
  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return null;
  const led = GRID[y * GRID_WIDTH + x];
  return led !== undefined && led >= 0 ? led : null;
}
```

- [ ] **Step 2: Run build to confirm no import errors**

```bash
cd /home/ti/projects/fizz-rgb && npm run build 2>&1 | grep -E "error|Error|warn" | head -20
```
Expected: no errors related to game-grid.ts.

---

### Task 6: Implement PongEngine and SnakeEngine and wire into engine.ts

**Files:**
- Modify: `packages/daemon/src/engine.ts`

- [ ] **Step 1: Add PongEngine class to engine.ts**

At the top of `packages/daemon/src/engine.ts`, after the existing imports, add:

```ts
import { gridToLed, GRID_HEIGHT } from './game-grid.js';
```

Then, before the `EffectEngine` class definition, add:

```ts
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

    // Left wall: paddle or score
    if (this.ballX <= 0) {
      if (this.ballY >= this.paddleLeft && this.ballY < this.paddleLeft + PADDLE_LEN) {
        this.ballX = 0;
        this.ballVX = -this.ballVX;
      } else {
        this.reset(-1);
      }
    }

    // Right wall: paddle or score
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
```

- [ ] **Step 2: Add SnakeEngine class to engine.ts**

After `PongEngine`, add:

```ts
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
```

- [ ] **Step 3: Wire PongEngine and SnakeEngine into startPattern**

In `EffectEngine.startPattern`, after `this.streamStart = performance.now();` and before `if (pattern.animType === 'solid')`, insert:

```ts
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
```

- [ ] **Step 4: Build the project**

```bash
cd /home/ti/projects/fizz-rgb && npm run build 2>&1 | tail -30
```
Expected: clean build, no TypeScript errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /home/ti/projects/fizz-rgb && npm test 2>&1 | tail -20
```
Expected: 109+ tests pass (107 existing + 2 new for pong/snake animType + 1 for game presets).

- [ ] **Step 6: Commit**

```bash
cd /home/ti/projects/fizz-rgb
git add packages/daemon/src/game-grid.ts packages/daemon/src/engine.ts
git commit -m "feat: Pong and Snake stateful game engines in daemon with 30fps stream"
```

---

### Task 7: Final integration commit

- [ ] **Step 1: Run full build + test one final time**

```bash
cd /home/ti/projects/fizz-rgb && npm run build && npm test 2>&1 | tail -30
```
Expected: clean build + all tests green.

- [ ] **Step 2: Create the combined feature commit**

```bash
cd /home/ti/projects/fizz-rgb
git add -A
git commit -m "feat: Pong + Snake game animations, animType edit re-streams to hardware, Brasil T/Y blue"
```

---

## Self-Review

**Spec coverage:**
- [x] Change 1 (Brasil T/Y): Task 1
- [x] Change 2 (animType re-stream): Task 4 — handleAnimTypeChange + handleSpeedChange + button rewiring
- [x] Change 3 (Pong/Snake): Task 2 (AnimType union), Task 3 (presets + GUI store), Task 5 (game-grid), Task 6 (engines in daemon)
- [x] Tests: animations.test.ts (pong/snake fallback), presets.test.ts (game presets)
- [x] presets.test.ts existing "non-empty key maps" test: updated in Task 3 to skip game animTypes

**Potential issue:** The existing `presets.test.ts` test `'all presets have non-empty key maps'` iterates ALL presets. The new game-pong and game-snake presets have `keys: {}`. Task 3 Step 1 handles this by updating that test.

**Type consistency:** `AnimType` union updated in 3 places — `animations.ts`, `ipc.ts` (via `AnimTypeSchema`), `paintStore.ts`. All consistent. `PontEngine`/`SnakeEngine` use `Color` type already imported in `engine.ts`.
