import { spawnSync } from 'node:child_process';

function systemctl(...args: string[]): number {
  const r = spawnSync('systemctl', ['--user', ...args], { stdio: 'inherit' });
  return r.status ?? 1;
}

export function daemonStartCmd():   void { process.exit(systemctl('start',   'fizzd')); }
export function daemonStopCmd():    void { process.exit(systemctl('stop',    'fizzd')); }
export function daemonRestartCmd(): void { process.exit(systemctl('restart', 'fizzd')); }
export function daemonEnableCmd():  void { process.exit(systemctl('enable',  '--now', 'fizzd')); }
export function daemonDisableCmd(): void { process.exit(systemctl('disable', '--now', 'fizzd')); }
export function daemonStatusCmd():  void { process.exit(systemctl('status',  'fizzd')); }
export function daemonLogsCmd():    void {
  const r = spawnSync('journalctl', ['--user', '-u', 'fizzd', '-f'], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}
