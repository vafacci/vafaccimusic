"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Restrained industrial dust / ember field — supports the dark universe,
 * never dominates the playlist.
 */
export function MusicAtmosphere({ count = 160 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const drift = useRef(0);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Bias toward edges / depth — keep center clearer for reading
      const edge = Math.random() > 0.35;
      positions[i3] = edge
        ? (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 3.2)
        : (Math.random() - 0.5) * 2.4;
      positions[i3 + 1] = (Math.random() - 0.5) * 9;
      positions[i3 + 2] = -2 - Math.random() * 9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  useFrame((_, delta) => {
    if (!points.current) return;
    drift.current += delta * 0.012;
    points.current.rotation.y = drift.current * 0.35;
    points.current.position.y = Math.sin(drift.current * 0.6) * 0.08;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        color="#1aff6a"
        size={0.011}
        transparent
        opacity={0.11}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
