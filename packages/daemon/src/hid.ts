import HID from 'node-hid';
import type { ProtocolFrame } from '@fizz/core';
import { log } from './log.js';

const VID = 0x258a;
const PID = 0x0049;

export interface HidController {
  isConnected(): boolean;
  sendFeatureReport(frame: ProtocolFrame): Promise<void>;
  sendFrames(frames: ProtocolFrame[]): Promise<void>;
  close(): void;
  on(event: 'connect' | 'disconnect', handler: () => void): void;
}

type Listener = () => void;

export class NodeHidController implements HidController {
  private device: HID.HID | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private listeners: Record<'connect' | 'disconnect', Listener[]> = { connect: [], disconnect: [] };

  constructor(private readonly retryMs = 2000) {
    this.tryOpen();
  }

  isConnected(): boolean { return this.device !== null; }

  on(event: 'connect' | 'disconnect', handler: Listener): void {
    this.listeners[event].push(handler);
  }

  private emit(event: 'connect' | 'disconnect'): void {
    for (const h of this.listeners[event]) h();
  }

  private tryOpen(): void {
    try {
      const descs = HID.devices().filter((d) => d.vendorId === VID && d.productId === PID);
      descs.sort((a, b) => (b.interface ?? 0) - (a.interface ?? 0));
      const target = descs.find((d) => d.path);
      if (!target?.path) {
        this.scheduleRetry();
        return;
      }
      const dev = new HID.HID(target.path);
      this.device = dev;
      if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
      log.info({ path: target.path, iface: target.interface }, 'HID device opened');
      this.emit('connect');
      dev.on('error', (err) => {
        log.warn({ err }, 'HID error, will reopen');
        this.handleDisconnect();
      });
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'HID open failed, retrying');
      this.scheduleRetry();
    }
  }

  private handleDisconnect(): void {
    if (this.device) {
      try { this.device.close(); } catch { /* ignore */ }
      this.device = null;
      this.emit('disconnect');
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.tryOpen();
    }, this.retryMs);
  }

  async sendFeatureReport(frame: ProtocolFrame): Promise<void> {
    if (!this.device) throw new Error('device not connected');
    // Two retry attempts before declaring the device gone — transient USB
    // stalls (suspend, brief bandwidth contention) shouldn't tear the whole
    // session down. After 3 failures the device is treated as disconnected.
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.device.sendFeatureReport(Array.from(frame));
        return;
      } catch (err) {
        lastErr = err as Error;
        if (attempt < 2) {
          // Tight retry — 5ms is enough to clear most kernel-side hiccups
          // without bloating frame latency.
          await new Promise((r) => setTimeout(r, 5));
          continue;
        }
      }
    }
    log.warn({ err: lastErr?.message }, 'sendFeatureReport failed after retries — treating as disconnect');
    this.handleDisconnect();
    throw lastErr ?? new Error('sendFeatureReport failed');
  }

  async sendFrames(frames: ProtocolFrame[]): Promise<void> {
    for (const f of frames) await this.sendFeatureReport(f);
  }

  close(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.device) { try { this.device.close(); } catch { /* ignore */ } this.device = null; }
  }
}
