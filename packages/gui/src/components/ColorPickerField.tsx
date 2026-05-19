import { HexColorPicker } from 'react-colorful';
import { useState } from 'react';
import { useColorHistoryStore, PALETTES } from '../stores/colorHistoryStore.js';
import { cn } from '../lib/classnames.js';

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPickerField({ value, onChange }: Props) {
  const recent = useColorHistoryStore((s) => s.recent);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 w-56">
      <HexColorPicker color={value} onChange={onChange} />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
            onChange(v.startsWith('#') ? v : '#' + v);
          }
        }}
        aria-label="Hex color"
        className="font-mono text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:border-fuchsia-500"
      />

      {/* Recent swatches */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">Recentes</span>
          <div className="flex flex-wrap gap-1">
            {recent.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={`Pick ${color}`}
                onClick={() => onChange(color)}
                className={cn(
                  'w-5 h-5 rounded border border-zinc-700 transition',
                  color.toLowerCase() === value.toLowerCase() && 'ring-2 ring-fuchsia-400',
                )}
                style={{ background: color }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Palettes */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setPaletteOpen((v) => !v)}
          className="text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 text-left transition"
        >
          Paletas {paletteOpen ? '▾' : '▸'}
        </button>
        {paletteOpen && (
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {PALETTES.map((palette) => (
              <div key={palette.id} className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 w-20 truncate" title={palette.name}>{palette.name}</span>
                <div className="flex gap-0.5">
                  {palette.colors.map((c, i) => (
                    <button
                      key={`${palette.id}-${i}`}
                      type="button"
                      title={c}
                      aria-label={`${palette.name} ${c}`}
                      onClick={() => onChange(c)}
                      className={cn(
                        'w-4 h-4 rounded-sm border border-zinc-800 transition hover:scale-110',
                        c.toLowerCase() === value.toLowerCase() && 'ring-2 ring-fuchsia-400',
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
