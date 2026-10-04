"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { PointLight } from "three";
import { liveBands, useAudioStore } from "@/experience/audio/audioStore";
import { liveShow } from "@/experience/worlds/lab-01/liveShow";

/** Stage keys — follow bands 1:1, collapse in silence. */
export function Lighting() {
  const magenta = useRef<PointLight>(null);
  const amber = useRef<PointLight>(null);
  const fill = useRef<PointLight>(null);

  useFrame(() => {
    const playing = useAudioStore.getState().status === "playing" ? 1 : 0;
    const { bass, energy, mid } = liveBands;
    const section = liveShow.section * playing;
    const flash = liveShow.flash * playing;

    if (magenta.current) {
      magenta.current.intensity =
        0.12 + bass * 0.9 * playing + section * 0.35 + flash * 0.55;
    }
    if (amber.current) {
      amber.current.intensity =
        0.06 + mid * 0.55 * playing + energy * 0.25 * playing + flash * 0.35;
    }
    if (fill.current) {
      fill.current.intensity = 0.05 + energy * 0.3 * playing + flash * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.06} />
      <pointLight
        ref={magenta}
        color="#1aff6a"
        position={[-1.4, 0.6, 2.2]}
        intensity={0.15}
        distance={12}
        decay={2}
      />
      <pointLight
        ref={amber}
        color="#ff4a14"
        position={[1.6, -0.2, 2.0]}
        intensity={0.1}
        distance={12}
        decay={2}
      />
      <pointLight
        ref={fill}
        color="#0a4cff"
        position={[0, 1.4, -1.5]}
        intensity={0.1}
        distance={14}
        decay={2}
      />
    </>
  );
}
