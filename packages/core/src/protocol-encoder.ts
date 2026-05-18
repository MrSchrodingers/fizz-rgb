// Encoder for the Redragon K617 firmware-effect HID protocol. Uses node:fs to
// load packet templates from disk — therefore **renderer-unsafe**. Import this
// module from the daemon, never from the Electron renderer.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FirmwareEffectName, FirmwareEffectParams } from './ipc.js';
import { parseHex } from './color.js';
import type { Color } from './color.js';
import type { ProtocolFrame } from './protocol.js';
import { K617_LAYOUT } from './layout.js';

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'templates');

function loadTemplate(name: FirmwareEffectName): Buffer[] {
  const path = join(TEMPLATE_DIR, `${name}.json`);
  const raw = readFileSync(path, 'utf8');
  const arrays = JSON.parse(raw) as number[][];
  return arrays.map((a) => Buffer.from(a));
}

const TEMPLATES: Record<FirmwareEffectName, Buffer[]> = {
  'fw-static': loadTemplate('fw-static'),
  'fw-rainbow': loadTemplate('fw-rainbow'),
  'fw-snake': loadTemplate('fw-snake'),
  'fw-sine-wave': loadTemplate('fw-sine-wave'),
  'fw-star-twinkle': loadTemplate('fw-star-twinkle'),
  'fw-rainbow-blossom': loadTemplate('fw-rainbow-blossom'),
  'fw-waterfall': loadTemplate('fw-waterfall'),
  'fw-wheel': loadTemplate('fw-wheel'),
};

const COLOR_BLOCK_INDEX = 1;
const COLOR_OFFSET_R = 29;
const COLOR_OFFSET_G = 30;
const COLOR_OFFSET_B = 31;
const MODE_BLOCK_INDEX = 4;
const SPEED_BRIGHTNESS_OFFSETS = [69, 71];

function clampNibble(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(15, Math.round(n)));
}

export function encodeFirmwareEffect(
  name: FirmwareEffectName,
  params: FirmwareEffectParams,
): ProtocolFrame[] {
  const template = TEMPLATES[name];
  if (!template) throw new Error(`unknown firmware effect: ${name}`);
  const frames = template.map((b) => Buffer.from(b));

  if (params.color !== undefined) {
    const rgb = parseHex(params.color);
    const block1 = frames[COLOR_BLOCK_INDEX]!;
    block1[COLOR_OFFSET_R] = rgb.r;
    block1[COLOR_OFFSET_G] = rgb.g;
    block1[COLOR_OFFSET_B] = rgb.b;
  }

  const speed = params.speed;
  const brightness = params.brightness;
  if (speed !== undefined || brightness !== undefined) {
    const block4 = frames[MODE_BLOCK_INDEX]!;
    const current = block4[SPEED_BRIGHTNESS_OFFSETS[0]!]!;
    const curSpeed = (current >> 4) & 0x0f;
    const curBright = current & 0x0f;
    const newSpeed = speed !== undefined ? clampNibble(speed) : curSpeed;
    const newBright = brightness !== undefined ? clampNibble(brightness) : curBright;
    const packed = ((newSpeed & 0x0f) << 4) | (newBright & 0x0f);
    for (const off of SPEED_BRIGHTNESS_OFFSETS) {
      block4[off] = packed;
    }
  }

  return frames;
}

// ---------------------------------------------------------------------------
// Sinodragon per-key protocol (verified on K617 hardware)
// ---------------------------------------------------------------------------

// Single HID feature report, 382 bytes, sent to interface 1 (/dev/hidraw1).
// Header: [0x08, 0x0A, 0x7A, 0x01] (4 bytes)
// Body: 96 RGB triplets = 288 bytes (column-major LED matrix, 16 cols × 6 rows)
// Padding zeros to 382 bytes total.

const PERKEY_HEADER = [0x08, 0x0a, 0x7a, 0x01];
const PERKEY_PACKET_LEN = 382;
const SINODRAGON_LED_COUNT = 96;

// Verified mapping: K617 key name → position in the 96-slot LED matrix.
// Anchors verified on hardware: Esc=0, Tab=2, Caps=3, LShift=4, LCtrl=5,
// J=45, Space=35, Enter=81.
// NOTE: Menu (65) and RCtrl (71) are best-guess positions derived from the
// Sinodragon full-size layout (col 10 / col 11 on the bottom row). These two
// keys were not directly verified on K617 hardware and may need adjustment.
const K617_TO_SINODRAGON_POS: Record<string, number> = {
  // Row 0 — number row
  Escape: 0,
  '1': 7, '2': 13, '3': 19, '4': 25, '5': 31, '6': 37, '7': 43, '8': 49, '9': 55, '0': 61,
  Minus: 67, Equal: 73, Backspace: 79,
  // Row 1 — QWERTY
  Tab: 2,
  Q: 8, W: 14, E: 20, R: 26, T: 32, Y: 38, U: 44, I: 50, O: 56, P: 62,
  LBracket: 68, RBracket: 74, Backslash: 80,
  // Row 2 — ASDF
  CapsLock: 3,
  A: 9, S: 15, D: 21, F: 27, G: 33, H: 39, J: 45, K: 51, L: 57,
  Semicolon: 63, Quote: 69, Enter: 81,
  // Row 3 — ZXCV
  LShift: 4,
  Z: 10, X: 16, C: 22, V: 28, B: 34, N: 40, M: 46,
  Comma: 52, Period: 58, Slash: 64, RShift: 82,
  // Row 4 — bottom row
  LCtrl: 5, LSuper: 11, LAlt: 17, Space: 35, RAlt: 53, Fn: 59,
  Menu: 65,  // UNVERIFIED — best guess from Sinodragon col 10, row 5
  RCtrl: 71, // UNVERIFIED — best guess from Sinodragon col 11, row 5
};

/**
 * Cache: K617 ledIndex (0..60) → Sinodragon LED position (0..95).
 * Computed once at module load from K617_LAYOUT and the name mapping above.
 */
const LED_INDEX_TO_POS: number[] = (() => {
  const arr: number[] = new Array(K617_LAYOUT.keys.length).fill(-1);
  for (const k of K617_LAYOUT.keys) {
    const pos = K617_TO_SINODRAGON_POS[k.name];
    if (pos !== undefined) arr[k.ledIndex] = pos;
  }
  return arr;
})();

/**
 * Encode a per-key color array as a single 382-byte HID feature report
 * using the Sinodragon protocol (verified on K617).
 *
 * @param colors  Map from K617 ledIndex (0..60) to RGB Color. Keys not in the
 *                map are sent as black (off).
 * @returns       A single Buffer ready to send via hid.sendFeatureReport.
 */
export function encodePerKeyFrame(colors: Map<number, Color>): Buffer {
  const packet = Buffer.alloc(PERKEY_PACKET_LEN);
  // Write header bytes
  for (let i = 0; i < PERKEY_HEADER.length; i++) packet[i] = PERKEY_HEADER[i]!;
  // Write RGB body: 96 triplets starting at byte offset 4
  for (const [ledIndex, color] of colors.entries()) {
    const pos = LED_INDEX_TO_POS[ledIndex];
    if (pos === undefined || pos < 0 || pos >= SINODRAGON_LED_COUNT) continue;
    const off = 4 + pos * 3;
    packet[off]     = color.r;
    packet[off + 1] = color.g;
    packet[off + 2] = color.b;
  }
  return packet;
}

/**
 * Helper: encode all 61 K617 keys to the same color (solid color via per-key path).
 */
export function encodePerKeySolid(color: Color): Buffer {
  const map = new Map<number, Color>();
  for (const k of K617_LAYOUT.keys) map.set(k.ledIndex, color);
  return encodePerKeyFrame(map);
}
