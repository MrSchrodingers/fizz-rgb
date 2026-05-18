import { create } from 'zustand';

interface DeviceState {
  connected: boolean;
  vid: number;
  pid: number;
  daemonOnline: boolean;
  setConnected: (c: boolean) => void;
  setDaemonOnline: (o: boolean) => void;
  setStatus: (s: { connected: boolean; vid: number; pid: number }) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  connected: false,
  vid: 0,
  pid: 0,
  daemonOnline: false,
  setConnected: (connected) => set({ connected }),
  setDaemonOnline: (daemonOnline) => set({ daemonOnline }),
  setStatus: (s) => set({ connected: s.connected, vid: s.vid, pid: s.pid, daemonOnline: true }),
}));
