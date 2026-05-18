import { K617_LAYOUT } from '@fizz/core';

export const GRID_WIDTH = 14;
export const GRID_HEIGHT = 5;

// Precompute for each (gridX, gridY) the nearest K617 LED index.
const GRID: number[] = (() => {
  const out: number[] = new Array(GRID_WIDTH * GRID_HEIGHT).fill(-1);

  // First pass: direct mapping (most keys land at one cell each).
  for (const k of K617_LAYOUT.keys) {
    const gx = Math.min(GRID_WIDTH - 1, Math.floor(k.col + k.width / 2));
    const gy = k.row;
    const cell = gy * GRID_WIDTH + gx;
    if (out[cell] === -1) out[cell] = k.ledIndex;
  }

  // Second pass: fill empty cells with the nearest key on the same row.
  for (let gy = 0; gy < GRID_HEIGHT; gy++) {
    // Collect (gridX, ledIndex) tuples for cells that have a key
    const filled: Array<{ x: number; led: number }> = [];
    for (let gx = 0; gx < GRID_WIDTH; gx++) {
      const idx = out[gy * GRID_WIDTH + gx];
      if (idx !== undefined && idx >= 0) filled.push({ x: gx, led: idx });
    }
    if (filled.length === 0) continue;
    // For each empty cell, find the closest filled neighbor on this row.
    for (let gx = 0; gx < GRID_WIDTH; gx++) {
      if (out[gy * GRID_WIDTH + gx] !== -1) continue;
      let bestDist = Infinity, bestLed = filled[0]!.led;
      for (const f of filled) {
        const d = Math.abs(f.x - gx);
        if (d < bestDist) { bestDist = d; bestLed = f.led; }
      }
      out[gy * GRID_WIDTH + gx] = bestLed;
    }
  }
  return out;
})();

export function gridToLed(x: number, y: number): number | null {
  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return null;
  const led = GRID[y * GRID_WIDTH + x];
  return led !== undefined && led >= 0 ? led : null;
}
