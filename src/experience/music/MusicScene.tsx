"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { MusicAtmosphere } from "./MusicAtmosphere";

/** Sparse particle veil over the dark CSS atmosphere. */
export function MusicScene() {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5], fov: 40, near: 0.1, far: 40 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;
      }}
    >
      <Suspense fallback={null}>
        <MusicAtmosphere />
      </Suspense>
    </Canvas>
  );
}
