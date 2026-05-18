import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.js';

export async function effectListCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    const effects = await client.call('effect.list', {}) as { name: string; description: string }[];
    for (const e of effects) console.log(`${e.name.padEnd(20)} ${e.description}`);
  } finally { client.close(); }
}

export async function effectRunCmd(name: string, opts: Record<string, string>): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts['color']) params['color'] = opts['color'].startsWith('#') ? opts['color'] : '#' + opts['color'];
  if (opts['speed'] !== undefined) params['speed'] = parseInt(opts['speed'], 10);
  if (opts['brightness'] !== undefined) params['brightness'] = parseInt(opts['brightness'], 10);
  if (opts['direction']) params['direction'] = opts['direction'];
  if (opts['density'] !== undefined) params['density'] = parseInt(opts['density'], 10);

  const client = new IpcClient(socketPath());
  try {
    await client.call('effect.run', { name, params });
    console.log(`effect ${name} started`);
  } finally { client.close(); }
}

export async function effectStopCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    await client.call('effect.stop', {});
    console.log('effect stopped');
  } finally { client.close(); }
}
