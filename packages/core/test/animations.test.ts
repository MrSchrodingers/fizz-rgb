import { describe, it, expect } from 'vitest';
import { computeFrame } from '../src/animations.js';

describe('computeFrame', () => {
  const basicPattern = {
    keys: { '0': '#ff0000', '5': '#00ff00', '10': '#0000ff' },
    animType: 'solid' as const,
    animSpeed: 0.5,
  };

  it('solid returns the colors as-is', () => {
    const f = computeFrame(basicPattern, 0, 61);
    expect(f.get(0)).toEqual({ r: 255, g: 0, b: 0 });
    expect(f.get(5)).toEqual({ r: 0, g: 255, b: 0 });
    expect(f.get(10)).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('blink at t=0 is on', () => {
    const f = computeFrame({ ...basicPattern, animType: 'blink' }, 0, 61);
    expect(f.get(0)?.r).toBe(255);
  });

  it('blink toggles between on and off frames', () => {
    // at animSpeed=0.5, speed=2.5; blink half-period = 1/(2*2.5) = 0.2s
    // t=0: phase=0 → on; t=0.21: phase=0.525 → off
    const f1 = computeFrame({ ...basicPattern, animType: 'blink' }, 0, 61);
    const f2 = computeFrame({ ...basicPattern, animType: 'blink' }, 0.21, 61);
    // first frame should be fully bright, second should be all black
    expect(f1.get(0)?.r).toBe(255);
    expect(f2.get(0)?.r).toBe(0);
  });

  it('chase: only some keys lit at a time', () => {
    const pattern = {
      keys: { '0': '#ff0000', '5': '#ff0000', '10': '#ff0000', '15': '#ff0000', '20': '#ff0000' },
      animType: 'chase' as const,
      animSpeed: 0.5,
    };
    const f = computeFrame(pattern, 0, 61);
    // not all keys should be at full brightness simultaneously
    const intensities = [0, 5, 10, 15, 20].map((k) => f.get(k)?.r ?? 0);
    const max = Math.max(...intensities);
    const min = Math.min(...intensities);
    expect(max).toBeGreaterThan(min);
  });

  it('typewriter at t~0 lights just first key', () => {
    const pattern = {
      keys: { '0': '#ff0000', '5': '#00ff00', '10': '#0000ff' },
      animType: 'typewriter' as const,
      animSpeed: 0.5,
      sequence: [0, 5, 10],
    };
    const f = computeFrame(pattern, 0.05, 61);
    expect(f.get(0)).toBeDefined();
    expect(f.get(5)).toBeUndefined();
    expect(f.get(10)).toBeUndefined();
  });

  it('marquee at t=0 lights starting window', () => {
    const pattern = {
      keys: { '0': '#ff0000', '5': '#00ff00', '10': '#0000ff' },
      animType: 'marquee' as const,
      animSpeed: 0.5,
      sequence: [0, 5, 10],
    };
    const f = computeFrame(pattern, 0, 61);
    expect(f.size).toBeGreaterThan(0);
  });

  it('wave varies brightness across keys', () => {
    const pattern = {
      keys: { '0': '#ff0000', '10': '#ff0000', '20': '#ff0000', '30': '#ff0000' },
      animType: 'wave' as const,
      animSpeed: 0.5,
    };
    const f = computeFrame(pattern, 1, 61);
    const intensities = [0, 10, 20, 30].map((k) => f.get(k)?.r ?? 0);
    const max = Math.max(...intensities);
    const min = Math.min(...intensities);
    // Wave should produce varying intensity across keys
    expect(max).toBeGreaterThan(min);
  });
});
