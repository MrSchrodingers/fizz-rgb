/**
 * Color transformation helpers used by the PresetEditor.
 *
 * Each transform takes a `Record<ledIndex → hex>` and returns a new one. We
 * keep the original untouched so the user can flip between styles without
 * losing the base preset.
 */

export type Style = 'original' | 'vivid' | 'neon' | 'pastel' | 'mono';

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const r1 = r / 255, g1 = g / 255, b1 = b / 255;
  const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r1) h = (g1 - b1) / d + (g1 < b1 ? 6 : 0);
    else if (max === g1) h = (b1 - r1) / d + 2;
    else h = (r1 - g1) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

/**
 * Apply vibrancy to RGB directly — much more visible than HSL massaging.
 *   v < 1: linear dim (full → black scale).
 *   v > 1: push the dominant channel(s) toward 255 and pull the weak ones
 *          toward 0, increasing saturation; mostly pure-channel at v=2.
 */
function applyVibrancyRgb(r: number, g: number, b: number, v: number): { r: number; g: number; b: number } {
  if (v <= 1) {
    return { r: r * v, g: g * v, b: b * v };
  }
  const max = Math.max(r, g, b);
  const boost = Math.min(1, v - 1); // 0..1 for v in 1..2
  const isMax = (c: number) => c >= max - 1;
  return {
    r: isMax(r) ? r + (255 - r) * boost : r * (1 - boost * 0.5),
    g: isMax(g) ? g + (255 - g) * boost : g * (1 - boost * 0.5),
    b: isMax(b) ? b + (255 - b) * boost : b * (1 - boost * 0.5),
  };
}

function transformOne(hex: string, style: Style, vibrancy: number, monoTint: string): string {
  const { r, g, b } = hexRgb(hex);

  // Style first (in HSL space, where it's natural), then vibrancy on RGB.
  let { h: nh, s: ns, l: nl } = rgbToHsl(r, g, b);
  switch (style) {
    case 'original': break;
    case 'vivid':
      // Maximum contrast — push saturation to 1 and luminance into the
      // sweet spot for pure-channel display.
      ns = 1;
      nl = nl < 0.25 ? 0.4 : nl > 0.75 ? 0.6 : nl;
      break;
    case 'neon':
      ns = 1;
      nl = 0.55;
      break;
    case 'pastel':
      ns = Math.max(0.2, ns * 0.5);
      nl = Math.min(0.82, Math.max(0.6, nl + 0.2));
      break;
    case 'mono': {
      const tintRgb = hexRgb(monoTint);
      const tintHsl = rgbToHsl(tintRgb.r, tintRgb.g, tintRgb.b);
      nh = tintHsl.h;
      ns = Math.max(0.6, tintHsl.s);
      break;
    }
  }
  const styled = hslToRgb(nh, ns, nl);
  const final = applyVibrancyRgb(styled.r, styled.g, styled.b, vibrancy);
  return rgbHex(final.r, final.g, final.b);
}

export interface StyleOptions {
  style: Style;
  vibrancy: number;
  monoTint?: string;
  /** Optional explicit color overrides: original hex → replacement hex. */
  colorMap?: Record<string, string>;
}

/**
 * Apply a transformation to every value in a preset's keys map. Empty input
 * (stateful presets) passes through untouched — the daemon will honour
 * style/vibrancy via the explicit fields in the IPC payload (future).
 */
export function transformKeys(
  keys: Record<string, string>,
  opts: StyleOptions,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [led, hex] of Object.entries(keys)) {
    // Per-color override first; falls through to style transform.
    const override = opts.colorMap?.[hex.toLowerCase()];
    const base = override ?? hex;
    if (opts.style === 'original' && opts.vibrancy === 1 && !override) {
      out[led] = base;
    } else {
      out[led] = transformOne(base, opts.style, opts.vibrancy, opts.monoTint ?? '#ff2db5');
    }
  }
  return out;
}

/** List unique hex colors in a keys map, sorted by frequency desc. */
export function uniqueColors(keys: Record<string, string>): string[] {
  const counts = new Map<string, number>();
  for (const hex of Object.values(keys)) {
    const k = hex.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
