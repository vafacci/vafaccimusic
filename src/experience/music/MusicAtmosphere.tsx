"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

type Star = {
  x: number;
  y: number;
  z: number;
  speed: number;
  size: number;
};

/**
 * Quiet star rain behind the playlist — atmosphere only, never the show.
 */
export function MusicAtmosphere({ count = 180 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const stars = useRef<Star[]>([]);

  const geometry = useMemo(() => {
    const list: Star[] = [];
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const edge = Math.random() > 0.28;
      const x = edge
        ? (Math.random() > 0.5 ? 1 : -1) * (0.9 + Math.random() * 3.4)
        : (Math.random() - 0.5) * 2.2;
      const y = (Math.random() - 0.5) * 10;
      const z = -1.5 - Math.random() * 10;
      const star: Star = {
        x,
        y,
        z,
        speed: 0.16 + Math.random() * 0.38,
        size: 0.8 + Math.random() * 1.6,
      };
      list.push(star);
      const i3 = i * 3;
      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
    }

    stars.current = list;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  useFrame((_, delta) => {
    const pts = points.current;
    if (!pts) return;
    const attr = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < stars.current.length; i++) {
      const star = stars.current[i]!;
      star.y -= star.speed * delta;
      if (star.y < -5.2) {
        star.y = 5.2;
        star.x =
          Math.random() > 0.28
            ? (Math.random() > 0.5 ? 1 : -1) * (0.9 + Math.random() * 3.4)
            : (Math.random() - 0.5) * 2.2;
      }
      const i3 = i * 3;
      arr[i3] = star.x;
      arr[i3 + 1] = star.y;
      arr[i3 + 2] = star.z;
    }

    attr.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        color="#e8f0ff"
        size={0.028}
        transparent
        opacity={0.42}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
