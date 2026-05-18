import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ProfileSchema } from '@fizz/core';
import type { Profile } from '@fizz/core';
import { log } from './log.js';

export type { Profile };

const FileSchema = z.object({
  version: z.literal(1),
  active: z.string().nullable(),
  profiles: z.record(z.string(), ProfileSchema),
});
type FileShape = z.infer<typeof FileSchema>;

type ProfileInput = Omit<Profile, 'createdAt'> & { createdAt?: string | undefined };

export class ProfileManager {
  private data: FileShape = { version: 1, active: null, profiles: {} };

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.path)) {
      this.data = { version: 1, active: null, profiles: {} };
      return;
    }
    const raw = readFileSync(this.path, 'utf8');
    try {
      this.data = FileSchema.parse(JSON.parse(raw));
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'profiles.json invalid; backing up and starting empty');
      renameSync(this.path, this.path + '.bak');
      this.data = { version: 1, active: null, profiles: {} };
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
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}
