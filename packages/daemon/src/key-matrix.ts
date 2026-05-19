/**
 * Physical key-matrix model for games.
 *
 * The K617 is NOT a uniform grid: each row has a different number of keys
 * (14 / 14 / 13 / 12 / 8) and the bottom row is dominated by a 6.25u-wide
 * spacebar. The old uniform 14×5 `gridToLed` collapses several logical
 * columns onto a single wide key (e.g. cols 5-8 all land on Space), which
 * makes side-scrollers and mazes unreadable on the bottom rows.
 *
 * This module exposes the keyboard the way it physically is: a ragged
 * matrix where each cell is exactly one key. Games address keys by
 * (row, col) where `col` is the 0-based index within that row, and move
 * between rows of differing widths using each key's physical centre-x so
 * "up"/"down" lands on the visually-aligned neighbour.
 */

import { K617_LAYOUT } from '@fizz/core';

export interface KeyCell {
  led: number;
  name: string;
  row: number;
  col: number;  // index within the row, left → right
  cx: number;   // physical centre x, in key units (each row spans 0..15)
}

/** Rows of keys, left → right. KEY_MATRIX[row][col] is one physical key. */
export const KEY_MATRIX: KeyCell[][] = (() => {
  const rows: KeyCell[][] = [];
  for (const k of K617_LAYOUT.keys) {
    const r = (rows[k.row] ??= []);
    r.push({
      led: k.ledIndex,
      name: k.name,
      row: k.row,
      col: r.length,
      cx: k.col + k.width / 2,
    });
  }
  return rows;
})();

export const ROW_COUNT = KEY_MATRIX.length;

/** Number of keys in a row (14 / 14 / 13 / 12 / 8 for the K617). */
export function rowWidth(row: number): number {
  return KEY_MATRIX[row]?.length ?? 0;
}

/** LED index for the key at (row, col), or null if out of range. */
export function keyLed(row: number, col: number): number | null {
  const r = KEY_MATRIX[row];
  if (!r || col < 0 || col >= r.length) return null;
  return r[col]!.led;
}

/** Physical centre-x of a key, in key units. */
export function keyCx(row: number, col: number): number {
  const r = KEY_MATRIX[row];
  if (!r || col < 0 || col >= r.length) return 0;
  return r[col]!.cx;
}

/** Key name at (row, col), or '' if out of range. */
export function keyName(row: number, col: number): string {
  const r = KEY_MATRIX[row];
  if (!r || col < 0 || col >= r.length) return '';
  return r[col]!.name;
}

/** Column in `row` whose centre-x is closest to physical `cx`. */
export function colNearestCx(row: number, cx: number): number {
  const r = KEY_MATRIX[row];
  if (!r || r.length === 0) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < r.length; i++) {
    const d = Math.abs(r[i]!.cx - cx);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** From (row, col), the visually-aligned column in `targetRow`. */
export function vNeighbor(row: number, col: number, targetRow: number): number {
  return colNearestCx(targetRow, keyCx(row, col));
}

/** col index in a row from a key name, or -1. */
export function colOfName(row: number, name: string): number {
  const r = KEY_MATRIX[row];
  if (!r) return -1;
  return r.findIndex((k) => k.name === name);
}
