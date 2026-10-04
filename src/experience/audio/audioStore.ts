"use client";

import { create } from "zustand";
import {
  WAVEFORM_SIZE,
  type AudioBands,
} from "./AudioAnalyzer";
import { AudioEngine, type AudioEngineStatus } from "./AudioEngine";

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

  return {
    engine,
    status: engine.getStatus(),
    error: null,
    trackUrl: null,
    saved: readSaved(),

    async load(url: string) {
      set({ trackUrl: url, error: null });
      await engine.load(url);
    },

    async play() {
      await engine.play();
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
