import { useDeviceStore } from '../stores/deviceStore.js';
import { AlertTriangle } from 'lucide-react';

export function ConnectionBanner() {
  const { daemonOnline, connected } = useDeviceStore();
  if (daemonOnline && connected) return null;
  const msg = !daemonOnline
    ? 'Daemon offline. Start it with: systemctl --user start fizzd'
    : 'Keyboard disconnected. Replug it.';
  return (
    <div
      role="alert"
      aria-live="polite"
      className="bg-amber-500/15 text-amber-200 border-b border-amber-500/30 px-6 py-2 text-sm flex items-center gap-2"
    >
      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      <span>{msg}</span>
    </div>
  );
}
