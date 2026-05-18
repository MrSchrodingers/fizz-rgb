import { useDeviceStore } from '../stores/deviceStore.js';
import { Keyboard } from 'lucide-react';

export function Header() {
  const { connected, daemonOnline, vid, pid } = useDeviceStore();
  const indicator = !daemonOnline ? 'bg-red-500' : connected ? 'bg-emerald-500' : 'bg-amber-500';
  const label = !daemonOnline ? 'Daemon offline' : connected ? 'Connected' : 'Disconnected';
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="flex items-center gap-3">
        <Keyboard className="w-6 h-6 text-fuchsia-400" />
        <h1 className="font-semibold tracking-tight">Fizz RGB</h1>
        <span className="text-xs text-zinc-500">K617 · {vid.toString(16) || '258a'}:{pid.toString(16) || '0049'}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${indicator}`} />
        <span className="text-zinc-300">{label}</span>
      </div>
    </header>
  );
}
