import { create } from 'zustand';
import type { Profile } from '@fizz/core';

interface ProfileState {
  profiles: Profile[];
  active: string | null;
  setProfiles: (profiles: Profile[]) => void;
  setActive: (active: string | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profiles: [],
  active: null,
  setProfiles: (profiles) => set({ profiles }),
  setActive: (active) => set({ active }),
}));
