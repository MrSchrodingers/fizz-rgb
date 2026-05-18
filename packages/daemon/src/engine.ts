import { encodeFirmwareEffect, encodePerKeyFrame } from '@fizz/core/encoder';
import type { FirmwareEffectName, FirmwareEffectParams } from '@fizz/core';
import { computeFrame } from '@fizz/core';
import type { Color, Pattern } from '@fizz/core';
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
  private streamInterval: ReturnType<typeof setInterval> | null = null;
  private streamStart = 0;
  private currentPattern: Pattern | null = null;

  constructor(private readonly hid: HidController) {}

  current(): CurrentEffect | null { return this.state; }

  onChange(listener: Listener): void { this.listeners.push(listener); }

  stopStreamLoop(): void {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
      this.currentPattern = null;
    }
  }

  async runEffect(name: FirmwareEffectName, params: FirmwareEffectParams): Promise<void> {
    this.stopStreamLoop();
    const frames = encodeFirmwareEffect(name, params);
    await this.hid.sendFrames(frames);
    this.state = { name, params, startedAt: new Date().toISOString() };
    log.info({ name, params }, 'effect started');
    this.notify();
  }

  stop(): void {
    this.stopStreamLoop();
    if (this.state) {
      log.info({ name: this.state.name }, 'effect stopped');
      this.state = null;
      this.notify();
    }
  }

  /**
   * Send a per-key color map to the keyboard using the Sinodragon protocol.
   * Clears any active named effect from state (the keyboard is now in per-key
   * mode; there is no FirmwareEffectName for this — we null out state).
   * Phase 3 TODO: extend CurrentEffect to carry a 'perkey' variant instead.
   */
  async setPerKey(colors: Map<number, Color>): Promise<void> {
    this.stopStreamLoop();
    const frame = encodePerKeyFrame(colors);
    await this.hid.sendFeatureReport(frame);
    // Per-key mode does not correspond to a named firmware effect; clear state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.state = null; // caller owns per-key state; daemon tracks nothing for now
    log.info({ keys: colors.size }, 'per-key colors set');
    this.notify();
  }

  async startPattern(pattern: Pattern): Promise<void> {
    this.stopStreamLoop();
    this.currentPattern = pattern;
    this.streamStart = performance.now();

    if (pattern.animType === 'solid') {
      // Just send one frame, no loop needed
      const colors = computeFrame(pattern, 0, 61);
      const frame = encodePerKeyFrame(colors);
      await this.hid.sendFeatureReport(frame);
      log.info({ animType: 'solid', keys: Object.keys(pattern.keys).length }, 'pattern (solid) applied');
      return;
    }

    // Start 30fps stream
    const tickIntervalMs = 1000 / 30;
    this.streamInterval = setInterval(() => {
      if (!this.currentPattern) return;
      const t = (performance.now() - this.streamStart) / 1000;
      const colors = computeFrame(this.currentPattern, t, 61);
      const frame = encodePerKeyFrame(colors);
      this.hid.sendFeatureReport(frame).catch((err) => {
        log.warn({ err: (err as Error).message }, 'frame send failed; stopping stream');
        this.stopStreamLoop();
      });
    }, tickIntervalMs);

    log.info(
      { animType: pattern.animType, keys: Object.keys(pattern.keys).length, speed: pattern.animSpeed },
      'pattern stream started',
    );
  }

  async stopPattern(): Promise<void> {
    this.stopStreamLoop();
    // Send all-black to clear
    const colors = new Map<number, { r: number; g: number; b: number }>();
    const frame = encodePerKeyFrame(colors);
    await this.hid.sendFeatureReport(frame);
    log.info('pattern stopped, all keys off');
  }

  private notify(): void { for (const l of this.listeners) l(this.state); }
}
