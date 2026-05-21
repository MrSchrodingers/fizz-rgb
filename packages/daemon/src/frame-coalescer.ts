import type { ProtocolFrame } from '@fizz/core';

/**
 * Frame coalescing for the per-key HID stream.
 *
 * Streamed effects/games render at a fixed tick rate but their output rarely
 * changes every tick (a reactive trail sits idle, a game only steps every N
 * ticks). Sending every rendered frame floods the K617's feature-report
 * endpoint with redundant writes, which — because node-hid writes block on a
 * synchronous USB control transfer — contends with the keyboard's own matrix
 * scanning and degrades typing on the same device (stuck/repeated keys,
 * stalls, and eventually USB re-enumeration).
 *
 * `shouldSend` returns true only when a frame differs from the last one it
 * approved, collapsing runs of identical frames into a single write. Call
 * `reset()` whenever the keyboard may have lost its state (stream (re)start,
 * reconnect) so the next frame is always re-sent even if its bytes are
 * unchanged.
 */
export class FrameCoalescer {
  private last: ProtocolFrame | null = null;

  /** True if `frame` should be written to HID (i.e. it differs from the last
   *  approved frame). Records the frame as the new baseline when true. */
  shouldSend(frame: ProtocolFrame): boolean {
    if (this.last !== null && this.last.equals(frame)) return false;
    this.last = frame;
    return true;
  }

  /** Forget the last frame so the next `shouldSend` always returns true. */
  reset(): void {
    this.last = null;
  }
}
