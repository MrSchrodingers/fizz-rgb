import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, RoundedBox } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { K617_LAYOUT } from '@fizz/core';
import type { KeyDef } from '@fizz/core';
import { useEffectStore } from '../stores/effectStore.js';
import { usePaintStore } from '../stores/paintStore.js';
import { useHistoryStore } from '../stores/historyStore.js';
import { computeKeyColor } from './keyColors.js';

const UNIT = 1.0;
const GAP = 0.08;
const KEY_HEIGHT = 0.45;
const KEY_PITCH = UNIT + GAP;

interface PositionedKey extends KeyDef {
  x: number;
  z: number;
  bodyWidth: number;
}

// Short label per key for the 3D text overlay
const KEY_LABEL: Record<string, string> = {
  Escape: 'Esc',
  Minus: '-',
  Equal: '=',
  Backspace: '⌫',
  Tab: 'Tab',
  LBracket: '[',
  RBracket: ']',
  Backslash: '\\',
  CapsLock: 'Caps',
  Semicolon: ';',
  Quote: "'",
  Enter: '↵',
  LShift: '⇧',
  RShift: '⇧',
  Comma: ',',
  Period: '.',
  Slash: '/',
  LCtrl: 'Ctrl',
  RCtrl: 'Ctrl',
  LSuper: '◆',
  LAlt: 'Alt',
  RAlt: 'Alt',
  Space: '',
  Fn: 'Fn',
  Menu: '☰',
};

function labelFor(name: string): string {
  if (KEY_LABEL[name] !== undefined) return KEY_LABEL[name];
  return name;
}

function buildPositionedKeys(): PositionedKey[] {
  const keys: PositionedKey[] = K617_LAYOUT.keys.map((k) => ({
    ...k,
    x: (k.col + k.width / 2) * KEY_PITCH,
    z: k.row * KEY_PITCH,
    bodyWidth: k.width * KEY_PITCH - GAP,
  }));
  const minX = Math.min(...keys.map((k) => k.x - k.bodyWidth / 2));
  const maxX = Math.max(...keys.map((k) => k.x + k.bodyWidth / 2));
  const midX = (minX + maxX) / 2;
  const minZ = Math.min(...keys.map((k) => k.z - UNIT / 2));
  const maxZ = Math.max(...keys.map((k) => k.z + UNIT / 2));
  const midZ = (minZ + maxZ) / 2;
  return keys.map((k) => ({ ...k, x: k.x - midX, z: k.z - midZ }));
}

const HELP_SHOWN_KEY = 'fizz-3d-help-shown';

export function Keyboard3D() {
  const directPaintMode = usePaintStore((s) => s.directPaintMode);
  const [showHelp, setShowHelp] = useState(() => !localStorage.getItem(HELP_SHOWN_KEY));

  function dismissHelp() {
    setShowHelp(false);
    try { localStorage.setItem(HELP_SHOWN_KEY, '1'); } catch { /* ignore */ }
  }

  return (
    <div className="relative flex-1 m-6 rounded-2xl overflow-hidden border border-zinc-800 bg-gradient-to-br from-zinc-950 to-zinc-900 min-h-0">
      <Canvas
        camera={{ position: [0, 13, 16], fov: 32 }}
        gl={{ antialias: true }}
        shadows
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#0a0a0e']} />
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[6, 12, 6]}
            intensity={0.8}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-6, 6, -4]} intensity={0.3} color="#aaaaff" />
          <KeyboardKeys />
          <OrbitControls
            enablePan={false}
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI / 2.3}
            minDistance={10}
            maxDistance={30}
            target={[0, 0, 0]}
            enableRotate={!directPaintMode}
          />
          <EffectComposer>
            <Bloom intensity={0.6} luminanceThreshold={0.2} luminanceSmoothing={0.4} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      {showHelp && (
        <div className="absolute top-3 left-3 right-3 sm:right-auto sm:max-w-sm bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-lg p-3 text-xs text-zinc-300 shadow-xl animate-fade-in">
          <div className="flex items-start gap-2">
            <div className="flex-1 leading-relaxed">
              <p className="font-medium text-zinc-100 mb-1">Atalhos do viewport</p>
              <ul className="space-y-0.5 text-zinc-400">
                <li>• Drag → rotacionar câmera</li>
                <li>• Scroll → zoom</li>
                <li>• Click numa tecla → selecionar (Shift+click pra multi)</li>
                <li>• <span className="text-fuchsia-300">Drag-paint ligado</span> → click+arrasta pinta direto</li>
                <li>• <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-[10px] font-mono">Ctrl+Z</kbd> undo · <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-[10px] font-mono">Ctrl+A</kbd> all · <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-[10px] font-mono">Esc</kbd> clear</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={dismissHelp}
              className="text-zinc-500 hover:text-zinc-200 transition px-1"
              aria-label="Dismiss help"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {directPaintMode && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-fuchsia-500/20 border border-fuchsia-500/60 text-fuchsia-100 text-xs px-3 py-1.5 rounded-full backdrop-blur shadow-lg pointer-events-none">
          ✏️ Drag-paint ativo — click+arrasta pra pintar
        </div>
      )}
    </div>
  );
}

function KeyboardKeys() {
  const keys = useMemo(() => buildPositionedKeys(), []);

  const selected = useEffectStore((s) => s.selected);
  const solidColor = useEffectStore((s) => s.solidColor);
  const draftParams = useEffectStore((s) => s.draftParams);

  const paintMode = usePaintStore((s) => s.mode);
  const paintSelected = usePaintStore((s) => s.selected);
  const keyColors = usePaintStore((s) => s.keyColors);
  const toggleKey = usePaintStore((s) => s.toggleKey);
  const paintKey = usePaintStore((s) => s.paintKey);
  const eraseKey = usePaintStore((s) => s.eraseKey);
  const directPaintMode = usePaintStore((s) => s.directPaintMode);
  const tapToTestMode = usePaintStore((s) => s.tapToTestMode);
  const animType = usePaintStore((s) => s.animType);
  const animSpeed = usePaintStore((s) => s.animSpeed);

  // Drag-paint state machine: when pointer is down, we paint every key we
  // enter until pointer-up. Track which keys we touched so we can push a
  // single history snapshot at the end and push the resulting frame to
  // hardware once instead of per-key.
  const isPainting = useRef(false);
  const touched = useRef<Set<number>>(new Set());
  const isErasing = useRef(false);

  useEffect(() => {
    function onPointerUp() {
      if (isPainting.current && touched.current.size > 0) {
        useHistoryStore.getState().push({
          keyColors: usePaintStore.getState().keyColors,
          animType: usePaintStore.getState().animType,
          animSpeed: usePaintStore.getState().animSpeed,
          lastSequence: usePaintStore.getState().lastSequence,
          activePresetId: usePaintStore.getState().activePresetId,
        });
        // Push the new pattern to hardware (only solid mode — animated mode
        // will re-stream on the user's next explicit toggle).
        const fresh = usePaintStore.getState();
        if (fresh.animType === 'solid' && window.fizz) {
          const colors: Record<string, string> = {};
          fresh.keyColors.forEach((hex, idx) => { colors[String(idx)] = hex; });
          window.fizz.perkeySet(colors).catch(() => {});
        }
      }
      isPainting.current = false;
      isErasing.current = false;
      touched.current = new Set();
    }
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, []);

  // Per-frame color computation — stored in state so each key receives its current color
  const [time, setTime] = useState(0);
  useFrame(({ clock }) => {
    setTime(clock.getElapsedTime());
  });

  const handlePointerDown = (ledIndex: number, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; button?: number }) => {
    if (paintMode !== 'paint') return;
    if (tapToTestMode && window.fizz) {
      // Flash the physical key for 250ms with the brush color, then revert
      // to whatever was there before. Lightweight test path.
      const before = keyColors.get(ledIndex);
      const colors: Record<string, string> = {};
      keyColors.forEach((hex, idx) => { colors[String(idx)] = hex; });
      colors[String(ledIndex)] = usePaintStore.getState().brushColor;
      window.fizz.perkeySet(colors).catch(() => {});
      setTimeout(() => {
        if (!window.fizz) return;
        const revert: Record<string, string> = {};
        keyColors.forEach((hex, idx) => { revert[String(idx)] = hex; });
        if (before === undefined) delete revert[String(ledIndex)];
        else revert[String(ledIndex)] = before;
        window.fizz.perkeySet(revert).catch(() => {});
      }, 250);
      return;
    }
    if (directPaintMode) {
      isPainting.current = true;
      // Alt-click or right-button → erase mode for this drag
      isErasing.current = e.altKey || e.button === 2;
      if (isErasing.current) {
        eraseKey(ledIndex);
      } else {
        paintKey(ledIndex);
      }
      touched.current.add(ledIndex);
      return;
    }
    toggleKey(ledIndex, e.shiftKey || e.metaKey || e.ctrlKey);
  };

  const handlePointerEnter = (ledIndex: number) => {
    if (!isPainting.current) return;
    if (touched.current.has(ledIndex)) return;
    touched.current.add(ledIndex);
    if (isErasing.current) eraseKey(ledIndex);
    else paintKey(ledIndex);
  };

  return (
    <group>
      {keys.map((k) => {
        const rgb = computeKeyColor({
          selected,
          solidColor,
          draftColor: typeof draftParams.color === 'string' ? draftParams.color : undefined,
          keyIndex: k.ledIndex,
          keyCount: keys.length,
          time,
          paintMode: paintMode === 'paint',
          keyColors,
          paintSelected,
          animType,
          animSpeed,
        });
        const isSelected = paintMode === 'paint' && paintSelected.has(k.ledIndex);
        return (
          <Key
            key={k.ledIndex}
            keyDef={k}
            colorRGB={rgb}
            isSelected={isSelected}
            onPointerDown={(e) => handlePointerDown(k.ledIndex, e)}
            onPointerEnter={() => handlePointerEnter(k.ledIndex)}
          />
        );
      })}
    </group>
  );
}

interface KeyProps {
  keyDef: PositionedKey;
  colorRGB: { r: number; g: number; b: number };
  isSelected: boolean;
  onPointerDown: (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; button?: number }) => void;
  onPointerEnter: () => void;
}

function Key({ keyDef, colorRGB, isSelected, onPointerDown, onPointerEnter }: KeyProps) {
  const [hovered, setHovered] = useState(false);
  const emissiveColor = useMemo(
    () => new THREE.Color(colorRGB.r, colorRGB.g, colorRGB.b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorRGB.r, colorRGB.g, colorRGB.b],
  );
  const label = labelFor(keyDef.name);
  const brightness = colorRGB.r * 0.3 + colorRGB.g * 0.6 + colorRGB.b * 0.1;
  const textColor = brightness > 0.5 ? '#0a0a0e' : '#e6e6ec';

  return (
    <group position={[keyDef.x, 0, keyDef.z]}>
      {/* Keycap body — RoundedBox for polished corners */}
      <RoundedBox
        args={[keyDef.bodyWidth, KEY_HEIGHT, UNIT]}
        radius={0.08}
        smoothness={3}
        castShadow
        receiveShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
          onPointerEnter();
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown({
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            button: e.button,
          });
        }}
      >
        <meshStandardMaterial
          color="#1a1a1f"
          emissive={emissiveColor}
          emissiveIntensity={1.4}
          roughness={0.55}
          metalness={0.1}
          toneMapped={false}
        />
      </RoundedBox>

      {/* Selection outline — wireframe slightly larger box */}
      {isSelected && (
        <mesh scale={[keyDef.bodyWidth * 1.05, 1.1, UNIT * 1.05]}>
          <boxGeometry args={[1, KEY_HEIGHT, 1]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.9} toneMapped={false} />
        </mesh>
      )}

      {/* Hover ring */}
      {hovered && !isSelected && (
        <mesh scale={[keyDef.bodyWidth * 1.02, 1.05, UNIT * 1.02]}>
          <boxGeometry args={[1, KEY_HEIGHT, 1]} />
          <meshBasicMaterial color="#888899" wireframe transparent opacity={0.4} toneMapped={false} />
        </mesh>
      )}

      {/* Label on top face. raycast={null} so clicks pass through to the
          keycap mesh underneath — otherwise the text label intercepts
          pointer events and selection silently fails. */}
      {label && (
        <Text
          position={[0, KEY_HEIGHT / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={keyDef.width >= 2 ? 0.22 : 0.28}
          color={textColor}
          anchorX="center"
          anchorY="middle"
          maxWidth={keyDef.bodyWidth * 0.9}
          raycast={() => null}
        >
          {label}
        </Text>
      )}
    </group>
  );
}
