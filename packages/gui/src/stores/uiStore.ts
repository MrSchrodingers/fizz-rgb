import { create } from 'zustand';

/** Cross-cutting UI state (sidebar collapse, etc.) that doesn't belong in
 * paint/effect/profile stores. */
interface UIState {
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: (v: boolean) => void;
  setRightSidebarCollapsed: (v: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
}

const LS_KEY = 'fizz-ui-state';

function load(): Partial<UIState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<UIState>;
  } catch {
    return {};
  }
}

function persist(state: Pick<UIState, 'leftSidebarCollapsed' | 'rightSidebarCollapsed'>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const initial = load();

export const useUIStore = create<UIState>((set, get) => ({
  leftSidebarCollapsed: initial.leftSidebarCollapsed ?? false,
  rightSidebarCollapsed: initial.rightSidebarCollapsed ?? false,
  setLeftSidebarCollapsed: (v) => {
    set({ leftSidebarCollapsed: v });
    persist({ leftSidebarCollapsed: v, rightSidebarCollapsed: get().rightSidebarCollapsed });
  },
  setRightSidebarCollapsed: (v) => {
    set({ rightSidebarCollapsed: v });
    persist({ leftSidebarCollapsed: get().leftSidebarCollapsed, rightSidebarCollapsed: v });
  },
  toggleLeftSidebar: () => {
    const next = !get().leftSidebarCollapsed;
    set({ leftSidebarCollapsed: next });
    persist({ leftSidebarCollapsed: next, rightSidebarCollapsed: get().rightSidebarCollapsed });
  },
  toggleRightSidebar: () => {
    const next = !get().rightSidebarCollapsed;
    set({ rightSidebarCollapsed: next });
    persist({ leftSidebarCollapsed: get().leftSidebarCollapsed, rightSidebarCollapsed: next });
  },
}));
