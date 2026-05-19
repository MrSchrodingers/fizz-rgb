import { create } from 'zustand';

/**
 * Last 8 colors the user explicitly committed (paint selected / paint by
 * text / preset tint), persisted to localStorage. Brush *intent* is signalled
 * by `commit()` — selecting a color in the picker doesn't pollute history
 * until the user actually uses it.
 */

const STORAGE_KEY = 'fizz-color-history';
const MAX_COLORS = 8;

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_COLORS);
  } catch {
    return [];
  }
}

function save(colors: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    /* localStorage full or unavailable — silently drop */
  }
}

interface ColorHistoryState {
  recent: string[];
  /** Move/add `color` to the front; dedupe. */
  commit: (color: string) => void;
  clear: () => void;
}

export const useColorHistoryStore = create<ColorHistoryState>((set, get) => ({
  recent: load(),
  commit: (color) => {
    const normalized = color.toLowerCase();
    const filtered = get().recent.filter((c) => c.toLowerCase() !== normalized);
    const next = [normalized, ...filtered].slice(0, MAX_COLORS);
    save(next);
    set({ recent: next });
  },
  clear: () => {
    save([]);
    set({ recent: [] });
  },
}));

/**
 * Curated palettes the user can pick wholesale. Each preserves a vibe;
 * keep ~5-7 colors so the UI row stays compact.
 */
export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

export const PALETTES: Palette[] = [
  { id: 'rgb', name: 'RGB', colors: ['#ff0000', '#ff8800', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2'] },
  { id: 'pride', name: 'Pride', colors: ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004cff', '#732982'] },
  { id: 'trans', name: 'Trans', colors: ['#5bcefa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcefa'] },
  { id: 'cyberpunk', name: 'Cyberpunk', colors: ['#fcee0a', '#ff003c', '#00f0ff', '#ff00ff', '#0aefff'] },
  { id: 'vaporwave', name: 'Vaporwave', colors: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'] },
  { id: 'synthwave', name: 'Synthwave', colors: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'] },
  { id: 'aurora', name: 'Aurora', colors: ['#0a3d3a', '#1abc9c', '#3ddc97', '#a16ae8', '#5b8def'] },
  { id: 'sunset', name: 'Sunset', colors: ['#0f1e3c', '#7a1f5a', '#c9356b', '#f57e57', '#fbb13c'] },
  { id: 'forest', name: 'Forest', colors: ['#0b3d2e', '#2d5d3a', '#6ab04c', '#badc58', '#ffeaa7'] },
  { id: 'ocean', name: 'Ocean', colors: ['#011627', '#1d3557', '#457b9d', '#a8dadc', '#f1faee'] },
  { id: 'brasil', name: 'Brasil', colors: ['#009c3b', '#ffdf00', '#002776', '#ffffff'] },
  { id: 'halloween', name: 'Halloween', colors: ['#ff7518', '#000000', '#7d2eff', '#39ff14', '#ff003c'] },
  { id: 'xmas', name: 'Natal', colors: ['#c8102e', '#006747', '#ffd700', '#ffffff'] },
  { id: 'pastel', name: 'Pastel', colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff'] },
  { id: 'mono-fuchsia', name: 'Mono Fúcsia', colors: ['#2d0a2f', '#4b1d50', '#7b337f', '#b54bff', '#e9a0ff'] },
];
