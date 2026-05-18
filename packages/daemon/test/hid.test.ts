import { describe, it, expect } from 'vitest';
import { FakeHidController } from '../src/hid-mock.js';

describe('FakeHidController', () => {
  it('records frames sent', async () => {
    const c = new FakeHidController();
    await c.sendFeatureReport(Buffer.from([0x01, 0x02, 0x03]));
    expect(c.sentFrames).toHaveLength(1);
    expect(c.sentFrames[0]).toEqual(Buffer.from([0x01, 0x02, 0x03]));
  });

  it('rejects writes when disconnected', async () => {
    const c = new FakeHidController();
    c.simulateDisconnect();
    await expect(c.sendFeatureReport(Buffer.from([0x01]))).rejects.toThrow('not connected');
  });

  it('emits connect/disconnect events', () => {
    const c = new FakeHidController();
    let disconnectCount = 0;
    let connectCount = 0;
    c.on('disconnect', () => disconnectCount++);
    c.on('connect', () => connectCount++);
    c.simulateDisconnect();
    c.simulateReconnect();
    expect(disconnectCount).toBe(1);
    expect(connectCount).toBe(1);
  });
});
