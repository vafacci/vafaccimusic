import type { Camera, Scene, WebGLRenderer } from "three";

type CanvasBridgeState = {
  gl: WebGLRenderer | null;
  scene: Scene | null;
  camera: Camera | null;
};

const state: CanvasBridgeState = {
  gl: null,
  scene: null,
  camera: null,
};

export function registerCanvasBridge(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
) {
  state.gl = gl;
  state.scene = scene;
  state.camera = camera;
}

export function unregisterCanvasBridge() {
  state.gl = null;
  state.scene = null;
  state.camera = null;
}

/** Force a fresh frame and return the WebGL canvas. */
export function getLiveCanvas(): HTMLCanvasElement | null {
  const { gl, scene, camera } = state;
  if (!gl || !scene || !camera) return null;
  gl.render(scene, camera);
  return gl.domElement;
}
