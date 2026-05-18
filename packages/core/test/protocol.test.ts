import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeFirmwareEffect } from '../src/protocol-encoder.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function loadFixtureFrames(name: string): Buffer[] {
  const arrays = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as number[][];
  return arrays.map((a) => Buffer.from(a));
}

describe('encodeFirmwareEffect — burst structure', () => {
  const effects = [
    'fw-static', 'fw-rainbow', 'fw-snake', 'fw-sine-wave',
    'fw-star-twinkle', 'fw-rainbow-blossom', 'fw-waterfall', 'fw-wheel',
  ] as const;

  for (const effect of effects) {
    it(`${effect}: returns 5 frames (1 handshake + 4 data blocks)`, () => {
      const frames = encodeFirmwareEffect(effect, {});
      expect(frames).toHaveLength(5);
      expect(frames[0]!.length).toBe(6);    // handshake
      expect(frames[1]!.length).toBe(1032); // data block 1
      expect(frames[2]!.length).toBe(1032);
      expect(frames[3]!.length).toBe(1032);
      expect(frames[4]!.length).toBe(1032);
    });

    it(`${effect}: handshake is constant [0x05, 0x83, 0xb6, 0x00, 0x00, 0x00]`, () => {
      const frames = encodeFirmwareEffect(effect, {});
      expect(Array.from(frames[0]!)).toEqual([0x05, 0x83, 0xb6, 0x00, 0x00, 0x00]);
    });

    it(`${effect}: matches captured template when no params provided`, () => {
      const expected = loadFixtureFrames(effect);
      const actual = encodeFirmwareEffect(effect, {});
      for (let i = 0; i < 5; i++) {
        expect(actual[i]!.toString('hex')).toBe(expected[i]!.toString('hex'));
      }
    });
  }
});

describe('encodeFirmwareEffect — effect mode byte', () => {
  const expectedModes: Record<string, number> = {
    'fw-static': 0x01,
    'fw-rainbow': 0x03,
    'fw-snake': 0x0a,
    'fw-sine-wave': 0x0d,
    'fw-star-twinkle': 0x08,
    'fw-rainbow-blossom': 0x11,
    'fw-waterfall': 0x10,
    'fw-wheel': 0x06,
  };
  for (const [effect, mode] of Object.entries(expectedModes)) {
    it(`${effect}: byte [21] of block #4 is 0x${mode.toString(16).padStart(2, '0')}`, () => {
      const frames = encodeFirmwareEffect(effect as any, {});
      expect(frames[4]![21]).toBe(mode);
    });
  }
});

describe('encodeFirmwareEffect — color patching', () => {
  it('fw-static red sets bytes [29..31] of block #1 to ff,00,00', () => {
    const frames = encodeFirmwareEffect('fw-static', { color: '#ff0000' });
    expect(frames[1]![29]).toBe(0xff);
    expect(frames[1]![30]).toBe(0x00);
    expect(frames[1]![31]).toBe(0x00);
  });

  it('fw-snake with green sets ff at byte 30', () => {
    const frames = encodeFirmwareEffect('fw-snake', { color: '#00ff00' });
    expect(frames[1]![30]).toBe(0xff);
  });

  it('fw-waterfall with hex #ff8800', () => {
    const frames = encodeFirmwareEffect('fw-waterfall', { color: '#ff8800' });
    expect(frames[1]![29]).toBe(0xff);
    expect(frames[1]![30]).toBe(0x88);
    expect(frames[1]![31]).toBe(0x00);
  });

  it('color patching does not affect other bytes in block #1', () => {
    const base = encodeFirmwareEffect('fw-rainbow', {});
    const patched = encodeFirmwareEffect('fw-rainbow', { color: '#abcdef' });
    for (let i = 0; i < base[1]!.length; i++) {
      if (i === 29 || i === 30 || i === 31) continue;
      expect(patched[1]![i]).toBe(base[1]![i]);
    }
  });

  it('color patching does not affect block #4 (mode/speed)', () => {
    const base = encodeFirmwareEffect('fw-rainbow', {});
    const patched = encodeFirmwareEffect('fw-rainbow', { color: '#abcdef' });
    expect(patched[4]!.toString('hex')).toBe(base[4]!.toString('hex'));
  });
});

describe('encodeFirmwareEffect — speed/brightness patching', () => {
  it('speed=2 brightness=3 packs to (2<<4)|3 = 0x23 at byte [69] and [71]', () => {
    const frames = encodeFirmwareEffect('fw-rainbow', { speed: 2, brightness: 3 });
    expect(frames[4]![69]).toBe(0x23);
    expect(frames[4]![71]).toBe(0x23);
  });

  it('speed only preserves brightness nibble', () => {
    const baseline = encodeFirmwareEffect('fw-rainbow', {})[4]![69]!;
    const baselineBright = baseline & 0x0f;
    const frames = encodeFirmwareEffect('fw-rainbow', { speed: 4 });
    expect((frames[4]![69]! >> 4) & 0x0f).toBe(4);
    expect(frames[4]![69]! & 0x0f).toBe(baselineBright);
  });

  it('brightness only preserves speed nibble', () => {
    const baseline = encodeFirmwareEffect('fw-rainbow', {})[4]![69]!;
    const baselineSpeed = (baseline >> 4) & 0x0f;
    const frames = encodeFirmwareEffect('fw-rainbow', { brightness: 0 });
    expect((frames[4]![69]! >> 4) & 0x0f).toBe(baselineSpeed);
    expect(frames[4]![69]! & 0x0f).toBe(0);
  });
});

describe('encodeFirmwareEffect — immutability of templates', () => {
  it('does not mutate cached template between calls', () => {
    // Patch fw-rainbow (template has non-red color bytes) to a distinct color,
    // then verify the next no-params call returns the original template bytes.
    const before = encodeFirmwareEffect('fw-rainbow', {})[1]![29]!;
    encodeFirmwareEffect('fw-rainbow', { color: '#aabbcc' });
    const after = encodeFirmwareEffect('fw-rainbow', {})[1]![29]!;
    expect(after).toBe(before); // cached template not mutated
  });
});
