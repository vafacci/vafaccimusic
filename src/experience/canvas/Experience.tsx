"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { useAudioStore } from "@/experience/audio/audioStore";
import { Lab01World } from "@/experience/worlds/lab-01/Lab01World";
import { lab01Config } from "@/experience/worlds/lab-01/config";
import { liveShow } from "@/experience/worlds/lab-01/liveShow";
import { CameraRig } from "./CameraRig";
import { CanvasBridge } from "./CanvasBridge";
import { Lighting } from "./Lighting";

function BandSync() {
  const syncBands = useAudioStore((state) => state.syncBands);

  useFrame(() => {
    syncBands();
  });

  return null;
}

/** Film-grade output — ACES + high DPR, not low-res game particles. */
function RenderQuality() {
  const { gl } = useThree();

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.setClearColor(lab01Config.background, 1);
  }, [gl]);

  useFrame(() => {
    // Tiny lift on energy only — no white flash wash
    gl.toneMappingExposure = 1.0 + liveShow.section * 0.06 + liveShow.flash * 0.08;
  });

  return null;
}

type ExperienceProps = {
  /**
   * `signature` = same entity, tighter camera framing for a shorter viewport crop.
   * Does not change geometry, materials, colors, or particle density.
   */
  frame?: "full" | "signature";
};

export function Experience({ frame = "full" }: ExperienceProps) {
  const zScale = frame === "signature" ? 0.78 : 1;
  const engine = useAudioStore((state) => state.engine);

  // Analysis only while the visual lab is mounted — keeps /music on native
  // HTMLAudioElement so lock-screen / background playback can continue.
  useEffect(() => {
    engine.setAnalysisEnabled(true);
    return () => engine.setAnalysisEnabled(false);
  }, [engine]);

  return (
    <Canvas
      className="h-full w-full touch-none"
      dpr={[1, 2]}
      camera={{
        position: lab01Config.camera.position,
        fov: lab01Config.camera.fov,
        near: 0.1,
        far: 40,
      }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
        // Needed to freeze a clean still for Stories share
        preserveDrawingBuffer: true,
      }}
    >
      <color attach="background" args={[lab01Config.background]} />
      <fog attach="fog" args={[lab01Config.background, 3.8, 12]} />
      <Suspense fallback={null}>
        <RenderQuality />
        <CanvasBridge />
        <BandSync />
        <Lighting />
        <CameraRig zScale={zScale} />
        <Lab01World />
      </Suspense>
    </Canvas>
  );
}
