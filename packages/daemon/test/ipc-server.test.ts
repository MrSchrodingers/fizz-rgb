import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { IpcServer } from '../src/ipc-server.js';
import { EffectEngine } from '../src/engine.js';
import { FakeHidController } from '../src/hid-mock.js';
import { ProfileManager } from '../src/profiles.js';

let dir: string;
let sockPath: string;
let server: IpcServer;
let hid: FakeHidController;
let engine: EffectEngine;
let pm: ProfileManager;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fizz-ipc-'));
  sockPath = join(dir, 'fizz.sock');
  hid = new FakeHidController();
  engine = new EffectEngine(hid);
  pm = new ProfileManager(join(dir, 'profiles.json'));
  await pm.load();
  server = new IpcServer({ socketPath: sockPath, engine, profiles: pm, hid });
  await server.start();
});

afterEach(async () => {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

function call(method: string, params: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = createConnection(sockPath);
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        const line = buf.slice(0, nl);
        sock.end();
        try { resolve(JSON.parse(line)); } catch (e) { reject(e as Error); }
      }
    });
    sock.on('error', reject);
    sock.on('connect', () => {
      sock.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n');
    });
  });
}

describe('IpcServer', () => {
  it('device.status returns connected', async () => {
    const r = await call('device.status', {});
    expect(r.result.connected).toBe(true);
    expect(r.result.vid).toBe(0x258a);
  });

  it('effect.run starts effect', async () => {
    const r = await call('effect.run', { name: 'fw-rainbow', params: { speed: 100 } });
    expect(r.result.ok).toBe(true);
    expect(engine.current()!.name).toBe('fw-rainbow');
  });

  it('invalid params returns -32602', async () => {
    const r = await call('effect.run', { name: 'not-a-real-effect' });
    expect(r.error.code).toBe(-32602);
  });

  it('unknown method returns -32601', async () => {
    const r = await call('bogus.method', {});
    expect(r.error.code).toBe(-32601);
  });

  it('profile.list returns saved profiles', async () => {
    await pm.save('default', { name: 'Default', effect: { name: 'fw-static', params: { color: '#ff0000' } } });
    const r = await call('profile.list', {});
    expect(r.result.map((p: any) => p.name)).toContain('Default');
  });
});
