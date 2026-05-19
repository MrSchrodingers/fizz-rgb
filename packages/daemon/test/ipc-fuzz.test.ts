import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { IpcServer } from '../src/ipc-server.js';
import { EffectEngine } from '../src/engine.js';
import { FakeHidController } from '../src/hid-mock.js';
import { ProfileManager } from '../src/profiles.js';

/**
 * Quick-and-mean fuzzing of the IPC parser. We're not chasing exhaustive
 * coverage — we want a regression net for the specific failure modes the
 * agent review flagged: malformed JSON, oversized payloads, null IDs, and
 * out-of-range ledIndex keys. Each test asserts the daemon stays up and
 * returns the right error code rather than crashing or hanging.
 */

let dir: string;
let sockPath: string;
let server: IpcServer;
let hid: FakeHidController;
let engine: EffectEngine;
let pm: ProfileManager;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fizz-fuzz-'));
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

function send(line: string): Promise<{ id: unknown; error?: { code: number; message: string }; result?: unknown }> {
  return new Promise((resolve, reject) => {
    const sock = createConnection(sockPath);
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        sock.end();
        try { resolve(JSON.parse(buf.slice(0, nl)) as never); } catch (e) { reject(e as Error); }
      }
    });
    sock.on('error', reject);
    sock.on('connect', () => sock.write(line + '\n'));
  });
}

describe('IPC fuzz', () => {
  it('malformed JSON returns parse error, daemon stays up', async () => {
    const res = await send('{not json');
    expect(res.error?.code).toBe(-32700); // RPC_ERR.PARSE_ERROR
    // Follow-up valid request must still work.
    const ok = await send(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'daemon.version', params: {} }));
    expect(ok.result).toBeDefined();
  });

  it('missing method returns invalid-request', async () => {
    const res = await send(JSON.stringify({ jsonrpc: '2.0', id: 1 }));
    expect(res.error?.code).toBe(-32600); // INVALID_REQUEST
  });

  it('unknown method returns method-not-found', async () => {
    const res = await send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'does.not.exist', params: {} }));
    expect(res.error?.code).toBe(-32601); // METHOD_NOT_FOUND
  });

  it('null id is accepted (notification-style call)', async () => {
    const res = await send(JSON.stringify({ jsonrpc: '2.0', id: null, method: 'daemon.version', params: {} }));
    expect(res.id).toBeNull();
    expect(res.result).toBeDefined();
  });

  it('rejects out-of-range ledIndex key', async () => {
    const res = await send(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'perkey.set',
      params: { colors: { '99': '#ff0000' } },
    }));
    expect(res.error?.code).toBe(-32602); // INVALID_PARAMS
    expect(res.error?.message).toMatch(/0, 60/);
  });

  it('rejects negative ledIndex', async () => {
    const res = await send(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'perkey.set',
      params: { colors: { '-1': '#ff0000' } },
    }));
    expect(res.error?.code).toBe(-32602);
  });

  it('rejects non-hex color', async () => {
    const res = await send(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'perkey.set',
      params: { colors: { '5': 'red' } },
    }));
    expect(res.error?.code).toBe(-32602);
  });

  it('rejects animSpeed > 1', async () => {
    const res = await send(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'perkey.startPattern',
      params: { keys: { '5': '#ff0000' }, animType: 'blink', animSpeed: 5 },
    }));
    expect(res.error?.code).toBe(-32602);
  });

  it('large but valid payload (1KB) succeeds', async () => {
    const colors: Record<string, string> = {};
    for (let i = 0; i < 61; i++) colors[String(i)] = '#abcdef';
    const res = await send(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'perkey.set', params: { colors },
    }));
    expect(res.result).toEqual({ ok: true });
  });
});
