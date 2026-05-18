import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { K617_LAYOUT } from '@fizz/core';
import type { KeyDef } from '@fizz/core';
import { useEffectStore } from '../stores/effectStore.js';
import { computeKeyColor } from './keyColors.js';

const UNIT = 1.0; // keycap base size (1u)
const GAP = 0.08; // gap between keycaps
const KEY_HEIGHT = 0.45;

interface PositionedKey extends KeyDef {
  x: number;
  z: number;
  scaleX: number;
}

function buildPositionedKeys(): PositionedKey[] {
  // Center the layout around origin
  const keys: PositionedKey[] = K617_LAYOUT.keys.map((k) => ({
    ...k,
    x: (k.col + k.width / 2) * (UNIT + GAP) * 0.5,
    z: k.row * (UNIT + GAP),
    scaleX: k.width,
  }));
  // Re-center: shift by mid X and mid Z
  const minX = Math.min(...keys.map((k) => k.x - (k.scaleX * (UNIT + GAP)) / 4));
  const maxX = Math.max(...keys.map((k) => k.x + (k.scaleX * (UNIT + GAP)) / 4));
  const midX = (minX + maxX) / 2;
  const minZ = Math.min(...keys.map((k) => k.z));
  const maxZ = Math.max(...keys.map((k) => k.z));
  const midZ = (minZ + maxZ) / 2;
  return keys.map((k) => ({ ...k, x: k.x - midX, z: k.z - midZ }));
}

export function Keyboard3D() {
  return (
    <div className="flex-1 m-6 rounded-2xl overflow-hidden border border-zinc-800 bg-gradient-to-br from-zinc-950 to-zinc-900">
      <Canvas
        shadows
        camera={{ position: [0, 9, 11], fov: 35 }}
        gl={{ antialias: true, toneMappingExposure: 1.1 }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#0a0a0e']} />
          <fog attach="fog" args={['#0a0a0e', 18, 30]} />
          <ambientLight intensity={0.25} />
          <directionalLight
            position={[6, 10, 4]}
            intensity={1.6}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-6, 6, -4]} intensity={0.6} color="#aaaaff" />
          <Environment preset="city" environmentIntensity={0.35} />

          {/* Subtle ground for shadow */}
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -KEY_HEIGHT, 0]}>
            <planeGeometry args={[30, 30]} />
            <shadowMaterial opacity={0.4} />
          </mesh>

          <KeyboardKeys />

          <OrbitControls
            enablePan={false}
            minPolarAngle={0.15}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={8}
            maxDistance={18}
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

function KeyboardKeys() {
  const keys = useMemo(() => buildPositionedKeys(), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const selected = useEffectStore((s) => s.selected);
  const solidColor = useEffectStore((s) => s.solidColor);
  const draftParams = useEffectStore((s) => s.draftParams);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    keys.forEach((k, i) => {
      dummy.position.set(k.x, 0, k.z);
      dummy.scale.set(k.scaleX * (UNIT + GAP) * 0.5 * 0.9, 1, 0.9);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      const rgb = computeKeyColor({
        selected,
        solidColor,
        draftColor: typeof draftParams.color === 'string' ? draftParams.color : undefined,
        keyIndex: i,
        keyCount: keys.length,
        time: t,
      });
      color.setRGB(rgb.r, rgb.g, rgb.b);
      meshRef.current!.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, keys.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, KEY_HEIGHT, 1]} />
      <meshStandardMaterial
        emissive="#ffffff"
        emissiveIntensity={2}
        roughness={0.35}
        metalness={0.05}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
