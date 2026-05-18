import type { FirmwareEffectName, FirmwareEffectParams } from './ipc.js';

export type ProtocolFrame = Buffer;

export const PACKET_SIZE = 64;

export function emptyPacket(): Buffer {
  return Buffer.alloc(PACKET_SIZE);
}

export function encodeFirmwareEffect(
  name: FirmwareEffectName,
  params: FirmwareEffectParams,
): ProtocolFrame[] {
  // Stub until T13 has real opcodes from captures.
  // Returns one zero-filled 64-byte packet with byte 0 = 0xFF marker so
  // downstream code can be wired up and tested for routing without crashing.
  void name;
  void params;
  const p = emptyPacket();
  p[0] = 0xff;
  return [p];
}

export type { FirmwareEffectName, FirmwareEffectParams };
