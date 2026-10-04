"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { liveBands, useAudioStore } from "@/experience/audio/audioStore";
import { liveShow } from "./liveShow";

/**
 * Sparse stadium haze — depth behind the LED form.
 * Cheap particle field that wakes on drop/flash.
 */
export function AtmosphereDust({ count = 900 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const mat = useRef<THREE.PointsMaterial>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 1.6 + Math.random() * 2.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const i3 = i * 3;
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[i3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  useFrame(({ clock }, delta) => {
    const points = ref.current;
    const material = mat.current;
    if (!points || !material) return;

    const playing = useAudioStore.getState().status === "playing" ? 1 : 0;
    const energy = liveBands.energy * playing;
    const section = liveShow.section;
    const flash = liveShow.flash;

    points.rotation.y += delta * (0.02 + section * 0.04);
    points.rotation.x = Math.sin(clock.elapsedTime * 0.07) * 0.08;

    const targetOpacity =
      0.02 + energy * 0.2 * playing + section * 0.08 + flash * 0.12;
    material.opacity = THREE.MathUtils.damp(
      material.opacity,
      targetOpacity,
      6,
      delta,
    );
    material.size = 0.014 + energy * 0.01 + flash * 0.008;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        ref={mat}
        color="#0ecf7a"
        size={0.02}
        transparent
        depthWrite={false}
        opacity={0.1}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
