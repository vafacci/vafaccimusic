import { AudioAnalyzer, type AudioBands } from "./AudioAnalyzer";

export type AudioEngineStatus = "idle" | "loading" | "ready" | "playing" | "error";

type StatusListener = (status: AudioEngineStatus, error?: string) => void;

/**
 * Owns Web Audio graph lifecycle.
 * Playback never starts without an explicit play() call.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private element: HTMLAudioElement | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private analyzer: AudioAnalyzer | null = null;
  private status: AudioEngineStatus = "idle";
  private listeners = new Set<StatusListener>();
  private boundSource = false;
  private loadGeneration = 0;
  private endedHandler: (() => void) | null = null;

  getBands(): AudioBands {
    if (!this.analyzer || this.status !== "playing") {
      return {
        bass: 0,
        lowMid: 0,
        mid: 0,
        highMid: 0,
        treble: 0,
        energy: 0,
      };
    }

    return this.analyzer.update();
  }

  /** Copy smoothed waveform (−1…1). Zeros when not playing. */
  copyWaveform(target: Float32Array): void {
    if (!this.analyzer || this.status !== "playing") {
      target.fill(0);
      return;
    }
    target.set(this.analyzer.waveform.subarray(0, target.length));
  }

  getStatus(): AudioEngineStatus {
    return this.status;
  }

  getCurrentTime(): number {
    return this.element?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.element?.duration ?? 0;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  /** Fires once when the current element reaches the end (not on pause/seek). */
  onEnded(handler: (() => void) | null): void {
    this.endedHandler = handler;
  }

  async load(url: string): Promise<void> {
    const generation = ++this.loadGeneration;
    this.setStatus("loading");

    try {
      this.pause();
      this.resetGraph();
      this.teardownElement();

      const element = new Audio();
      element.crossOrigin = "anonymous";
      element.loop = false;
      element.preload = "auto";
      element.src = url;
      element.style.display = "none";
      document.body.appendChild(element);

      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(`Failed to load audio: ${url}`));
        };
        const cleanup = () => {
          element.removeEventListener("canplaythrough", onCanPlay);
          element.removeEventListener("error", onError);
        };

        element.addEventListener("canplaythrough", onCanPlay, { once: true });
        element.addEventListener("error", onError, { once: true });
        element.load();
      });

      // Discard stale loads (React Strict Mode / rapid remounts).
      if (generation !== this.loadGeneration) {
        element.pause();
        element.removeAttribute("src");
        element.load();
        element.remove();
        return;
      }

      element.addEventListener("ended", () => {
        if (this.element !== element) return;
        this.analyzer?.reset();
        if (this.status === "playing") {
          this.setStatus("ready");
        }
        this.endedHandler?.();
      });

      this.element = element;
      this.setStatus("ready");
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      const message =
        error instanceof Error ? error.message : "Unknown audio load error";
      this.setStatus("error", message);
      throw error;
    }
  }

  async play(): Promise<void> {
    if (!this.element) {
      throw new Error("No audio loaded");
    }

    const context = this.ensureContext();

    if (context.state === "suspended") {
      await context.resume();
    }

    if (!this.boundSource) {
      this.source = context.createMediaElementSource(this.element);
      this.analyzer = new AudioAnalyzer(context);
      this.analyzer.connect(this.source);
      this.source.connect(context.destination);
      this.boundSource = true;
    }

    await this.element.play();
    this.setStatus("playing");
  }

  pause(): void {
    this.element?.pause();
    this.analyzer?.reset();
    if (this.status === "playing") {
      this.setStatus("ready");
    }
  }

  seek(time: number): void {
    if (!this.element || !Number.isFinite(time)) return;
    const duration = this.element.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    this.element.currentTime = Math.min(Math.max(time, 0), duration);
  }

  dispose(): void {
    this.loadGeneration += 1;
    this.pause();
    this.resetGraph();
    this.teardownElement();

    if (this.context) {
      void this.context.close();
      this.context = null;
    }

    this.setStatus("idle");
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  private resetGraph(): void {
    try {
      this.source?.disconnect();
    } catch {
      // already disconnected
    }
    this.source = null;
    this.analyzer = null;
    this.boundSource = false;
  }

  private teardownElement(): void {
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute("src");
      this.element.load();
      this.element.remove();
      this.element = null;
    }
  }

  private setStatus(status: AudioEngineStatus, error?: string): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status, error);
    }
  }
}
