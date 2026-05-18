import { create } from 'zustand';
import { K617_LAYOUT } from '@fizz/core';

export type AnimType = 'solid' | 'blink' | 'chase' | 'wave' | 'typewriter' | 'marquee' | 'flag-wave';

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
}

export const usePaintStore = create<PaintState>((set, get) => ({
  mode: 'effect',
  selected: new Set(),
  keyColors: new Map(),
  brushColor: '#ff8800',
  animType: 'solid',
  animSpeed: 0.5,
  lastSequence: [],
  setMode: (mode) => set({ mode, selected: new Set() }),
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
    const next = new Map(keyColors);
    selected.forEach((i) => next.set(i, brushColor));
    set({ keyColors: next, selected: new Set() });
  },
  setBrushColor: (brushColor) => set({ brushColor }),
  resetKeys: () => set({ keyColors: new Map(), selected: new Set() }),
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
    set({ keyColors: next, lastSequence: sequence });
  },
  setAnimType: (animType) => set({ animType }),
  setAnimSpeed: (animSpeed) => set({ animSpeed }),
}));
