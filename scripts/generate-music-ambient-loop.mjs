#!/usr/bin/env node
/**
 * Generate a seamless dark ambient loop for /music background.
 *
 * All motion is periodic over the loop (phase 0 === phase 2π),
 * so frame 0 matches frame N and the cut is invisible.
 *
 * Usage:
 *   node scripts/generate-music-ambient-loop.mjs
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "videos");

// Render at mid-res for quality/size balance, upscale to deliverable
const RENDER_W = 720;
const RENDER_H = 1280;
const OUT_W = 1080;
const OUT_H = 1920;
const FPS = 24;
const DURATION_SEC = 10;
const TOTAL_FRAMES = FPS * DURATION_SEC;
const TAU = Math.PI * 2;

mkdirSync(OUT_DIR, { recursive: true });

const mp4Path = join(OUT_DIR, "music-ambient-loop.mp4");
const webmPath = join(OUT_DIR, "music-ambient-loop.webm");

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash2(ix, iy) {
  let n = ix * 374761393 + iy * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

/** Seamless value-ish noise from periodic sines (period = 1 in t) */
function field(x, y, phase, seed) {
  const s = seed * 0.17;
  const a =
    Math.sin(x * 2.1 + phase + s) * Math.cos(y * 1.7 - phase * 0.85 + s) +
    Math.sin(x * 3.4 - phase * 1.2 + y * 2.2 + s * 2) * 0.55 +
    Math.cos(x * 1.15 + y * 3.1 + phase * 0.6 + s * 3) * 0.4 +
    Math.sin((x + y) * 2.8 - phase * 0.9 + s) * 0.35;
  return a * 0.5 + 0.5;
}

/** Soft particle / ember set — orbits close after one loop */
function makeParticles(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const u = hash2(i, 1);
    const v = hash2(i, 2);
    const w = hash2(i, 3);
    // Bias toward edges / depth — keep center calmer
    const rx = (u - 0.5) * 1.7;
    const ry = (v - 0.5) * 1.7;
    const edgeBias = Math.max(Math.abs(rx), Math.abs(ry));
    if (edgeBias < 0.22 && w < 0.7) continue;

    list.push({
      x: 0.5 + rx * 0.42,
      y: 0.5 + ry * 0.46,
      ampX: 0.02 + hash2(i, 4) * 0.05,
      ampY: 0.015 + hash2(i, 5) * 0.04,
      phaseOff: hash2(i, 6) * TAU,
      size: 0.8 + hash2(i, 7) * 2.4,
      hue: hash2(i, 8), // 0 pink … 1 amber
      brightness: 0.25 + hash2(i, 9) * 0.55,
      depth: hash2(i, 10), // 0 far … 1 near
    });
  }
  return list;
}

const particles = makeParticles(90);

function renderFrame(frameIndex) {
  const t = frameIndex / TOTAL_FRAMES;
  const phase = t * TAU;
  const buf = Buffer.allocUnsafe(RENDER_W * RENDER_H * 3);

  // Soft vignette / center calm mask (static)
  // Accent layers are multiplied by edge energy so titles stay readable

  for (let y = 0; y < RENDER_H; y++) {
    const ny = y / (RENDER_H - 1);
    for (let x = 0; x < RENDER_W; x++) {
      const nx = x / (RENDER_W - 1);

      // Center distance — slightly calmer for titles, but never empty black
      const dx = (nx - 0.5) * 1.05;
      const dy = (ny - 0.5) * 0.95;
      const r = Math.sqrt(dx * dx + dy * dy);
      const edge = smoothstep(0.08, 0.85, r);
      const deepEdge = smoothstep(0.22, 1.0, r);

      // Base: charcoal / violet-black (must read vs pure landing black)
      const breathe = 0.5 + 0.5 * Math.sin(phase * 1); // seamless
      let rC = 0.035 + 0.02 * breathe;
      let gC = 0.02 + 0.012 * breathe;
      let bC = 0.055 + 0.03 * breathe;

      // Layer 1 — slow drifting particle haze (soft noise field)
      const hazeA = field(nx * 1.4, ny * 1.1, phase * 1, 1.0);
      const hazeB = field(nx * 2.3 + 0.4, ny * 1.8, -phase * 0.7, 2.3);
      const haze = hazeA * 0.62 + hazeB * 0.38;
      const hazeAmt = haze * (0.12 + edge * 0.16);
      rC += hazeAmt * 0.75;
      gC += hazeAmt * 0.22;
      bC += hazeAmt * 0.55;

      // Layer 2 — soft smoky flow (broader, slower)
      const smoke =
        field(nx * 0.9 + Math.sin(phase) * 0.08, ny * 0.75, phase * 0.5, 4.1) *
        field(nx * 1.6, ny * 1.3 - Math.cos(phase) * 0.06, phase * 0.8, 5.7);
      const smokeAmt = smoke * (0.09 + deepEdge * 0.18);
      rC += smokeAmt * 0.5;
      gC += smokeAmt * 0.12;
      bC += smokeAmt * 0.72;

      // Layer 3 — liquid / ripple distortion feel via phase-shifted bands
      const ripple =
        0.5 +
        0.5 *
          Math.sin(
            nx * 6.5 +
              Math.sin(ny * 4.2 + phase) * 1.4 +
              phase * 1,
          ) *
          Math.cos(ny * 5.1 - phase * 0.65);
      const rippleAmt = Math.max(0, ripple) * (0.04 + edge * 0.06);
      rC += rippleAmt * 0.8;
      gC += rippleAmt * 0.2;
      bC += rippleAmt * 0.95;

      // Magenta / violet bloom — visible atmosphere, still secondary
      const bloom =
        Math.pow(haze * smoke, 1.05) * (0.12 + deepEdge * 0.22) * (0.7 + 0.3 * Math.sin(phase + r * 3));
      rC += bloom * 1.05;
      gC += bloom * 0.16;
      bC += bloom * 0.7;

      // Soft corner washes so cover-crop / landscape still shows color
      const cornerL = Math.exp(-((nx - 0.12) ** 2 * 8 + (ny - 0.22) ** 2 * 6));
      const cornerR = Math.exp(-((nx - 0.88) ** 2 * 7 + (ny - 0.78) ** 2 * 5));
      const corners = (cornerL + cornerR) * (0.08 + 0.04 * Math.sin(phase + nx * 2));
      rC += corners * 0.9;
      gC += corners * 0.15;
      bC += corners * 0.55;

      // Mild center calm for titles — not a black hole
      const midCalm = 1 - smoothstep(0.2, 0.55, 1 - Math.abs(ny - 0.5) * 2) * 0.18;
      rC *= 0.9 + midCalm * 0.1;
      gC *= 0.9 + midCalm * 0.1;
      bC *= 0.9 + midCalm * 0.1;

      // Crush highlights — dark but clearly not #000
      const luma = rC * 0.3 + gC * 0.5 + bC * 0.2;
      if (luma > 0.32) {
        const k = 0.32 / luma;
        rC *= k;
        gC *= k;
        bC *= k;
      }

      const i = (y * RENDER_W + x) * 3;
      buf[i] = Math.min(255, (rC * 255) | 0);
      buf[i + 1] = Math.min(255, (gC * 255) | 0);
      buf[i + 2] = Math.min(255, (bC * 255) | 0);
    }
  }

  // Layer 4 — tiny glints / embers (additive soft discs, edge-biased)
  for (const p of particles) {
    const px =
      p.x +
      Math.sin(phase + p.phaseOff) * p.ampX +
      Math.sin(phase * 2 + p.phaseOff * 0.5) * p.ampX * 0.25;
    const py =
      p.y +
      Math.cos(phase * 0.85 + p.phaseOff) * p.ampY +
      Math.sin(phase + p.phaseOff * 1.3) * p.ampY * 0.2;

    // Pulse once per loop — seamless
    const pulse = 0.55 + 0.45 * Math.sin(phase + p.phaseOff);
    const strength = p.brightness * pulse * (0.35 + p.depth * 0.65);
    if (strength < 0.08) continue;

    const cx = (px * (RENDER_W - 1)) | 0;
    const cy = (py * (RENDER_H - 1)) | 0;
    const radius = p.size * (0.7 + p.depth * 0.8);
    const r0 = Math.ceil(radius * 3);

    // Color: pink/magenta or rare warm amber
    const isAmber = p.hue > 0.88;
    const pr = isAmber ? 1.0 : 0.95;
    const pg = isAmber ? 0.55 : 0.22;
    const pb = isAmber ? 0.28 : 0.72;

    for (let oy = -r0; oy <= r0; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= RENDER_H) continue;
      for (let ox = -r0; ox <= r0; ox++) {
        const xx = cx + ox;
        if (xx < 0 || xx >= RENDER_W) continue;
        const d = Math.sqrt(ox * ox + oy * oy) / (radius + 0.001);
        if (d > 3) continue;
        const fall = Math.exp(-d * d * 1.6);
        const add = fall * strength * 0.38;
        // Center calm: reduce glints near middle
        const ndx = xx / (RENDER_W - 1) - 0.5;
        const ndy = yy / (RENDER_H - 1) - 0.5;
        const nr = Math.sqrt(ndx * ndx + ndy * ndy);
        const edgeGate = smoothstep(0.12, 0.55, nr);
        const a = add * edgeGate;
        if (a < 0.002) continue;
        const i = (yy * RENDER_W + xx) * 3;
        buf[i] = Math.min(255, buf[i] + ((pr * a * 255) | 0));
        buf[i + 1] = Math.min(255, buf[i + 1] + ((pg * a * 255) | 0));
        buf[i + 2] = Math.min(255, buf[i + 2] + ((pb * a * 255) | 0));
      }
    }
  }

  return buf;
}

function runFfmpeg(args) {
  return spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
}

async function encodeMp4() {
  console.log(`Rendering ${TOTAL_FRAMES} frames @ ${RENDER_W}x${RENDER_H} → ${OUT_W}x${OUT_H}`);
  console.log(`Writing ${mp4Path}`);

  const ff = runFfmpeg([
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${RENDER_W}x${RENDER_H}`,
    "-r",
    String(FPS),
    "-i",
    "pipe:0",
    "-vf",
    `scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "26",
    "-profile:v",
    "main",
    "-level",
    "4.0",
    "-movflags",
    "+faststart",
    "-an",
    mp4Path,
  ]);

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const frame = renderFrame(f);
    const ok = ff.stdin.write(frame);
    if (!ok) {
      await new Promise((resolve) => ff.stdin.once("drain", resolve));
    }
    if (f % 24 === 0) {
      process.stdout.write(`  mp4 frame ${f}/${TOTAL_FRAMES}\n`);
    }
  }
  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg mp4 exit ${code}`))));
  });
}

async function encodeWebmFromMp4() {
  console.log(`Writing ${webmPath}`);
  await new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        mp4Path,
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        "34",
        "-row-mt",
        "1",
        "-an",
        webmPath,
      ],
      { stdio: "inherit" },
    );
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg webm exit ${code}`))));
  });
}

async function main() {
  const t0 = Date.now();
  await encodeMp4();
  await encodeWebmFromMp4();
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done in ${sec}s`);
  console.log(`MP4:  ${mp4Path}`);
  console.log(`WebM: ${webmPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
