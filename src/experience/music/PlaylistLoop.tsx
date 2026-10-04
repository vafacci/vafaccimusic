"use client";

import { useEffect, useRef } from "react";

/**
 * Quiet muted loop that fills the /music hero strip.
 * Source is already crossfaded end→start so `loop` has no hard cut.
 */
export function PlaylistLoop() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      if (motion.matches) {
        video.pause();
        return;
      }
      void video.play().catch(() => {});
    };

    apply();
    motion.addEventListener("change", apply);
    return () => motion.removeEventListener("change", apply);
  }, []);

  return (
    <video
      ref={ref}
      className="music-loop"
      src="/videos/playlist-loop.mp4"
      muted
      playsInline
      autoPlay
      loop
      preload="auto"
      disablePictureInPicture
      aria-hidden
    />
  );
}
