"use client";

import {
  CATALOG,
  getCatalogByAudio,
  getCatalogIndexByAudio,
} from "@/data/catalog";
import { useAudioStore } from "./audioStore";

let wired = false;

/**
 * Lock-screen / Control Center integration + background audio handoff.
 * Safe to call once from any client shell.
 */
export function ensureMediaSession(): void {
  if (typeof window === "undefined" || wired) return;
  wired = true;

  const syncMetadata = () => {
    if (!("mediaSession" in navigator)) return;
    const { trackUrl, status } = useAudioStore.getState();
    const track = getCatalogByAudio(trackUrl);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "VAFACCI",
    });

    navigator.mediaSession.playbackState =
      status === "playing" ? "playing" : "paused";
  };

  const bindActions = () => {
    if (!("mediaSession" in navigator)) return;

    const set = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // action not supported on this browser
      }
    };

    set("play", () => {
      void useAudioStore.getState().play();
    });
    set("pause", () => {
      useAudioStore.getState().pause();
    });
    set("stop", () => {
      useAudioStore.getState().pause();
    });
    set("seekto", (details) => {
      if (details.seekTime == null) return;
      useAudioStore.getState().seek(details.seekTime);
    });
    set("seekbackward", (details) => {
      const engine = useAudioStore.getState().engine;
      const step = details.seekOffset ?? 10;
      useAudioStore.getState().seek(Math.max(0, engine.getCurrentTime() - step));
    });
    set("seekforward", (details) => {
      const engine = useAudioStore.getState().engine;
      const step = details.seekOffset ?? 10;
      useAudioStore
        .getState()
        .seek(engine.getCurrentTime() + step);
    });
    set("previoustrack", () => {
      const { trackUrl, load, play } = useAudioStore.getState();
      const index = getCatalogIndexByAudio(trackUrl);
      const prev = CATALOG[index - 1];
      if (!prev?.audio) return;
      void load(prev.audio).then(() => play());
    });
    set("nexttrack", () => {
      const { trackUrl, load, play } = useAudioStore.getState();
      const index = getCatalogIndexByAudio(trackUrl);
      const next = CATALOG[index + 1];
      if (!next?.audio) return;
      void load(next.audio).then(() => play());
    });
  };

  bindActions();
  syncMetadata();

  useAudioStore.subscribe((state, prev) => {
    if (
      state.trackUrl !== prev.trackUrl ||
      state.status !== prev.status
    ) {
      syncMetadata();
    }
  });

  // Position updates for lock-screen scrubber
  window.setInterval(() => {
    if (!("mediaSession" in navigator)) return;
    const { engine, status } = useAudioStore.getState();
    if (status !== "playing" && status !== "ready") return;
    const duration = engine.getDuration();
    const position = engine.getCurrentTime();
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(position, duration),
        playbackRate: 1,
      });
    } catch {
      // some browsers reject while metadata unset
    }
  }, 1000);

  const onVisibility = () => {
    const engine = useAudioStore.getState().engine;
    if (document.visibilityState === "hidden") {
      void engine.enterBackgroundPlayback();
    } else {
      void engine.exitBackgroundPlayback().catch(() => {
        // user may need to tap play if iOS blocked resume
      });
    }
  };

  document.addEventListener("visibilitychange", onVisibility);

  // iOS sometimes fires pagehide without a clean visibility flip
  window.addEventListener("pagehide", () => {
    void useAudioStore.getState().engine.enterBackgroundPlayback();
  });
}
