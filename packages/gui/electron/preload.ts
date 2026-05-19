import { contextBridge, ipcRenderer } from 'electron';

const fizz = {
  daemonVersion: () => ipcRenderer.invoke('fizz:daemonVersion'),
  deviceStatus: () => ipcRenderer.invoke('fizz:deviceStatus'),
  effectList: () => ipcRenderer.invoke('fizz:effectList'),
  effectRun: (name: string, params: unknown) => ipcRenderer.invoke('fizz:effectRun', name, params),
  effectStop: () => ipcRenderer.invoke('fizz:effectStop'),
  effectCurrent: () => ipcRenderer.invoke('fizz:effectCurrent'),
  solidSet: (color: string) => ipcRenderer.invoke('fizz:solidSet', color),
  profileList: () => ipcRenderer.invoke('fizz:profileList'),
  profileActivate: (name: string) => ipcRenderer.invoke('fizz:profileActivate', name),
  profileSave: (key: string, profile: unknown) => ipcRenderer.invoke('fizz:profileSave', key, profile),
  profileDelete: (name: string) => ipcRenderer.invoke('fizz:profileDelete', name),
  subscribeEffectChanged: (handler: (cur: any) => void) => {
    const wrapped = (_e: unknown, params: any) => handler(params);
    ipcRenderer.on('fizz:effectChanged', wrapped);
    return () => ipcRenderer.off('fizz:effectChanged', wrapped);
  },
  subscribeDeviceChanged: (handler: (s: any) => void) => {
    const wrapped = (_e: unknown, params: any) => handler(params);
    ipcRenderer.on('fizz:deviceChanged', wrapped);
    return () => ipcRenderer.off('fizz:deviceChanged', wrapped);
  },
  subscribePerkeyChanged: (handler: (s: any) => void) => {
    const wrapped = (_e: unknown, params: any) => handler(params);
    ipcRenderer.on('fizz:perkeyChanged', wrapped);
    return () => ipcRenderer.off('fizz:perkeyChanged', wrapped);
  },
  perkeyCurrent: () => ipcRenderer.invoke('fizz:perkeyCurrent'),
  perkeySet: (colors: Record<string, string>) => ipcRenderer.invoke('fizz:perkeySet', colors),
  perkeyStartPattern: (pattern: any) => ipcRenderer.invoke('fizz:perkeyStartPattern', pattern),
  perkeyStopPattern: () => ipcRenderer.invoke('fizz:perkeyStopPattern'),
};

contextBridge.exposeInMainWorld('fizz', fizz);
