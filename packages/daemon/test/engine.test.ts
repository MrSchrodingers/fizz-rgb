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

describe('EffectEngine reconnect persistence', () => {
  let hid: FakeHidController;
  let engine: EffectEngine;

  beforeEach(() => {
    hid = new FakeHidController();
    engine = new EffectEngine(hid);
  });

  it('restores last per-key state on reconnect', async () => {
    await engine.setPerKey(new Map([[0, { r: 255, g: 0, b: 0 }]]));
    hid.sentFrames.length = 0; // clear log
    hid.simulateDisconnect();
    hid.simulateReconnect();
    // Give async restore a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(hid.sentFrames.length).toBeGreaterThan(0); // some frame sent on restore
  });

  it('restores last pattern stream on reconnect', async () => {
    await engine.startPattern({
      keys: { 0: '#ff0000' },
      animType: 'blink',
      animSpeed: 0.5,
    });
    hid.sentFrames.length = 0;
    hid.simulateDisconnect();
    hid.simulateReconnect();
    await new Promise((r) => setTimeout(r, 100));
    // Stream resumed → at least one frame sent within 100ms (the loop runs at 30fps)
    expect(hid.sentFrames.length).toBeGreaterThan(0);
    // Clean up
    engine.stopStreamLoop();
    engine.stop();
  });

  it('does not restore state after stopPattern', async () => {
    await engine.startPattern({
      keys: { 0: '#ff0000' },
      animType: 'blink',
      animSpeed: 0.5,
    });
    await engine.stopPattern();
    hid.sentFrames.length = 0;
    hid.simulateDisconnect();
    hid.simulateReconnect();
    await new Promise((r) => setTimeout(r, 50));
    // Only reconnect itself — no restore frames
    expect(hid.sentFrames.length).toBe(0);
  });

  it('restores named effect on reconnect', async () => {
    await engine.runEffect('fw-static', { color: '#00ff00' });
    hid.sentFrames.length = 0;
    hid.simulateDisconnect();
    hid.simulateReconnect();
    await new Promise((r) => setTimeout(r, 50));
    expect(hid.sentFrames.length).toBeGreaterThan(0);
  });
});
