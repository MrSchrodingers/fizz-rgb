import { useEffect, useState, useCallback } from 'react';
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
import { Toast } from './components/Toast.js';
import { TimelineEditor } from './components/TimelineEditor.js';
import { useDeviceStore } from './stores/deviceStore.js';
import { useEffectStore } from './stores/effectStore.js';
import { useProfileStore } from './stores/profileStore.js';
import { usePaintStore } from './stores/paintStore.js';
import type { AnimType } from './stores/paintStore.js';
import { useHistoryStore } from './stores/historyStore.js';
import { useUIStore } from './stores/uiStore.js';
import { useMediaQuery } from './lib/useMediaQuery.js';
import { StatusBar } from './components/StatusBar.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Preset, Profile } from '@fizz/core';
import { ALL_ANIM_TYPES } from '@fizz/core';

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

  // Toast notification state
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, variant: 'success' | 'error' = 'success') => {
    setToast({ msg, variant });
  }, []);

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
    const unsubPerkey = window.fizz.subscribePerkeyChanged((state) => {
      hydrateFromPerkeyState(state);
    });

    // Initial hydrate: when GUI opens, sync to whatever the daemon is doing
    // right now (covers the CLI-changed-it-while-GUI-was-closed case).
    window.fizz.perkeyCurrent().then((state) => {
      if (state.mode !== 'off') hydrateFromPerkeyState(state);
    }).catch(() => { /* daemon offline; banner already shows it */ });

    return () => { unsubEffect(); unsubDevice(); unsubPerkey(); };
  }, [setCurrent, setDeviceStatus]);

  function hydrateFromPerkeyState(state: import('./types/window.js').PerkeyState) {
    if (state.mode === 'off') {
      // Don't touch activePresetId here — startPattern() in the daemon
      // emits a transient 'off' notification before the 'pattern' one
      // when restarting a stream, which would otherwise blow away the
      // user's active preset selection mid-transition. The activePresetId
      // is cleared explicitly when the user diverges via paint/reset/etc.
      return;
    }
    if (state.mode === 'static') {
      const next = new Map<number, string>();
      for (const [k, v] of Object.entries(state.colors)) next.set(Number(k), v);
      usePaintStore.setState({
        keyColors: next,
        animType: 'solid',
        mode: 'paint',
      });
      return;
    }
    // 'pattern'
    const next = new Map<number, string>();
    for (const [k, v] of Object.entries(state.pattern.keys)) next.set(Number(k), v);
    const validAnimTypes: readonly AnimType[] = ALL_ANIM_TYPES;
    const animType: AnimType = validAnimTypes.includes(state.pattern.animType as AnimType)
      ? (state.pattern.animType as AnimType)
      : 'solid';
    usePaintStore.setState({
      keyColors: next,
      animType,
      animSpeed: state.pattern.animSpeed,
      lastSequence: state.pattern.sequence ?? [],
      mode: 'paint',
    });
  }

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
      const validAnimTypes: readonly AnimType[] = ALL_ANIM_TYPES;
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

  // Window-level pointer-down probe so we can see if clicks reach the
  // renderer at all (independent of the 3D viewport raycast).
  useEffect(() => {
    const log = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      console.log('[window-click]', 'x=', e.clientX, 'y=', e.clientY, 'target=', target?.tagName, target?.className?.toString().slice(0, 40) ?? '');
    };
    window.addEventListener('pointerdown', log, true); // capture phase
    return () => window.removeEventListener('pointerdown', log, true);
  }, []);

  // Global keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo,
  // Ctrl+A select all (paint mode), Esc clear selection.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const snap = useHistoryStore.getState().undo();
        if (snap) {
          usePaintStore.getState().applySnapshot(snap);
          pushSnapshotToHardware(snap);
        }
        e.preventDefault();
      } else if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        const snap = useHistoryStore.getState().redo();
        if (snap) {
          usePaintStore.getState().applySnapshot(snap);
          pushSnapshotToHardware(snap);
        }
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'a' && usePaintStore.getState().mode === 'paint') {
        usePaintStore.getState().selectAll();
        e.preventDefault();
      } else if (e.key === 'Escape' && usePaintStore.getState().mode === 'paint') {
        usePaintStore.getState().clearSelection();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
          const validAnimTypes: readonly AnimType[] = ALL_ANIM_TYPES;
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
        console.log('[saveProfile] attempting:', name);
        try {
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
          console.log('[saveProfile] success:', updated.length, 'profiles');
          showToast(`Perfil "${name}" salvo`, 'success');
        } catch (err) {
          console.error('[saveProfile] error:', err);
          showToast(`Erro ao salvar: ${(err as Error).message}`, 'error');
        }
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
    // Stateful game animations (Pong/Snake/Tetris/etc.) generate colors at
    // runtime in the daemon — their pattern intentionally has empty keys.
    // Allow saving them as profile even when colors map is empty.
    const STATEFUL_GAME_TYPES = ['pong', 'snake', 'tetris', 'matrix-rain', 'breakout', 'fireworks', 'dvd', 'heart-rate', 'equalizer', 'rule30'];
    const isStatefulGame = STATEFUL_GAME_TYPES.includes(paintAnimType);
    if (colors.size === 0 && !isStatefulGame) {
      alert('No keys painted yet. Click keys in the 3D view to select, then "Paint selected", ou aplica um preset primeiro.');
      return;
    }
    promptForName(
      'Nome do padrão (pattern)',
      `pattern-${Date.now().toString().slice(-4)}`,
      async (name) => {
        if (!window.fizz) return;
        console.log('[savePattern] attempting:', name);
        try {
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
          console.log('[savePattern] success:', updated.length, 'profiles');
          showToast(`Padrão "${name}" salvo`, 'success');
        } catch (err) {
          console.error('[savePattern] error:', err);
          showToast(`Erro ao salvar padrão: ${(err as Error).message}`, 'error');
        }
      },
    );
  }

  // Suppress unused warning - setPaintKeyColors is held for future use
  void setPaintKeyColors;

  function pushSnapshotToHardware(snap: {
    keyColors: Map<number, string>;
    animType: string;
    animSpeed: number;
    lastSequence: number[];
  }) {
    if (!window.fizz) return;
    const colors: Record<string, string> = {};
    snap.keyColors.forEach((hex, idx) => { colors[String(idx)] = hex; });
    if (snap.animType === 'solid') {
      window.fizz.perkeySet(colors).catch(() => {});
    } else {
      window.fizz.perkeyStartPattern({
        keys: colors,
        animType: snap.animType as AnimType,
        animSpeed: snap.animSpeed,
        ...(snap.lastSequence.length > 0 ? { sequence: snap.lastSequence } : {}),
      }).catch(() => {});
    }
  }

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
      activePresetId: preset.id,
    });
    useHistoryStore.getState().push({
      keyColors: next,
      animType: preset.pattern.animType,
      animSpeed: preset.pattern.animSpeed,
      lastSequence: preset.pattern.sequence ?? [],
      activePresetId: preset.id,
    });

    console.log('[applyPreset]', preset.id, 'animType=', preset.pattern.animType, tintColor ? `tint=${tintColor}` : '');
    if (window.fizz) {
      const colors: Record<string, string> = {};
      next.forEach((hex, idx) => { colors[String(idx)] = hex; });
      if (preset.pattern.animType === 'solid') {
        console.log('[applyPreset] → perkeySet (solid)');
        try { await window.fizz.perkeySet(colors); } catch (err) { console.warn(err); }
      } else {
        const vibrancy = (preset.pattern as { vibrancy?: number }).vibrancy;
        console.log('[applyPreset] → perkeyStartPattern (animated)', preset.pattern.animType, vibrancy ? `vibrancy=${vibrancy}` : '');
        try {
          await window.fizz.perkeyStartPattern({
            keys: colors,
            animType: preset.pattern.animType as AnimType,
            animSpeed: preset.pattern.animSpeed,
            ...(preset.pattern.sequence != null ? { sequence: preset.pattern.sequence } : {}),
            ...(vibrancy !== undefined && vibrancy !== 1 ? { vibrancy } : {}),
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

  return <AppShell
    paintMode={paintMode}
    handleSavePattern={handleSavePattern}
    handleProfileActivate={handleProfileActivate}
    handleSaveProfile={handleSaveProfile}
    handleDeleteProfile={handleDeleteProfile}
    handleExportProfiles={handleExportProfiles}
    handleImportProfiles={handleImportProfiles}
    handleApplyPreset={handleApplyPreset}
    handleApply={handleApply}
    namePrompt={namePrompt}
    setNamePrompt={setNamePrompt}
    toast={toast}
    setToast={setToast}
  />;
}

interface AppShellProps {
  paintMode: 'effect' | 'paint';
  handleSavePattern: () => void;
  handleProfileActivate: (name: string) => void;
  handleSaveProfile: () => void;
  handleDeleteProfile: (name: string) => void;
  handleExportProfiles: () => void;
  handleImportProfiles: () => void;
  handleApplyPreset: (preset: Preset | UserPreset, tintColor?: string) => void;
  handleApply: () => void;
  namePrompt: { title: string; defaultValue: string; onConfirm: (name: string) => void } | null;
  setNamePrompt: (p: AppShellProps['namePrompt']) => void;
  toast: { msg: string; variant: 'success' | 'error' } | null;
  setToast: (t: AppShellProps['toast']) => void;
}

function AppShell(props: AppShellProps) {
  const {
    paintMode, handleSavePattern, handleProfileActivate, handleSaveProfile,
    handleDeleteProfile, handleExportProfiles, handleImportProfiles,
    handleApplyPreset, handleApply, namePrompt, setNamePrompt, toast, setToast,
  } = props;

  const isNarrow = useMediaQuery('(max-width: 1400px)');
  const leftCollapsed = useUIStore((s) => s.leftSidebarCollapsed) || isNarrow;
  const rightCollapsed = useUIStore((s) => s.rightSidebarCollapsed) || isNarrow;
  const toggleLeft = useUIStore((s) => s.toggleLeftSidebar);
  const toggleRight = useUIStore((s) => s.toggleRightSidebar);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      <Header />
      <ConnectionBanner />
      <div className="flex flex-1 overflow-hidden">
        {leftCollapsed ? (
          <div className="flex flex-col items-center border-r border-zinc-800 bg-zinc-950/50">
            <button
              type="button"
              onClick={toggleLeft}
              className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
              aria-label="Expand effects sidebar"
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col relative">
            <button
              type="button"
              onClick={toggleLeft}
              className="absolute top-1 right-1 z-10 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition"
              aria-label="Collapse effects sidebar"
              title="Collapse"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <EffectSidebar />
            <ProfileSidebar
              onActivate={handleProfileActivate}
              onSaveNew={handleSaveProfile}
              onDelete={handleDeleteProfile}
              onExport={handleExportProfiles}
              onImport={handleImportProfiles}
            />
          </div>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          {paintMode === 'paint' && <PaintToolbar onSavePattern={handleSavePattern} />}
          <Keyboard3D />
        </div>
        {rightCollapsed ? (
          <div className="flex flex-col items-center border-l border-zinc-800 bg-zinc-950/50">
            <button
              type="button"
              onClick={toggleRight}
              className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
              aria-label="Expand right sidebar"
              title="Expand sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="relative h-full">
            <button
              type="button"
              onClick={toggleRight}
              className="absolute top-1 left-1 z-10 p-1 rounded hover:bg-zinc-800/80 text-zinc-500 hover:text-zinc-200 transition"
              aria-label="Collapse right sidebar"
              title="Collapse"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {paintMode === 'paint' ? (
              <PresetGallery onApply={handleApplyPreset} />
            ) : (
              <ParametersPanel onApply={handleApply} />
            )}
          </div>
        )}
      </div>
      {paintMode === 'paint' && <TimelineEditor />}
      <StatusBar />
      {namePrompt && (
        <NamePromptModal
          title={namePrompt.title}
          defaultValue={namePrompt.defaultValue}
          onConfirm={namePrompt.onConfirm}
          onCancel={() => setNamePrompt(null)}
        />
      )}
      {toast && (
        <Toast
          message={toast.msg}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
