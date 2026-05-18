import { useEffect } from 'react';
import { Header } from './components/Header.js';
import { EffectSidebar } from './components/EffectSidebar.js';
import { ProfileSidebar } from './components/ProfileSidebar.js';
import { ParametersPanel } from './components/ParametersPanel.js';
import { Keyboard3D } from './three/Keyboard3D.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';
import { useDeviceStore } from './stores/deviceStore.js';
import { useEffectStore } from './stores/effectStore.js';
import { useProfileStore } from './stores/profileStore.js';

export default function App() {
  const setDeviceStatus = useDeviceStore((s) => s.setStatus);
  const setDaemonOnline = useDeviceStore((s) => s.setDaemonOnline);
  const selected = useEffectStore((s) => s.selected);
  const draft = useEffectStore((s) => s.draftParams);
  const solidColor = useEffectStore((s) => s.solidColor);
  const setCurrent = useEffectStore((s) => s.setCurrent);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActive = useProfileStore((s) => s.setActive);

  // Initial fetch
  useEffect(() => {
    if (!window.fizz) return;
    window.fizz.deviceStatus()
      .then(setDeviceStatus)
      .catch(() => setDaemonOnline(false));
    window.fizz.effectCurrent()
      .then(setCurrent)
      .catch(() => { /* ignore */ });
    window.fizz.profileList()
      .then(setProfiles)
      .catch(() => { /* ignore */ });
  }, [setDeviceStatus, setDaemonOnline, setCurrent, setProfiles]);

  // Subscribe to push notifications from daemon
  useEffect(() => {
    if (!window.fizz) return;
    const unsubEffect = window.fizz.subscribeEffectChanged((cur) => setCurrent(cur ?? null));
    const unsubDevice = window.fizz.subscribeDeviceChanged((s) => {
      setDeviceStatus({ connected: s.connected, vid: 0x258a, pid: 0x0049 });
    });
    return () => { unsubEffect(); unsubDevice(); };
  }, [setCurrent, setDeviceStatus]);

  async function handleApply() {
    if (!window.fizz) return;
    if (selected === 'solid-color') {
      await window.fizz.solidSet(solidColor);
    } else {
      await window.fizz.effectRun(selected, draft);
    }
  }

  async function handleProfileActivate(name: string) {
    if (!window.fizz) return;
    await window.fizz.profileActivate(name);
    setActive(name);
  }

  async function handleSaveProfile() {
    if (!window.fizz) return;
    const name = window.prompt('Profile name?', `${selected}-${Date.now().toString().slice(-4)}`);
    if (!name) return;
    if (selected === 'solid-color') {
      await window.fizz.profileSave(name, {
        name,
        effect: { name: 'fw-static', params: { color: solidColor } },
      });
    } else {
      await window.fizz.profileSave(name, {
        name,
        effect: { name: selected, params: draft },
      });
    }
    const updated = await window.fizz.profileList();
    setProfiles(updated);
  }

  async function handleDeleteProfile(name: string) {
    if (!window.fizz) return;
    if (!window.confirm(`Delete profile "${name}"?`)) return;
    await window.fizz.profileDelete(name);
    const updated = await window.fizz.profileList();
    setProfiles(updated);
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      <Header />
      <ConnectionBanner />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col">
          <EffectSidebar />
          <ProfileSidebar
            onActivate={handleProfileActivate}
            onSaveNew={handleSaveProfile}
            onDelete={handleDeleteProfile}
          />
        </div>
        <div className="flex-1 flex flex-col">
          <Keyboard3D />
        </div>
        <ParametersPanel onApply={handleApply} />
      </div>
    </div>
  );
}
