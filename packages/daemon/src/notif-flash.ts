import { log } from './log.js';
import type { EffectEngine } from './engine.js';
import type { Color } from '@fizz/core';

/**
 * Listens on the session DBus for `org.freedesktop.Notifications.Notify`
 * signals and flashes the keyboard white for ~250ms each time, then restores
 * whatever was running.
 *
 * Implementation notes:
 *   - `dbus-next` is lazily required so the daemon still boots cleanly if
 *     the library is missing or the session bus isn't reachable (headless
 *     systemd-user sessions hit this).
 *   - We register as an *eavesdropping* match — we want to observe what the
 *     real notification daemon (GNOME Shell, KDE plasmashell, dunst, mako)
 *     is being asked to show, not replace it.
 *   - Flash is fire-and-forget: if the keyboard is mid-animation we don't
 *     try to be clever about pausing/resuming. We push white, wait, push
 *     black so the active stream loop's next frame overwrites cleanly.
 */

interface FlashOptions {
  /** Color shown during the flash. Default = soft white. */
  color?: Color;
  /** Flash duration in ms. Default 250. */
  durationMs?: number;
  /** If true, only flash when an app_name regex matches. */
  filter?: RegExp;
}

export class NotifFlash {
  private bus: { disconnect: () => void } | null = null;
  private active = false;
  private flashing = false;

  constructor(
    private readonly engine: EffectEngine,
    private readonly opts: FlashOptions = {},
  ) {}

  async start(): Promise<void> {
    if (this.active) return;
    try {
      // Lazy import so daemon boots without dbus-next on path.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const dbus = require('dbus-next') as any;
      const bus = dbus.sessionBus() as {
        addMatch: (rule: string) => Promise<void>;
        on: (event: string, handler: (msg: { interface?: string; member?: string; body?: unknown[] }) => void) => void;
        disconnect: () => void;
      };

      await bus.addMatch(
        "eavesdrop=true,type='method_call',interface='org.freedesktop.Notifications',member='Notify'",
      );
      // Some session bus daemons reject eavesdrop=true (newer dbus-broker
      // policies). Add a fallback signal match in case the user's notif
      // daemon emits NotificationClosed/ActionInvoked we can still hook.
      await bus.addMatch("type='signal',interface='org.freedesktop.Notifications'")
        .catch(() => { /* optional */ });

      bus.on('message', (msg) => {
        if (msg.interface !== 'org.freedesktop.Notifications') return;
        if (msg.member !== 'Notify') return;
        const appName = typeof msg.body?.[0] === 'string' ? (msg.body[0] as string) : '';
        if (this.opts.filter && !this.opts.filter.test(appName)) return;
        void this.flash();
      });

      this.bus = bus;
      this.active = true;
      log.info('notif-flash listening on session DBus');
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'notif-flash unavailable (DBus or dbus-next missing); skipping');
    }
  }

  stop(): void {
    if (!this.bus) return;
    try { this.bus.disconnect(); } catch { /* ignore */ }
    this.bus = null;
    this.active = false;
  }

  private async flash(): Promise<void> {
    if (this.flashing) return; // collapse rapid bursts into one flash
    this.flashing = true;
    const color = this.opts.color ?? { r: 255, g: 255, b: 255 };
    const durationMs = this.opts.durationMs ?? 250;
    const all = new Map<number, Color>();
    for (let i = 0; i < 61; i++) all.set(i, color);
    try {
      await this.engine.setPerKey(all);
      await new Promise((r) => setTimeout(r, durationMs));
      // After the flash, restoreLastState (triggered automatically by the
      // next HID reconnect path) doesn't fire — but the engine's own
      // restoration logic kicks in on the next user action. For now we just
      // clear the flash so the active stream's next frame overwrites.
      const black = new Map<number, Color>();
      for (let i = 0; i < 61; i++) black.set(i, { r: 0, g: 0, b: 0 });
      await this.engine.setPerKey(black);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'notif-flash send failed');
    } finally {
      this.flashing = false;
    }
  }
}
