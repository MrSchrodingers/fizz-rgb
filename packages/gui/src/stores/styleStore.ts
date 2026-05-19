import { create } from 'zustand';
import type { Style } from '../lib/colorTransform.js';

/**
 * Global style selector applied to every preset before it goes to hardware.
 *
 * This is the "tonalidade" knob the user controls at the top of the
 * preset sidebar — different from the per-preset PresetEditor which
 * scopes edits to one preset.
 *
 * Persisted to localStorage so the choice survives a relaunch.
 */

const LS_KEY = 'fizz-style';

interface Persisted { style: Style; vibrancy: number; }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { style: 'original', vibrancy: 1 };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      style: (parsed.style ?? 'original') as Style,
      vibrancy: typeof parsed.vibrancy === 'number' ? parsed.vibrancy : 1,
    };
  } catch {
    return { style: 'original', vibrancy: 1 };
  }
}

function persist(s: Persisted) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

interface StyleState {
  style: Style;
  vibrancy: number;
  setStyle: (s: Style) => void;
  setVibrancy: (v: number) => void;
}

const initial = load();

export const useStyleStore = create<StyleState>((set, get) => ({
  style: initial.style,
  vibrancy: initial.vibrancy,
  setStyle: (style) => { set({ style }); persist({ style, vibrancy: get().vibrancy }); },
  setVibrancy: (vibrancy) => { set({ vibrancy }); persist({ style: get().style, vibrancy }); },
}));
