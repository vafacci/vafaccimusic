/**
 * Stadium LED entity — denser depth, fresnel rim, drop punch, flash shockwave.
 * Form stays; wow lives in light, rim, and camera-facing pop.
 */

export const particleEntityVertexShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uLoud;
uniform float uSection;
uniform float uFlash;
uniform float uDeform;
uniform float uNoiseScale;
uniform float uMorphSpeed;
uniform float uAudio;
uniform float uBassInf;
uniform float uMidInf;
uniform float uTrebleInf;
uniform float uPlaying;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uLayer;
uniform sampler2D uWaveform;

varying float vDisplace;
varying float vEnergy;
varying float vLayer;
varying float vWave;
varying float vFace;
varying float vDepth;
varying float vFlash;
varying float vSection;
varying float vFresnel;
varying vec3 vLedDir;

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

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.07 + vec3(1.7, 9.2, 2.3);
    a *= 0.5;
  }
  return v;
}

float sampleWave(float u) {
  return texture2D(uWaveform, vec2(fract(u), 0.5)).r * 2.0 - 1.0;
}

void main() {
  float bass = uBass * uBassInf * uAudio * uPlaying;
  float mid = uMid * uMidInf * uAudio * uPlaying;
  float treble = uTreble * uTrebleInf * uAudio * uPlaying;
  float energy = uEnergy * uAudio * uPlaying;
  float loud = clamp(uLoud * uAudio * uPlaying, 0.0, 1.0);
  float section = clamp(uSection * uPlaying, 0.0, 1.0);
  float flash = clamp(uFlash * uPlaying, 0.0, 1.0);

  // Hard gate: no music energy → almost no music motion (1:1 silence)
  float gate = smoothstep(0.02, 0.16, loud);
  float amp = pow(loud, 1.15) * gate;
  // Bass owns body; mids own waveform carve; section only opens a little
  float body = bass * (0.55 + amp * 0.7);
  float carve = mid * (0.4 + amp * 0.9);
  amp *= mix(0.85, 1.15, section);
  amp += flash * 0.35;

  float t = uTime * uMorphSpeed * mix(0.12, 0.28, gate);

  vec3 p = position;
  vec3 n = normalize(position);

  p.z *= 1.08 + body * 0.04 + flash * 0.025;
  p.x *= 1.03;
  p.y *= 0.97;
  n = normalize(p);

  vec3 q = p * uNoiseScale;
  q += (0.26 + carve * 0.1) * vec3(
    fbm(q + vec3(t * 0.18, 0.0, 0.0)),
    fbm(q + vec3(5.2, t * 0.14, 1.3)),
    fbm(q + vec3(1.7, 9.2, -t * 0.12))
  );

  float ridges = fbm(q);
  // Quiet = calm silhouette; music replaces idle when gated open
  float idle = (ridges - 0.42) * mix(0.52, 0.22, gate);

  float theta = atan(n.z, n.x);
  float lat = length(vec2(n.x, n.z));
  float wu = theta * 0.15915494309 + 0.5;
  float belt = smoothstep(0.0, 0.32, lat) * (1.0 - abs(n.y) * 0.5);

  float wave = sampleWave(wu);
  float waveFine = sampleWave(wu * 2.0 + 0.02) * carve * 0.55;

  // Waveform only when there is signal — no ghost ripples in silence
  float audioWave = (wave * 0.42 + waveFine * 0.14) * amp * belt;
  float kick = sin(lat * 10.0 - uTime * (1.2 + body * 2.2)) * body * 0.11;
  audioWave += kick;

  float shock = sin(lat * 14.0 - flash * 8.0) * exp(-flash * 3.2) * flash;
  audioWave += shock * 0.12;

  float displace = (idle + audioWave) * uDeform;
  displace += step(1.5, uLayer) * 0.05 * mix(0.4, 1.0, gate);

  float crest = max(wave, 0.0) * amp * belt;

  vec3 pos = p + n * displace;
  pos *= 1.0 + body * 0.035 + flash * 0.045 - uLayer * 0.015;

  vec3 viewN = normalize(mat3(modelViewMatrix) * n);
  float face = pow(max(viewN.z, 0.0), 1.25);
  float fresnel = pow(1.0 - max(viewN.z, 0.0), 2.4);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float pop =
    face * (0.08 + crest * 0.2 + amp * 0.12 + body * 0.1 + flash * 0.12)
    + fresnel * 0.03
    - uLayer * 0.02;
  mv.z += pop;

  gl_Position = projectionMatrix * mv;

  float layerSize = mix(1.0, 1.45, smoothstep(1.2, 2.0, uLayer));
  float size = uPointSize * uPixelRatio
    * (1.0 - uLayer * 0.12)
    * layerSize
    * (1.0 + crest * 0.35 + face * 0.3 + amp * 0.12 + flash * 0.28 + treble * gate * 0.1);
  size *= (290.0 / max(-mv.z, 0.18));
  gl_PointSize = clamp(size, 0.7, 38.0);

  vDisplace = displace;
  vEnergy = energy;
  vLayer = uLayer;
  vWave = wave * amp * belt * uPlaying;
  vFace = face;
  vDepth = clamp((-mv.z - 2.0) / 3.6, 0.0, 1.0);
  vFlash = flash;
  vSection = section;
  vFresnel = fresnel;
  vLedDir = normalize(pos);
}
`;

export const particleEntityFragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uColorValley;
uniform vec3 uColorMid;
uniform vec3 uColorPeak;
uniform float uPlaying;
uniform float uLoud;
uniform float uLedStrength;

varying float vDisplace;
varying float vEnergy;
varying float vLayer;
varying float vWave;
varying float vFace;
varying float vDepth;
varying float vFlash;
varying float vSection;
varying float vFresnel;
varying vec3 vLedDir;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;

  // Tight laser core + wider stage bloom (aura layers bloom more)
  float bloomAmt = 0.5 + vFlash * 0.75 + vLayer * 0.2;
  float core = exp(-d * d * mix(7.2, 3.2, smoothstep(1.2, 2.0, vLayer)));
  float bloom = exp(-d * d * 1.35) * bloomAmt;
  float soft = core + bloom;
  if (soft < 0.009) discard;

  float loud = clamp(uLoud * uPlaying, 0.0, 1.0);
  float h = clamp(vDisplace * 1.2 + 0.3 + max(vWave, 0.0) * 0.6, 0.0, 1.0);

  // Thermal posterize: blue → green → yellow bridge → hot red
  float tCold = smoothstep(0.0, 0.3, h);
  float tBridge = smoothstep(0.32, 0.55, h);
  float tHot = pow(smoothstep(0.48, 0.9, h), 1.1);
  vec3 col = mix(uColorValley, uColorMid, tCold);
  vec3 hotBridge = mix(uColorMid, uColorPeak, 0.42);
  col = mix(col, hotBridge, tBridge);
  col = mix(col, uColorPeak, tHot);

  float crest = smoothstep(0.06, 0.5, vWave);
  col = mix(col, uColorPeak, crest * 0.62);

  float sectionGain = mix(0.48, 1.0, vSection);
  float front = 0.52 + vFace * 0.78;
  float atmosphere = mix(1.0, 0.24, vDepth);
  float stage = (0.78 + loud * 0.38 + crest * 0.32 + vEnergy * 0.16) * sectionGain;
  col *= stage * front * atmosphere;
  col *= 1.0 - vLayer * 0.12;

  col += uColorMid * vFresnel * (0.22 + vSection * 0.28 + loud * 0.18);
  col += uColorPeak * pow(vFace, 3.2) * (0.14 + crest * 0.28 + loud * 0.14);
  col += uColorPeak * core * pow(vFace, 2.2) * (0.1 + crest * 0.22);
  col += col * bloom * (0.18 + loud * 0.14);

  // Keep thermal chroma — stop additive core from washing to white
  float peak = max(col.r, max(col.g, col.b));
  col *= peak > 1.25 ? (1.25 / peak) : 1.0;

  float ember = step(0.94, fract(sin(dot(vLedDir.xy, vec2(12.9898, 78.233))) * 43758.5453));
  col += uColorPeak * ember * crest * vFace * 0.35;

  // Stadium LED panel
  float ledAmt = clamp(uLedStrength, 0.0, 1.0);
  float ledU = atan(vLedDir.z, vLedDir.x);
  float ledV = asin(clamp(vLedDir.y, -1.0, 1.0));
  float dens = 40.0;
  vec2 cell = vec2(
    fract(ledU * dens * 0.31831),
    fract(ledV * dens * 0.45)
  );
  float seam = 0.09;
  float pixel =
    smoothstep(0.0, seam, cell.x) * smoothstep(0.0, seam, 1.0 - cell.x) *
    smoothstep(0.0, seam, cell.y) * smoothstep(0.0, seam, 1.0 - cell.y);
  float grid = mix(0.76, 1.12, pixel);
  float scan = 0.92 + 0.08 * sin(ledV * 110.0 + uTime * 1.8);
  float sub = sin(ledU * dens * 3.0) * 0.5 + 0.5;
  vec3 rgbShift = mix(vec3(1.03, 0.97, 1.0), vec3(0.97, 1.0, 1.04), sub);
  float ledMix = ledAmt * (0.5 + vFace * 0.5) * (0.7 + vSection * 0.3);
  col *= mix(1.0, grid * scan, ledMix);
  col *= mix(vec3(1.0), rgbShift, ledMix * 0.4 * pixel);

  // Flash = thermal hot punch, not white sear
  vec3 flashCol = mix(uColorMid, uColorPeak, 0.55);
  col = mix(col, flashCol * 1.25, vFlash * 0.4);
  col += flashCol * core * vFlash * 0.55;

  float alpha = soft;
  alpha *= (0.48 + smoothstep(0.1, 0.9, h) * 0.42 + crest * 0.5 + vFace * 0.28 + vFresnel * 0.2);
  alpha *= mix(1.15, 0.35, vDepth);
  alpha *= mix(1.0, 0.55, smoothstep(1.3, 2.0, vLayer));
  alpha *= mix(0.72, 1.08, vSection);
  alpha *= mix(1.0, 0.86 + pixel * 0.18, ledMix * 0.65);
  alpha = clamp(alpha * (0.92 + loud * 0.4 + vFlash * 0.55), 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`;
