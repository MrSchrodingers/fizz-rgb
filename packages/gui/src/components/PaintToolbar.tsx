import { useState } from 'react';
import { Brush, Trash2, MousePointer2, CheckSquare, Save } from 'lucide-react';
import { usePaintStore } from '../stores/paintStore.js';
import { ColorPickerField } from './ColorPickerField.js';
import type { AnimType } from '../stores/paintStore.js';

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface Props {
  onSavePattern: () => void;
}

export function PaintToolbar({ onSavePattern }: Props) {
  const { selected, brushColor, setBrushColor, paintSelected, selectAll, clearSelection, resetKeys } =
    usePaintStore();
  const paintByText = usePaintStore((s) => s.paintByText);
  const animType = usePaintStore((s) => s.animType);
  const animSpeed = usePaintStore((s) => s.animSpeed);
  const setAnimType = usePaintStore((s) => s.setAnimType);
  const setAnimSpeed = usePaintStore((s) => s.setAnimSpeed);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [text, setText] = useState('');

  return (
    <div className="border-b border-zinc-800 bg-zinc-950/60">
      {/* Main toolbar row */}
      <div className="relative flex items-center gap-2 px-4 py-2">
        <span className="text-xs text-zinc-400 mr-2">
          {selected.size} key{selected.size === 1 ? '' : 's'} selected
        </span>

        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-sm"
        >
          <Brush className="w-3.5 h-3.5" />
          <span
            className="w-4 h-4 rounded border border-zinc-600"
            style={{ background: brushColor }}
          />
          <span className="font-mono">{brushColor}</span>
        </button>

        {pickerOpen && (
          <div className="absolute top-full left-4 mt-1 z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
              <ColorPickerField value={brushColor} onChange={setBrushColor} />
            </div>
          </div>
        )}

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type to paint…"
          className="px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-sm w-40 font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              paintByText(text);
              setText('');
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (text.trim()) {
              paintByText(text);
              setText('');
            }
          }}
          disabled={!text.trim()}
          className="px-3 py-1.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-40 text-indigo-200 text-sm"
        >
          Paint text
        </button>

        <button
          type="button"
          onClick={paintSelected}
          disabled={selected.size === 0}
          className="px-3 py-1.5 rounded-md bg-fuchsia-500 hover:bg-fuchsia-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-medium text-sm transition"
        >
          Paint selected
        </button>

        <button
          type="button"
          onClick={selectAll}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 text-sm"
        >
          <CheckSquare className="w-3.5 h-3.5" />
          All
        </button>

        <button
          type="button"
          onClick={clearSelection}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 text-sm"
        >
          <MousePointer2 className="w-3.5 h-3.5" />
          Clear sel
        </button>

        <button
          type="button"
          onClick={resetKeys}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 text-zinc-400 text-sm"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Reset
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onSavePattern}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-sm"
        >
          <Save className="w-3.5 h-3.5" />
          Save pattern as profile
        </button>
      </div>

      {/* Animation row */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-950/40 text-xs border-t border-zinc-900">
        <span className="text-zinc-500 uppercase tracking-wider">Pattern animation:</span>
        {(['solid', 'blink', 'chase', 'wave'] as const).map((t: AnimType) => (
          <button
            key={t}
            type="button"
            onClick={() => setAnimType(t)}
            className={cn(
              'px-3 py-1 rounded-md transition',
              animType === t ? 'bg-fuchsia-500/20 text-fuchsia-200' : 'text-zinc-400 hover:bg-zinc-800',
            )}
          >
            {t}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-4">
          <span className="text-zinc-500">Speed</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={animSpeed}
            onChange={(e) => setAnimSpeed(Number(e.target.value))}
            className="accent-fuchsia-500"
          />
        </div>
      </div>
    </div>
  );
}
