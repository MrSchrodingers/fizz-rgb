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
  perkeySet(colors: Record<string, string>): Promise<void>;
}

declare global {
  interface Window {
    fizz: FizzApi;
  }
}

export {};
