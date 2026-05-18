import { encodeFirmwareEffect } from '@fizz/core/encoder';
import type { FirmwareEffectName, FirmwareEffectParams } from '@fizz/core';
import type { HidController } from './hid.js';
import { log } from './log.js';

export interface CurrentEffect {
  name: FirmwareEffectName;
  params: FirmwareEffectParams;
  startedAt: string; // ISO
}

type Listener = (cur: CurrentEffect | null) => void;

export class EffectEngine {
  private state: CurrentEffect | null = null;
  private listeners: Listener[] = [];

  constructor(private readonly hid: HidController) {}

  current(): CurrentEffect | null { return this.state; }

  onChange(listener: Listener): void { this.listeners.push(listener); }

  async runEffect(name: FirmwareEffectName, params: FirmwareEffectParams): Promise<void> {
    const frames = encodeFirmwareEffect(name, params);
    await this.hid.sendFrames(frames);
    this.state = { name, params, startedAt: new Date().toISOString() };
    log.info({ name, params }, 'effect started');
    this.notify();
  }

  stop(): void {
    if (this.state) {
      log.info({ name: this.state.name }, 'effect stopped');
      this.state = null;
      this.notify();
    }
  }

  private notify(): void { for (const l of this.listeners) l(this.state); }
}
