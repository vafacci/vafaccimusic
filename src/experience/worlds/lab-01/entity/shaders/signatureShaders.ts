import { sharedEntityMath } from "./sharedEntityMath";

export const coreVertexShader = /* glsl */ `
${sharedEntityMath}
varying float vFresnel;
varying vec3 vNormalW;

void main() {
  vec3 pos = entityPosition(position);
  vec3 n = normalize(normalMatrix * normalize(position));
  vNormalW = n;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec3 viewDir = normalize(-mv.xyz);
  vFresnel = pow(1.0 - max(dot(viewDir, normalize(normalMatrix * normalize(pos))), 0.0), 2.4);
  gl_Position = projectionMatrix * mv;
}
`;

export const coreFragmentShader = /* glsl */ `
uniform vec3 uColorCore;
uniform vec3 uColorViolet;
uniform float uEnergy;
uniform float uPlaying;
uniform float uExposure;

varying float vFresnel;
varying vec3 vNormalW;

void main() {
  float rim = smoothstep(0.15, 0.95, vFresnel);
  vec3 col = uColorCore;
  col = mix(col, uColorViolet * 0.35, rim * (0.25 + uEnergy * 0.2 * uPlaying));
  col *= uExposure * 0.55;
  float alpha = 0.92 - rim * 0.15;
  gl_FragColor = vec4(col, alpha);
}
`;

export const membraneVertexShader = /* glsl */ `
${sharedEntityMath}
varying float vFresnel;
varying float vWave;
varying vec3 vView;

void main() {
  vec3 nObj = normalize(position);
  float d = entityDisplace(nObj, uTime);
  vec3 pos = entityWarp(position + nObj * d * 1.05);
  float press = 1.0 + uBass * uBassInf * uAudio * uPlaying * 0.035;
  pos *= press;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = normalize(-mv.xyz);
  vec3 n = normalize(normalMatrix * nObj);
  vFresnel = pow(1.0 - max(dot(vView, n), 0.0), 2.2);
  float theta = atan(nObj.z, nObj.x);
  vWave = abs(sampleWave(theta * 0.15915494309 + 0.5));
  gl_Position = projectionMatrix * mv;
}
`;

export const membraneFragmentShader = /* glsl */ `
uniform vec3 uColorSteel;
uniform vec3 uColorViolet;
uniform vec3 uColorAmber;
uniform vec3 uColorRose;
uniform float uMembraneOpacity;
uniform float uFresnelPower;
uniform float uEdgeIntensity;
uniform float uAmber;
uniform float uViolet;
uniform float uBlue;
uniform float uEnergy;
uniform float uBass;
uniform float uPlaying;
uniform float uExposure;
uniform float uKickAge;

varying float vFresnel;
varying float vWave;
varying vec3 vView;

void main() {
  float fres = pow(clamp(vFresnel, 0.0, 1.0), uFresnelPower * 0.35 + 0.65);
  float edge = fres * uEdgeIntensity;

  vec3 col = uColorSteel * (0.15 * uBlue);
  col = mix(col, uColorViolet * uViolet, fres * 0.55);
  col = mix(col, uColorRose, vWave * 0.25 * uPlaying);
  col += uColorAmber * uAmber * (edge * 0.55 + vWave * 0.2 + uBass * 0.12 * uPlaying);
  col += uColorAmber * exp(-uKickAge * 3.0) * uBass * 0.25 * uPlaying;

  float alpha = uMembraneOpacity * (0.35 + edge * 0.75 + uEnergy * 0.12 * uPlaying);
  alpha = clamp(alpha, 0.02, 0.55);
  col *= uExposure;

  gl_FragColor = vec4(col, alpha);
}
`;

export const filamentVertexShader = /* glsl */ `
${sharedEntityMath}
attribute float aOffset;
varying float vGlow;
varying float vAlong;

void main() {
  vec3 nObj = normalize(position);
  float d = entityDisplace(nObj, uTime);
  // Filaments ride slightly outside the membrane
  vec3 pos = entityWarp(position + nObj * (d + 0.02 + aOffset * 0.015));
  pos *= 1.0 + uBass * uBassInf * uAudio * uPlaying * 0.03;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float treble = uTreble * uTrebleInf * uAudio * uPlaying;
  vAlong = aOffset;
  vGlow = 0.35 + treble * 0.45 + uEnergy * uEnergyInf * uAudio * uPlaying * 0.25
    + exp(-uKickAge * 2.5) * uBass * 0.35 * uPlaying;
}
`;

export const filamentFragmentShader = /* glsl */ `
uniform vec3 uColorAmber;
uniform vec3 uColorSteel;
uniform vec3 uColorViolet;
uniform float uFilamentBrightness;
uniform float uExposure;
uniform float uPlaying;

varying float vGlow;
varying float vAlong;

void main() {
  vec3 col = mix(uColorSteel, uColorAmber, smoothstep(0.2, 0.9, vGlow));
  col = mix(col, uColorViolet, 0.2 * (1.0 - vAlong));
  col *= uFilamentBrightness * uExposure * (0.55 + vGlow * 0.7);
  float alpha = (0.15 + vGlow * 0.55) * mix(0.7, 1.0, uPlaying);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
}
`;

export const shellVertexShader = /* glsl */ `
${sharedEntityMath}
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uLayer;

varying float vHeight;
varying float vGlow;
varying float vFres;

void main() {
  vec3 nObj = normalize(position);
  float d = entityDisplace(nObj, uTime);
  vec3 pos = entityWarp(position + nObj * (d - uLayer * 0.04));
  pos *= 1.0 + uBass * uBassInf * uAudio * uPlaying * 0.028 - uLayer * 0.03;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float treble = uTreble * uTrebleInf * uAudio * uPlaying;
  float energy = uEnergy * uEnergyInf * uAudio * uPlaying;
  float crest = abs(sampleWave(atan(nObj.z, nObj.x) * 0.15915494309 + 0.5));

  vHeight = d;
  vGlow = crest * uPlaying + treble * 0.5 + energy * 0.25
    + exp(-uKickAge * 2.8) * uBass * 0.4 * uPlaying;
  vFres = pow(1.0 - abs(nObj.y), 1.4);

  float size = uPointSize * uPixelRatio
    * (1.0 - uLayer * 0.3)
    * (1.0 + treble * 0.35 + vGlow * 0.25);
  size *= (260.0 / max(-mv.z, 0.1));
  gl_PointSize = clamp(size, 0.8, 28.0);
}
`;

export const shellFragmentShader = /* glsl */ `
uniform vec3 uColorValley;
uniform vec3 uColorSteel;
uniform vec3 uColorAmber;
uniform vec3 uColorViolet;
uniform float uAmber;
uniform float uViolet;
uniform float uBlue;
uniform float uExposure;
uniform float uPlaying;
uniform float uLayer;

varying float vHeight;
varying float vGlow;
varying float vFres;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float dist = length(c);
  if (dist > 0.5) discard;

  float alpha = pow(1.0 - smoothstep(0.0, 0.5, dist), 1.65);
  float h = clamp(vHeight * 1.2 + 0.4 + vGlow * 0.25, 0.0, 1.0);

  vec3 col = mix(uColorValley, uColorSteel * uBlue, smoothstep(0.1, 0.55, h));
  col = mix(col, uColorViolet * uViolet, vFres * 0.35);
  col = mix(col, uColorAmber * uAmber, smoothstep(0.45, 1.0, vGlow));
  col *= uExposure * (0.55 + vGlow * 0.55 + uPlaying * 0.08);
  col *= 1.0 - uLayer * 0.25;

  alpha *= (0.35 + vGlow * 0.4 + vFres * 0.2) * (1.0 - uLayer * 0.3);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

export const atmosphereVertexShader = /* glsl */ `
${sharedEntityMath}
uniform float uPointSize;
uniform float uPixelRatio;
attribute float aSeed;

varying float vAlpha;

void main() {
  float t = uTime * (0.08 + aSeed * 0.05);
  vec3 p = position;
  p += vec3(
    sin(t + aSeed * 6.0) * 0.08,
    cos(t * 0.7 + aSeed) * 0.05,
    sin(t * 0.9 + aSeed * 3.0) * 0.08
  );
  float energy = uEnergy * uEnergyInf * uAudio * uPlaying;
  p *= 1.0 + energy * 0.04;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uPointSize * 0.45 * uPixelRatio * (0.6 + aSeed);
  size *= (220.0 / max(-mv.z, 0.1));
  gl_PointSize = clamp(size, 0.5, 10.0);
  vAlpha = 0.08 + energy * 0.12 + uTreble * uTrebleInf * uAudio * uPlaying * 0.08;
}
`;

export const atmosphereFragmentShader = /* glsl */ `
uniform vec3 uColorSteel;
uniform vec3 uColorAmber;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (length(c) > 0.5) discard;
  float a = (1.0 - smoothstep(0.0, 0.5, length(c))) * vAlpha;
  vec3 col = mix(uColorSteel, uColorAmber, 0.35);
  gl_FragColor = vec4(col, a);
}
`;
