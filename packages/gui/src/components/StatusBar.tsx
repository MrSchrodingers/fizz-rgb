import { useEffect, useState } from 'react';
import { useDeviceStore } from '../stores/deviceStore.js';
import { useEffectStore } from '../stores/effectStore.js';
import { usePaintStore } from '../stores/paintStore.js';
import { useHistoryStore } from '../stores/historyStore.js';

/**
 * Slim footer summarising session state: daemon health, active effect/preset,
 * unsaved-changes badge (history length > 1), and current key-paint count.
 *
 * Kept intentionally read-only — actions belong in toolbars/sidebars.
 */
export function StatusBar() {
  const { daemonOnline, connected } = useDeviceStore();
  const current = useEffectStore((s) => s.current);
  const paintMode = usePaintStore((s) => s.mode);
  const animType = usePaintStore((s) => s.animType);
  const keyColorsSize = usePaintStore((s) => s.keyColors.size);
  const activePresetId = usePaintStore((s) => s.activePresetId);
  const historyLen = useHistoryStore((s) => s.past.length);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const statusDot = !daemonOnline ? 'bg-red-500' : connected ? 'bg-emerald-500' : 'bg-amber-500';
  const statusLabel = !daemonOnline ? 'Daemon offline' : connected ? 'Connected' : 'Disconnected';

  const activeLine =
    paintMode === 'paint'
      ? activePresetId
        ? `Preset: ${activePresetId}`
        : `Paint · ${animType} · ${keyColorsSize} key${keyColorsSize === 1 ? '' : 's'}`
      : current
        ? `Effect: ${current.name}`
        : 'Idle';

  return (
    <footer className="flex items-center gap-4 px-4 py-1.5 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-400">
      <div className="flex items-center gap-1.5" title={statusLabel}>
        <span className={`w-2 h-2 rounded-full ${statusDot}`} aria-hidden="true" />
        <span>{statusLabel}</span>
      </div>

      <span className="text-zinc-700" aria-hidden="true">·</span>

      <span className="truncate" title={activeLine}>{activeLine}</span>

      <span className="text-zinc-700" aria-hidden="true">·</span>

      <span title={`${historyLen} undo steps`}>
        {historyLen > 1 ? `${historyLen - 1} step${historyLen === 2 ? '' : 's'} of history` : 'no history yet'}
      </span>

      <span className="ml-auto font-mono text-zinc-500" aria-label="Clock">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </footer>
  );
}
