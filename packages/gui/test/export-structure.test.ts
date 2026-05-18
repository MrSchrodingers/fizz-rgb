/**
 * Smoke tests for the portable export/import format (schemaVersion: 1).
 * These tests run in Node (no DOM) and verify the data shape produced by
 * the export logic — without needing a browser or Electron.
 */
import { describe, it, expect } from 'vitest';

interface FizzExport {
  schemaVersion: number;
  exportedAt: string;
  profiles: unknown[];
  patterns: Record<string, unknown>;
  userPresets: unknown[];
  currentState: unknown;
}

/** Simulates the export logic from App.tsx without any DOM/localStorage. */
function buildExportPayload(
  profiles: FizzExport['profiles'],
  patterns: FizzExport['patterns'],
  userPresets: FizzExport['userPresets'],
  currentState: FizzExport['currentState'],
): FizzExport {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profiles,
    patterns,
    userPresets,
    currentState,
  };
}

describe('fizz portable export format', () => {
  it('produces an object with schemaVersion: 1', () => {
    const payload = buildExportPayload([], {}, [], null);
    expect(payload.schemaVersion).toBe(1);
  });

  it('includes all top-level keys', () => {
    const payload = buildExportPayload([], {}, [], null);
    expect(payload).toHaveProperty('exportedAt');
    expect(payload).toHaveProperty('profiles');
    expect(payload).toHaveProperty('patterns');
    expect(payload).toHaveProperty('userPresets');
    expect(payload).toHaveProperty('currentState');
  });

  it('exportedAt is a valid ISO-8601 date string', () => {
    const payload = buildExportPayload([], {}, [], null);
    expect(() => new Date(payload.exportedAt)).not.toThrow();
    expect(new Date(payload.exportedAt).toISOString()).toBe(payload.exportedAt);
  });

  it('preserves profiles array', () => {
    const profiles = [
      { name: 'gaming', effect: { name: 'fw-static', params: { color: '#ff0000' } } },
    ];
    const payload = buildExportPayload(profiles, {}, [], null);
    expect(payload.profiles).toHaveLength(1);
    expect((payload.profiles[0] as { name: string }).name).toBe('gaming');
  });

  it('preserves patterns record', () => {
    const patterns = {
      'gaming': { keys: { '0': '#ff0000' }, animType: 'solid', animSpeed: 0.5 },
    };
    const payload = buildExportPayload([], patterns, [], null);
    expect(payload.patterns).toHaveProperty('gaming');
    expect((payload.patterns['gaming'] as { keys: Record<string, string> }).keys['0']).toBe('#ff0000');
  });

  it('preserves userPresets array', () => {
    const presets = [
      {
        id: 'user-1234',
        name: 'My preset',
        description: '5 keys, solid',
        category: 'user',
        pattern: { keys: { '0': '#00ff00' }, animType: 'solid', animSpeed: 0.5 },
      },
    ];
    const payload = buildExportPayload([], {}, presets, null);
    expect(payload.userPresets).toHaveLength(1);
  });

  it('is round-trip safe (JSON.stringify + JSON.parse)', () => {
    const profiles = [{ name: 'test', effect: { name: 'wave', params: { speed: 0.8 } } }];
    const patterns = { test: { keys: { '5': '#0000ff' }, animType: 'wave', animSpeed: 0.8 } };
    const presets = [{ id: 'u-1', name: 'p', description: '', category: 'user', pattern: { keys: {}, animType: 'solid', animSpeed: 0.5 } }];
    const currentState = { keys: { '0': '#ffffff' }, animType: 'solid', animSpeed: 0.5, mode: 'paint' };

    const payload = buildExportPayload(profiles, patterns, presets, currentState);
    const roundTripped = JSON.parse(JSON.stringify(payload)) as FizzExport;

    expect(roundTripped.schemaVersion).toBe(1);
    expect(roundTripped.profiles).toEqual(profiles);
    expect(roundTripped.patterns).toEqual(patterns);
    expect(roundTripped.userPresets).toEqual(presets);
    expect(roundTripped.currentState).toEqual(currentState);
  });

  it('import validation: rejects payload with wrong schemaVersion', () => {
    const badPayload = { schemaVersion: 2, profiles: [], patterns: {}, userPresets: [] };
    // Mirrors the import guard: typeof data === 'object' && data.schemaVersion === 1
    const isValid = typeof badPayload === 'object' && badPayload.schemaVersion === 1;
    expect(isValid).toBe(false);
  });

  it('import validation: accepts payload with schemaVersion 1', () => {
    const goodPayload = buildExportPayload([], {}, [], null);
    const isValid = typeof goodPayload === 'object' && goodPayload.schemaVersion === 1;
    expect(isValid).toBe(true);
  });
});
