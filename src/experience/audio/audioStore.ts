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

/** Last track URL we already counted a listen for (avoid pause/resume doubles). */
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
  }).catch(() => {
    // analytics must never break playback
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
    const { trackUrl, load, play } = get();
    const index = getCatalogIndexByAudio(trackUrl);
    const next = CATALOG[index + 1];
    if (!next?.audio) return;
    void load(next.audio)
      .then(() => play())
      .catch(() => {
        // leave status/error from load
      });
  });

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
