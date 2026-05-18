import { useEffect, useState } from 'react';
import { Header } from './components/Header.js';
import { EffectSidebar } from './components/EffectSidebar.js';
import { ProfileSidebar } from './components/ProfileSidebar.js';
import { ParametersPanel } from './components/ParametersPanel.js';
import { PresetGallery } from './components/PresetGallery.js';
import type { UserPreset } from './components/PresetGallery.js';
import { Keyboard3D } from './three/Keyboard3D.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';
import { PaintToolbar } from './components/PaintToolbar.js';
import { NamePromptModal } from './components/NamePromptModal.js';
import { useDeviceStore } from './stores/deviceStore.js';
import { useEffectStore } from './stores/effectStore.js';
import { useProfileStore } from './stores/profileStore.js';
import { usePaintStore } from './stores/paintStore.js';
import type { AnimType } from './stores/paintStore.js';
import type { Preset, Profile } from '@fizz/core';

export default function App() {
  const setDeviceStatus = useDeviceStore((s) => s.setStatus);
  const setDaemonOnline = useDeviceStore((s) => s.setDaemonOnline);
  const selected = useEffectStore((s) => s.selected);
  const draft = useEffectStore((s) => s.draftParams);
  const solidColor = useEffectStore((s) => s.solidColor);
  const setCurrent = useEffectStore((s) => s.setCurrent);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActive = useProfileStore((s) => s.setActive);
  const profiles = useProfileStore((s) => s.profiles);

  const paintMode = usePaintStore((s) => s.mode);
  const paintKeyColors = usePaintStore((s) => s.keyColors);
  const paintAnimType = usePaintStore((s) => s.animType);
  const paintAnimSpeed = usePaintStore((s) => s.animSpeed);
  const setPaintKeyColors = usePaintStore((s) => s.resetKeys);

  // Modal state: null = hidden, otherwise shows the prompt
  const [namePrompt, setNamePrompt] = useState<{
    title: string;
    defaultValue: string;
    onConfirm: (name: string) => void;
  } | null>(null);

  // Helper: show the name prompt modal and invoke action on confirm
  function promptForName(
    title: string,
    defaultValue: string,
    action: (name: string) => Promise<void>,
  ) {
    setNamePrompt({
      title,
      defaultValue,
      onConfirm: async (name) => {
        setNamePrompt(null);
        await action(name);
      },
    });
  }

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

  // Auto-save current paint state to localStorage (debounced 500ms).
  // IMPORTANT: subscribe to atomic fields individually — a Zustand selector
  // returning a new object on every call ({...}) causes an infinite re-render
  // loop because each render gets a different reference.
  const autoSaveKeyColors = usePaintStore((s) => s.keyColors);
  const autoSaveAnimType = usePaintStore((s) => s.animType);
  const autoSaveAnimSpeed = usePaintStore((s) => s.animSpeed);
  const autoSaveLastSequence = usePaintStore((s) => s.lastSequence);
  const autoSaveMode = usePaintStore((s) => s.mode);

  useEffect(() => {
    if (autoSaveKeyColors.size === 0) return;
    const t = setTimeout(() => {
      try {
        const data = {
          keys: Object.fromEntries(autoSaveKeyColors),
          animType: autoSaveAnimType,
          animSpeed: autoSaveAnimSpeed,
          sequence: autoSaveLastSequence,
          mode: autoSaveMode,
          savedAt: Date.now(),
        };
        localStorage.setItem('fizz-current-state', JSON.stringify(data));
      } catch { /* ignore storage errors */ }
    }, 500);
    return () => clearTimeout(t);
  }, [autoSaveKeyColors, autoSaveAnimType, autoSaveAnimSpeed, autoSaveLastSequence, autoSaveMode]);

  // On boot: restore last auto-saved state
  useEffect(() => {
    try {
      const raw = localStorage.getItem('fizz-current-state');
      if (!raw) return;
      const data = JSON.parse(raw) as {
        keys?: Record<string, string>;
        animType?: string;
        animSpeed?: number;
        sequence?: number[];
        mode?: string;
      };
      if (!data.keys || Object.keys(data.keys).length === 0) return;
      const next = new Map<number, string>(
        Object.entries(data.keys).map(([k, v]) => [Number(k), v]),
      );
      const validAnimTypes: AnimType[] = ['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave', 'pong', 'snake', 'tetris'];
      const animType: AnimType = validAnimTypes.includes(data.animType as AnimType)
        ? (data.animType as AnimType)
        : 'solid';
      usePaintStore.setState({
        keyColors: next,
        animType,
        animSpeed: data.animSpeed ?? 0.5,
        lastSequence: data.sequence ?? [],
        mode: (data.mode === 'paint' || data.mode === 'effect') ? data.mode : 'paint',
      });
      // Push to hardware after daemon connects
      setTimeout(() => {
        if (!window.fizz) return;
        const colors: Record<string, string> = {};
        next.forEach((hex, idx) => { colors[String(idx)] = hex; });
        if (animType === 'solid') {
          window.fizz.perkeySet(colors).catch(() => {});
        } else {
          window.fizz.perkeyStartPattern({
            keys: colors,
            animType,
            animSpeed: data.animSpeed ?? 0.5,
            ...(data.sequence && data.sequence.length > 0 ? { sequence: data.sequence } : {}),
          }).catch(() => {});
        }
      }, 1500);
    } catch { /* ignore */ }
  }, []); // run once on mount

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
          const validAnimTypes: AnimType[] = ['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave', 'pong', 'snake', 'tetris'];
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
    promptForName(
      'Nome do perfil',
      `${selected}-${Date.now().toString().slice(-4)}`,
      async (name) => {
        if (!window.fizz) return;
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
      },
    );
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
    promptForName(
      'Nome do padrão (pattern)',
      `pattern-${Date.now().toString().slice(-4)}`,
      async (name) => {
        if (!window.fizz) return;
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
      },
    );
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

  // Export all profiles + patterns + presets as a portable JSON file
  function handleExportProfiles() {
    const data = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profiles,
      patterns: JSON.parse(localStorage.getItem('fizz-patterns') ?? '{}'),
      userPresets: JSON.parse(localStorage.getItem('fizz-user-presets') ?? '[]'),
      currentState: JSON.parse(localStorage.getItem('fizz-current-state') ?? 'null'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fizz-profiles-${new Date().toISOString().slice(0, 10)}.fizzpattern.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import profiles + patterns + presets from a portable JSON file
  function handleImportProfiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.fizzpattern.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as {
          schemaVersion?: number;
          profiles?: Array<{ name: string; [k: string]: unknown }>;
          patterns?: Record<string, unknown>;
          userPresets?: Array<{ id: string; [k: string]: unknown }>;
        };
        if (typeof data !== 'object' || data.schemaVersion !== 1) {
          alert('Arquivo inválido (não é um fizz-pattern v1)');
          return;
        }
        // Import profiles via daemon
        if (data.profiles && Array.isArray(data.profiles) && window.fizz) {
          for (const profile of data.profiles) {
            await window.fizz
              .profileSave(profile.name, profile as Omit<Profile, 'createdAt'>)
              .catch((err) => console.warn('profile import skipped', profile.name, err));
          }
        }
        // Merge patterns into localStorage
        if (data.patterns) {
          const existing = JSON.parse(localStorage.getItem('fizz-patterns') ?? '{}') as Record<string, unknown>;
          localStorage.setItem('fizz-patterns', JSON.stringify({ ...existing, ...data.patterns }));
        }
        // Merge user presets (skip duplicates by id)
        if (data.userPresets) {
          const existing = JSON.parse(localStorage.getItem('fizz-user-presets') ?? '[]') as Array<{ id: string }>;
          const incoming = data.userPresets.filter(
            (p) => !existing.some((e) => e.id === p.id),
          );
          localStorage.setItem('fizz-user-presets', JSON.stringify([...existing, ...incoming]));
        }
        // Refresh profile list from daemon
        if (window.fizz) {
          const updated = await window.fizz.profileList();
          setProfiles(updated);
        }
        alert(
          `Importado: ${data.profiles?.length ?? 0} profiles, ` +
          `${Object.keys(data.patterns ?? {}).length} patterns, ` +
          `${data.userPresets?.length ?? 0} user presets`,
        );
      } catch (err) {
        alert(`Falha ao importar: ${(err as Error).message}`);
      }
    };
    input.click();
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
            onExport={handleExportProfiles}
            onImport={handleImportProfiles}
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
      {namePrompt && (
        <NamePromptModal
          title={namePrompt.title}
          defaultValue={namePrompt.defaultValue}
          onConfirm={namePrompt.onConfirm}
          onCancel={() => setNamePrompt(null)}
        />
      )}
    </div>
  );
}
