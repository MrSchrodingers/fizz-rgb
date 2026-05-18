// Encoder for the Redragon K617 firmware-effect HID protocol. Uses node:fs to
// load packet templates from disk — therefore **renderer-unsafe**. Import this
// module from the daemon, never from the Electron renderer.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FirmwareEffectName, FirmwareEffectParams } from './ipc.js';
import { parseHex } from './color.js';
import type { ProtocolFrame } from './protocol.js';

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
