import { Palette, Sparkles } from 'lucide-react';
import { EFFECT_META, EFFECT_ORDER } from '../lib/effectMetadata.js';
import { useEffectStore } from '../stores/effectStore.js';
import { cn } from '../lib/classnames.js';

export function EffectSidebar() {
  const selected = useEffectStore((s) => s.selected);
  const setSelected = useEffectStore((s) => s.setSelected);

  return (
    <aside className="flex flex-col gap-1 w-56 px-3 py-4 border-r border-zinc-800 overflow-y-auto">
      <h2 className="text-xs uppercase tracking-wider text-zinc-500 px-2 mb-2">Color</h2>
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

      <h2 className="text-xs uppercase tracking-wider text-zinc-500 px-2 mt-4 mb-2">Firmware Effects</h2>
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
        Host-side effects (per-key paint, audio-reactive, etc.) land in Phase 3.
      </p>
    </aside>
  );
}
