import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ProfileSchema } from '@fizz/core';
import type { Profile } from '@fizz/core';
import { log } from './log.js';

export type { Profile };

/**
 * On-disk schema is versioned. Each bump adds a migration function in
 * MIGRATIONS that takes the previous-version payload (validated by the
 * previous version's schema) and returns the next-version payload.
 *
 * Why this matters: if we silently truncate a file we don't recognise, we
 * lose user data. By chaining versioned migrations we can grow the schema
 * over time without ever asking users to redo their presets.
 */

const CURRENT_VERSION = 1 as const;

const FileSchemaV1 = z.object({
  version: z.literal(1),
  active: z.string().nullable(),
  profiles: z.record(z.string(), ProfileSchema),
});
type FileV1 = z.infer<typeof FileSchemaV1>;

// Add new versions here. Example for a future v2:
//   const FileSchemaV2 = z.object({ version: z.literal(2), ...new fields... });
//   type FileV2 = z.infer<typeof FileSchemaV2>;
//   MIGRATIONS[1] = (v1: FileV1): FileV2 => ({ ...v1, version: 2, newField: 'default' });

type FileShape = FileV1; // = current
const CurrentSchema = FileSchemaV1;

const MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  // 1 -> 2: not yet defined.
};

function migrate(data: unknown): FileShape {
  let current = data;
  // Walk up the version ladder until we hit CURRENT_VERSION.
  for (let v = 1; v < CURRENT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`missing migration step from v${v}`);
    current = step(current);
  }
  return CurrentSchema.parse(current);
}

type ProfileInput = Omit<Profile, 'createdAt'> & { createdAt?: string | undefined };

export class ProfileManager {
  private data: FileShape = { version: CURRENT_VERSION, active: null, profiles: {} };

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.path)) {
      this.data = { version: CURRENT_VERSION, active: null, profiles: {} };
      return;
    }
    const raw = readFileSync(this.path, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'profiles.json not valid JSON; backing up');
      renameSync(this.path, this.path + '.bak');
      this.data = { version: CURRENT_VERSION, active: null, profiles: {} };
      return;
    }

    try {
      this.data = migrate(parsed);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'profiles.json schema invalid after migration; backing up');
      renameSync(this.path, this.path + '.bak');
      this.data = { version: CURRENT_VERSION, active: null, profiles: {} };
      return;
    }

    // Validate active profile reference — if it points to a deleted entry,
    // silently reset rather than serving a stale name to consumers.
    if (this.data.active && this.data.profiles[this.data.active] === undefined) {
      log.warn({ active: this.data.active }, 'active profile reference dangling; clearing');
      this.data.active = null;
      await this.writeAtomic().catch(() => { /* best-effort */ });
    }
  }

  list(): Profile[] { return Object.values(this.data.profiles); }
  active(): string | null { return this.data.active; }
  get(id: string): Profile | undefined { return this.data.profiles[id]; }

  async save(key: string, profile: ProfileInput): Promise<void> {
    const createdAt = profile.createdAt ?? new Date().toISOString();
    const full: Profile = ProfileSchema.parse({ ...profile, createdAt });
    this.data.profiles[key] = full;
    await this.writeAtomic();
  }

  async activate(name: string): Promise<void> {
    if (this.data.profiles[name] === undefined) throw new Error(`profile not found: ${name}`);
    this.data.active = name;
    await this.writeAtomic();
  }

  async delete(key: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.data.profiles[key];
    if (this.data.active === key) this.data.active = null;
    await this.writeAtomic();
  }

  private async writeAtomic(): Promise<void> {
    const tmp = this.path + '.tmp';
    try {
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    } catch (err) {
      // ENOSPC / EROFS — don't trash the existing file by renaming a partial.
      log.error({ err: (err as Error).message }, 'profile write failed');
      throw err;
    }
    renameSync(tmp, this.path);
  }
}
