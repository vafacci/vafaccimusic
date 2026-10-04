/**
 * Shared GLSL — organic lobes + outward-propagating audio waves.
 * Used by core / membrane / filaments / particle shell.
 */
export const sharedEntityMath = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uPeak;
uniform float uPlaying;
uniform float uKickAge;
uniform float uDeform;
uniform float uLobeStrength;
uniform float uLobeCount;
uniform float uWaveFreq;
uniform float uAsymmetry;
uniform float uMorphSpeed;
uniform float uAudio;
uniform float uBassInf;
uniform float uMidInf;
uniform float uTrebleInf;
uniform float uEnergyInf;
uniform float uPointerX;
uniform float uPointerY;
uniform float uPointerInf;
uniform sampler2D uWaveform;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float sampleWave(float u) {
  return texture2D(uWaveform, vec2(fract(u), 0.5)).r * 2.0 - 1.0;
}

/** Wide ovoid — reference silhouette (horizontal waveform body). */
vec3 entityWarp(vec3 p) {
  p.x *= 1.18;
  p.y *= 0.72;
  p.z *= 1.05;
  return p;
}

/**
 * Displacement along normal. Calm when quiet; spatial waves when music earns it.
 */
float entityDisplace(vec3 n, float t) {
  float bass = uBass * uBassInf * uAudio * uPlaying;
  float mid = uMid * uMidInf * uAudio * uPlaying;
  float treble = uTreble * uTrebleInf * uAudio * uPlaying;
  float energy = uEnergy * uEnergyInf * uAudio * uPlaying;
  float peak = uPeak * uAudio * uPlaying;

  float theta = atan(n.z, n.x);
  float phi = asin(clamp(n.y, -1.0, 1.0));
  float breathT = t * uMorphSpeed * (0.35 + energy * 0.25);

  // Soft organic lobes — waveform ridges, not a perfect sphere
  float lobes = sin(theta * uLobeCount + uAsymmetry) * cos(phi * 2.2);
  lobes += 0.45 * sin(theta * (uLobeCount * 0.5) - phi * 1.4);
  float ridge = sin(phi * uWaveFreq + breathT * 0.8) * cos(theta * 2.0);

  float idle =
    (lobes * uLobeStrength + ridge * 0.1)
    * mix(1.0, 0.75, uPlaying)
    + (noise(n * 2.4 + breathT * 0.15) - 0.5) * 0.04;

  // Real waveform wrapped on equator belt
  float wu = theta * 0.15915494309 + 0.5;
  float wave = sampleWave(wu) * (0.04 + mid * 0.05);

  // Kick: pressure at center → travels outward (radial phase delay)
  float radial = acos(clamp(abs(n.y), 0.0, 1.0)); // 0 at poles… use lateral radius
  float lat = length(vec2(n.x, n.z));
  float kickPhase = lat * 9.0 - uKickAge * 7.5;
  float kickEnv = exp(-uKickAge * 2.2) * smoothstep(0.0, 0.35, uKickAge + 0.05);
  float kickWave = sin(kickPhase) * kickEnv * bass * 0.16;

  // Mid current — membrane twist / flow (not whole-surface shake)
  float flow =
    sin(theta * 3.0 + breathT * (1.1 + mid * 2.0) + phi * 2.5)
    * (0.02 + mid * 0.055);
  flow += sin(lat * 10.0 - breathT * (1.4 + mid * 2.2)) * mid * 0.03;

  // Treble micro — edges only
  float micro = (noise(n * 14.0 + t * (2.0 + treble * 3.0)) - 0.5) * treble * 0.028;

  // Subtle pointer bias
  float pointer =
    (n.x * uPointerX + n.y * uPointerY) * uPointerInf * 0.04;

  float music = (wave + kickWave + flow + micro + peak * 0.02) * uPlaying;

  return (idle + music) * uDeform + pointer;
}

vec3 entityPosition(vec3 p) {
  vec3 n = normalize(p);
  float d = entityDisplace(n, uTime);
  vec3 pos = entityWarp(p + n * d);
  // Soft pressure expansion on bass — not uniform scale punch
  float press = 1.0 + uBass * uBassInf * uAudio * uPlaying * 0.04 * (0.6 + length(vec2(n.x, n.z)));
  return pos * press;
}
`;
