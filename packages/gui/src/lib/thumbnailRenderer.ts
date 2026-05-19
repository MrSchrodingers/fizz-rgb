import { K617_LAYOUT } from '@fizz/core';
import type { Preset } from '@fizz/core';
import type { UserPreset } from '../components/PresetGallery.js';

/**
 * Per-preset animated thumbnail renderer.
 *
 * Each thumbnail is a 6 wide x 5 tall grid (30 cells). The renderer takes
 * a preset + a time `t` (seconds since canvas init) and returns the cell
 * colors as hex strings. PresetGallery wires this to a shared
 * requestAnimationFrame loop so all thumbnails animate in sync.
 *
 * For non-stateful presets we sample the actual `pattern.keys` from the
 * K617 layout and modulate brightness based on `animType + t`, mirroring
 * what the GUI computeKeyColor does for the 3D viewport.
 *
 * For stateful animations (games, minecraft, aquarium, thermal) the
 * daemon owns the real engine — we ship simplified TypeScript
 * approximations here so the previews actually look like the preset.
 */

export const THUMB_COLS = 6;
export const THUMB_ROWS = 5;
const TOTAL = THUMB_COLS * THUMB_ROWS;

const BG = '#1a1a1f';

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function rgbHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
function scale(hex: string, mul: number): string {
  const { r, g, b } = hexRgb(hex);
  return rgbHex(r * mul, g * mul, b * mul);
}
function lerpHex(a: string, b: string, t: number): string {
  const ca = hexRgb(a), cb = hexRgb(b);
  return rgbHex(lerp(ca.r, cb.r, t), lerp(ca.g, cb.g, t), lerp(ca.b, cb.b, t));
}

// ─── Sampling K617 keys -> 6x5 thumbnail grid ───────────────────────────────

/**
 * For each thumbnail cell, find the ledIndex of the closest K617 key (or
 * null if none nearby). Cached at module load — K617 layout is static.
 */
const SAMPLE_LEDS: Array<number | null> = (() => {
  const keys = K617_LAYOUT.keys;
  const maxCol = Math.max(...keys.map((k) => k.col + k.width));
  const maxRow = 4;
  const out: Array<number | null> = new Array(TOTAL).fill(null);
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const tx = ((gx + 0.5) / THUMB_COLS) * maxCol;
      const ty = ((gy + 0.5) / THUMB_ROWS) * (maxRow + 1) - 0.5;
      let best = -1, bestDist = Infinity;
      for (const k of keys) {
        const kx = k.col + k.width / 2;
        const ky = k.row;
        const d = Math.sqrt((kx - tx) ** 2 + (ky - ty) ** 2);
        if (d < bestDist) { bestDist = d; best = k.ledIndex; }
      }
      out[gy * THUMB_COLS + gx] = best >= 0 ? best : null;
    }
  }
  return out;
})();

// ─── Animation modulators for non-stateful types ────────────────────────────

function modulateNonStateful(baseHex: string, animType: string, animSpeed: number, gx: number, gy: number, t: number): string {
  const speed = 0.5 + animSpeed * 4;
  if (animType === 'solid') return baseHex;
  if (animType === 'blink') {
    const phase = (t * speed) % 1;
    return phase < 0.5 ? baseHex : scale(baseHex, 0.1);
  }
  if (animType === 'wave') {
    const phase = t * speed + (gx + gy * 1.5) * 0.6;
    const intensity = 0.15 + 0.85 * (Math.sin(phase) + 1) / 2;
    return scale(baseHex, intensity);
  }
  if (animType === 'flag-wave') {
    const phase = t * speed + gx * 0.7;
    const intensity = 0.2 + 0.8 * (Math.sin(phase) + 1) / 2;
    return scale(baseHex, intensity);
  }
  if (animType === 'chase') {
    const head = Math.floor(t * speed * 2) % THUMB_COLS;
    const dist = Math.abs(gx - head);
    return scale(baseHex, Math.max(0.1, 1 - dist / 3));
  }
  if (animType === 'typewriter') {
    const totalSteps = THUMB_COLS + 2;
    const phase = Math.floor((t * speed) % totalSteps);
    return gx <= phase && gx < THUMB_COLS ? baseHex : scale(baseHex, 0.05);
  }
  if (animType === 'marquee') {
    const headPos = (t * speed * 2) % (THUMB_COLS + 2);
    const dist = Math.abs(gx - Math.floor(headPos));
    return dist <= 1 ? baseHex : scale(baseHex, 0.05);
  }
  return baseHex;
}

// ─── Stateful preset renderers ───────────────────────────────────────────────

function renderMinecraftDay(t: number): string[] {
  // 8-second thumbnail cycle (faster than the 30s daemon cycle so the user
  // sees motion in the preview).
  const phase = (t / 8) % 1;
  const out: string[] = [];

  let skyTop: string, skyBottom: string;
  if (phase < 0.10) { skyTop = lerpHex('#040030', '#8c3cc8', phase / 0.10); skyBottom = lerpHex('#0c005a', '#ff783c', phase / 0.10); }
  else if (phase < 0.20) { skyTop = lerpHex('#8c3cc8', '#008cff', (phase - 0.10) / 0.10); skyBottom = lerpHex('#ff783c', '#50c8ff', (phase - 0.10) / 0.10); }
  else if (phase < 0.65) { skyTop = '#008cff'; skyBottom = '#50c8ff'; }
  else if (phase < 0.75) { skyTop = lerpHex('#008cff', '#b42878', (phase - 0.65) / 0.10); skyBottom = lerpHex('#50c8ff', '#ff5a1e', (phase - 0.65) / 0.10); }
  else if (phase < 0.85) { skyTop = lerpHex('#b42878', '#040030', (phase - 0.75) / 0.10); skyBottom = lerpHex('#ff5a1e', '#0c005a', (phase - 0.75) / 0.10); }
  else { skyTop = '#040030'; skyBottom = '#0c005a'; }

  const isDay = phase >= 0.10 && phase <= 0.75;
  const sunT = isDay ? (phase - 0.10) / 0.65 : -1;
  const sunCol = isDay ? sunT * THUMB_COLS : -1;
  const sunRow = isDay && Math.sin(sunT * Math.PI) > 0.5 ? 0 : 1;

  const isNight = phase > 0.85;
  const moonT = isNight ? (phase - 0.85) / 0.15 : -1;
  const moonCol = isNight ? moonT * THUMB_COLS : -1;

  const cloud1Col = (phase * 8) % 8 - 1;
  const cloud2Col = (phase * 6 + 3) % 8 - 1;

  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color: string;
      if (gy === 0) color = skyTop;
      else if (gy === 1) color = skyBottom;
      else if (gy === 2) color = lerpHex(skyBottom, '#8c4614', 0.55);
      else if (gy === 3) color = '#8c4614';
      else color = '#1edc32';

      if (isDay && gy === sunRow) {
        const d = Math.abs(gx + 0.5 - sunCol);
        if (d < 0.9) color = lerpHex(color, '#ffdc00', (1 - d / 0.9));
      }
      if (isNight && gy === 0) {
        const d = Math.abs(gx + 0.5 - moonCol);
        if (d < 0.8) color = lerpHex(color, '#e6e6f5', (1 - d / 0.8));
      }
      if (isNight && gy <= 1) {
        const hash = Math.sin((gx + 1) * 12.9898 + (gy + 1) * 78.233) * 43758.5453;
        const isStar = (hash - Math.floor(hash)) > 0.7;
        if (isStar) {
          const twinkle = 0.4 + 0.6 * Math.sin(t * 8 + gx * 4 + gy * 3);
          color = lerpHex(color, '#ffffff', Math.max(0, twinkle) * 0.8);
        }
      }
      if (isDay && gy <= 1) {
        const cloudCol = gy === 0 ? cloud1Col : cloud2Col;
        const d = Math.abs(gx + 0.5 - cloudCol);
        if (d < 1.2) color = lerpHex(color, '#ffffff', (1 - d / 1.2) * 0.7);
      }
      out.push(color);
    }
  }
  return out;
}

function renderAquarium(t: number): string[] {
  const out: string[] = [];
  const bubbles = [0, 1, 2, 3, 4, 5].map((i) => {
    const col = ((i * 1.7) % THUMB_COLS) + 0.3;
    const speed = 0.4 + (i % 3) * 0.15;
    const phase = (t * speed + i * 0.4) % 1;
    return { col, phase };
  });
  const fishT = (t / 5) % 1;
  const fishCol = fishT * (THUMB_COLS + 2) - 1;
  const fishRow = 2 + Math.round(Math.sin(fishT * Math.PI * 2) * 0.5);

  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color: string;
      if (gy === 0) color = '#28dcff';
      else if (gy === 1) color = lerpHex('#28dcff', '#0078e6', 0.4);
      else if (gy === 2) color = '#0078e6';
      else if (gy === 3) color = '#001e82';
      else color = '#ffc83c';

      for (const b of bubbles) {
        const bRow = 4 - b.phase * 4;
        const dr = Math.abs(gy - bRow);
        const dc = Math.abs(gx + 0.5 - b.col);
        if (dr < 0.7 && dc < 0.7) {
          color = lerpHex(color, '#dcfaff', (1 - dr / 0.7) * (1 - dc / 0.7) * 0.85);
        }
      }
      if (gy === fishRow) {
        const d = gx + 0.5 - fishCol;
        if (d >= -0.3 && d <= 1.4) {
          const ti = 1 - Math.min(1, Math.abs(d - 0.5));
          color = lerpHex(color, '#ff8c3c', ti * 0.9);
        }
      }
      out.push(color);
    }
  }
  return out;
}

function renderMatrixRain(t: number): string[] {
  const out: string[] = [];
  const speed = 1.4;
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const colOffset = (gx * 0.37) % 1;
      const dropY = (t * speed + colOffset) % (THUMB_ROWS + 2);
      const d = gy - (dropY - 2);
      let color = BG;
      if (d >= 0 && d <= 2) {
        const intensity = 1 - d / 2;
        const head = d < 0.5 ? '#e6ffe6' : '#00ff00';
        color = scale(head, intensity);
      }
      out.push(color);
    }
  }
  return out;
}

function renderPong(t: number): string[] {
  const out: string[] = [];
  const ballX = (THUMB_COLS / 2) + Math.sin(t * 2) * (THUMB_COLS / 2 - 1);
  const ballY = (THUMB_ROWS / 2) + Math.sin(t * 2.7) * (THUMB_ROWS / 2 - 1);
  const leftPaddle = 1.5 + Math.sin(t * 2 + 0.3) * 1.2;
  const rightPaddle = 1.5 + Math.sin(t * 2.7 + 0.3) * 1.2;
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      if (gx === 0 && Math.abs(gy - leftPaddle) < 1.2) color = '#00ffff';
      else if (gx === THUMB_COLS - 1 && Math.abs(gy - rightPaddle) < 1.2) color = '#ff0080';
      else if (Math.abs(gx - ballX) < 0.7 && Math.abs(gy - ballY) < 0.7) color = '#ffff00';
      out.push(color);
    }
  }
  return out;
}

function renderSnake(t: number): string[] {
  const out: string[] = [];
  const head = (t * 2) % (THUMB_COLS * 2);
  const segments: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const s = head - i * 0.8;
    const xRaw = (s < 0 ? s + THUMB_COLS * 2 : s) % (THUMB_COLS * 2);
    const wrappedX = xRaw < THUMB_COLS ? xRaw : THUMB_COLS * 2 - xRaw - 1;
    const wrappedY = 1 + Math.sin(s * 0.7) * 1.5;
    segments.push({ x: wrappedX, y: wrappedY + 1.5 });
  }
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i]!;
        if (Math.abs(gx - s.x) < 0.7 && Math.abs(gy - s.y) < 0.7) {
          const intensity = 1 - i * 0.12;
          color = scale(i === 0 ? '#a0ff00' : '#00ff00', intensity);
        }
      }
      const foodX = 4.5, foodY = 0.5;
      if (Math.abs(gx - foodX) < 0.5 && Math.abs(gy - foodY) < 0.5) {
        color = (Math.sin(t * 8) > 0) ? '#ff0000' : '#aa0000';
      }
      out.push(color);
    }
  }
  return out;
}

function renderTetris(t: number): string[] {
  const out: string[] = [];
  const stack: Record<string, string> = {
    '0,4': '#00ffff', '1,4': '#00ffff', '2,4': '#00ffff',
    '3,4': '#ff8c00', '4,4': '#ff8c00', '5,4': '#ff8c00',
    '0,3': '#ffff00', '1,3': '#ffff00',
    '4,3': '#0000ff',
  };
  const fallingPiece = [
    { x: Math.floor((t * 0.6) % THUMB_COLS), y: Math.floor((t * 1.8) % 3) },
    { x: Math.floor((t * 0.6) % THUMB_COLS) + 1, y: Math.floor((t * 1.8) % 3) },
    { x: Math.floor((t * 0.6) % THUMB_COLS), y: Math.floor((t * 1.8) % 3) + 1 },
  ];
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      const k = `${gx},${gy}`;
      if (stack[k]) color = stack[k]!;
      for (const p of fallingPiece) {
        if (p.x === gx && p.y === gy) color = '#a020f0';
      }
      out.push(color);
    }
  }
  return out;
}

function renderBreakout(t: number): string[] {
  const out: string[] = [];
  const ballX = (THUMB_COLS / 2) + Math.sin(t * 3) * (THUMB_COLS / 2 - 1);
  const ballY = 1.5 + Math.abs(Math.sin(t * 4)) * 2;
  const paddleX = (THUMB_COLS / 2) + Math.sin(t * 3) * 1.5;
  const brickColors = ['#ff0000', '#ff8c00', '#ffff00'];
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      if (gy < 2) {
        const broken = Math.sin((gx + 1) * (gy + 1) * 7 + Math.floor(t / 2) * 2) > 0.6;
        if (!broken) color = brickColors[(gx + gy) % 3]!;
      }
      if (gy === 4 && Math.abs(gx + 0.5 - paddleX) < 1) color = '#ffffff';
      if (Math.abs(gx + 0.5 - ballX) < 0.6 && Math.abs(gy + 0.5 - ballY) < 0.6) color = '#00ffff';
      out.push(color);
    }
  }
  return out;
}

function renderFireworks(t: number): string[] {
  const out: string[] = [];
  const bursts = [
    { x: 1.5, y: 1.5, period: 1.7 },
    { x: 4.5, y: 0.5, period: 1.3 },
    { x: 3, y: 2.5, period: 2.1 },
  ];
  const palette = ['#ff0080', '#00ff80', '#ffff00', '#00ddff', '#ff8000'];
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      for (let i = 0; i < bursts.length; i++) {
        const b = bursts[i]!;
        const phase = (t / b.period + i * 0.2) % 1;
        const radius = phase * 2.5;
        const dx = gx + 0.5 - b.x;
        const dy = gy + 0.5 - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const onRing = Math.abs(d - radius) < 0.5;
        const intensity = (1 - phase) * (onRing ? 1 : 0);
        if (intensity > 0.05) {
          color = scale(palette[i % palette.length]!, intensity);
        }
      }
      out.push(color);
    }
  }
  return out;
}

function renderDvd(t: number): string[] {
  const out: string[] = [];
  const x = (THUMB_COLS / 2 - 0.5) + Math.sin(t * 1.7) * (THUMB_COLS / 2 - 0.5);
  const y = (THUMB_ROWS / 2 - 0.5) + Math.sin(t * 2.3) * (THUMB_ROWS / 2 - 0.5);
  const palette = ['#ff0080', '#00ff80', '#00ddff', '#ffff00', '#ff8000'];
  const colorIdx = Math.floor(t / 2) % palette.length;
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const d = Math.sqrt((gx - x) ** 2 + (gy - y) ** 2);
      out.push(d < 0.9 ? palette[colorIdx]! : BG);
    }
  }
  return out;
}

function renderHeartRate(t: number): string[] {
  const out: string[] = [];
  const cursor = (t * 1.5) % THUMB_COLS;
  const wave = [0, 0, -0.3, 1.0, -0.6, 0.2, 0];
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const cursorIdx = Math.floor(cursor);
      const distFromCursor = (cursorIdx - gx + THUMB_COLS) % THUMB_COLS;
      const waveValue = wave[distFromCursor % wave.length] ?? 0;
      const targetRow = 2 - waveValue * 2;
      const onLine = Math.abs(gy - targetRow) < 0.6;
      let color = BG;
      if (onLine) {
        const intensity = distFromCursor < 3 ? 1 - distFromCursor / 4 : 0.2;
        color = scale('#00ff32', Math.max(0.2, intensity));
      }
      out.push(color);
    }
  }
  return out;
}

function renderEqualizer(t: number): string[] {
  const out: string[] = [];
  const bars: number[] = [];
  for (let i = 0; i < THUMB_COLS; i++) {
    bars.push(2 + Math.sin(t * 4 + i * 1.3) * 1.5 + Math.sin(t * 7 + i * 2.1) * 0.8);
  }
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const height = Math.max(0.5, Math.min(THUMB_ROWS - 0.5, bars[gx]!));
      const onBar = (THUMB_ROWS - 1 - gy) <= height;
      let color = BG;
      if (onBar) {
        const heightRatio = (THUMB_ROWS - 1 - gy) / height;
        if (heightRatio > 0.7) color = '#ff3030';
        else if (heightRatio > 0.4) color = '#ffd000';
        else color = '#30ff30';
      }
      out.push(color);
    }
  }
  return out;
}

function renderRule30(t: number): string[] {
  const out: string[] = [];
  const tBucket = Math.floor(t * 1.5);
  function rng(i: number): number {
    return (Math.sin((i + 1) * 12.9898 + tBucket * 78.233) * 43758.5453) % 1;
  }
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const v = Math.abs(rng(gx + gy * THUMB_COLS));
      const on = v > 0.55;
      out.push(on ? '#ff00ff' : BG);
    }
  }
  return out;
}

function renderCpuThermal(t: number): string[] {
  const out: string[] = [];
  const temp = 50 + Math.sin(t * 0.3) * 25;
  const palette = ['#0050ff', '#00c8c8', '#00e650', '#ffc800', '#ff6400', '#ff1e1e'];
  let base: string;
  if (temp < 35) base = palette[0]!;
  else if (temp < 50) base = palette[1]!;
  else if (temp < 65) base = palette[2]!;
  else if (temp < 75) base = palette[3]!;
  else if (temp < 85) base = palette[4]!;
  else base = palette[5]!;
  const heat = clamp01((temp - 30) / 60);
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const rowHeat = (THUMB_ROWS - 1 - gy) / (THUMB_ROWS - 1);
      const intensity = 0.3 + 0.7 * (rowHeat < heat ? 1 : 0.4);
      out.push(scale(base, intensity));
    }
  }
  return out;
}

function renderPacman(t: number): string[] {
  const out: string[] = [];
  // Pacman wanders left↔right on a sin curve.
  const px = Math.floor(2 + (Math.sin(t * 0.8) * 0.5 + 0.5) * (THUMB_COLS - 4));
  const py = 2 + Math.round(Math.sin(t * 1.3) * 1);
  // Two ghosts on opposite sides moving toward Pacman.
  const ghosts = [
    { x: Math.floor((Math.sin(t * 0.6 + 1.0) * 0.5 + 0.5) * (THUMB_COLS - 1)), y: 0, color: '#ff003c' },
    { x: Math.floor((Math.sin(t * 0.7 + 2.5) * 0.5 + 0.5) * (THUMB_COLS - 1)), y: 4, color: '#00ddff' },
  ];
  // Dots — pseudo-random sparse pattern using a hash.
  function hasDot(x: number, y: number): boolean {
    const h = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + Math.floor(t / 2) * 11) * 43758.5453;
    return (h - Math.floor(h)) > 0.45;
  }

  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      if (hasDot(gx, gy)) color = '#3a3a22';
      // Ghosts.
      for (const g of ghosts) {
        if (g.x === gx && g.y === gy) color = g.color;
      }
      // Pacman.
      if (gx === px && gy === py) {
        // chomp blink
        color = Math.sin(t * 6) > 0 ? '#ffdc00' : '#dcb400';
      }
      out.push(color);
    }
  }
  return out;
}

function renderDoom(t: number): string[] {
  const out: string[] = [];
  // Fake a 3D corridor: walls converging to a vanishing point at center.
  // Two enemy "imps" appear at distance, pulsing red.
  const enemyDist = 1.5 + Math.sin(t * 1.2) * 1.0; // 0.5..2.5
  const enemyCol = 3 + Math.floor(Math.sin(t * 0.8) * 0.5 + 0.5);
  const flash = Math.sin(t * 8) > 0;

  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      // HUD row 0: HP bar (left half red) + ammo (right cyan)
      if (gy === 0) {
        if (gx <= 2) color = '#ff0000';
        else if (gx >= 4) color = '#ffdc00';
        out.push(color);
        continue;
      }
      // Floor row 4
      if (gy === 4) { out.push('#3c1e05'); continue; }
      // 3D view rows 1-3: wall slices converging toward center column.
      const distFromCenter = Math.abs(gx - (THUMB_COLS - 1) / 2);
      const wallSliceHeight = Math.max(1, 3 - Math.floor(distFromCenter));
      const sliceTop = 2 - Math.floor((wallSliceHeight - 1) / 2);
      const sliceBottom = sliceTop + wallSliceHeight - 1;
      if (gy >= sliceTop && gy <= sliceBottom) {
        const fade = 1 - distFromCenter / 4;
        // Enemy: column matches & near distance
        if (gx === enemyCol && enemyDist < 1.5 && gy === 2) {
          color = flash ? '#ff0050' : '#a00040';
        } else {
          const v = Math.round(140 * fade);
          color = '#' + v.toString(16).padStart(2, '0').repeat(2) + Math.round(160 * fade).toString(16).padStart(2, '0');
        }
      }
      out.push(color);
    }
  }
  return out;
}

function renderMinecraftClouds(t: number): string[] {
  const out: string[] = [];
  const SKY_TOP = '#008cff';
  const SKY_BOTTOM = '#50c8ff';
  const cloud1 = ((t * 0.18) % 1) * THUMB_COLS;
  const cloud2 = ((t * 0.12 + 0.4) % 1) * THUMB_COLS;
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color: string;
      if (gy === 0) color = SKY_TOP;
      else if (gy === 1 || gy === 2) color = SKY_BOTTOM;
      else if (gy === 3) color = '#1edc32';
      else color = '#8c4614';
      // Sun
      if (gy === 0 && Math.abs(gx + 0.5 - THUMB_COLS / 2) < 0.7) {
        color = lerpHex(color, '#ffdc00', 0.8);
      }
      // Clouds
      if (gy === 0 || gy === 1) {
        const cloudCol = gy === 0 ? cloud1 : cloud2;
        const d = Math.abs(gx + 0.5 - cloudCol);
        if (d < 1.0) color = lerpHex(color, '#ffffff', (1 - d / 1.0) * 0.7);
      }
      out.push(color);
    }
  }
  return out;
}

function renderSpaceInvaders(t: number): string[] {
  const out: string[] = [];
  // Marching formation drifts left↔right; player ship tracks on row 4.
  const drift = Math.round(Math.sin(t * 0.8) * 1);
  const shipX = Math.floor(2 + (Math.sin(t * 1.1) * 0.5 + 0.5) * (THUMB_COLS - 4));
  // A descending alien bullet and a rising player bullet.
  const aBulletY = Math.floor((t * 1.5) % 5);
  const aBulletX = 2 + drift;
  const pBulletY = 3 - Math.floor((t * 2.0) % 4);
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      // Aliens occupy rows 0-1 on alternating columns.
      if ((gy === 0 || gy === 1) && (gx + drift) % 2 === 0) color = '#00ff64';
      // Alien bullet.
      if (gx === aBulletX && gy === aBulletY && gy > 1) color = '#ff5018';
      // Player bullet.
      if (gx === shipX && gy === pBulletY && gy < 4) color = '#ffffff';
      // Ship on row 4.
      if (gy === 4 && gx === shipX) color = '#64c8ff';
      out.push(color);
    }
  }
  return out;
}

function renderMario(t: number): string[] {
  const out: string[] = [];
  // Side-scroll feel: ground on row 4 with a moving pit, Mario hops, a
  // goomba shuffles, a coin pulses.
  const scroll = Math.floor(t * 1.2);
  const pitCol = ((scroll % (THUMB_COLS + 2)) + THUMB_COLS) % (THUMB_COLS + 2);
  // Mario jump arc.
  const jumpPhase = (t * 1.6) % 3;
  const marioY = jumpPhase < 1.4 ? 1 : 3;
  const marioX = 1;
  const goombaX = THUMB_COLS - 1 - (scroll % THUMB_COLS);
  const coinPulse = Math.sin(t * 5) > 0;
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      let color = BG;
      // Ground row 4 (with a pit).
      if (gy === 4 && gx !== pitCol) color = '#823c0a';
      // Floating platform on row 2.
      if (gy === 2 && (gx === 3 || gx === 4)) color = '#6e5028';
      // Coin on row 1.
      if (gy === 1 && gx === 4 && coinPulse) color = '#ffdc00';
      // Goomba on row 3.
      if (gy === 3 && gx === goombaX) color = '#a05000';
      // Mario.
      if (gy === marioY && gx === marioX) color = '#ff1e00';
      out.push(color);
    }
  }
  return out;
}

function renderGenius(t: number): string[] {
  const out: string[] = [];
  // Four quadrants; one lights up at a time, cycling like a Simon sequence.
  const quadColors = ['#00ff28', '#ff0000', '#ffd200', '#005aff'];
  const active = Math.floor(t * 1.5) % 4;
  for (let gy = 0; gy < THUMB_ROWS; gy++) {
    for (let gx = 0; gx < THUMB_COLS; gx++) {
      const top = gy <= 1 ? 0 : 2;            // rows 0-1 top, 2-4 bottom-ish
      const left = gx < THUMB_COLS / 2 ? 0 : 1;
      const q = top + left;
      const qc = quadColors[q] ?? '#000000';
      out.push(q === active ? qc : lerpHex(qc, '#000000', 0.82));
    }
  }
  return out;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function renderThumbnail(preset: Preset | UserPreset, t: number): string[] {
  const animType = preset.pattern.animType;

  switch (animType) {
    case 'minecraft-day': return renderMinecraftDay(t);
    case 'aquarium': return renderAquarium(t);
    case 'matrix-rain': return renderMatrixRain(t);
    case 'pong': return renderPong(t);
    case 'snake': return renderSnake(t);
    case 'tetris': return renderTetris(t);
    case 'breakout': return renderBreakout(t);
    case 'fireworks': return renderFireworks(t);
    case 'dvd': return renderDvd(t);
    case 'heart-rate': return renderHeartRate(t);
    case 'equalizer': return renderEqualizer(t);
    case 'rule30': return renderRule30(t);
    case 'cpu-thermal': return renderCpuThermal(t);
    case 'pong-interactive': return renderPong(t);
    case 'pong-multiplayer': return renderPong(t);
    case 'snake-interactive': return renderSnake(t);
    case 'breakout-interactive': return renderBreakout(t);
    case 'pacman': return renderPacman(t);
    case 'doom': return renderDoom(t);
    case 'minecraft-clouds': return renderMinecraftClouds(t);
    case 'space-invaders': return renderSpaceInvaders(t);
    case 'mario': return renderMario(t);
    case 'genius': return renderGenius(t);
  }

  const out: string[] = new Array(TOTAL);
  const animSpeed = preset.pattern.animSpeed;
  for (let i = 0; i < TOTAL; i++) {
    const led = SAMPLE_LEDS[i];
    const baseHex = led !== null && led !== undefined ? preset.pattern.keys[String(led)] : undefined;
    if (!baseHex) {
      out[i] = BG;
      continue;
    }
    const gy = Math.floor(i / THUMB_COLS);
    const gx = i % THUMB_COLS;
    out[i] = modulateNonStateful(baseHex, animType, animSpeed, gx, gy, t);
  }
  return out;
}
