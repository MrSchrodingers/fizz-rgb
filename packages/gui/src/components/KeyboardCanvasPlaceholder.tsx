import { useEffectStore } from '../stores/effectStore.js';

export function KeyboardCanvasPlaceholder() {
  const selected = useEffectStore((s) => s.selected);
  const current = useEffectStore((s) => s.current);
  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl m-6 min-h-[300px]">
      <div className="text-center">
        <div className="text-zinc-500 text-sm mb-2">3D keyboard preview</div>
        <div className="text-zinc-700 text-xs">arrives in Batch 3</div>
        <div className="mt-6 text-xs font-mono text-zinc-500">selected: {selected}</div>
        {current && <div className="text-xs font-mono text-zinc-500">running: {current.name}</div>}
      </div>
    </div>
  );
}
