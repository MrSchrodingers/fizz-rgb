import { useEffect } from 'react';
import { Header } from './components/Header.js';
import { EffectSidebar } from './components/EffectSidebar.js';
import { ProfileSidebar } from './components/ProfileSidebar.js';
import { ParametersPanel } from './components/ParametersPanel.js';
import { PresetGallery } from './components/PresetGallery.js';
import type { UserPreset } from './components/PresetGallery.js';
import { Keyboard3D } from './three/Keyboard3D.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';
import { PaintToolbar } from './components/PaintToolbar.js';
import { useDeviceStore } from './stores/deviceStore.js';
import { useEffectStore } from './stores/effectStore.js';
import { useProfileStore } from './stores/profileStore.js';
import { usePaintStore } from './stores/paintStore.js';
import type { AnimType } from './stores/paintStore.js';
import type { Preset } from '@fizz/core';

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
  const paintAnimType = usePaintStore((s) => s.animType);
  const paintAnimSpeed = usePaintStore((s) => s.animSpeed);
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
      type LegacyPattern = Record<string, string>;
      type NewPattern = { keys: Record<string, string>; animType?: string; animSpeed?: number };
      const patterns = JSON.parse(localStorage.getItem('fizz-patterns') ?? '{}') as Record<string, LegacyPattern | NewPattern>;
      const pattern = patterns[name];
      if (pattern) {
        // Detect new shape vs legacy shape
        const isNew = typeof pattern === 'object' && 'keys' in pattern;
        const keysRaw: Record<string, string> = isNew ? (pattern as NewPattern).keys : (pattern as LegacyPattern);

        // Rebuild the Map and inject it into paintStore
        const store = usePaintStore.getState();
        const next = new Map<number, string>();
        for (const [k, v] of Object.entries(keysRaw)) {
          next.set(Number(k), v as string);
        }
        store.setMode('paint');
        const stateUpdate: { keyColors: Map<number, string>; selected: Set<number>; animType?: AnimType; animSpeed?: number } = {
          keyColors: next,
          selected: new Set(),
        };
        if (isNew) {
          const p = pattern as NewPattern;
          const validAnimTypes: AnimType[] = ['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave'];
          if (p.animType && validAnimTypes.includes(p.animType as AnimType)) {
            stateUpdate.animType = p.animType as AnimType;
          }
          if (p.animSpeed !== undefined) {
            stateUpdate.animSpeed = p.animSpeed;
          }
        }
        usePaintStore.setState(stateUpdate);

        // Push restored per-key pattern to hardware in real time
        if (window.fizz) {
          const record: Record<string, string> = {};
          next.forEach((hex, idx) => { record[String(idx)] = hex; });
          try { await window.fizz.perkeySet(record); } catch (err) { console.warn('perkey send failed', err); }
        }
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

    // Persist per-key pattern in localStorage (new shape includes animType + animSpeed)
    const patterns = JSON.parse(localStorage.getItem('fizz-patterns') ?? '{}') as Record<string, unknown>;
    patterns[name] = {
      keys: Object.fromEntries(Array.from(colors.entries()).map(([k, v]) => [String(k), v])),
      animType: paintAnimType,
      animSpeed: paintAnimSpeed,
    };
    localStorage.setItem('fizz-patterns', JSON.stringify(patterns));

    const updated = await window.fizz.profileList();
    setProfiles(updated);
  }

  // Suppress unused warning - setPaintKeyColors is held for future use
  void setPaintKeyColors;

  async function handleApplyPreset(preset: Preset | UserPreset, tintColor?: string) {
    const next = new Map<number, string>();
    for (const [k, v] of Object.entries(preset.pattern.keys)) {
      // If tint is enabled, replace ALL preset colors with the brush color
      next.set(Number(k), tintColor ?? v);
    }
    usePaintStore.setState({
      keyColors: next,
      selected: new Set(),
      animType: preset.pattern.animType as AnimType,
      animSpeed: preset.pattern.animSpeed,
      lastSequence: preset.pattern.sequence ?? [],
      mode: 'paint',
    });

    console.log('[applyPreset]', preset.id, 'animType=', preset.pattern.animType, tintColor ? `tint=${tintColor}` : '');
    if (window.fizz) {
      const colors: Record<string, string> = {};
      next.forEach((hex, idx) => { colors[String(idx)] = hex; });
      if (preset.pattern.animType === 'solid') {
        console.log('[applyPreset] → perkeySet (solid)');
        try { await window.fizz.perkeySet(colors); } catch (err) { console.warn(err); }
      } else {
        console.log('[applyPreset] → perkeyStartPattern (animated)', preset.pattern.animType);
        try {
          await window.fizz.perkeyStartPattern({
            keys: colors,
            animType: preset.pattern.animType as AnimType,
            animSpeed: preset.pattern.animSpeed,
            ...(preset.pattern.sequence != null ? { sequence: preset.pattern.sequence } : {}),
          });
        } catch (err) { console.warn(err); }
      }
    }
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {paintMode === 'paint' && <PaintToolbar onSavePattern={handleSavePattern} />}
          <Keyboard3D />
        </div>
        {paintMode === 'paint' ? (
          <PresetGallery onApply={handleApplyPreset} />
        ) : (
          <ParametersPanel onApply={handleApply} />
        )}
      </div>
    </div>
  );
}
