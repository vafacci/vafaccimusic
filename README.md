# VAFACCI — Interactive Music Universe

Experimental audiovisual foundation. Not a finished artist website.

## Current phase

**Visual Lab 01** — mobile-first particle music entity.

Route: [`/labs/01`](http://localhost:3000/labs/01)

Active track: `public/audio/tusay-ft-facci.mp3`

## Stack (Lab 01)

- Next.js + TypeScript + React
- Three.js + React Three Fiber + Drei
- Web Audio API (custom analyzer)
- Zustand (playback UI state)
- Leva (dev debug panel only)

Not installed yet (intentionally): GSAP, Meyda, postprocessing, Motion.

## Develop

```bash
npm run dev
```

Open [http://localhost:3000/labs/01](http://localhost:3000/labs/01).

Press **Play** to start audio (never autoplays).

## Swap in the first track

1. Add the file under `public/audio/`
2. Point `LAB_01_TRACK.audio` in `src/data/tracks.ts` at that path

## Architecture

```text
src/
  data/tracks.ts                 # structured track config
  experience/
    audio/                       # engine + analyzer + store
    canvas/                      # R3F canvas, camera, lighting
    worlds/lab-01/               # temporary Lab 01 world
    ui/                          # minimal transport + debug
  app/labs/01/                   # Lab 01 route
```

Uses a music-driven particle point-cloud entity (no hover, no waves). Still experimental.
