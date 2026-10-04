"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { registerCanvasBridge, unregisterCanvasBridge } from "./canvasBridge";

/** Exposes the live WebGL canvas to UI (share-frame capture). */
export function CanvasBridge() {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    registerCanvasBridge(gl, scene, camera);
    return () => unregisterCanvasBridge();
  }, [gl, scene, camera]);

  return null;
}
