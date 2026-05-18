#!/usr/bin/env node
import { Command } from 'commander';
import { statusCmd } from './cmd/status.js';
import { setCmd } from './cmd/set.js';
import { effectListCmd, effectRunCmd, effectStopCmd } from './cmd/effect.js';
import { profileListCmd, profileActivateCmd, profileSaveCmd, profileDeleteCmd } from './cmd/profile.js';
import {
  daemonStartCmd, daemonStopCmd, daemonRestartCmd,
  daemonEnableCmd, daemonDisableCmd, daemonStatusCmd, daemonLogsCmd,
} from './cmd/daemon.js';

const program = new Command();
program.name('fizz').description('Redragon Fizz K617 RGB controller').version('0.1.0');

program.command('status').description('Show device/effect/daemon status').action(statusCmd);
program.command('set <color>').description('Set solid color (#RRGGBB or named)').action(setCmd);

const effect = program.command('effect').description('Manage effects');
effect.command('list').description('List available effects').action(effectListCmd);
effect.command('run <name>')
  .description('Run a firmware effect')
  .option('--color <hex>', 'Color for effects that take one')
  .option('--speed <n>', 'Speed 0..255')
  .option('--brightness <n>', 'Brightness 0..255')
  .option('--direction <forward|reverse>', 'Direction')
  .option('--density <n>', 'Density')
  .action(effectRunCmd);
effect.command('stop').description('Stop current effect').action(effectStopCmd);

const profile = program.command('profile').description('Manage profiles');
profile.command('list').description('List saved profiles').action(profileListCmd);
profile.command('activate <name>').description('Activate a profile').action(profileActivateCmd);
profile.command('save <key>')
  .description('Save current settings as a profile')
  .requiredOption('--effect <name>', 'Firmware effect name (fw-rainbow, fw-snake, etc.)')
  .option('--name <displayName>', 'Human-readable name (defaults to key)')
  .option('--color <hex>')
  .option('--speed <n>')
  .option('--brightness <n>')
  .option('--direction <forward|reverse>')
  .option('--density <n>')
  .action(profileSaveCmd);
profile.command('delete <name>').description('Delete a profile').action(profileDeleteCmd);

const daemon = program.command('daemon').description('Manage the fizzd systemd user service');
daemon.command('start').action(daemonStartCmd);
daemon.command('stop').action(daemonStopCmd);
daemon.command('restart').action(daemonRestartCmd);
daemon.command('enable').description('Enable + start (autostart on login)').action(daemonEnableCmd);
daemon.command('disable').description('Disable + stop').action(daemonDisableCmd);
daemon.command('status').action(daemonStatusCmd);
daemon.command('logs').description('Tail fizzd logs').action(daemonLogsCmd);

await program.parseAsync(process.argv);
