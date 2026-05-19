import { describe, it, expect } from 'vitest';
import { BUILTIN_PRESETS, getPresetById } from '../src/presets.js';

describe('BUILTIN_PRESETS', () => {
  it('has at least 16 presets', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThanOrEqual(16);
  });

  it('all presets have unique IDs', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all non-game presets have non-empty key maps', () => {
    const gameOnlyAnimTypes = ['pong', 'snake', 'tetris', 'matrix-rain', 'breakout', 'fireworks', 'dvd', 'heart-rate', 'equalizer', 'rule30', 'cpu-thermal'];
    for (const p of BUILTIN_PRESETS) {
      if (p.category === 'game' && gameOnlyAnimTypes.includes(p.pattern.animType)) continue;
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

  it('shape-heart and shape-x-diagonal are removed', () => {
    expect(getPresetById('shape-heart')).toBeUndefined();
    expect(getPresetById('shape-x-diagonal')).toBeUndefined();
  });

  it('shape-border is renamed to shape-frame', () => {
    expect(getPresetById('shape-border')).toBeUndefined();
    expect(getPresetById('shape-frame')).toBeDefined();
  });

  it('has zone presets', () => {
    expect(getPresetById('zone-left-right')).toBeDefined();
    expect(getPresetById('zone-modifiers')).toBeDefined();
    expect(getPresetById('zone-typing-row')).toBeDefined();
  });

  it('has theme-fire with flag-wave', () => {
    const p = getPresetById('theme-fire');
    expect(p?.pattern.animType).toBe('flag-wave');
  });

  it('has game-pong and game-snake', () => {
    expect(getPresetById('game-pong')?.pattern.animType).toBe('pong');
    expect(getPresetById('game-snake')?.pattern.animType).toBe('snake');
  });

  it('has game-tetris with tetris animType', () => {
    const p = getPresetById('game-tetris');
    expect(p?.pattern.animType).toBe('tetris');
  });

  it('has the matrix-rain and breakout game presets', () => {
    expect(getPresetById('game-matrix-rain')?.pattern.animType).toBe('matrix-rain');
    expect(getPresetById('game-breakout')?.pattern.animType).toBe('breakout');
  });

  it('game-life preset is removed', () => {
    expect(getPresetById('game-life')).toBeUndefined();
  });

  it('has fireworks/dvd/heart-rate/equalizer/rule30 presets', () => {
    expect(getPresetById('game-fireworks')?.pattern.animType).toBe('fireworks');
    expect(getPresetById('game-dvd')?.pattern.animType).toBe('dvd');
    expect(getPresetById('game-heart-rate')?.pattern.animType).toBe('heart-rate');
    expect(getPresetById('game-equalizer')?.pattern.animType).toBe('equalizer');
    expect(getPresetById('game-rule30')?.pattern.animType).toBe('rule30');
  });
});
