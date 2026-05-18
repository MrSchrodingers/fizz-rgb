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
