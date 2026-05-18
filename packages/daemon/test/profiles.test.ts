import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileManager } from '../src/profiles.js';

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fizz-profiles-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('ProfileManager', () => {
  it('returns empty list when file does not exist', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    expect(pm.list()).toEqual([]);
  });

  it('persists profiles atomically', async () => {
    const path = join(dir, 'profiles.json');
    const pm = new ProfileManager(path);
    await pm.load();
    await pm.save('gaming', {
      name: 'Gaming',
      effect: { name: 'fw-rainbow', params: { speed: 100 } },
    });
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk.profiles.gaming.name).toBe('Gaming');
    expect(onDisk.version).toBe(1);
  });

  it('activate sets active', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    await pm.save('a', { name: 'A', effect: { name: 'fw-static', params: { color: '#ff0000' } } });
    await pm.activate('a');
    expect(pm.active()).toBe('a');
  });

  it('delete removes profile', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    await pm.save('x', { name: 'X', effect: { name: 'fw-snake', params: {} } });
    await pm.delete('x');
    expect(pm.list().find((p) => p.name === 'X')).toBeUndefined();
  });

  it('rejects activate on unknown profile', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    await expect(pm.activate('nope')).rejects.toThrow(/not found/i);
  });

  it('recovers from corrupt JSON by backing up and starting empty', async () => {
    const path = join(dir, 'profiles.json');
    writeFileSync(path, '{ this is not json');
    const pm = new ProfileManager(path);
    await pm.load();
    expect(pm.list()).toEqual([]);
    expect(existsSync(path + '.bak')).toBe(true);
  });
});
