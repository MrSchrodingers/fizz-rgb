import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.js';

export async function profileListCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    const profiles = await client.call('profile.list', {}) as { name: string; effect: { name: string } }[];
    if (profiles.length === 0) { console.log('(no profiles)'); return; }
    for (const p of profiles) console.log(`${p.name.padEnd(20)} ${p.effect.name}`);
  } finally { client.close(); }
}

export async function profileActivateCmd(name: string): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    await client.call('profile.activate', { name });
    console.log(`activated ${name}`);
  } finally { client.close(); }
}

interface SaveOpts {
  name?: string;
  effect: string;
  color?: string;
  speed?: string;
  brightness?: string;
  direction?: string;
  density?: string;
}

export async function profileSaveCmd(key: string, opts: SaveOpts): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.color) params['color'] = opts.color.startsWith('#') ? opts.color : '#' + opts.color;
  if (opts.speed !== undefined) params['speed'] = parseInt(opts.speed, 10);
  if (opts.brightness !== undefined) params['brightness'] = parseInt(opts.brightness, 10);
  if (opts.direction) params['direction'] = opts.direction;
  if (opts.density !== undefined) params['density'] = parseInt(opts.density, 10);

  const profile = { name: opts.name ?? key, effect: { name: opts.effect, params } };

  const client = new IpcClient(socketPath());
  try {
    await client.call('profile.save', { name: key, profile });
    console.log(`saved profile "${key}"`);
  } finally { client.close(); }
}

export async function profileDeleteCmd(name: string): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    await client.call('profile.delete', { name });
    console.log(`deleted profile "${name}"`);
  } finally { client.close(); }
}
