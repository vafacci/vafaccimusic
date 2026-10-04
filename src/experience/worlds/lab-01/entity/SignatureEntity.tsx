"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { WAVEFORM_SIZE } from "@/experience/audio/AudioAnalyzer";
import {
  liveBands,
  liveWaveform,
  useAudioStore,
} from "@/experience/audio/audioStore";
import { lab01Config } from "../config";
import {
  atmosphereFragmentShader,
  atmosphereVertexShader,
  coreFragmentShader,
  coreVertexShader,
  filamentFragmentShader,
  filamentVertexShader,
  membraneFragmentShader,
  membraneVertexShader,
  shellFragmentShader,
  shellVertexShader,
} from "./shaders/signatureShaders";

type Quality = typeof lab01Config.quality.mobile;

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

/** Shared smoothed audio + kick age for all layers. */
const audio = {
  bass: 0,
  mid: 0,
  treble: 0,
  energy: 0,
  peak: 0,
  playing: 0,
  kickAge: 10,
  pointerX: 0,
  pointerY: 0,
};

function follow(cur: number, next: number, up: number, down: number) {
  return cur + (next - cur) * (next > cur ? up : down);
}

function createFibonacciSphere(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(count - 1, 1)) * 2;
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

function createFilamentGeometry(curves: number, segments: number) {
  const positions: number[] = [];
  const offsets: number[] = [];

  for (let c = 0; c < curves; c++) {
    const lat = ((c / curves) * 2 - 1) * 0.85;
    const radius = Math.sqrt(Math.max(0.05, 1 - lat * lat));
    const phase = (c / curves) * Math.PI * 2;
    for (let s = 0; s < segments; s++) {
      const t0 = (s / segments) * Math.PI * 2;
      const t1 = ((s + 1) / segments) * Math.PI * 2;
      const a0 = t0 + phase * 0.15;
      const a1 = t1 + phase * 0.15;
      const yWobble = Math.sin(t0 * 3.0 + phase) * 0.04;
      positions.push(
        Math.cos(a0) * radius,
        lat + yWobble,
        Math.sin(a0) * radius,
        Math.cos(a1) * radius,
        lat + Math.sin(t1 * 3.0 + phase) * 0.04,
        Math.sin(a1) * radius,
      );
      offsets.push(s / segments, (s + 1) / segments);
    }
  }

  // Meridian filaments for vertical ridges
  const meridians = Math.max(6, Math.floor(curves * 0.45));
  for (let m = 0; m < meridians; m++) {
    const ang = (m / meridians) * Math.PI * 2;
    for (let s = 0; s < segments; s++) {
      const v0 = (s / segments) * Math.PI - Math.PI / 2;
      const v1 = ((s + 1) / segments) * Math.PI - Math.PI / 2;
      const r0 = Math.cos(v0);
      const r1 = Math.cos(v1);
      positions.push(
        Math.cos(ang) * r0,
        Math.sin(v0),
        Math.sin(ang) * r0,
        Math.cos(ang) * r1,
        Math.sin(v1),
        Math.sin(ang) * r1,
      );
      offsets.push(s / segments, (s + 1) / segments);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
  );
  geo.setAttribute(
    "aOffset",
    new THREE.Float32BufferAttribute(new Float32Array(offsets), 1),
  );
  return geo;
}

function createAtmosphere(count: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = 1.55 + Math.random() * 0.85;
    const i3 = i * 3;
    positions[i3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i3 + 1] = Math.cos(phi) * r * 0.65;
    positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  return geo;
}

type ArtParams = {
  deform: number;
  lobeStrength: number;
  lobeCount: number;
  waveFrequency: number;
  asymmetry: number;
  morphSpeed: number;
  audioSensitivity: number;
  bassInfluence: number;
  midInfluence: number;
  trebleInfluence: number;
  energyInfluence: number;
  membraneOpacity: number;
  fresnelPower: number;
  edgeIntensity: number;
  filamentBrightness: number;
  filamentFlow: number;
  pointSize: number;
  amberIntensity: number;
  violetIntensity: number;
  blueIntensity: number;
  exposure: number;
  pointerInfluence: number;
};

function useArtDirection(): ArtParams {
  const e = lab01Config.entity;
  return useControls("Signature Entity", {
    deform: { value: e.deform, min: 0.2, max: 1.6, step: 0.01 },
    lobeStrength: { value: e.lobeStrength, min: 0, max: 0.55, step: 0.01 },
    lobeCount: { value: e.lobeCount, min: 4, max: 14, step: 1 },
    waveFrequency: { value: e.waveFrequency, min: 2, max: 12, step: 0.1 },
    asymmetry: { value: e.asymmetry, min: 0, max: 0.5, step: 0.01 },
    morphSpeed: { value: e.morphSpeed, min: 0.1, max: 1.5, step: 0.01 },
    audioSensitivity: {
      value: e.audioSensitivity,
      min: 0.4,
      max: 1.8,
      step: 0.01,
    },
    bassInfluence: { value: e.bassInfluence, min: 0, max: 1.5, step: 0.01 },
    midInfluence: { value: e.midInfluence, min: 0, max: 1.5, step: 0.01 },
    trebleInfluence: {
      value: e.trebleInfluence,
      min: 0,
      max: 1.5,
      step: 0.01,
    },
    energyInfluence: {
      value: e.energyInfluence,
      min: 0,
      max: 1.5,
      step: 0.01,
    },
    membraneOpacity: {
      value: e.membraneOpacity,
      min: 0.05,
      max: 0.5,
      step: 0.01,
    },
    fresnelPower: { value: e.fresnelPower, min: 1, max: 5, step: 0.05 },
    edgeIntensity: { value: e.edgeIntensity, min: 0.2, max: 2.2, step: 0.01 },
    filamentBrightness: {
      value: e.filamentBrightness,
      min: 0.2,
      max: 1.6,
      step: 0.01,
    },
    filamentFlow: { value: e.filamentFlow, min: 0.1, max: 2, step: 0.01 },
    pointSize: { value: e.pointSize, min: 0.02, max: 0.12, step: 0.001 },
    amberIntensity: {
      value: e.amberIntensity,
      min: 0,
      max: 1.8,
      step: 0.01,
    },
    violetIntensity: {
      value: e.violetIntensity,
      min: 0,
      max: 1.8,
      step: 0.01,
    },
    blueIntensity: { value: e.blueIntensity, min: 0, max: 1.8, step: 0.01 },
    exposure: { value: e.exposure, min: 0.5, max: 1.8, step: 0.01 },
    pointerInfluence: {
      value: e.pointerInfluence,
      min: 0,
      max: 0.6,
      step: 0.01,
    },
  });
}

function baseUniforms() {
  const e = lab01Config.entity;
  return {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uEnergy: { value: 0 },
    uPeak: { value: 0 },
    uPlaying: { value: 0 },
    uKickAge: { value: 10 },
    uDeform: { value: e.deform },
    uLobeStrength: { value: e.lobeStrength },
    uLobeCount: { value: e.lobeCount },
    uWaveFreq: { value: e.waveFrequency },
    uAsymmetry: { value: e.asymmetry },
    uMorphSpeed: { value: e.morphSpeed },
    uAudio: { value: e.audioSensitivity },
    uBassInf: { value: e.bassInfluence },
    uMidInf: { value: e.midInfluence },
    uTrebleInf: { value: e.trebleInfluence },
    uEnergyInf: { value: e.energyInfluence },
    uPointerX: { value: 0 },
    uPointerY: { value: 0 },
    uPointerInf: { value: e.pointerInfluence },
    uWaveform: { value: waveTexture },
  };
}

function pushCommon(
  material: THREE.ShaderMaterial,
  art: ArtParams,
  clockTime: number,
) {
  const u = material.uniforms;
  u.uTime.value = clockTime * (0.7 + art.filamentFlow * 0.3);
  u.uBass.value = audio.bass;
  u.uMid.value = audio.mid;
  u.uTreble.value = audio.treble;
  u.uEnergy.value = audio.energy;
  u.uPeak.value = audio.peak;
  u.uPlaying.value = audio.playing;
  u.uKickAge.value = audio.kickAge;
  u.uDeform.value = art.deform;
  u.uLobeStrength.value = art.lobeStrength;
  u.uLobeCount.value = art.lobeCount;
  u.uWaveFreq.value = art.waveFrequency;
  u.uAsymmetry.value = art.asymmetry;
  u.uMorphSpeed.value = art.morphSpeed;
  u.uAudio.value = art.audioSensitivity;
  u.uBassInf.value = art.bassInfluence;
  u.uMidInf.value = art.midInfluence;
  u.uTrebleInf.value = art.trebleInfluence;
  u.uEnergyInf.value = art.energyInfluence;
  u.uPointerX.value = audio.pointerX;
  u.uPointerY.value = audio.pointerY;
  u.uPointerInf.value = art.pointerInfluence;
  u.uWaveform.value = waveTexture;
}

function CoreLayer({ art }: { art: ArtParams }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      ...baseUniforms(),
      uColorCore: { value: new THREE.Color(lab01Config.entity.colorCore) },
      uColorViolet: { value: new THREE.Color(lab01Config.entity.colorViolet) },
      uExposure: { value: art.exposure },
    }),
    [art.exposure],
  );

  useFrame(({ clock }) => {
    if (!mat.current) return;
    pushCommon(mat.current, art, clock.elapsedTime);
    mat.current.uniforms.uExposure.value = art.exposure;
    mat.current.uniforms.uColorCore.value.set(lab01Config.entity.colorCore);
    mat.current.uniforms.uColorViolet.value.set(lab01Config.entity.colorViolet);
  });

  return (
    <mesh>
      <icosahedronGeometry args={[0.72, 3]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={coreVertexShader}
        fragmentShader={coreFragmentShader}
        transparent
        depthWrite
        blending={THREE.NormalBlending}
      />
    </mesh>
  );
}

function MembraneLayer({
  art,
  detail,
  scale = 1,
}: {
  art: ArtParams;
  detail: number;
  scale?: number;
}) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      ...baseUniforms(),
      uColorSteel: { value: new THREE.Color(lab01Config.entity.colorSteel) },
      uColorViolet: { value: new THREE.Color(lab01Config.entity.colorViolet) },
      uColorAmber: { value: new THREE.Color(lab01Config.entity.colorAmber) },
      uColorRose: { value: new THREE.Color(lab01Config.entity.colorRose) },
      uMembraneOpacity: { value: art.membraneOpacity },
      uFresnelPower: { value: art.fresnelPower },
      uEdgeIntensity: { value: art.edgeIntensity },
      uAmber: { value: art.amberIntensity },
      uViolet: { value: art.violetIntensity },
      uBlue: { value: art.blueIntensity },
      uExposure: { value: art.exposure },
    }),
    [art],
  );

  useFrame(({ clock }) => {
    if (!mat.current) return;
    pushCommon(mat.current, art, clock.elapsedTime);
    const u = mat.current.uniforms;
    u.uMembraneOpacity.value = art.membraneOpacity * (scale > 1 ? 0.7 : 1);
    u.uFresnelPower.value = art.fresnelPower;
    u.uEdgeIntensity.value = art.edgeIntensity;
    u.uAmber.value = art.amberIntensity;
    u.uViolet.value = art.violetIntensity;
    u.uBlue.value = art.blueIntensity;
    u.uExposure.value = art.exposure;
  });

  return (
    <mesh scale={scale}>
      <icosahedronGeometry args={[1.0, detail]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={membraneVertexShader}
        fragmentShader={membraneFragmentShader}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function FilamentLayer({ art, curves }: { art: ArtParams; curves: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => createFilamentGeometry(curves, 48), [curves]);
  const uniforms = useMemo(
    () => ({
      ...baseUniforms(),
      uColorAmber: { value: new THREE.Color(lab01Config.entity.colorAmber) },
      uColorSteel: { value: new THREE.Color(lab01Config.entity.colorSteel) },
      uColorViolet: { value: new THREE.Color(lab01Config.entity.colorViolet) },
      uFilamentBrightness: { value: art.filamentBrightness },
      uExposure: { value: art.exposure },
    }),
    [art.filamentBrightness, art.exposure],
  );

  useFrame(({ clock }) => {
    if (!mat.current) return;
    pushCommon(mat.current, art, clock.elapsedTime);
    mat.current.uniforms.uFilamentBrightness.value = art.filamentBrightness;
    mat.current.uniforms.uExposure.value = art.exposure;
  });

  return (
    <lineSegments geometry={geometry}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={filamentVertexShader}
        fragmentShader={filamentFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

function ShellParticles({
  art,
  count,
  radius,
  layer,
}: {
  art: ArtParams;
  count: number;
  radius: number;
  layer: number;
}) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const geometry = useMemo(
    () => createFibonacciSphere(count, radius),
    [count, radius],
  );
  const uniforms = useMemo(
    () => ({
      ...baseUniforms(),
      uPointSize: { value: art.pointSize },
      uPixelRatio: { value: 1 },
      uLayer: { value: layer },
      uColorValley: { value: new THREE.Color(lab01Config.entity.colorValley) },
      uColorSteel: { value: new THREE.Color(lab01Config.entity.colorSteel) },
      uColorAmber: { value: new THREE.Color(lab01Config.entity.colorAmber) },
      uColorViolet: { value: new THREE.Color(lab01Config.entity.colorViolet) },
      uAmber: { value: art.amberIntensity },
      uViolet: { value: art.violetIntensity },
      uBlue: { value: art.blueIntensity },
      uExposure: { value: art.exposure },
    }),
    [art, layer],
  );

  useFrame(({ clock }) => {
    if (!mat.current) return;
    pushCommon(mat.current, art, clock.elapsedTime);
    mat.current.uniforms.uPointSize.value = art.pointSize;
    mat.current.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 1.5);
    mat.current.uniforms.uAmber.value = art.amberIntensity;
    mat.current.uniforms.uViolet.value = art.violetIntensity;
    mat.current.uniforms.uBlue.value = art.blueIntensity;
    mat.current.uniforms.uExposure.value = art.exposure;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={shellVertexShader}
        fragmentShader={shellFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function AtmosphereLayer({ art, count }: { art: ArtParams; count: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const geometry = useMemo(() => createAtmosphere(count), [count]);
  const uniforms = useMemo(
    () => ({
      ...baseUniforms(),
      uPointSize: { value: art.pointSize },
      uPixelRatio: { value: 1 },
      uColorSteel: { value: new THREE.Color(lab01Config.entity.colorSteel) },
      uColorAmber: { value: new THREE.Color(lab01Config.entity.colorAmber) },
    }),
    [art.pointSize],
  );

  useFrame(({ clock }) => {
    if (!mat.current) return;
    pushCommon(mat.current, art, clock.elapsedTime);
    mat.current.uniforms.uPointSize.value = art.pointSize;
    mat.current.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 1.5);
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={atmosphereVertexShader}
        fragmentShader={atmosphereFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * Lab 01.3 signature entity — layered membrane / filament / particle form.
 * Music propagates as spatial waves; pointer is optional and subtle.
 */
export function SignatureEntity() {
  const group = useRef<THREE.Group>(null);
  const art = useArtDirection();
  const { viewport, pointer } = useThree();
  const kickClock = useRef(0);
  const prevBass = useRef(0);
  const smoothed = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    peak: 0,
    playing: 0,
    px: 0,
    py: 0,
  });

  const isMobile = viewport.aspect < 0.75 || viewport.width < 3.6;
  const quality: Quality = isMobile
    ? lab01Config.quality.mobile
    : lab01Config.quality.desktop;

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;

    const playing = useAudioStore.getState().status === "playing" ? 1 : 0;
    const dt = Math.min(delta, 0.05);
    const s = smoothed.current;

    let peak = 0;
    for (let i = 0; i < WAVEFORM_SIZE; i++) {
      const v = Math.abs(liveWaveform[i] ?? 0);
      if (v > peak) peak = v;
      waveTexData[i] = Math.round(((liveWaveform[i] ?? 0) * 0.5 + 0.5) * 255);
    }
    waveTexture.needsUpdate = true;

    s.playing = follow(s.playing, playing, 0.14, 0.05);
    s.bass = follow(s.bass, liveBands.bass, 0.28, 0.09);
    s.mid = follow(s.mid, liveBands.mid, 0.18, 0.1);
    s.treble = follow(s.treble, liveBands.treble, 0.24, 0.12);
    s.energy = follow(s.energy, liveBands.energy, 0.16, 0.09);
    s.peak = follow(s.peak, peak, 0.4, 0.1);

    // Kick onset → start outward wave
    if (playing && s.bass - prevBass.current > 0.085 && s.bass > 0.22) {
      kickClock.current = clock.elapsedTime;
    }
    prevBass.current = s.bass;

    audio.bass = s.bass;
    audio.mid = s.mid;
    audio.treble = s.treble;
    audio.energy = s.energy;
    audio.peak = s.peak;
    audio.playing = s.playing;
    audio.kickAge = Math.min(clock.elapsedTime - kickClock.current, 10);

    // Subtle pointer — works without it
    const targetX = pointer.x * art.pointerInfluence;
    const targetY = pointer.y * art.pointerInfluence;
    s.px = THREE.MathUtils.damp(s.px, targetX, 2.2, dt);
    s.py = THREE.MathUtils.damp(s.py, targetY, 2.2, dt);
    audio.pointerX = s.px;
    audio.pointerY = s.py;

    g.rotation.y += (0.03 + s.mid * 0.04 * s.playing) * dt;
    g.rotation.x = THREE.MathUtils.damp(
      g.rotation.x,
      s.py * 0.35 + Math.sin(clock.elapsedTime * 0.08) * 0.06,
      2,
      dt,
    );
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -s.px * 0.2, 2, dt);

    const base = isMobile
      ? lab01Config.entity.mobileScale
      : lab01Config.entity.scale;
    // Pressure, not hard uniform bounce
    const targetScale = base * (1 + s.bass * 0.035 * s.playing);
    const sc = THREE.MathUtils.damp(g.scale.x, targetScale, 3.5, dt);
    g.scale.setScalar(sc);
  });

  return (
    <group ref={group} position={[0, lab01Config.entity.offsetY, 0]}>
      <CoreLayer art={art} />
      <MembraneLayer art={art} detail={quality.membraneDetail} />
      {quality.dualMembrane ? (
        <MembraneLayer art={art} detail={quality.membraneDetail} scale={1.06} />
      ) : null}
      <FilamentLayer art={art} curves={quality.filaments} />
      <ShellParticles
        art={art}
        count={quality.shellParticles}
        radius={1.02}
        layer={0}
      />
      <ShellParticles
        art={art}
        count={quality.innerParticles}
        radius={0.78}
        layer={1}
      />
      {quality.atmosphere > 0 ? (
        <AtmosphereLayer art={art} count={quality.atmosphere} />
      ) : null}
    </group>
  );
}
