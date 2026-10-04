"use client";

import { create } from "zustand";

type MusicGalleryStore = {
  /** 0…1 scroll through the catalogue */
  scrollProgress: number;
  setScrollProgress: (value: number) => void;
  /** Continuous index (e.g. 1.35) — drives spatial layout */
  floatIndex: number;
  setFloatIndex: (value: number) => void;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
};

export const useMusicGalleryStore = create<MusicGalleryStore>((set) => ({
  scrollProgress: 0,
  setScrollProgress: (scrollProgress) => set({ scrollProgress }),
  floatIndex: 0,
  setFloatIndex: (floatIndex) => set({ floatIndex }),
  activeIndex: 0,
  setActiveIndex: (activeIndex) => set({ activeIndex }),
}));
