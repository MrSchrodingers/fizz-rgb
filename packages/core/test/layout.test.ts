import { describe, it, expect } from 'vitest';
import { K617_LAYOUT, keyByName, ledCount } from '../src/layout.ts';

describe('K617_LAYOUT', () => {
  it('has 61 keys', () => {
    expect(K617_LAYOUT.keys).toHaveLength(61);
    expect(ledCount).toBe(61);
  });
  it('every key has unique LED index 0..60', () => {
    const indices = K617_LAYOUT.keys.map((k) => k.ledIndex).sort((a, b) => a - b);
    expect(indices).toEqual([...Array(61).keys()]);
  });
  it('keyByName finds Escape', () => {
    const k = keyByName('Escape');
    expect(k).toBeDefined();
    expect(k!.row).toBe(0);
    expect(k!.col).toBe(0);
  });
  it('keyByName returns undefined for unknown', () => {
    expect(keyByName('NotAKey')).toBeUndefined();
  });
  it('rows 0..4', () => {
    const rows = new Set(K617_LAYOUT.keys.map((k) => k.row));
    expect([...rows].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
