import type { DeviceStatus, FirmwareEffectName, FirmwareEffectParams, Profile, AnimType } from '@fizz/core';

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
    animType: AnimType;
    animSpeed: number;
    sequence?: number[];
    vibrancy?: number;
  }): Promise<void>;
  perkeyStopPattern(): Promise<void>;
  perkeyGameInput(slot: number): Promise<void>;
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
