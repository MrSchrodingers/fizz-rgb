import { useEffect } from 'react';
import { Header } from './components/Header.js';
import { EffectSidebar } from './components/EffectSidebar.js';
import { ProfileSidebar } from './components/ProfileSidebar.js';
import { ParametersPanel } from './components/ParametersPanel.js';
import { Keyboard3D } from './three/Keyboard3D.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';
import { PaintToolbar } from './components/PaintToolbar.js';
import { useDeviceStore } from './stores/deviceStore.js';
import { useEffectStore } from './stores/effectStore.js';
import { useProfileStore } from './stores/profileStore.js';
import { usePaintStore } from './stores/paintStore.js';

export default function App() {
  const setDeviceStatus = useDeviceStore((s) => s.setStatus);
  const setDaemonOnline = useDeviceStore((s) => s.setDaemonOnline);
  const selected = useEffectStore((s) => s.selected);
  const draft = useEffectStore((s) => s.draftParams);
  const solidColor = useEffectStore((s) => s.solidColor);
  const setCurrent = useEffectStore((s) => s.setCurrent);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActive = useProfileStore((s) => s.setActive);

  const paintMode = usePaintStore((s) => s.mode);
  const paintKeyColors = usePaintStore((s) => s.keyColors);
  const setPaintKeyColors = usePaintStore((s) => s.resetKeys);

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
    // Restore per-key pattern from localStorage if it exists for this profile
    try {
      const patterns = JSON.parse(localStorage.getItem('fizz-patterns') ?? '{}') as Record<string, Record<string, string>>;
      const pattern = patterns[name];
      if (pattern) {
        // Rebuild the Map and inject it into paintStore
        const store = usePaintStore.getState();
        const next = new Map<number, string>();
        for (const [k, v] of Object.entries(pattern)) {
          next.set(Number(k), v as string);
        }
        store.setMode('paint');
        usePaintStore.setState({ keyColors: next, selected: new Set() });
      }
    } catch {
      // ignore localStorage errors
    }
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

  async function handleSavePattern() {
    if (!window.fizz) return;
    const colors = paintKeyColors;
    if (colors.size === 0) {
      alert('No keys painted yet. Click keys in the 3D view to select, then "Paint selected".');
      return;
    }
    const name = window.prompt('Pattern name?', `pattern-${Date.now().toString().slice(-4)}`);
    if (!name) return;

    // Compute average color for hardware fallback
    let r = 0, g = 0, b = 0;
    colors.forEach((hex) => {
      const n = parseInt(hex.replace('#', ''), 16);
      r += (n >> 16) & 0xff;
      g += (n >> 8) & 0xff;
      b += n & 0xff;
    });
    const c = colors.size;
    const avgHex =
      '#' +
      ((Math.round(r / c) << 16) | (Math.round(g / c) << 8) | Math.round(b / c))
        .toString(16)
        .padStart(6, '0');

    await window.fizz.profileSave(name, {
      name,
      effect: { name: 'fw-static', params: { color: avgHex } },
    });

    // Persist per-key pattern in localStorage
    const patterns = JSON.parse(localStorage.getItem('fizz-patterns') ?? '{}') as Record<string, Record<string, string>>;
    patterns[name] = Object.fromEntries(
      Array.from(colors.entries()).map(([k, v]) => [String(k), v]),
    );
    localStorage.setItem('fizz-patterns', JSON.stringify(patterns));

    const updated = await window.fizz.profileList();
    setProfiles(updated);
  }

  // Suppress unused warning - setPaintKeyColors is held for future use
  void setPaintKeyColors;

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
        <div className="flex-1 flex flex-col overflow-hidden">
          {paintMode === 'paint' && <PaintToolbar onSavePattern={handleSavePattern} />}
          <Keyboard3D />
        </div>
        <ParametersPanel onApply={handleApply} />
      </div>
    </div>
  );
}
