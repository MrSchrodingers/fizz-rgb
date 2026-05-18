#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { socketPath } from '@fizz/core';
import { NodeHidController } from './hid.js';
import { FakeHidController } from './hid-mock.js';
import { EffectEngine } from './engine.js';
import { ProfileManager } from './profiles.js';
import { IpcServer } from './ipc-server.js';
import type { HidController } from './hid.js';
import { log } from './log.js';

const useFakeHid = process.argv.includes('--fake-hid');

async function main(): Promise<void> {
  const profilesPath = `${homedir()}/.config/fizz/profiles.json`;
  mkdirSync(dirname(profilesPath), { recursive: true });

  const hid: HidController = useFakeHid ? new FakeHidController() : new NodeHidController();
  const engine = new EffectEngine(hid);
  const profiles = new ProfileManager(profilesPath);
  await profiles.load();

  const sock = socketPath();
  mkdirSync(dirname(sock), { recursive: true });
  const server = new IpcServer({ socketPath: sock, engine, profiles, hid });
  await server.start();

  // Restore last-active profile
  const active = profiles.active();
  if (active) {
    const prof = profiles.get(active);
    if (prof) {
      try { await engine.runEffect(prof.effect.name, prof.effect.params); }
      catch (err) { log.warn({ err: (err as Error).message }, 'failed to restore profile on boot'); }
    }
  }

  const shutdown = async (sig: string): Promise<void> => {
    log.info({ sig }, 'shutting down');
    await server.stop();
    hid.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  log.info('fizzd ready');
}

main().catch((err) => { log.fatal({ err }, 'fizzd crashed'); process.exit(1); });
