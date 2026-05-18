import type { FirmwareEffectName } from '@fizz/core';

interface Params {
  selected: FirmwareEffectName | 'solid-color';
  solidColor: string; // hex
  draftColor: string | undefined;
  keyIndex: number;
  keyCount: number;
  time: number; // seconds since canvas init
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb01(hex: string): RGB {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return { r: 1, g: 1, b: 1 };
  const n = parseInt(m[1]!, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

function hsvToRgb01(h: number, s: number, v: number): RGB {
  const c = v * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hh < 1) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (hh < 2) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (hh < 3) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (hh < 4) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (hh < 5) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }
  const m = v - c;
  return { r: r1 + m, g: g1 + m, b: b1 + m };
}

const ANIMATED_NO_COLOR: FirmwareEffectName[] = [
  'fw-rainbow',
  'fw-rainbow-blossom',
  'fw-sine-wave',
  'fw-wheel',
];

export function computeKeyColor(p: Params): RGB {
  if (p.selected === 'solid-color') {
    return hexToRgb01(p.solidColor);
  }

  if (ANIMATED_NO_COLOR.includes(p.selected as FirmwareEffectName)) {
    // Rotating rainbow across keys
    const hue = (p.keyIndex / p.keyCount) * 360 + p.time * 60;
    return hsvToRgb01(hue, 0.85, 0.95);
  }

  // Color-bearing effects: use the draft color (or fallback) and animate brightness
  const base = hexToRgb01(p.draftColor ?? '#ff0000');

  if (p.selected === 'fw-snake') {
    // Highlight a single key that "moves"
    const head = Math.floor(p.time * 8) % p.keyCount;
    const dist = Math.min(
      Math.abs(p.keyIndex - head),
      p.keyCount - Math.abs(p.keyIndex - head),
    );
    const intensity = Math.max(0, 1 - dist / 5);
    return { r: base.r * intensity, g: base.g * intensity, b: base.b * intensity };
  }

  if (p.selected === 'fw-waterfall') {
    // Brightness varies by row + time (waterfall down)
    const wave = (Math.sin(p.time * 3 + p.keyIndex * 0.5) + 1) / 2;
    return {
      r: base.r * (0.3 + wave * 0.7),
      g: base.g * (0.3 + wave * 0.7),
      b: base.b * (0.3 + wave * 0.7),
    };
  }

  if (p.selected === 'fw-star-twinkle') {
    // Random keys flicker
    const phase = Math.sin(p.time * 4 + p.keyIndex * 7.3);
    const bright = phase > 0.5 ? 1 : 0.15;
    return { r: base.r * bright, g: base.g * bright, b: base.b * bright };
  }

  // fw-static: just the color
  return base;
}
