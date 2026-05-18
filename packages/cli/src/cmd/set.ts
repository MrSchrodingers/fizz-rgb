import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.js';

const NAMED: Record<string, string> = {
  red: '#ff0000', green: '#00ff00', blue: '#0000ff',
  white: '#ffffff', black: '#000000', off: '#000000',
};

export async function setCmd(color: string): Promise<void> {
  let hex = color.trim();
  if (NAMED[hex.toLowerCase()]) hex = NAMED[hex.toLowerCase()]!;
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
    console.error(`Invalid color: ${color}. Use #RRGGBB or one of: ${Object.keys(NAMED).join(', ')}`);
    process.exit(2);
  }
  if (!hex.startsWith('#')) hex = '#' + hex;
  const client = new IpcClient(socketPath());
  try {
    await client.call('solid.set', { color: hex });
    console.log(`set ${hex}`);
  } finally { client.close(); }
}
