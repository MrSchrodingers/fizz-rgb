// Renderer-safe protocol types and constants. The actual encoder (which loads
// captured templates from disk via fs) lives in `./protocol-encoder.ts` and
// MUST NOT be re-exported from the package index — the Electron renderer
// imports the index and cannot resolve node:fs.
import type { FirmwareEffectName, FirmwareEffectParams } from './ipc.js';

export type ProtocolFrame = Buffer;
export const PACKET_SIZE = 64;
export function emptyPacket(): Buffer { return Buffer.alloc(PACKET_SIZE); }

export type { FirmwareEffectName, FirmwareEffectParams };
