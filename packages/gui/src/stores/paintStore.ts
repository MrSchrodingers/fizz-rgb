import { create } from 'zustand';

interface PaintState {
  mode: 'effect' | 'paint';
  selected: Set<number>;
  keyColors: Map<number, string>;
  brushColor: string;
  setMode: (m: 'effect' | 'paint') => void;
  toggleKey: (ledIndex: number, additive: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  paintSelected: () => void;
  setBrushColor: (c: string) => void;
  resetKeys: () => void;
}

export const usePaintStore = create<PaintState>((set, get) => ({
  mode: 'effect',
  selected: new Set(),
  keyColors: new Map(),
  brushColor: '#ff8800',
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
}));
