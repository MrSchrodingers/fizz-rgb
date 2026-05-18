import { describe, it, expect, beforeEach } from 'vitest';
import { EffectEngine } from '../src/engine.js';
import { FakeHidController } from '../src/hid-mock.js';

describe('EffectEngine', () => {
  let hid: FakeHidController;
  let engine: EffectEngine;

  beforeEach(() => {
    hid = new FakeHidController();
    engine = new EffectEngine(hid);
  });

  it('current is null initially', () => {
    expect(engine.current()).toBeNull();
  });

  it('runEffect sends at least one frame', async () => {
    await engine.runEffect('fw-static', { color: '#ff0000' });
    expect(hid.sentFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('current returns the active effect after run', async () => {
    await engine.runEffect('fw-rainbow', { speed: 128 });
    const c = engine.current();
    expect(c).not.toBeNull();
    expect(c!.name).toBe('fw-rainbow');
    expect(c!.params).toEqual({ speed: 128 });
  });

  it('stop clears current', async () => {
    await engine.runEffect('fw-rainbow', {});
    engine.stop();
    expect(engine.current()).toBeNull();
  });

  it('switching effects replaces previous', async () => {
    await engine.runEffect('fw-rainbow', {});
    hid.reset();
    await engine.runEffect('fw-waterfall', { color: '#0000ff' });
    expect(hid.sentFrames.length).toBeGreaterThanOrEqual(1);
    expect(engine.current()!.name).toBe('fw-waterfall');
  });

  it('rejects gracefully when device disconnected', async () => {
    hid.simulateDisconnect();
    await expect(engine.runEffect('fw-static', { color: '#010101' }))
      .rejects.toThrow(/not connected/);
  });
});
