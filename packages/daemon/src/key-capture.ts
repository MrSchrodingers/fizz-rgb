import { createReadStream, readdirSync, readFileSync, existsSync, type ReadStream } from 'node:fs';
import { log } from './log.js';

/**
 * Read physical key presses from the K617's evdev node, in parallel with the
 * OS receiving them normally (evdev allows multiple concurrent readers).
 *
 * The daemon already has hidraw + USB access via the udev rule installed by
 * `tools/install-udev.sh`. As of the latest rule revision, evdev nodes
 * (`/dev/input/event*`) belonging to the K617 also get a uaccess ACL for
 * the active-session user — so fizzd can open them without privileges.
 *
 * Used by the interactive Pong preset to move the player paddle when the
 * user presses Tab / CapsLock / LShift / LCtrl on the physical keyboard,
 * without needing to keep the GUI window focused.
 */

// Linux evdev event format — 24 bytes total on 64-bit (timeval 16 + type+code+value 8).
const EVDEV_RECORD_SIZE = 24;

// Linux input event types
const EV_KEY = 0x01;

// Linux keycodes used across the interactive game engines.
// Source: include/uapi/linux/input-event-codes.h
export const KEY_TAB = 15;
export const KEY_CAPSLOCK = 58;
export const KEY_LEFTSHIFT = 42;
export const KEY_LEFTCTRL = 29;
export const KEY_BACKSLASH = 43;
export const KEY_ENTER = 28;
export const KEY_RIGHTSHIFT = 54;
export const KEY_RIGHTCTRL = 97;
export const KEY_W = 17;
export const KEY_A = 30;
export const KEY_S = 31;
export const KEY_D = 32;
export const KEY_Q = 16;
export const KEY_E = 18;
export const KEY_SPACE = 57;

/** Original PongInteractive paddle map (Tab/Caps/LShift/LCtrl → slot 0..3). */
export const PADDLE_KEYCODES: Record<number, number> = {
  [KEY_TAB]: 0,
  [KEY_CAPSLOCK]: 1,
  [KEY_LEFTSHIFT]: 2,
  [KEY_LEFTCTRL]: 3,
};

export type KeyEventHandler = (keycode: number, value: number) => void;

interface InputDevice {
  path: string;
  name: string;
}

/**
 * Scan `/sys/class/input/event*` and return the K617's main keyboard
 * interface — the one named "BY Tech Gaming Keyboard" on PHYS ".../input0"
 * (the standard typing interface, where Tab/Caps/Shift/Ctrl events appear).
 */
function findK617KeyboardEvent(): InputDevice | null {
  const baseDir = '/sys/class/input';
  if (!existsSync(baseDir)) return null;
  let candidates: InputDevice[] = [];
  for (const entry of readdirSync(baseDir)) {
    if (!entry.startsWith('event')) continue;
    const ueventPath = `${baseDir}/${entry}/device/uevent`;
    if (!existsSync(ueventPath)) continue;
    let uevent: string;
    try { uevent = readFileSync(ueventPath, 'utf8'); }
    catch { continue; }
    // PRODUCT=BUS/VENDOR/PRODUCT/VERSION — we want VENDOR=258a PRODUCT=49.
    if (!/^PRODUCT=\d+\/258a\/49\//im.test(uevent)) continue;
    const nameMatch = uevent.match(/^NAME="?([^"\n]+)"?/m);
    const name = nameMatch ? nameMatch[1]! : '';
    candidates.push({ path: `/dev/input/${entry}`, name });
  }
  // Prefer the plain "BY Tech Gaming Keyboard" interface (the typing surface).
  candidates = candidates.sort((a, b) => {
    // Names without suffix words ("Mouse", "Consumer Control", etc.) come first.
    const score = (n: string) => /^BY Tech Gaming Keyboard$/.test(n) ? 0
      : n.includes('Mouse') ? 3
      : n.includes('Consumer') ? 2
      : n.includes('System') ? 2
      : 1;
    return score(a.name) - score(b.name);
  });
  return candidates[0] ?? null;
}

export class KeyCapture {
  private stream: ReadStream | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private handler: KeyEventHandler | null = null;
  private devicePath: string | null = null;

  /** Bind a callback that fires for every relevant key press/release. */
  onKey(h: KeyEventHandler): void { this.handler = h; }

  /** Open the K617 evdev node and start streaming events. Returns true on
   *  success — caller can decide to log a warning if false. */
  start(): boolean {
    if (this.stream) return true;
    const dev = findK617KeyboardEvent();
    if (!dev) {
      log.warn('key-capture: no K617 input device found in /sys/class/input — physical-key paddle disabled');
      return false;
    }
    try {
      this.stream = createReadStream(dev.path);
      this.devicePath = dev.path;
    } catch (err) {
      log.warn(
        { err: (err as Error).message, path: dev.path },
        'key-capture: failed to open evdev — physical-key paddle disabled (try replugging the keyboard after the udev rule update)',
      );
      return false;
    }

    this.stream.on('data', (chunk) => this.onChunk(chunk as Buffer));
    this.stream.on('error', (err) => {
      log.warn({ err: err.message }, 'key-capture: read error');
      this.stop();
    });
    this.stream.on('close', () => {
      log.info('key-capture: stream closed');
      this.stream = null;
    });
    log.info({ path: dev.path, name: dev.name }, 'key-capture: listening for physical key events');
    return true;
  }

  stop(): void {
    if (this.stream) {
      this.stream.destroy();
      this.stream = null;
    }
    this.devicePath = null;
    this.buffer = Buffer.alloc(0);
  }

  private onChunk(chunk: Buffer): void {
    this.buffer = (this.buffer.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.buffer, chunk])) as Buffer;
    while (this.buffer.length >= EVDEV_RECORD_SIZE) {
      const record = this.buffer.subarray(0, EVDEV_RECORD_SIZE) as Buffer;
      this.buffer = this.buffer.subarray(EVDEV_RECORD_SIZE) as Buffer;
      const type = record.readUInt16LE(16);
      const code = record.readUInt16LE(18);
      const value = record.readInt32LE(20);
      if (type === EV_KEY && this.handler) {
        this.handler(code, value);
      }
    }
  }
}
