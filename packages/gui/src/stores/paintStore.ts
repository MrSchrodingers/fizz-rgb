import { create } from 'zustand';
import { K617_LAYOUT } from '@fizz/core';
import type { AnimType as CoreAnimType } from '@fizz/core';
import { useHistoryStore, type PaintSnapshot } from './historyStore.js';
import { useColorHistoryStore } from './colorHistoryStore.js';

export type AnimType = CoreAnimType;

function textCharToKeyName(ch: string): string | null {
  if (ch === ' ') return 'Space';
  if (ch === '\n' || ch === '\r' || ch === '\t') return null;
  const upper = ch.toUpperCase();
  // letters
  if (/^[A-Z]$/.test(upper)) return upper;
  // digits
  if (/^[0-9]$/.test(ch)) return ch;
  // punctuation
  const map: Record<string, string> = {
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash',
    ';': 'Semicolon',
    "'": 'Quote',
    '-': 'Minus',
    '=': 'Equal',
    '[': 'LBracket',
    ']': 'RBracket',
    '\\': 'Backslash',
  };
  return map[ch] ?? null;
}

interface PaintState {
  mode: 'effect' | 'paint';
  selected: Set<number>;
  keyColors: Map<number, string>;
  brushColor: string;
  animType: AnimType;
  animSpeed: number;
  /** Sequential order of keys last set via paintByText (for typewriter/marquee). */
  lastSequence: number[];
  /** Currently applied preset id (null when user has diverged from any preset). */
  activePresetId: string | null;
  /** When on, clicking/dragging keys paints them with the brush color directly. */
  directPaintMode: boolean;
  /** Tap-to-test: when on, clicking a virtual key briefly lights the real key. */
  tapToTestMode: boolean;
  setMode: (m: 'effect' | 'paint') => void;
  toggleKey: (ledIndex: number, additive: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  paintSelected: () => void;
  setBrushColor: (c: string) => void;
  resetKeys: () => void;
  paintByText: (text: string) => void;
  setAnimType: (t: AnimType) => void;
  setAnimSpeed: (s: number) => void;
  setActivePresetId: (id: string | null) => void;
  setDirectPaintMode: (v: boolean) => void;
  setTapToTestMode: (v: boolean) => void;
  /** Apply the current brush color to a specific key (used by drag-paint). */
  paintKey: (ledIndex: number) => void;
  /** Erase a key (clear its color). */
  eraseKey: (ledIndex: number) => void;
  /** Bulk paint a set of keys (used by lasso). Commits history once at the end. */
  paintKeys: (ledIndexes: number[]) => void;
  /** Restore a snapshot from history (undo/redo). */
  applySnapshot: (snap: PaintSnapshot) => void;
}

export const usePaintStore = create<PaintState>((set, get) => ({
  mode: 'effect',
  selected: new Set(),
  keyColors: new Map(),
  brushColor: '#ff8800',
  animType: 'solid',
  animSpeed: 0.5,
  lastSequence: [],
  activePresetId: null,
  directPaintMode: false,
  tapToTestMode: false,
  setMode: (mode) => set({ mode, selected: new Set() }),
  setDirectPaintMode: (directPaintMode) => set({ directPaintMode }),
  setTapToTestMode: (tapToTestMode) => set({ tapToTestMode }),
  paintKey: (ledIndex) => {
    const { brushColor, keyColors } = get();
    if (keyColors.get(ledIndex) === brushColor) return; // already that color, no-op
    const next = new Map(keyColors);
    next.set(ledIndex, brushColor);
    set({ keyColors: next, activePresetId: null });
    useColorHistoryStore.getState().commit(brushColor);
    // No pushHistory per-key: drag paint can fire dozens of paintKey() calls
    // per second. We snapshot on pointer-up via paintKeys() or via the
    // PaintToolbar's explicit "send" instead.
  },
  eraseKey: (ledIndex) => {
    const { keyColors } = get();
    if (!keyColors.has(ledIndex)) return;
    const next = new Map(keyColors);
    next.delete(ledIndex);
    set({ keyColors: next, activePresetId: null });
  },
  paintKeys: (ledIndexes) => {
    if (ledIndexes.length === 0) return;
    const { brushColor, keyColors } = get();
    const next = new Map(keyColors);
    for (const i of ledIndexes) next.set(i, brushColor);
    set({ keyColors: next, activePresetId: null });
    useColorHistoryStore.getState().commit(brushColor);
    pushHistory(get());
  },
  toggleKey: (ledIndex, additive) =>
    set((s) => {
      const next = additive ? new Set(s.selected) : new Set<number>();
      if (next.has(ledIndex)) next.delete(ledIndex);
      else next.add(ledIndex);
      return { selected: next };
    }),
  clearSelection: () => set({ selected: new Set() }),
  selectAll: () => {
    const all = new Set<number>();
    for (let i = 0; i < 61; i++) all.add(i);
    set({ selected: all });
  },
  paintSelected: () => {
    const { selected, brushColor, keyColors } = get();
    if (selected.size === 0) return;
    const next = new Map(keyColors);
    selected.forEach((i) => next.set(i, brushColor));
    set({ keyColors: next, selected: new Set(), activePresetId: null });
    useColorHistoryStore.getState().commit(brushColor);
    pushHistory(get());
  },
  setBrushColor: (brushColor) => set({ brushColor }),
  resetKeys: () => {
    set({ keyColors: new Map(), selected: new Set(), activePresetId: null, lastSequence: [] });
    pushHistory(get());
  },
  paintByText: (text) => {
    const { brushColor, keyColors } = get();
    const next = new Map(keyColors);
    const sequence: number[] = [];
    for (const ch of text) {
      const keyName = textCharToKeyName(ch);
      if (!keyName) continue;
      const keyDef = K617_LAYOUT.keys.find((k) => k.name === keyName);
      if (!keyDef) continue;
      next.set(keyDef.ledIndex, brushColor);
      sequence.push(keyDef.ledIndex);
    }
    set({ keyColors: next, lastSequence: sequence, activePresetId: null });
    useColorHistoryStore.getState().commit(brushColor);
    pushHistory(get());
  },
  setAnimType: (animType) => set({ animType }),
  setAnimSpeed: (animSpeed) => set({ animSpeed }),
  setActivePresetId: (activePresetId) => set({ activePresetId }),
  applySnapshot: (snap) => set({
    keyColors: new Map(snap.keyColors),
    animType: snap.animType as AnimType,
    animSpeed: snap.animSpeed,
    lastSequence: [...snap.lastSequence],
    activePresetId: snap.activePresetId,
    selected: new Set(),
  }),
}));

function snapshot(state: PaintState): PaintSnapshot {
  return {
    keyColors: state.keyColors,
    animType: state.animType,
    animSpeed: state.animSpeed,
    lastSequence: state.lastSequence,
    activePresetId: state.activePresetId,
  };
}

function pushHistory(state: PaintState) {
  useHistoryStore.getState().push(snapshot(state));
}

// Seed history with the initial paint state so the first push has something
// to undo back to.
pushHistory(usePaintStore.getState());
