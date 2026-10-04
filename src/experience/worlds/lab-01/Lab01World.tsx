"use client";

import { useSyncExternalStore } from "react";
import { AtmosphereDust } from "./AtmosphereDust";
import { ParticleEntity } from "./ParticleEntity";
import { readShowMobile, subscribeShowMobile } from "./showMobile";

export function Lab01World() {
  const isMobile = useSyncExternalStore(
    subscribeShowMobile,
    readShowMobile,
    () => false,
  );

  return (
    <group>
      <AtmosphereDust count={isMobile ? 550 : 1100} />
      <ParticleEntity />
    </group>
  );
}
