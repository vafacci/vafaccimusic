"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { WAVEFORM_SIZE } from "@/experience/audio/AudioAnalyzer";
import { liveBands, liveWaveform, useAudioStore } from "@/experience/audio/audioStore";
import { lab01Config } from "./config";
import { liveShow } from "./liveShow";
import { readShowMobile, subscribeShowMobile } from "./showMobile";
import {
  particleEntityFragmentShader,
  particleEntityVertexShader,
} from "./shaders/particleEntityShaders";

const QUALITY = {
  desktop: { outer: 15000, inner: 5600, aura: 2800 },
  mobile: { outer: 9500, inner: 3600, aura: 1600 },
} as const;

const waveTexData = new Uint8Array(WAVEFORM_SIZE);
const waveTexture = new THREE.DataTexture(
  waveTexData,
  WAVEFORM_SIZE,
  1,
  THREE.RedFormat,
);
waveTexture.minFilter = THREE.LinearFilter;
waveTexture.magFilter = THREE.LinearFilter;
waveTexture.wrapS = THREE.RepeatWrapping;
waveTexture.wrapT = THREE.ClampToEdgeWrapping;
waveTexture.needsUpdate = true;

/** Smoothed bands for rendering — separate from raw analyzer output. */
const displayBands = {
  bass: 0,
  mid: 0,
  treble: 0,
  energy: 0,
  loud: 0,
  section: 0,
  flash: 0,
  playing: 0,
};

/** Even sphere packing — avoids unfinished lat/long stripe look. */
function createFibonacciSphere(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const i3 = i * 3;
    positions[i3] = Math.cos(theta) * r * radius;
    positions[i3 + 1] = y * radius;
    positions[i3 + 2] = Math.sin(theta) * r * radius;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geo;
}

function ParticleLayer({
  count,
  radius,
  layer,
}: {
  count: number;
  radius: number;
  layer: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();

  const geometry = useMemo(
    () => createFibonacciSphere(count, radius),
    [count, radius],
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uEnergy: { value: 0 },
      uLoud: { value: 0 },
      uSection: { value: 0 },
      uFlash: { value: 0 },
      uDeform: { value: lab01Config.entity.deform },
      uNoiseScale: { value: lab01Config.entity.noiseScale },
      uMorphSpeed: { value: lab01Config.entity.morphSpeed },
      uAudio: { value: lab01Config.entity.audioSensitivity },
      uBassInf: { value: lab01Config.entity.bassInfluence },
      uMidInf: { value: lab01Config.entity.midInfluence },
      uTrebleInf: { value: lab01Config.entity.trebleInfluence },
      uPlaying: { value: 0 },
      uPointSize: { value: lab01Config.entity.pointSize },
      uPixelRatio: { value: 1 },
      uLayer: { value: layer },
      uWaveform: { value: waveTexture },
      uLedStrength: { value: lab01Config.entity.ledStrength },
      uColorValley: { value: new THREE.Color(lab01Config.entity.colorValley) },
      uColorMid: { value: new THREE.Color(lab01Config.entity.colorMid) },
      uColorPeak: { value: new THREE.Color(lab01Config.entity.colorPeak) },
    }),
    [layer],
  );

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) return;

    // Parent group pushes smoothed audio via shared liveBands;
    // each layer reads config + bands locally for simplicity.
    const cfg = lab01Config.entity;

    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uBass.value = displayBands.bass;
    material.uniforms.uMid.value = displayBands.mid;
    material.uniforms.uTreble.value = displayBands.treble;
    material.uniforms.uEnergy.value = displayBands.energy;
    material.uniforms.uLoud.value = displayBands.loud;
    material.uniforms.uSection.value = displayBands.section;
    material.uniforms.uFlash.value = displayBands.flash;
    material.uniforms.uPlaying.value = displayBands.playing;
    material.uniforms.uDeform.value = cfg.deform;
    material.uniforms.uNoiseScale.value = cfg.noiseScale;
    material.uniforms.uMorphSpeed.value = cfg.morphSpeed;
    material.uniforms.uAudio.value = cfg.audioSensitivity;
    material.uniforms.uBassInf.value = cfg.bassInfluence;
    material.uniforms.uMidInf.value = cfg.midInfluence;
    material.uniforms.uTrebleInf.value = cfg.trebleInfluence;
    material.uniforms.uPointSize.value = cfg.pointSize;
    material.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);
    material.uniforms.uLedStrength.value = cfg.ledStrength;
    material.uniforms.uColorValley.value.set(cfg.colorValley);
    material.uniforms.uColorMid.value.set(cfg.colorMid);
    material.uniforms.uColorPeak.value.set(cfg.colorPeak);
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={particleEntityVertexShader}
        fragmentShader={particleEntityFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * Reference-style particle music entity.
 * Music drives form — no hover / pointer interaction.
 */
export function ParticleEntity() {
  const groupRef = useRef<THREE.Group>(null);
  const smoothed = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    loud: 0,
    section: 0,
    flash: 0,
    playing: 0,
  });
  const showRef = useRef({
    prevBass: 0,
    prevLoud: 0,
    lastFlashAt: -10,
  });
  const isMobile = useSyncExternalStore(
    subscribeShowMobile,
    readShowMobile,
    () => false,
  );

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const playing = useAudioStore.getState().status === "playing" ? 1 : 0;
    const dt = Math.min(delta, 0.05);
    const s = smoothed.current;
    const show = showRef.current;

    // Fast attack / faster release — silence collapses, hits land 1:1
    const follow = (cur: number, next: number, up: number, down: number) =>
      cur + (next - cur) * (next > cur ? up : down);

    s.playing = follow(s.playing, playing, 0.25, 0.1);
    s.bass = follow(s.bass, liveBands.bass, 0.55, 0.32);
    s.mid = follow(s.mid, liveBands.mid, 0.48, 0.3);
    s.treble = follow(s.treble, liveBands.treble, 0.5, 0.34);
    s.energy = follow(s.energy, liveBands.energy, 0.45, 0.3);

    let wavePeak = 0;
    let waveSum = 0;
    for (let i = 0; i < WAVEFORM_SIZE; i++) {
      const sample = liveWaveform[i] ?? 0;
      const abs = Math.abs(sample);
      if (abs > wavePeak) wavePeak = abs;
      waveSum += abs;
      waveTexData[i] = Math.round((sample * 0.5 + 0.5) * 255);
    }
    waveTexture.needsUpdate = true;

    const waveRms = waveSum / WAVEFORM_SIZE;
    // Loudness tracks real signal — no floor that keeps it “always on”
    const rawLoud =
      playing === 0
        ? 0
        : Math.min(
            1,
            s.bass * 0.45 +
              s.mid * 0.3 +
              s.energy * 0.25 +
              wavePeak * 0.55 +
              waveRms * 0.7,
          );
    s.loud = follow(s.loud, rawLoud, 0.5, 0.35);

    // Section follows bass+loud honestly
    const sectionTarget =
      playing === 0
        ? 0
        : Math.min(1, s.bass * 0.65 + s.loud * 0.55);
    s.section = follow(s.section, sectionTarget, 0.22, 0.18);

    // Magenta punch on bass onset — not white wash
    const bassOnset = s.bass - show.prevBass;
    const flashReady = clock.elapsedTime - show.lastFlashAt > 0.28;
    if (playing && flashReady && bassOnset > 0.11 && s.bass > 0.32) {
      s.flash = 0.85;
      show.lastFlashAt = clock.elapsedTime;
    } else {
      s.flash = Math.max(0, s.flash - dt * 11);
    }
    show.prevBass = s.bass;
    show.prevLoud = s.loud;

    liveShow.section = s.section;
    liveShow.flash = s.flash;

    displayBands.playing = s.playing;
    displayBands.bass = s.bass;
    displayBands.mid = s.mid;
    displayBands.treble = s.treble;
    displayBands.energy = s.energy;
    displayBands.loud = s.loud;
    displayBands.section = s.section;
    displayBands.flash = s.flash;

    const spin = 0.02 + s.mid * 0.08 + s.loud * 0.06;
    group.rotation.y += spin * dt;
    group.rotation.x = THREE.MathUtils.damp(
      group.rotation.x,
      Math.sin(clock.elapsedTime * 0.09) * 0.08 + s.bass * 0.1,
      3.5,
      dt,
    );
    group.rotation.z = THREE.MathUtils.damp(
      group.rotation.z,
      Math.sin(clock.elapsedTime * 0.07) * 0.03 + s.mid * 0.04,
      3.5,
      dt,
    );

    const base = isMobile
      ? lab01Config.entity.mobileScale
      : lab01Config.entity.scale;
    const targetScale = base * (1 + s.bass * 0.08 + s.flash * 0.06);
    const scale = THREE.MathUtils.damp(group.scale.x, targetScale, 6, dt);
    group.scale.setScalar(scale);

    const targetZ = s.bass * 0.14 + s.loud * 0.08 + s.flash * 0.1;
    group.position.z = THREE.MathUtils.damp(group.position.z, targetZ, 5, dt);
    group.position.y = lab01Config.entity.offsetY;
  });

  const quality = isMobile ? QUALITY.mobile : QUALITY.desktop;

  return (
    <group ref={groupRef} position={[0, lab01Config.entity.offsetY, 0]}>
      <ParticleLayer count={quality.aura} radius={1.28} layer={2} />
      <ParticleLayer count={quality.outer} radius={1.08} layer={0} />
      <ParticleLayer count={quality.inner} radius={0.8} layer={1} />
    </group>
  );
}
