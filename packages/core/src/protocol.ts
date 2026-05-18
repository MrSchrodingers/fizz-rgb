import type { Color } from './color.ts';

export type ProtocolFrame = Buffer;

export type FirmwareEffectName =
  | 'fw-static'
  | 'fw-rainbow'
  | 'fw-snake'
  | 'fw-sine-wave'
  | 'fw-star-twinkle'
  | 'fw-rainbow-blossom'
  | 'fw-waterfall'
  | 'fw-wheel';

export interface FirmwareEffectParams {
  speed?: number;
  brightness?: number;
  direction?: 'forward' | 'reverse';
  color?: Color;
  density?: number;
}

export const PACKET_SIZE = 64;

export function emptyPacket(): Buffer {
  return Buffer.alloc(PACKET_SIZE);
}

export function encodeFirmwareEffect(
  _name: FirmwareEffectName,
  _params: FirmwareEffectParams,
): ProtocolFrame[] {
  throw new Error('not implemented — see T13');
}
