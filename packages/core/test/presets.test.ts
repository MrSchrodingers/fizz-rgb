import { describe, it, expect } from 'vitest';
import { BUILTIN_PRESETS, getPresetById } from '../src/presets.js';

describe('BUILTIN_PRESETS', () => {
  it('has at least 15 presets', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThanOrEqual(15);
  });

  it('all presets have unique IDs', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all presets have non-empty key maps', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(Object.keys(p.pattern.keys).length).toBeGreaterThan(0);
    }
  });

  it('getPresetById finds by id', () => {
    const p = getPresetById('word-debt');
    expect(p?.name).toBe('DEBT');
  });

  it('all colors are valid hex', () => {
    for (const p of BUILTIN_PRESETS) {
      for (const hex of Object.values(p.pattern.keys)) {
        expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('all key indices are numeric strings in 0..60', () => {
    for (const p of BUILTIN_PRESETS) {
      for (const k of Object.keys(p.pattern.keys)) {
        const n = Number(k);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(60);
      }
    }
  });

  it('presets with sequence have all sequence indices in 0..60', () => {
    for (const p of BUILTIN_PRESETS) {
      if (!p.pattern.sequence) continue;
      for (const idx of p.pattern.sequence) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(60);
      }
    }
  });

  it('covers multiple categories', () => {
    const cats = new Set(BUILTIN_PRESETS.map((p) => p.category));
    expect(cats.size).toBeGreaterThanOrEqual(4);
  });

  it('brasil preset uses flag-wave animation', () => {
    const p = getPresetById('theme-brazil');
    expect(p?.pattern.animType).toBe('flag-wave');
  });

  it('heart preset uses two distinct red shades', () => {
    const p = getPresetById('shape-heart');
    expect(p).toBeDefined();
    const colors = new Set(Object.values(p!.pattern.keys));
    expect(colors.size).toBeGreaterThanOrEqual(2);
  });
});
