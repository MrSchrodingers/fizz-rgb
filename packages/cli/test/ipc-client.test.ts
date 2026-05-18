import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:net';
import { IpcClient } from '../src/ipc-client.js';

let dir: string;
let sockPath: string;
let server: Server;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fizz-cli-'));
  sockPath = join(dir, 'fizz.sock');
  server = createServer((sock) => {
    sock.on('data', (chunk) => {
      const line = chunk.toString('utf8').trim();
      const req = JSON.parse(line) as { id: number; method: string };
      sock.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { echoed: req.method } }) + '\n');
    });
  });
  await new Promise<void>((resolve) => server.listen(sockPath, () => resolve()));
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe('IpcClient', () => {
  it('round-trips a request', async () => {
    const c = new IpcClient(sockPath);
    const r = await c.call('device.status', {});
    expect(r).toEqual({ echoed: 'device.status' });
    c.close();
  });

  it('rejects on connection failure', async () => {
    const c = new IpcClient('/nonexistent/socket');
    await expect(c.call('device.status', {})).rejects.toThrow();
  });
});
