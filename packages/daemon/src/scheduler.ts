import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';
import { log } from './log.js';
import type { EffectEngine } from './engine.js';
import type { ProfileManager } from './profiles.js';

/**
 * Lightweight time-of-day scheduler.
 *
 * Reads schedule.json (per-user), evaluates rules once per minute, and
 * activates the matching profile when the local clock first crosses an
 * entry's start time. Intentionally NOT cron — we only support hour:minute
 * boundaries on weekdays, which covers ~95% of "gaming at night, dim during
 * work" requests without dragging in a parser dep.
 *
 * File shape (~/.config/fizz/schedule.json):
 *   {
 *     "version": 1,
 *     "enabled": true,
 *     "rules": [
 *       { "at": "09:00", "days": ["mon","tue","wed","thu","fri"], "profile": "work" },
 *       { "at": "18:00", "days": ["mon","tue","wed","thu","fri"], "profile": "gaming" },
 *       { "at": "23:00", "profile": "dim-night" }
 *     ]
 *   }
 *
 * When "days" is omitted the rule fires every day. A rule activates exactly
 * once per day (we track lastFiredAt) so dragging the clock backward or a
 * lingering daemon doesn't re-trigger it.
 */

const RuleSchema = z.object({
  at: z.string().regex(/^([01]?\d|2[0-3]):([0-5]\d)$/, 'expected HH:MM'),
  days: z.array(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).optional(),
  profile: z.string().min(1),
});
export type ScheduleRule = z.infer<typeof RuleSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  rules: z.array(RuleSchema),
});
type FileShape = z.infer<typeof FileSchema>;

const DAY_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private data: FileShape = { version: 1, enabled: false, rules: [] };
  private lastFiredKey = new Map<number, string>(); // ruleIdx → YYYY-MM-DD when last fired

  constructor(
    private readonly path: string,
    private readonly engine: EffectEngine,
    private readonly profiles: ProfileManager,
  ) {}

  async load(): Promise<void> {
    if (!existsSync(this.path)) return;
    try {
      const raw = readFileSync(this.path, 'utf8');
      this.data = FileSchema.parse(JSON.parse(raw));
      log.info({ rules: this.data.rules.length, enabled: this.data.enabled }, 'scheduler loaded');
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'schedule.json invalid — scheduler disabled');
    }
  }

  start(): void {
    if (this.timer) return;
    // Tick at the top of each minute (give a 2s slack so we don't miss the
    // boundary if setInterval is slightly off).
    const tick = () => this.evaluate().catch((err) => log.warn({ err }, 'scheduler tick failed'));
    this.timer = setInterval(tick, 60_000);
    // Run once immediately so a daemon restart at 09:01 still fires the 09:00 rule.
    tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async evaluate(): Promise<void> {
    if (!this.data.enabled) return;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const dayName = DAY_KEY[now.getDay()];

    for (let i = 0; i < this.data.rules.length; i++) {
      const rule = this.data.rules[i]!;
      if (rule.days && !rule.days.includes(dayName!)) continue;
      const parts = rule.at.split(':');
      const ruleMin = Number(parts[0]) * 60 + Number(parts[1]);
      // Fire within the first 2 minutes of the boundary to tolerate drift /
      // late starts (covers the "daemon restarted at 09:01" case).
      if (currentMin < ruleMin || currentMin > ruleMin + 2) continue;
      if (this.lastFiredKey.get(i) === todayKey) continue;

      const prof = this.profiles.get(rule.profile);
      if (!prof) {
        log.warn({ rule }, 'scheduler rule references unknown profile');
        continue;
      }
      try {
        await this.engine.runEffect(prof.effect.name, prof.effect.params);
        this.lastFiredKey.set(i, todayKey);
        log.info({ rule }, 'scheduler activated profile');
      } catch (err) {
        log.warn({ err: (err as Error).message, rule }, 'scheduler activation failed');
      }
    }
  }

  /** Persist current rules to disk (called from RPC method, future). */
  async save(): Promise<void> {
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }

  getConfig(): FileShape { return this.data; }
  setConfig(next: FileShape): void { this.data = next; this.lastFiredKey.clear(); }
}
