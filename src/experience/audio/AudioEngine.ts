import { AudioAnalyzer, type AudioBands } from "./AudioAnalyzer";

export type AudioEngineStatus = "idle" | "loading" | "ready" | "playing" | "error";

type StatusListener = (status: AudioEngineStatus, error?: string) => void;

/**
 * Owns Web Audio graph lifecycle.
 * Playback never starts without an explicit play() call.
 *
 * Lock-screen / background: when the page is hidden we drop the Web Audio
 * graph and continue on a plain HTMLAudioElement (iOS suspends AudioContext).
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
  private trackUrl: string | null = null;
  /** True while page is hidden — play via element only, no MediaElementSource. */
  private nativeBackground = false;

  getBands(): AudioBands {
    if (!this.analyzer || this.status !== "playing" || this.nativeBackground) {
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
    if (!this.analyzer || this.status !== "playing" || this.nativeBackground) {
      target.fill(0);
      return;
    }
    target.set(this.analyzer.waveform.subarray(0, target.length));
  }

  getStatus(): AudioEngineStatus {
    return this.status;
  }

  getTrackUrl(): string | null {
    return this.trackUrl;
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
    this.trackUrl = url;
    this.nativeBackground = false;

    try {
      this.pause();
      this.resetGraph();
      this.teardownElement();

      const element = this.createElement(url);
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

      this.bindEnded(element);
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

    this.claimPlaybackSession();

    if (!this.nativeBackground) {
      const context = this.ensureContext();

      if (context.state !== "running") {
        await context.resume().catch(() => {
          // iOS may reject while backgrounded; native path handles that
        });
      }

      if (!this.boundSource) {
        this.source = context.createMediaElementSource(this.element);
        this.analyzer = new AudioAnalyzer(context);
        this.analyzer.connect(this.source);
        this.source.connect(context.destination);
        this.boundSource = true;
      }
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

  /**
   * Call when the tab/app is hidden (lock screen / app switch).
   * Recreates a plain HTMLAudioElement so playback can continue without Web Audio.
   */
  async enterBackgroundPlayback(): Promise<void> {
    if (!this.element || !this.trackUrl) return;
    if (this.nativeBackground) return;
    if (this.status !== "playing") {
      // Still drop the graph so a later play() while hidden stays native.
      if (this.boundSource) {
        const time = this.element.currentTime;
        this.resetGraph();
        await this.rebuildElement(this.trackUrl, time, false);
        this.nativeBackground = true;
      }
      return;
    }

    const time = this.element.currentTime;
    this.resetGraph();
    if (this.context) {
      void this.context.suspend().catch(() => undefined);
    }
    await this.rebuildElement(this.trackUrl, time, true);
    this.nativeBackground = true;
    this.setStatus("playing");
  }

  /**
   * Call when the tab/app is visible again — reattach Web Audio for the entity viz.
   */
  async exitBackgroundPlayback(): Promise<void> {
    if (!this.nativeBackground || !this.element || !this.trackUrl) return;

    const time = this.element.currentTime;
    const shouldPlay = this.status === "playing" || !this.element.paused;

    this.nativeBackground = false;
    await this.rebuildElement(this.trackUrl, time, false);

    if (shouldPlay) {
      await this.play();
    } else {
      this.setStatus("ready");
    }
  }

  dispose(): void {
    this.loadGeneration += 1;
    this.pause();
    this.resetGraph();
    this.teardownElement();
    this.trackUrl = null;
    this.nativeBackground = false;

    if (this.context) {
      void this.context.close();
      this.context = null;
    }

    this.setStatus("idle");
  }

  private createElement(url: string): HTMLAudioElement {
    const element = new Audio();
    element.crossOrigin = "anonymous";
    element.loop = false;
    element.preload = "auto";
    element.setAttribute("playsinline", "");
    element.setAttribute("webkit-playsinline", "");
    // Prefer media / playback channel over ringer on supporting browsers
    try {
      (
        element as HTMLAudioElement & { mozAudioChannelType?: string }
      ).mozAudioChannelType = "content";
    } catch {
      // ignore
    }
    element.src = url;
    element.style.display = "none";
    return element;
  }

  private bindEnded(element: HTMLAudioElement): void {
    element.addEventListener("ended", () => {
      if (this.element !== element) return;
      this.analyzer?.reset();
      if (this.status === "playing") {
        this.setStatus("ready");
      }
      this.endedHandler?.();
    });
  }

  private async rebuildElement(
    url: string,
    time: number,
    autoplay: boolean,
  ): Promise<void> {
    this.teardownElement();
    const element = this.createElement(url);
    document.body.appendChild(element);
    this.bindEnded(element);
    this.element = element;

    await new Promise<void>((resolve) => {
      const ready = () => {
        element.removeEventListener("loadedmetadata", ready);
        resolve();
      };
      if (element.readyState >= 1) resolve();
      else element.addEventListener("loadedmetadata", ready, { once: true });
      element.load();
    });

    if (Number.isFinite(time) && time > 0) {
      try {
        element.currentTime = time;
      } catch {
        // metadata may still be settling
      }
    }

    if (autoplay) {
      await element.play();
    }
  }

  private claimPlaybackSession(): void {
    if (typeof navigator === "undefined") return;
    const session = (
      navigator as Navigator & {
        audioSession?: { type: string };
      }
    ).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {
        // unsupported value
      }
    }
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext();
      this.boundSource = false;
      this.source = null;
      this.analyzer = null;
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
