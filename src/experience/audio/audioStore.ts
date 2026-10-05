"use client";

import { create } from "zustand";
import {
  getCatalogByAudio,
  getCatalogIndexByAudio,
  CATALOG,
} from "@/data/catalog";
import {
  WAVEFORM_SIZE,
  type AudioBands,
} from "./AudioAnalyzer";
import { AudioEngine, type AudioEngineStatus } from "./AudioEngine";

/** Session dedupe: same URL counted once until it ends or another track loads. */
let lastCountedUrl: string | null = null;

function recordPlay(trackUrl: string | null) {
  if (!trackUrl || typeof window === "undefined") return;
  if (trackUrl === lastCountedUrl) return;
  lastCountedUrl = trackUrl;
  const track = getCatalogByAudio(trackUrl);
  void fetch("/api/plays", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId: track.id }),
    keepalive: true,
  })
    .then(async (res) => {
      if (!res.ok) {
        // Allow a later play() to retry if the write failed
        if (lastCountedUrl === trackUrl) lastCountedUrl = null;
      }
    })
    .catch(() => {
      if (lastCountedUrl === trackUrl) lastCountedUrl = null;
    });
}

/**
 * Mutable analysis snapshot — read from useFrame, not React state.
 */
export const liveBands: AudioBands = {
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  treble: 0,
  energy: 0,
};

export const liveWaveform = new Float32Array(WAVEFORM_SIZE);

type AudioStore = {
  engine: AudioEngine;
  status: AudioEngineStatus;
  error: string | null;
  trackUrl: string | null;
  saved: boolean;
  load: (url: string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  toggleSave: () => void;
  syncBands: () => void;
};

const SAVE_KEY = "vafacci:lab01:saved";

function readSaved(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SAVE_KEY) === "1";
  } catch {
    return false;
  }
}

let unsubscribeStatus: (() => void) | null = null;

export const useAudioStore = create<AudioStore>((set, get) => {
  const engine = new AudioEngine();

  unsubscribeStatus?.();
  unsubscribeStatus = engine.subscribe((status, error) => {
    set({ status, error: error ?? null });
  });

  engine.onEnded(() => {
    const finishedUrl = get().trackUrl;
    // Allow the same track to count again on a later replay
    if (lastCountedUrl === finishedUrl) lastCountedUrl = null;

    const { trackUrl, load, play, engine: eng } = get();
    const index = getCatalogIndexByAudio(trackUrl);
    const next = CATALOG[index + 1];
    if (!next?.audio) return;

    // Same HTMLAudioElement swap — required so iOS lock screen keeps playing.
    void load(next.audio)
      .then(() => play())
      .catch(() => {
        // One retry: src may still be buffering after lock
        window.setTimeout(() => {
          void eng
            .play()
            .then(() => recordPlay(get().trackUrl))
            .catch(() => undefined);
        }, 250);
      });
  });

  // Warm the next track while current plays (helps auto-next under lock).
  if (typeof window !== "undefined") {
    window.setInterval(() => {
      const { status, trackUrl, engine: eng } = get();
      if (status !== "playing" || !trackUrl) return;
      const duration = eng.getDuration();
      const now = eng.getCurrentTime();
      if (!Number.isFinite(duration) || duration <= 0) return;
      // Start warming ~20s before the end (or immediately on short tracks).
      if (duration - now > 20 && duration > 25) return;
      const index = getCatalogIndexByAudio(trackUrl);
      const next = CATALOG[index + 1];
      if (next?.audio) eng.preload(next.audio);
    }, 4000);
  }

  return {
    engine,
    status: engine.getStatus(),
    error: null,
    trackUrl: null,
    saved: readSaved(),

    async load(url: string) {
      const current = get();
      // Same track already in engine — never tear down (keeps playback across pages).
      if (
        current.trackUrl === url &&
        (current.status === "playing" ||
          current.status === "ready" ||
          current.status === "loading")
      ) {
        return;
      }
      set({ trackUrl: url, error: null });
      await engine.load(url);
    },

    async play() {
      await engine.play();
      recordPlay(get().trackUrl);
    },

    pause() {
      engine.pause();
      Object.assign(liveBands, {
        bass: 0,
        lowMid: 0,
        mid: 0,
        highMid: 0,
        treble: 0,
        energy: 0,
      });
      liveWaveform.fill(0);
    },

    seek(time: number) {
      engine.seek(time);
    },

    toggleSave() {
      const next = !get().saved;
      set({ saved: next });
      try {
        window.localStorage.setItem(SAVE_KEY, next ? "1" : "0");
      } catch {
        // session-only fallback
      }
    },

    syncBands() {
      Object.assign(liveBands, get().engine.getBands());
      get().engine.copyWaveform(liveWaveform);
    },
  };
});
