import { describe, it, expect } from 'vitest';
import { FrameCoalescer } from '../src/frame-coalescer.js';

describe('FrameCoalescer', () => {
  it('sends the first frame', () => {
    const c = new FrameCoalescer();
    expect(c.shouldSend(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it('skips an identical consecutive frame (by value, not reference)', () => {
    const c = new FrameCoalescer();
    c.shouldSend(Buffer.from([1, 2, 3]));
    expect(c.shouldSend(Buffer.from([1, 2, 3]))).toBe(false);
  });

  it('sends again when the frame changes', () => {
    const c = new FrameCoalescer();
    c.shouldSend(Buffer.from([1, 2, 3]));
    expect(c.shouldSend(Buffer.from([1, 2, 4]))).toBe(true);
  });

  it('re-sends an identical frame after reset (forces a redraw on reconnect)', () => {
    const c = new FrameCoalescer();
    c.shouldSend(Buffer.from([1, 2, 3]));
    c.reset();
    expect(c.shouldSend(Buffer.from([1, 2, 3]))).toBe(true);
  });
});
