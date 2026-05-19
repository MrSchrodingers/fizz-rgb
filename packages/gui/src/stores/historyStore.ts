import { create } from 'zustand';

/**
 * Lightweight history store decoupled from paintStore so we don't snapshot
 * unrelated fields (like brushColor or mode) every time a key changes.
 *
 * A snapshot captures only what makes a paint state diff: keyColors,
 * animType, animSpeed, lastSequence. Limit 50 entries to bound memory.
 */
export interface PaintSnapshot {
  keyColors: Map<number, string>;
  animType: string;
  animSpeed: number;
  lastSequence: number[];
  activePresetId: string | null;
}

interface HistoryState {
  past: PaintSnapshot[];
  future: PaintSnapshot[];
  push: (snapshot: PaintSnapshot) => void;
  undo: () => PaintSnapshot | null;
  redo: () => PaintSnapshot | null;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX_HISTORY = 50;

function cloneSnapshot(s: PaintSnapshot): PaintSnapshot {
  return {
    keyColors: new Map(s.keyColors),
    animType: s.animType,
    animSpeed: s.animSpeed,
    lastSequence: [...s.lastSequence],
    activePresetId: s.activePresetId,
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  push: (snapshot) =>
    set((s) => {
      const next = [...s.past, cloneSnapshot(snapshot)];
      if (next.length > MAX_HISTORY) next.shift();
      // Any new push invalidates the redo branch.
      return { past: next, future: [] };
    }),
  undo: () => {
    const { past, future } = get();
    if (past.length < 2) return null;
    const previous = past[past.length - 2];
    const current = past[past.length - 1];
    if (!previous || !current) return null;
    set({ past: past.slice(0, -1), future: [current, ...future] });
    return cloneSnapshot(previous);
  },
  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return null;
    const next = future[0];
    if (!next) return null;
    set({ past: [...past, next], future: future.slice(1) });
    return cloneSnapshot(next);
  },
  clear: () => set({ past: [], future: [] }),
  canUndo: () => get().past.length > 1,
  canRedo: () => get().future.length > 0,
}));
