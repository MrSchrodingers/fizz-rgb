import { Brush, Palette, Sparkles } from 'lucide-react';
import { EFFECT_META, EFFECT_ORDER } from '../lib/effectMetadata.js';
import { useEffectStore } from '../stores/effectStore.js';
import { usePaintStore } from '../stores/paintStore.js';
import { cn } from '../lib/classnames.js';

export function EffectSidebar() {
  const selected = useEffectStore((s) => s.selected);
  const setSelected = useEffectStore((s) => s.setSelected);

  const paintMode = usePaintStore((s) => s.mode);
  const setPaintMode = usePaintStore((s) => s.setMode);

  return (
    <aside className="flex flex-col gap-1 w-56 px-3 py-4 border-r border-zinc-800 overflow-y-auto">
      <h2 className="text-xs uppercase tracking-wider text-zinc-500 px-2 mb-2">Mode</h2>
      <button
        type="button"
        onClick={() => setPaintMode(paintMode === 'paint' ? 'effect' : 'paint')}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
          paintMode === 'paint'
            ? 'bg-amber-500/20 text-amber-200'
            : 'text-zinc-300 hover:bg-zinc-800/60',
        )}
      >
        <Brush className="w-4 h-4" />
        Paint per-key
      </button>

      <div className={cn('flex flex-col gap-1', paintMode === 'paint' && 'opacity-40 pointer-events-none')}>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 px-2 mt-4 mb-2">Color</h2>
        <button
          type="button"
          onClick={() => setSelected('solid-color')}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
            selected === 'solid-color'
              ? 'bg-fuchsia-500/15 text-fuchsia-200'
              : 'text-zinc-300 hover:bg-zinc-800/60',
          )}
        >
          <Palette className="w-4 h-4" />
          Solid Color
        </button>

        <h2 className="text-xs uppercase tracking-wider text-zinc-500 px-2 mt-4 mb-2">
          Firmware Effects
        </h2>
        {EFFECT_ORDER.map((name) => {
          const meta = EFFECT_META[name];
          const active = selected === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition text-left',
                active ? 'bg-fuchsia-500/15 text-fuchsia-200' : 'text-zinc-300 hover:bg-zinc-800/60',
              )}
            >
              <Sparkles className="w-4 h-4 opacity-70" />
              <span className="flex-1">{meta.label}</span>
            </button>
          );
        })}

        <p className="text-xs text-zinc-600 px-2 mt-6 leading-relaxed">
          Host-side effects (audio-reactive, etc.) land in Phase 3.
        </p>
      </div>
    </aside>
  );
}
