"use client";

import {
  getCatalogByAudio,
  getCatalogIndexByAudio,
  getLiveCatalog,
} from "@/data/liveCatalog";
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
      const { trackUrl, advanceTo } = useAudioStore.getState();
      const list = getLiveCatalog();
      const index = getCatalogIndexByAudio(trackUrl);
      const prev = list[index - 1];
      if (!prev?.audio) return;
      void advanceTo(prev.audio);
    });
    set("nexttrack", () => {
      const { trackUrl, advanceTo } = useAudioStore.getState();
      const list = getLiveCatalog();
      const index = getCatalogIndexByAudio(trackUrl);
      const next = list[index + 1];
      if (!next?.audio) return;
      void advanceTo(next.audio);
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

  let hideTimer: number | null = null;

  const onVisibility = () => {
    const engine = useAudioStore.getState().engine;
    if (document.visibilityState === "hidden") {
      // Debounce pagehide + visibilitychange double-fire
      if (hideTimer != null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        void engine.enterBackgroundPlayback();
      }, 40);
      return;
    }
    if (hideTimer != null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    void engine.exitBackgroundPlayback().catch(() => {
      // user may need to tap play if iOS blocked resume
    });
  };

  document.addEventListener("visibilitychange", onVisibility);

  // iOS sometimes fires pagehide without a clean visibility flip
  window.addEventListener("pagehide", () => {
    if (document.visibilityState === "hidden") {
      void useAudioStore.getState().engine.enterBackgroundPlayback();
    }
  });
}
