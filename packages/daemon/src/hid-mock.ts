import type { ProtocolFrame } from '@fizz/core';
import type { HidController } from './hid.js';

type Listener = () => void;

export class FakeHidController implements HidController {
  public readonly sentFrames: ProtocolFrame[] = [];
  private connected = true;
  private listeners: Record<'connect' | 'disconnect', Listener[]> = { connect: [], disconnect: [] };

  isConnected(): boolean { return this.connected; }

  on(event: 'connect' | 'disconnect', handler: Listener): void {
    this.listeners[event].push(handler);
  }

  private emit(event: 'connect' | 'disconnect'): void {
    for (const h of this.listeners[event]) h();
  }

  async sendFeatureReport(frame: ProtocolFrame): Promise<void> {
    if (!this.connected) throw new Error('device not connected');
    this.sentFrames.push(Buffer.from(frame));
  }

  async sendFrames(frames: ProtocolFrame[]): Promise<void> {
    for (const f of frames) await this.sendFeatureReport(f);
  }

  close(): void { this.connected = false; }

  simulateDisconnect(): void { this.connected = false; this.emit('disconnect'); }
  simulateReconnect(): void { this.connected = true; this.emit('connect'); }
  reset(): void { this.sentFrames.length = 0; this.connected = true; }
}
