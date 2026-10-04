"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useAudioStore } from "@/experience/audio/audioStore";
import { lab01Config } from "@/experience/worlds/lab-01/config";
import { liveShow } from "@/experience/worlds/lab-01/liveShow";
import { readShowMobile } from "@/experience/worlds/lab-01/showMobile";

/**
 * Show-director camera — theatrical dolly / FOV on drop + flash.
 */
export function CameraRig() {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const playAmt = useRef(0);
  const sectionAmt = useRef(0);
  const flashAmt = useRef(0);

  useFrame(({ clock }, delta) => {
    const playing = useAudioStore.getState().status === "playing" ? 1 : 0;
    playAmt.current = THREE.MathUtils.damp(playAmt.current, playing, 3, delta);
    sectionAmt.current = THREE.MathUtils.damp(
      sectionAmt.current,
      liveShow.section * playAmt.current,
      3.2,
      delta,
    );
    flashAmt.current = THREE.MathUtils.damp(
      flashAmt.current,
      liveShow.flash * playAmt.current,
      14,
      delta,
    );

    const [bx, by, bz] = lab01Config.camera.position;
    const isMobile = readShowMobile();
    const zBase = isMobile ? lab01Config.camera.mobileZ : bz;

    const dolly =
      sectionAmt.current * (isMobile ? 0.32 : 0.48) +
      flashAmt.current * (isMobile ? 0.18 : 0.28);

    const t = clock.elapsedTime;
    const orbitX =
      Math.sin(t * 0.13) * 0.1 +
      Math.sin(t * 0.07) * 0.045 +
      flashAmt.current * 0.04;
    const orbitY =
      by +
      Math.cos(t * 0.1) * 0.055 +
      sectionAmt.current * 0.04 +
      flashAmt.current * 0.03;

    target.current.set(bx + orbitX, orbitY, zBase - dolly);
    camera.position.lerp(target.current, lab01Config.camera.lerp);

    look.current.set(
      orbitX * 0.18,
      lab01Config.camera.lookAtY + flashAmt.current * 0.02,
      -sectionAmt.current * 0.16 - flashAmt.current * 0.14,
    );
    camera.lookAt(look.current);

    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      const fovTarget =
        lab01Config.camera.fov -
        sectionAmt.current * 3.2 -
        flashAmt.current * 5.5;
      persp.fov = THREE.MathUtils.damp(persp.fov, fovTarget, 5, delta);
      persp.updateProjectionMatrix();
    }
  });

  return null;
}
