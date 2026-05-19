import { useEffect, useMemo, useState } from 'react';
import { Save, X, RotateCcw } from 'lucide-react';
import type { Preset } from '@fizz/core';
import type { UserPreset } from './PresetGallery.js';
import { uniqueColors, transformKeys, type Style, type StyleOptions } from '../lib/colorTransform.js';
import { STATEFUL_PALETTES } from '../lib/statefulPalettes.js';
import { cn } from '../lib/classnames.js';

interface Props {
  preset: Preset | UserPreset;
  /** Re-apply the edited preset to hardware live. */
  onPreview: (transformed: Preset | UserPreset) => void;
  /** Persist the edited preset as a user preset. */
  onSaveAs: (transformed: Preset | UserPreset, name: string) => void;
  onClose: () => void;
}

const STYLES: Array<{ id: Style; label: string; description: string }> = [
  { id: 'original', label: 'Original', description: 'cores do preset sem alterar' },
  { id: 'vivid', label: 'Vivid', description: 'satura + clareia tons muito escuros' },
  { id: 'neon', label: 'Neon', description: 'saturação 100%, luz fixa no meio' },
  { id: 'pastel', label: 'Pastel', description: 'dessatura e clareia (suave)' },
  { id: 'mono', label: 'Mono', description: 'troca o tom todo pra cor do brush' },
];

export function PresetEditor({ preset, onPreview, onSaveAs, onClose }: Props) {
  const [style, setStyle] = useState<Style>('original');
  const [vibrancy, setVibrancy] = useState(1);
  const [colorMap, setColorMap] = useState<Record<string, string>>({});
  /** Per-palette-slot overrides for stateful animations. Sent as
   *  pattern.colorOverrides; the daemon engine reads them in render(). */
  const [paletteOverrides, setPaletteOverrides] = useState<Record<string, string>>({});
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const colors = uniqueColors(preset.pattern.keys);
  const statefulSlots = useMemo(() => STATEFUL_PALETTES[preset.pattern.animType] ?? null, [preset.pattern.animType]);
  const isStateful = colors.length === 0;

  // Apply the current transformation and notify the host whenever any knob
  // changes — drives the live preview on hardware.
  useEffect(() => {
    const opts: StyleOptions = { style, vibrancy, colorMap };
    const hasOverrides = Object.keys(paletteOverrides).length > 0;
    const transformed = {
      ...preset,
      pattern: {
        keys: transformKeys(preset.pattern.keys, opts),
        animType: preset.pattern.animType,
        animSpeed: preset.pattern.animSpeed,
        ...(preset.pattern.sequence ? { sequence: preset.pattern.sequence } : {}),
        ...(hasOverrides ? { colorOverrides: paletteOverrides } : {}),
      },
    } as Preset | UserPreset;
    onPreview(transformed);
    // We intentionally exclude onPreview from deps — parent passes a fresh
    // closure each render, which would loop. The values that actually drive
    // a re-apply are the knobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, vibrancy, colorMap, paletteOverrides, preset]);

  function reset() {
    setStyle('original');
    setVibrancy(1);
    setColorMap({});
    setPaletteOverrides({});
    setEditingColor(null);
    setEditingSlot(null);
  }

  function applyColorChange(newHex: string) {
    if (!editingColor) return;
    setColorMap((prev) => ({ ...prev, [editingColor]: newHex }));
    setEditingColor(null);
  }

  function saveAs() {
    if (!saveName.trim()) return;
    const opts: StyleOptions = { style, vibrancy, colorMap };
    const transformed = {
      ...preset,
      pattern: {
        keys: transformKeys(preset.pattern.keys, opts),
        animType: preset.pattern.animType,
        animSpeed: preset.pattern.animSpeed,
        ...(preset.pattern.sequence ? { sequence: preset.pattern.sequence } : {}),
      },
    } as Preset | UserPreset;
    onSaveAs(transformed, saveName.trim());
    setShowSave(false);
    setSaveName('');
    onClose();
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-zinc-400">Editor de tonalidade</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close editor"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Style chips */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Estilo</span>
        <div className="flex flex-wrap gap-1">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              title={s.description}
              className={cn(
                'px-2 py-1 rounded text-xs transition',
                style === s.id
                  ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-500/60'
                  : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vibrancy slider */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Vibrância</span>
          <span className="font-mono text-zinc-300">{vibrancy.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={0.4}
          max={2}
          step={0.05}
          value={vibrancy}
          onChange={(e) => setVibrancy(Number(e.target.value))}
          className="accent-fuchsia-500"
          aria-label="Vibrancy"
        />
      </div>

      {/* Per-color editing */}
      {!isStateful && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Cores ({colors.length}) — clica pra trocar
          </span>
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c) => {
              const effective = colorMap[c] ?? c;
              return (
                <div key={c} className="relative">
                  <button
                    type="button"
                    onClick={() => setEditingColor(c)}
                    title={`${c} → ${effective}`}
                    aria-label={`Edit color ${c}`}
                    className={cn(
                      'w-6 h-6 rounded border transition',
                      editingColor === c
                        ? 'border-fuchsia-400 ring-2 ring-fuchsia-500/50'
                        : 'border-zinc-700 hover:border-zinc-500',
                    )}
                    style={{ background: effective }}
                  />
                  {colorMap[c] && (
                    <span
                      className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-fuchsia-400"
                      title="Editado"
                    />
                  )}
                </div>
              );
            })}
          </div>
          {editingColor && (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={colorMap[editingColor] ?? editingColor}
                onChange={(e) => applyColorChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-zinc-700"
                aria-label="Pick replacement color"
              />
              <span className="text-xs text-zinc-400 font-mono">{editingColor}</span>
              <span className="text-xs text-zinc-500">→</span>
              <span className="text-xs text-fuchsia-300 font-mono">{colorMap[editingColor] ?? '?'}</span>
            </div>
          )}
        </div>
      )}

      {isStateful && statefulSlots && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Paleta do preset ({statefulSlots.length} cores)
          </span>
          <div className="flex flex-col gap-1">
            {statefulSlots.map((s) => {
              const effective = paletteOverrides[s.slot] ?? s.default;
              const isEditing = editingSlot === s.slot;
              return (
                <div key={s.slot} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSlot(isEditing ? null : s.slot)}
                    title={`${s.label} (${effective})`}
                    aria-label={`Edit ${s.label}`}
                    className={cn(
                      'w-6 h-6 rounded border transition shrink-0',
                      isEditing
                        ? 'border-fuchsia-400 ring-2 ring-fuchsia-500/50'
                        : 'border-zinc-700 hover:border-zinc-500',
                    )}
                    style={{ background: effective }}
                  />
                  <span className="text-xs text-zinc-300 w-20">{s.label}</span>
                  {isEditing && (
                    <input
                      type="color"
                      value={effective}
                      onChange={(e) => setPaletteOverrides((prev) => ({ ...prev, [s.slot]: e.target.value }))}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border border-zinc-700"
                      aria-label={`Pick ${s.label} color`}
                    />
                  )}
                  {paletteOverrides[s.slot] && (
                    <button
                      type="button"
                      onClick={() => setPaletteOverrides((prev) => {
                        const next = { ...prev };
                        delete next[s.slot];
                        return next;
                      })}
                      className="text-[10px] text-zinc-500 hover:text-zinc-200"
                      title="Restaurar padrão"
                    >
                      ↺
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isStateful && !statefulSlots && (
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Animação stateful sem paleta editável ainda. Vibrância funciona; estilo afeta só
          presets de cor-base.
        </p>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-1 pt-1 border-t border-zinc-800">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-zinc-800 text-zinc-400"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
        <div className="flex-1" />
        {!showSave ? (
          <button
            type="button"
            onClick={() => setShowSave(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
          >
            <Save className="w-3 h-3" /> Salvar como preset
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Nome…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAs();
                if (e.key === 'Escape') setShowSave(false);
              }}
              className="px-2 py-1 text-xs rounded bg-zinc-900 border border-zinc-700 focus:outline-none focus:border-emerald-400 w-28"
            />
            <button
              type="button"
              onClick={saveAs}
              disabled={!saveName.trim()}
              className="px-2 py-1 text-xs rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950"
            >
              OK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
