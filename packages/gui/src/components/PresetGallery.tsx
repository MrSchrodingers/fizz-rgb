import { useState, useMemo } from 'react';
import { BUILTIN_PRESETS, K617_LAYOUT } from '@fizz/core';
import type { Preset } from '@fizz/core';
import { usePaintStore } from '../stores/paintStore.js';
import { Trash2, Plus } from 'lucide-react';

export interface UserPreset {
  id: string;
  name: string;
  description: string;
  category: 'user';
  pattern: {
    keys: Record<string, string>;
    animType: string;
    animSpeed: number;
    sequence?: number[];
  };
}

const USER_PRESETS_KEY = 'fizz-user-presets';

function loadUserPresets(): UserPreset[] {
  try {
    return JSON.parse(localStorage.getItem(USER_PRESETS_KEY) ?? '[]') as UserPreset[];
  } catch {
    return [];
  }
}

function saveUserPresets(presets: UserPreset[]) {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}

export function PresetGallery({
  onApply,
}: {
  onApply: (preset: Preset | UserPreset, tintColor?: string) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [userPresets, setUserPresets] = useState<UserPreset[]>(loadUserPresets);
  const [tintEnabled, setTintEnabled] = useState(false);

  const keyColors = usePaintStore((s) => s.keyColors);
  const animType = usePaintStore((s) => s.animType);
  const animSpeed = usePaintStore((s) => s.animSpeed);
  const lastSequence = usePaintStore((s) => s.lastSequence);
  const brushColor = usePaintStore((s) => s.brushColor);

  const categories = ['all', 'word', 'shape', 'pattern', 'gradient', 'theme', 'game', 'user'];

  const allPresets = useMemo(() => {
    const builtins = (BUILTIN_PRESETS as (Preset | UserPreset)[]).filter(
      (p) => filter === 'all' || p.category === filter,
    );
    const user = (userPresets as (Preset | UserPreset)[]).filter(
      () => filter === 'all' || filter === 'user',
    );
    return [...builtins, ...user];
  }, [filter, userPresets]);

  function saveCurrent() {
    if (keyColors.size === 0) {
      alert('Nada pintado pra salvar. Pinta umas teclas primeiro.');
      return;
    }
    const name = window.prompt(
      'Nome do preset?',
      `Custom ${Date.now().toString().slice(-4)}`,
    );
    if (!name) return;
    const keysObj: Record<string, string> = {};
    keyColors.forEach((hex, idx) => {
      keysObj[String(idx)] = hex;
    });
    const newPreset: UserPreset = {
      id: `user-${Date.now()}`,
      name,
      description: `${keyColors.size} keys, ${animType}`,
      category: 'user',
      pattern: {
        keys: keysObj,
        animType,
        animSpeed,
        ...(lastSequence.length > 0 ? { sequence: lastSequence } : {}),
      },
    };
    const next: UserPreset[] = [...userPresets, newPreset];
    setUserPresets(next);
    saveUserPresets(next);
  }

  function deleteUser(id: string) {
    if (!window.confirm('Deletar preset?')) return;
    const next = userPresets.filter((p) => p.id !== id);
    setUserPresets(next);
    saveUserPresets(next);
  }

  return (
    <aside className="flex flex-col w-72 border-l border-zinc-800 bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="font-semibold text-sm">Presets</h2>
        <button
          type="button"
          onClick={saveCurrent}
          className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Salvar atual
        </button>
      </div>

      {/* Tint toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-900 bg-zinc-950/40">
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={tintEnabled}
            onChange={(e) => setTintEnabled(e.target.checked)}
            className="accent-fuchsia-500"
          />
          Aplicar com cor do brush
        </label>
        <span
          className="inline-block w-3.5 h-3.5 rounded border border-zinc-600 flex-shrink-0"
          style={{ background: brushColor }}
        />
        <span className="font-mono text-xs text-zinc-500">{brushColor}</span>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-zinc-900">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={
              filter === c
                ? 'px-2 py-0.5 rounded text-xs bg-fuchsia-500/20 text-fuchsia-200'
                : 'px-2 py-0.5 rounded text-xs text-zinc-500 hover:bg-zinc-800'
            }
          >
            {c}
          </button>
        ))}
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {allPresets.length === 0 && (
          <p className="text-zinc-600 text-xs px-2 py-4 text-center">
            Nenhum preset nessa categoria.
          </p>
        )}
        {allPresets.map((preset) => (
          <div
            key={preset.id}
            className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-zinc-800/50 transition cursor-pointer"
            onClick={() => onApply(preset, tintEnabled ? brushColor : undefined)}
          >
            <PresetThumbnail preset={preset} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 font-medium truncate">{preset.name}</div>
              <div className="text-xs text-zinc-500 truncate">{preset.description}</div>
            </div>
            {preset.category === 'user' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteUser(preset.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function PresetThumbnail({ preset }: { preset: Preset | UserPreset }) {
  // Build a 5×6 dot grid sampling up to 30 colored entries from the K617 layout order.
  // We iterate K617_LAYOUT.keys (in ledIndex order) to get spatially-meaningful dots.
  const colorByLed = new Map<number, string>();
  for (const [ledStr, hex] of Object.entries(preset.pattern.keys)) {
    colorByLed.set(Number(ledStr), hex);
  }

  // Sample at most 30 keys from the layout in physical order (ledIndex 0..60).
  const dots: string[] = [];
  for (const k of K617_LAYOUT.keys) {
    if (dots.length >= 30) break;
    dots.push(colorByLed.get(k.ledIndex) ?? '#1a1a1f');
  }
  // Pad to 30 if fewer keys defined.
  while (dots.length < 30) dots.push('#1a1a1f');

  return (
    <div
      className="grid gap-0.5 flex-shrink-0 mt-0.5"
      style={{ gridTemplateColumns: 'repeat(6, 1fr)', width: '3rem', height: '2.5rem' }}
    >
      {dots.map((color, i) => (
        <div key={i} className="rounded-sm" style={{ background: color }} />
      ))}
    </div>
  );
}
