import { useState } from 'react';
import { Brush, Trash2, MousePointer2, CheckSquare, Save, Zap, StopCircle } from 'lucide-react';
import { usePaintStore } from '../stores/paintStore.js';
import { ColorPickerField } from './ColorPickerField.js';
import type { AnimType } from '../stores/paintStore.js';

/** Reads the current keyColors from the store and pushes them to hardware (solid, no animation). */
async function sendToHardware(colors: Map<number, string>): Promise<void> {
  if (!window.fizz) return;
  const record: Record<string, string> = {};
  colors.forEach((hex, idx) => { record[String(idx)] = hex; });
  try {
    await window.fizz.perkeySet(record);
  } catch (err) {
    console.warn('perkey send failed', err);
  }
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface Props {
  onSavePattern: () => void;
}

export function PaintToolbar({ onSavePattern }: Props) {
  const { selected, brushColor, setBrushColor, paintSelected, selectAll, clearSelection, resetKeys } =
    usePaintStore();
  const keyColors = usePaintStore((s) => s.keyColors);
  const paintByText = usePaintStore((s) => s.paintByText);
  const animType = usePaintStore((s) => s.animType);
  const animSpeed = usePaintStore((s) => s.animSpeed);
  const lastSequence = usePaintStore((s) => s.lastSequence);
  const setAnimType = usePaintStore((s) => s.setAnimType);
  const setAnimSpeed = usePaintStore((s) => s.setAnimSpeed);

  const handleAnimTypeChange = async (newType: AnimType) => {
    setAnimType(newType);
    if (keyColors.size === 0 || !window.fizz) return;
    const colors: Record<string, string> = {};
    keyColors.forEach((hex, idx) => { colors[String(idx)] = hex; });
    try {
      if (newType === 'solid') {
        await window.fizz.perkeySet(colors);
      } else {
        await window.fizz.perkeyStartPattern({
          keys: colors,
          animType: newType,
          animSpeed,
          ...(lastSequence.length > 0 ? { sequence: lastSequence } : {}),
        });
      }
    } catch (err) {
      console.warn('animType change failed', err);
    }
  };

  const handleSpeedChange = async (newSpeed: number) => {
    setAnimSpeed(newSpeed);
    if (keyColors.size === 0 || !window.fizz || animType === 'solid') return;
    const colors: Record<string, string> = {};
    keyColors.forEach((hex, idx) => { colors[String(idx)] = hex; });
    try {
      await window.fizz.perkeyStartPattern({
        keys: colors,
        animType,
        animSpeed: newSpeed,
        ...(lastSequence.length > 0 ? { sequence: lastSequence } : {}),
      });
    } catch (err) {
      console.warn('speed change failed', err);
    }
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);

  const buildColorRecord = (colors: Map<number, string>): Record<string, string> => {
    const record: Record<string, string> = {};
    colors.forEach((hex, idx) => { record[String(idx)] = hex; });
    return record;
  };

  const handlePaintSelectedAndSend = async () => {
    paintSelected(); // updates store
    // Read fresh state after update
    const fresh = usePaintStore.getState().keyColors;
    if (animType === 'solid') {
      await sendToHardware(fresh);
    } else {
      await handleStreamPattern(fresh, usePaintStore.getState().lastSequence);
    }
  };

  const handlePaintTextAndSend = async () => {
    if (!text.trim()) return;
    paintByText(text);
    setText('');
    const fresh = usePaintStore.getState().keyColors;
    const freshSeq = usePaintStore.getState().lastSequence;
    if (animType === 'solid') {
      await sendToHardware(fresh);
    } else {
      await handleStreamPattern(fresh, freshSeq);
    }
  };

  const handleReset = async () => {
    await handleStopAnimation();
    resetKeys(); // clears keyColors to empty Map
    // empty record → encoder sends all-black → keyboard goes dark
    await sendToHardware(new Map());
  };

  const handleStreamPattern = async (colors: Map<number, string>, seq: number[]) => {
    if (!window.fizz) return;
    try {
      const keys = buildColorRecord(colors);
      const patternArg: Parameters<typeof window.fizz.perkeyStartPattern>[0] = {
        keys,
        animType,
        animSpeed,
      };
      if (seq.length > 0) patternArg.sequence = seq;
      await window.fizz.perkeyStartPattern(patternArg);
      setStreaming(true);
    } catch (err) {
      console.warn('perkeyStartPattern failed', err);
    }
  };

  const handleStopAnimation = async () => {
    if (!window.fizz) return;
    try {
      await window.fizz.perkeyStopPattern();
      setStreaming(false);
    } catch (err) {
      console.warn('perkeyStopPattern failed', err);
    }
  };

  const handleSendToHardware = async () => {
    if (animType === 'solid') {
      await sendToHardware(keyColors);
      setStreaming(false);
    } else {
      await handleStreamPattern(keyColors, lastSequence);
    }
  };

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
              void handlePaintTextAndSend();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void handlePaintTextAndSend()}
          disabled={!text.trim()}
          className="px-3 py-1.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-40 text-indigo-200 text-sm"
        >
          Paint text
        </button>

        <button
          type="button"
          onClick={() => void handlePaintSelectedAndSend()}
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
          onClick={() => void handleReset()}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 text-zinc-400 text-sm"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Reset
        </button>

        <button
          type="button"
          onClick={() => void handleSendToHardware()}
          disabled={keyColors.size === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-cyan-500/10 hover:text-cyan-300 disabled:opacity-40 text-zinc-400 text-sm"
          title={animType === 'solid' ? 'Push current pattern to keyboard LEDs' : 'Start streaming animation to keyboard LEDs'}
        >
          <Zap className="w-3.5 h-3.5" />
          {animType === 'solid' ? 'Send to hardware' : 'Start stream'}
        </button>

        {streaming && (
          <button
            type="button"
            onClick={() => void handleStopAnimation()}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm"
            title="Stop animation on keyboard"
          >
            <StopCircle className="w-3.5 h-3.5" />
            Stop animation
          </button>
        )}

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
        {(['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave', 'pong', 'snake'] as const).map((t: AnimType) => (
          <button
            key={t}
            type="button"
            onClick={() => void handleAnimTypeChange(t)}
            className={cn(
              'px-3 py-1 rounded-md transition',
              animType === t ? 'bg-fuchsia-500/20 text-fuchsia-200' : 'text-zinc-400 hover:bg-zinc-800',
            )}
          >
            {t === 'flag-wave' ? 'flag' : t}
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
            onChange={(e) => void handleSpeedChange(Number(e.target.value))}
            className="accent-fuchsia-500"
          />
        </div>
      </div>
    </div>
  );
}
