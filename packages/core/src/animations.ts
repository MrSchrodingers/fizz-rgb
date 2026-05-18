import type { Color } from './color.js';
import { parseHex } from './color.js';

export type AnimType = 'solid' | 'blink' | 'chase' | 'wave' | 'typewriter' | 'marquee' | 'flag-wave' | 'pong' | 'snake' | 'tetris';

export interface Pattern {
  /** ledIndex (0..60) → hex color. Keys not in the map are "off" (black). */
  keys: Record<string, string>;
  animType: AnimType;
  /** 0..1, speed multiplier (1 = max speed). */
  animSpeed: number;
  /** Ordered list of ledIndex for sequential animations (typewriter, marquee).
   *  When provided, animations that need ordering (typewriter, marquee) use
   *  this sequence instead of sorted ledIndex order. */
  sequence?: number[];
}

const BLACK: Color = { r: 0, g: 0, b: 0 };

function hexToColor(hex: string): Color {
  return parseHex(hex);
}

function scaleColor(c: Color, factor: number): Color {
  const f = Math.max(0, Math.min(1, factor));
  return { r: Math.round(c.r * f), g: Math.round(c.g * f), b: Math.round(c.b * f) };
}

/**
 * Compute the color array for a single animation frame at time t (seconds).
 * Returns a Map<ledIndex, Color> with one entry per K617 key (61 total).
 * Unset keys = black.
 */
export function computeFrame(p: Pattern, t: number, _keyCount: number): Map<number, Color> {
  const out = new Map<number, Color>();
  const allKeys = Object.keys(p.keys).map(Number).sort((a, b) => a - b);
  const sequence = p.sequence ?? allKeys;
  const speed = 0.5 + p.animSpeed * 4; // map 0..1 → 0.5..4.5

  if (p.animType === 'solid') {
    for (const [k, hex] of Object.entries(p.keys)) {
      out.set(Number(k), hexToColor(hex));
    }
    return out;
  }

  if (p.animType === 'blink') {
    const phase = (t * speed) % 1;
    const on = phase < 0.5;
    for (const [k, hex] of Object.entries(p.keys)) {
      out.set(Number(k), on ? hexToColor(hex) : BLACK);
    }
    return out;
  }

  if (p.animType === 'chase') {
    if (sequence.length === 0) return out;
    const headIdx = Math.floor(t * speed * 2) % sequence.length;
    for (let i = 0; i < sequence.length; i++) {
      const ledIndex = sequence[i]!;
      const hex = p.keys[String(ledIndex)];
      if (!hex) continue;
      const dist = Math.abs(i - headIdx);
      const trailLen = Math.max(2, Math.floor(sequence.length / 4));
      const intensity = Math.max(0, 1 - dist / trailLen);
      out.set(ledIndex, scaleColor(hexToColor(hex), intensity));
    }
    return out;
  }

  if (p.animType === 'wave') {
    for (const [kStr, hex] of Object.entries(p.keys)) {
      const k = Number(kStr);
      const phase = t * speed + k * 0.3;
      const intensity = 0.3 + 0.7 * (Math.sin(phase) + 1) / 2;
      out.set(k, scaleColor(hexToColor(hex), intensity));
    }
    return out;
  }

  if (p.animType === 'typewriter') {
    // Each cycle: keys appear one by one, then all stay lit briefly, then all off, repeat.
    if (sequence.length === 0) return out;
    const totalSteps = sequence.length + 4;  // +reveal frames at end
    const stepDuration = 0.4 / speed;  // seconds per step
    const cycleTime = totalSteps * stepDuration;
    const phaseInCycle = (t % cycleTime) / stepDuration;
    const currentStep = Math.floor(phaseInCycle);
    // Show keys[0..currentStep] lit; if currentStep >= length, all lit for a moment
    const litCount = Math.min(currentStep + 1, sequence.length);
    for (let i = 0; i < litCount; i++) {
      const ledIndex = sequence[i]!;
      const hex = p.keys[String(ledIndex)];
      if (!hex) continue;
      out.set(ledIndex, hexToColor(hex));
    }
    // Fade out at the very end of the cycle (last 1-2 steps): blink off
    if (currentStep >= sequence.length + 2) {
      out.clear();
    }
    return out;
  }

  if (p.animType === 'marquee') {
    // Scrolling: at any moment, show a "window" of N consecutive keys from the sequence.
    if (sequence.length === 0) return out;
    const windowSize = Math.max(1, Math.min(4, Math.floor(sequence.length / 2)));
    const headPosition = (t * speed * 2) % (sequence.length + windowSize);
    for (let i = 0; i < windowSize; i++) {
      const seqIdx = Math.floor(headPosition) - i;
      if (seqIdx < 0 || seqIdx >= sequence.length) continue;
      const ledIndex = sequence[seqIdx]!;
      const hex = p.keys[String(ledIndex)];
      if (!hex) continue;
      // Fade trailing keys
      const intensity = 1 - (i / windowSize) * 0.6;
      out.set(ledIndex, scaleColor(hexToColor(hex), intensity));
    }
    return out;
  }

  if (p.animType === 'flag-wave') {
    // Phase varies primarily by column position (ledIndex % 14 approximates col in K617).
    // Time advances the wave left-to-right, creating a ripple effect like a waving flag.
    for (const [kStr, hex] of Object.entries(p.keys)) {
      const k = Number(kStr);
      // approximate column from ledIndex (K617 has ~14 cols per row)
      const col = k % 14;
      const phase = t * speed + col * 0.4;
      const intensity = 0.5 + 0.5 * Math.sin(phase);
      out.set(k, scaleColor(hexToColor(hex), intensity));
    }
    return out;
  }

  // Unknown type — fallback to solid
  for (const [k, hex] of Object.entries(p.keys)) {
    out.set(Number(k), hexToColor(hex));
  }
  return out;
}

