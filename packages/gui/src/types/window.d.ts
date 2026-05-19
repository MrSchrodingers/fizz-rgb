import type { DeviceStatus, FirmwareEffectName, FirmwareEffectParams, Profile } from '@fizz/core';

export interface FizzApi {
  daemonVersion(): Promise<{ version: string; buildHash: string }>;
  deviceStatus(): Promise<DeviceStatus>;
  effectList(): Promise<{ name: FirmwareEffectName; description: string }[]>;
  effectRun(name: FirmwareEffectName, params: FirmwareEffectParams): Promise<void>;
  effectStop(): Promise<void>;
  effectCurrent(): Promise<{ name: FirmwareEffectName; params: FirmwareEffectParams; startedAt: string } | null>;
  solidSet(color: string): Promise<void>;
  profileList(): Promise<Profile[]>;
  profileActivate(name: string): Promise<void>;
  profileSave(key: string, profile: Omit<Profile, 'createdAt'>): Promise<void>;
  profileDelete(name: string): Promise<void>;
  subscribeEffectChanged(handler: (cur: any) => void): () => void;
  subscribeDeviceChanged(handler: (s: any) => void): () => void;
  subscribePerkeyChanged(handler: (s: PerkeyState) => void): () => void;
  perkeyCurrent(): Promise<PerkeyState>;
  perkeySet(colors: Record<string, string>): Promise<void>;
  perkeyStartPattern(pattern: {
    keys: Record<string, string>;
    animType: 'solid' | 'blink' | 'chase' | 'wave' | 'typewriter' | 'marquee' | 'flag-wave' | 'pong' | 'snake' | 'tetris' | 'matrix-rain' | 'breakout' | 'fireworks' | 'dvd' | 'heart-rate' | 'equalizer' | 'rule30';
    animSpeed: number;
    sequence?: number[];
  }): Promise<void>;
  perkeyStopPattern(): Promise<void>;
}

export type PerkeyState =
  | { mode: 'off' }
  | { mode: 'static'; colors: Record<string, string> }
  | { mode: 'pattern'; pattern: {
      keys: Record<string, string>;
      animType: string;
      animSpeed: number;
      sequence?: number[];
    } };

declare global {
  interface Window {
    fizz: FizzApi;
  }
}

export {};
