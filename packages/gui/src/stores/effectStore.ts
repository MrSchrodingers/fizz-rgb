import { create } from 'zustand';
import type { FirmwareEffectName, FirmwareEffectParams } from '@fizz/core';

interface EffectState {
  current: { name: FirmwareEffectName; params: FirmwareEffectParams } | null;
  // The "selected" effect in the sidebar — may differ from `current` while user is configuring
  selected: FirmwareEffectName | 'solid-color';
  // Local form state for the currently selected effect (sent on Apply)
  draftParams: FirmwareEffectParams;
  solidColor: string; // hex for the solid-color pseudo-effect
  setCurrent: (c: { name: FirmwareEffectName; params: FirmwareEffectParams } | null) => void;
  setSelected: (s: FirmwareEffectName | 'solid-color') => void;
  setDraftParams: (p: FirmwareEffectParams) => void;
  setSolidColor: (c: string) => void;
  resetDraft: () => void;
}

export const useEffectStore = create<EffectState>((set) => ({
  current: null,
  selected: 'solid-color',
  draftParams: {},
  solidColor: '#ff8800',
  setCurrent: (current) => set({ current }),
  setSelected: (selected) => set({ selected, draftParams: {} }),
  setDraftParams: (draftParams) => set({ draftParams }),
  setSolidColor: (solidColor) => set({ solidColor }),
  resetDraft: () => set({ draftParams: {} }),
}));
