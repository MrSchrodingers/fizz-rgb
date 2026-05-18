import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.js';

export async function statusCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    const status = await client.call('device.status', {}) as { connected: boolean; vid: number; pid: number };
    const cur = await client.call('effect.current', {}) as { name: string; params: unknown } | null;
    const ver = await client.call('daemon.version', {}) as { version: string };
    console.log(`device:  ${status.connected ? 'connected' : 'disconnected'} (${status.vid.toString(16)}:${status.pid.toString(16)})`);
    console.log(`effect:  ${cur ? cur.name : '(none)'}${cur ? ` ${JSON.stringify(cur.params)}` : ''}`);
    console.log(`daemon:  v${ver.version}`);
  } finally { client.close(); }
}
