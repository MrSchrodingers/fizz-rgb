import { useState, useMemo, useEffect, useRef } from 'react';
import { BUILTIN_PRESETS } from '@fizz/core';
import type { Preset, AnimType } from '@fizz/core';
import { usePaintStore } from '../stores/paintStore.js';
import { NamePromptModal } from './NamePromptModal.js';
import { Trash2, Plus, Sliders, Sparkles } from 'lucide-react';
import { renderThumbnail, THUMB_COLS } from '../lib/thumbnailRenderer.js';
import { useSharedClock } from '../lib/useSharedClock.js';
import { PresetEditor } from './PresetEditor.js';
import { useStyleStore } from '../stores/styleStore.js';
import { transformKeys, type Style } from '../lib/colorTransform.js';
import { cn } from '../lib/classnames.js';

export interface UserPreset {
  id: string;
  name: string;
  description: string;
  category: 'user';
  pattern: {
    keys: Record<string, string>;
    animType: AnimType;
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
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [namePrompt, setNamePrompt] = useState<{
    title: string;
    defaultValue: string;
    onConfirm: (name: string) => void;
  } | null>(null);

  const keyColors = usePaintStore((s) => s.keyColors);
  const animType = usePaintStore((s) => s.animType);
  const animSpeed = usePaintStore((s) => s.animSpeed);
  const lastSequence = usePaintStore((s) => s.lastSequence);
  const brushColor = usePaintStore((s) => s.brushColor);
  const activePresetId = usePaintStore((s) => s.activePresetId);
  const globalStyle = useStyleStore((s) => s.style);
  const globalVibrancy = useStyleStore((s) => s.vibrancy);
  const setGlobalStyle = useStyleStore((s) => s.setStyle);
  const setGlobalVibrancy = useStyleStore((s) => s.setVibrancy);

  // Wrap the parent onApply so the global tonality always applies.
  //
  // For NON-stateful presets we bake the style+vibrancy into the keys map
  // client-side — the daemon's computeFrameInto path doesn't re-multiply.
  //
  // For STATEFUL presets (Minecraft, Aquarium, games) the keys map is
  // empty so transformKeys is a no-op — we instead pass the vibrancy via
  // pattern.vibrancy so the daemon engines (which generate colors from
  // internal state) can apply it before encoding.
  function applyWithStyle(p: Preset | UserPreset, tint?: string) {
    const noChange = globalStyle === 'original' && globalVibrancy === 1;
    if (noChange) {
      onApply(p, tint);
      return;
    }
    const transformed = {
      ...p,
      pattern: {
        keys: transformKeys(p.pattern.keys, {
          style: globalStyle,
          vibrancy: globalVibrancy,
          monoTint: tint ?? brushColor,
        }),
        animType: p.pattern.animType,
        animSpeed: p.pattern.animSpeed,
        vibrancy: globalVibrancy,
        ...(p.pattern.sequence ? { sequence: p.pattern.sequence } : {}),
      },
    } as Preset | UserPreset;
    onApply(transformed, tint);
  }

  // Re-apply whenever global style changes — gives instant feedback whether
  // there's an active preset or just whatever the daemon is currently
  // running. Without this, clicking Vivid/Pastel/etc would visually update
  // the chip but the hardware would stay the same.
  useEffect(() => {
    if (activePresetId) {
      const builtin = (BUILTIN_PRESETS as (Preset | UserPreset)[]).find((p) => p.id === activePresetId);
      const user = userPresets.find((p) => p.id === activePresetId);
      const active = builtin ?? user;
      if (active) {
        console.log('[tonality] re-applying preset', active.id, 'style=', globalStyle, 'vibrancy=', globalVibrancy);
        applyWithStyle(active, tintEnabled ? brushColor : undefined);
        return;
      }
    }
    // Nothing tracked client-side — ask the daemon what's running and resend.
    if (!window.fizz) return;
    window.fizz.perkeyCurrent().then((state) => {
      if (state.mode !== 'pattern') return;
      console.log('[tonality] re-applying daemon pattern', state.pattern.animType);
      window.fizz!.perkeyStartPattern({
        keys: state.pattern.keys,
        animType: state.pattern.animType as AnimType,
        animSpeed: state.pattern.animSpeed,
        vibrancy: globalVibrancy,
        ...(state.pattern.sequence && state.pattern.sequence.length > 0 ? { sequence: state.pattern.sequence } : {}),
      }).catch(() => {});
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalStyle, globalVibrancy]);

  // Re-tint the active preset when the brush color changes while tint mode
  // is on, so the user sees the new color immediately instead of having to
  // re-click the preset card.
  const prevBrush = useRef(brushColor);
  useEffect(() => {
    if (prevBrush.current === brushColor) return;
    prevBrush.current = brushColor;
    if (!tintEnabled || !activePresetId) return;
    const builtin = (BUILTIN_PRESETS as (Preset | UserPreset)[]).find((p) => p.id === activePresetId);
    const user = userPresets.find((p) => p.id === activePresetId);
    const active = builtin ?? user;
    if (active) onApply(active, brushColor);
  }, [brushColor, tintEnabled, activePresetId, userPresets, onApply]);

  const categories = ['all', 'theme', 'brasil', 'productivity', 'pattern', 'gradient', 'shape', 'word', 'game', 'user'];

  const allPresets = useMemo(() => {
    const builtins = (BUILTIN_PRESETS as (Preset | UserPreset)[]).filter(
      (p) => filter === 'all' || p.category === filter,
    );
    const user = (userPresets as (Preset | UserPreset)[]).filter(
      () => filter === 'all' || filter === 'user',
    );
    return [...builtins, ...user];
  }, [filter, userPresets]);

  // Game animations generate colors at runtime in the daemon — their pattern
  // doesn't store keys. So "save current" must allow saving when the active
  // animType is a stateful game even if keyColors is empty.
  const STATEFUL_GAME_TYPES = [
    'pong', 'snake', 'tetris', 'matrix-rain', 'breakout',
    'fireworks', 'dvd', 'heart-rate', 'equalizer', 'rule30',
  ];

  function saveCurrent() {
    const isStatefulGame = STATEFUL_GAME_TYPES.includes(animType);
    if (keyColors.size === 0 && !isStatefulGame) {
      alert('Nada pintado pra salvar. Pinta umas teclas primeiro ou aplica um preset.');
      return;
    }
    setNamePrompt({
      title: 'Nome do preset?',
      defaultValue: `Custom ${Date.now().toString().slice(-4)}`,
      onConfirm: (name) => {
        setNamePrompt(null);
        const keysObj: Record<string, string> = {};
        keyColors.forEach((hex, idx) => {
          keysObj[String(idx)] = hex;
        });
        const description = isStatefulGame
          ? `${animType} (game)`
          : `${keyColors.size} keys, ${animType}`;
        const newPreset: UserPreset = {
          id: `user-${Date.now()}`,
          name,
          description,
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
      },
    });
  }

  function deleteUser(id: string) {
    if (!window.confirm('Deletar preset?')) return;
    const next = userPresets.filter((p) => p.id !== id);
    setUserPresets(next);
    saveUserPresets(next);
  }

  return (
    <aside className="flex flex-col w-72 h-full border-l border-zinc-800 bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="font-semibold text-sm">Presets <span className="text-xs text-zinc-500 font-normal">(do PC)</span></h2>
        <button
          type="button"
          onClick={saveCurrent}
          className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Salvar atual
        </button>
      </div>

      {/* Global tonality (style + vibrancy) — affects every preset before
          it goes to the hardware. */}
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-fuchsia-400" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-300">Tonalidade global</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {(['original', 'vivid', 'neon', 'pastel', 'mono'] as Style[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setGlobalStyle(s);
                // Bump vibrancy along with the style so the change is
                // immediately visible for stateful presets (Minecraft,
                // Aquarium, games) — their palettes are daemon-generated
                // and only respond to pattern.vibrancy, not to style.
                const defaultVibrancyFor: Record<Style, number> = {
                  original: 1.0,
                  vivid: 1.6,
                  neon: 1.9,
                  pastel: 0.7,
                  mono: 1.0,
                };
                setGlobalVibrancy(defaultVibrancyFor[s]);
              }}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] capitalize transition',
                globalStyle === s
                  ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-500/60'
                  : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-400 shrink-0">Vibrância</span>
          <input
            type="range"
            min={0.4}
            max={2}
            step={0.05}
            value={globalVibrancy}
            onChange={(e) => setGlobalVibrancy(Number(e.target.value))}
            aria-label="Global vibrancy"
            className="accent-fuchsia-500 flex-1 min-w-0"
          />
          <span className="text-[10px] font-mono text-zinc-300 tabular-nums w-10 text-right">
            {globalVibrancy.toFixed(2)}×
          </span>
        </div>
      </div>

      {/* Persistence info banner */}
      <div className="px-4 py-2 border-b border-zinc-900 bg-amber-500/5 text-[10px] text-amber-200/80 leading-tight">
        Presets rodam via Fizz daemon (PC). <span className="font-mono">FIRMWARE EFFECTS</span> persistem no teclado sem PC.
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
          <p className="text-zinc-500 text-xs px-2 py-4 text-center">
            Nenhum preset nessa categoria.
          </p>
        )}
        {allPresets.map((preset) => {
          const isActive = activePresetId === preset.id;
          const isEditing = editingPresetId === preset.id;
          return (
          <div key={preset.id} className="flex flex-col">
          <div
            className={
              'group flex items-start gap-2 px-2 py-2 rounded-lg transition cursor-pointer ' +
              (isActive
                ? 'bg-fuchsia-500/15 ring-1 ring-fuchsia-500/60'
                : 'hover:bg-zinc-800/50')
            }
            onClick={() => applyWithStyle(preset, tintEnabled ? brushColor : undefined)}
          >
            <PresetThumbnail preset={preset} />
            <div className="flex-1 min-w-0">
              <div className={'text-sm font-medium truncate ' + (isActive ? 'text-fuchsia-100' : 'text-zinc-200')}>
                {preset.name}
                {isActive && <span className="ml-2 text-[10px] uppercase tracking-wider text-fuchsia-400/80">ativo</span>}
              </div>
              <div className="text-xs text-zinc-500 truncate">{preset.description}</div>
            </div>
            {isActive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingPresetId(isEditing ? null : preset.id);
                }}
                aria-label={isEditing ? 'Fechar editor' : 'Editar tonalidade'}
                title="Editar tonalidade"
                className="p-1 rounded hover:bg-fuchsia-500/20 text-fuchsia-300"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}
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
          {isEditing && (
            <PresetEditor
              preset={preset}
              onPreview={(transformed) => onApply(transformed, undefined)}
              onSaveAs={(transformed, name) => {
                const newPreset: UserPreset = {
                  id: `user-${Date.now()}`,
                  name,
                  description: `Editado de ${preset.name}`,
                  category: 'user',
                  pattern: {
                    keys: transformed.pattern.keys,
                    animType: transformed.pattern.animType,
                    animSpeed: transformed.pattern.animSpeed,
                    ...(transformed.pattern.sequence ? { sequence: transformed.pattern.sequence } : {}),
                  },
                };
                const next = [...userPresets, newPreset];
                setUserPresets(next);
                saveUserPresets(next);
              }}
              onClose={() => setEditingPresetId(null)}
            />
          )}
          </div>
          );
        })}
      </div>

      {/* Name prompt modal */}
      {namePrompt && (
        <NamePromptModal
          title={namePrompt.title}
          defaultValue={namePrompt.defaultValue}
          onConfirm={namePrompt.onConfirm}
          onCancel={() => setNamePrompt(null)}
        />
      )}
    </aside>
  );
}

function PresetThumbnail({ preset }: { preset: Preset | UserPreset }) {
  // Tick the shared clock so the thumbnail animates. Throttled to ~12fps —
  // enough to read motion, easy on CPU when 40 thumbs render at once.
  const t = useSharedClock(12);
  const dots = renderThumbnail(preset as Preset, t);
  return (
    <div
      className="grid gap-0.5 flex-shrink-0 mt-0.5"
      style={{ gridTemplateColumns: `repeat(${THUMB_COLS}, 1fr)`, width: '3rem', height: '2.5rem' }}
    >
      {dots.map((color, i) => (
        <div key={i} className="rounded-sm" style={{ background: color }} />
      ))}
    </div>
  );
}
