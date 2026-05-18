export interface Color {
  r: number;
  g: number;
  b: number;
}

export const Color = {
  black: { r: 0, g: 0, b: 0 } satisfies Color,
  white: { r: 255, g: 255, b: 255 } satisfies Color,
} as const;

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

export function parseHex(hex: string): Color {
  const m = HEX_RE.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function toHex(c: Color): string {
  const n = ((c.r & 0xff) << 16) | ((c.g & 0xff) << 8) | (c.b & 0xff);
  return '#' + n.toString(16).padStart(6, '0');
}

export function hsvToRgb(h: number, s: number, v: number): Color {
  const c = v * s;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 1)      { r1 = c; g1 = x; b1 = 0; }
  else if (hh < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hh < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hh < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; g1 = 0; b1 = c; }
  else             { r1 = c; g1 = 0; b1 = x; }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}
