/**
 * Forside particle entity — stadium LED look.
 * Tuned for presence / wow without losing the silhouette.
 */
export const lab01Config = {
  background: "#000000",
  camera: {
    position: [0, 0.14, 4.25] as [number, number, number],
    mobileZ: 5.45,
    fov: 50,
    lerp: 0.055,
    lookAtY: 0.24,
  },
  entity: {
    deform: 1.28,
    noiseScale: 1.52,
    morphSpeed: 1.2,
    audioSensitivity: 1.18,
    bassInfluence: 0.62,
    midInfluence: 0.95,
    trebleInfluence: 0.78,
    pointSize: 0.052,
    scale: 0.74,
    mobileScale: 0.52,
    offsetY: 0.3,
    // Thermal / night-vision ramp: cold blue → NV green → hot orange-red
    colorValley: "#0a4cff",
    colorMid: "#1aff6a",
    colorPeak: "#ff2a00",
    ledStrength: 0.55,
  },
};
