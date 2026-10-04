"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { LAB_01_TRACK } from "@/data/tracks";
import { useAudioStore } from "@/experience/audio/audioStore";
import { ensureMediaSession } from "@/experience/audio/mediaSession";
import { BrandMark } from "./BrandMark";
import { PlayerFooter } from "./PlayerFooter";

const Experience = dynamic(
  () =>
    import("@/experience/canvas/Experience").then((mod) => mod.Experience),
  { ssr: false },
);

export function Lab01Shell() {
  const load = useAudioStore((state) => state.load);

  useEffect(() => {
    ensureMediaSession();

    // Keep whatever is already loaded/playing across page navigations.
    const { trackUrl, status } = useAudioStore.getState();
    if (
      trackUrl &&
      (status === "playing" || status === "ready" || status === "loading")
    ) {
      return;
    }

    let active = true;
    void load(LAB_01_TRACK.audio).catch(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black text-white">
      <Experience />

      <BrandMark />
      <PlayerFooter />
    </main>
  );
}
