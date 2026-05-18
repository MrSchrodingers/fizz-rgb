import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, RoundedBox } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { K617_LAYOUT } from '@fizz/core';
import type { KeyDef } from '@fizz/core';
import { useEffectStore } from '../stores/effectStore.js';
import { usePaintStore } from '../stores/paintStore.js';
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

export function Keyboard3D() {
  return (
    <div className="flex-1 m-6 rounded-2xl overflow-hidden border border-zinc-800 bg-gradient-to-br from-zinc-950 to-zinc-900 min-h-0">
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
          />
          <EffectComposer>
            <Bloom intensity={0.6} luminanceThreshold={0.2} luminanceSmoothing={0.4} />
          </EffectComposer>
        </Suspense>
      </Canvas>
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
  const animType = usePaintStore((s) => s.animType);
  const animSpeed = usePaintStore((s) => s.animSpeed);

  // Debug: log when paint state changes
  useEffect(() => {
    console.log('[KeyboardKeys] paintMode=', paintMode, 'selected.size=', paintSelected.size, 'keyColors.size=', keyColors.size);
  }, [paintMode, paintSelected, keyColors]);

  // Per-frame color computation — stored in state so each key receives its current color
  const [time, setTime] = useState(0);
  useFrame(({ clock }) => {
    setTime(clock.getElapsedTime());
  });

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
            onClick={(additive) => {
              if (paintMode !== 'paint') return;
              console.log('[Key click] ledIndex', k.ledIndex, 'additive', additive);
              toggleKey(k.ledIndex, additive);
            }}
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
  onClick: (additive: boolean) => void;
}

function Key({ keyDef, colorRGB, isSelected, onClick }: KeyProps) {
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
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick(e.shiftKey || e.metaKey || e.ctrlKey);
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
