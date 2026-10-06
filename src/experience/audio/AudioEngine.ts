import { AudioAnalyzer, type AudioBands } from "./AudioAnalyzer";

export type AudioEngineStatus = "idle" | "loading" | "ready" | "playing" | "error";

type StatusListener = (status: AudioEngineStatus, error?: string) => void;

type CaptureCapableMedia = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/**
 * Owns playback + optional Web Audio analysis.
 *
 * Speakers always come from a long-lived HTMLAudioElement.
 * Analysis is opt-in (visual lab) and prefers captureStream so iOS can keep
 * playing after the tab is hidden / the phone is locked.
 *
 * Critical for lock-screen auto-next: never replace the HTMLAudioElement when
 * advancing tracks — only swap `src` on the same node so iOS keeps the
 * media-session playback privilege.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private element: HTMLAudioElement | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;
  private captureStream: MediaStream | null = null;
  private analyzer: AudioAnalyzer | null = null;
  private status: AudioEngineStatus = "idle";
  private listeners = new Set<StatusListener>();
  private loadGeneration = 0;
  private endedHandler: (() => void) | null = null;
  private trackUrl: string | null = null;
  /** Visual lab wants band/waveform data. */
  private analysisWanted = false;
  /** True after createMediaElementSource — element no longer has native output. */
  private usingMediaElementSource = false;
  /** Page is hidden; keep analysis detached until visible again. */
  private backgrounded = false;
  private handoffChain: Promise<void> = Promise.resolve();
  private endedBound = false;
  /** Warm next track while current plays (lock-screen auto-advance). */
  private preloadEl: HTMLAudioElement | null = null;
  private preloadUrl: string | null = null;

  getBands(): AudioBands {
    if (!this.analyzer || this.status !== "playing" || this.backgrounded) {
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
    if (!this.analyzer || this.status !== "playing" || this.backgrounded) {
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

  /**
   * Warm the next catalog URL so lock-screen auto-advance is not cold.
   * Safe to call repeatedly; no-ops if already preloading that URL.
   */
  preload(url: string | null | undefined): void {
    if (!url || url === this.trackUrl || url === this.preloadUrl) return;
    this.clearPreload();
    const el = new Audio();
    el.preload = "auto";
    el.setAttribute("playsinline", "");
    el.src = url;
    el.style.display = "none";
    document.body.appendChild(el);
    try {
      el.load();
    } catch {
      // ignore
    }
    this.preloadEl = el;
    this.preloadUrl = url;
  }

  /**
   * Enable/disable FFT analysis for the visual lab.
   * Safe to call from React mount/unmount — releases MediaElementSource while
   * visible so /music can background-play on a plain element.
   */
  setAnalysisEnabled(enabled: boolean): void {
    this.analysisWanted = enabled;
    if (!enabled) {
      void this.withHandoff(async () => {
        await this.detachAnalysis({ restoreNativeOutput: true });
      });
      return;
    }
    if (!this.backgrounded && this.status === "playing") {
      void this.attachAnalysis().catch(() => undefined);
    }
  }

  async load(url: string): Promise<void> {
    const generation = ++this.loadGeneration;
    this.setStatus("loading");
    this.trackUrl = url;

    try {
      // Same long-lived element: required for iOS lock-screen auto-next.
      if (this.element) {
        await this.swapSource(url, generation);
        return;
      }

      const element = this.createElement(url);
      document.body.appendChild(element);
      this.bindEnded(element);

      await this.waitUntilPlayable(element, generation);

      if (generation !== this.loadGeneration) {
        this.destroyElementNode(element);
        return;
      }

      this.element = element;
      this.usingMediaElementSource = false;
      this.setStatus("ready");
      this.consumePreloadIfMatch(url);
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

    if (!this.backgrounded && this.analysisWanted) {
      await this.attachAnalysis().catch(() => undefined);
    }

    await this.element.play();
    this.setStatus("playing");
  }

  /**
   * Auto-next / lock-screen advance.
   *
   * iOS only keeps the media-session privilege if `play()` runs in the same
   * turn as the previous element's `ended` (no awaiting canplay/network).
   * Prefer a warm preloaded element; otherwise swap `src` and play immediately.
   */
  advanceTo(url: string): Promise<void> {
    this.claimPlaybackSession();
    this.trackUrl = url;
    this.loadGeneration += 1;

    // Drop analysis taps without blocking play() — never await here.
    void this.detachAnalysis({ restoreNativeOutput: false });
    this.usingMediaElementSource = false;

    // 1) Promote warm preload — already buffering / ready
    if (this.preloadEl && this.preloadUrl === url) {
      const next = this.preloadEl;
      const prev = this.element;
      this.preloadEl = null;
      this.preloadUrl = null;
      this.endedBound = false;
      this.bindEnded(next);
      this.element = next;

      const playPromise = next.play();
      this.setStatus("playing");

      if (prev) {
        // Defer teardown so we don't stall the play() kickoff
        window.setTimeout(() => this.destroyElementNode(prev), 0);
      }

      return playPromise.then(() => undefined);
    }

    // 2) Same element, new src — play immediately (do not wait for canplay)
    if (this.element) {
      const element = this.element;
      element.crossOrigin = "anonymous";
      element.src = url;
      try {
        element.load();
      } catch {
        // ignore
      }
      const playPromise = element.play();
      this.setStatus("playing");
      return playPromise.then(() => undefined);
    }

    // 3) Cold start (shouldn't happen mid-playlist)
    return this.load(url).then(() => this.play());
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
   * Page/tab hidden or phone locked.
   * Prefer leaving the same HTMLAudioElement running (native output).
   * Only rebuild when MediaElementSource stole the speakers.
   */
  async enterBackgroundPlayback(): Promise<void> {
    await this.withHandoff(async () => {
      if (!this.element || !this.trackUrl) return;
      if (this.backgrounded) return;

      this.backgrounded = true;

      if (this.context?.state === "running") {
        void this.context.suspend().catch(() => undefined);
      }

      // captureStream / no-analysis: element already owns speakers — do nothing.
      if (!this.usingMediaElementSource) {
        this.detachCaptureTap();
        return;
      }

      // MediaElementSource path: speakers die with AudioContext — rebuild native.
      const time = this.element.currentTime;
      const shouldPlay =
        this.status === "playing" || (this.element && !this.element.paused);

      await this.detachAnalysis({ restoreNativeOutput: false });
      await this.rebuildElement(this.trackUrl, time, !!shouldPlay);

      if (shouldPlay && this.element && !this.element.paused) {
        this.setStatus("playing");
      }
    });
  }

  /**
   * Tab visible again — resume context and reattach analysis if the lab wants it.
   */
  async exitBackgroundPlayback(): Promise<void> {
    await this.withHandoff(async () => {
      if (!this.backgrounded) return;
      this.backgrounded = false;

      if (this.context && this.context.state === "suspended") {
        await this.context.resume().catch(() => undefined);
      }

      if (this.analysisWanted && this.status === "playing") {
        await this.attachAnalysis().catch(() => undefined);
      }
    });
  }

  dispose(): void {
    this.loadGeneration += 1;
    this.pause();
    void this.detachAnalysis({ restoreNativeOutput: false });
    this.teardownElement();
    this.clearPreload();
    this.trackUrl = null;
    this.backgrounded = false;
    this.analysisWanted = false;

    if (this.context) {
      void this.context.close();
      this.context = null;
    }

    this.setStatus("idle");
  }

  private async swapSource(url: string, generation: number): Promise<void> {
    const element = this.element;
    if (!element) {
      throw new Error("No audio element");
    }

    // Drop analysis taps before changing src (keeps native output path clean).
    await this.detachAnalysis({ restoreNativeOutput: false });
    this.usingMediaElementSource = false;

    const wasPlaying =
      this.status === "playing" || (!element.paused && !element.ended);
    if (wasPlaying || !element.paused) {
      element.pause();
    }

    element.crossOrigin = "anonymous";
    element.src = url;
    element.load();

    await this.waitUntilPlayable(element, generation);

    if (generation !== this.loadGeneration) return;

    try {
      element.currentTime = 0;
    } catch {
      // ignore
    }

    this.setStatus("ready");
    this.consumePreloadIfMatch(url);
  }

  private waitUntilPlayable(
    element: HTMLAudioElement,
    generation: number,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (generation !== this.loadGeneration) {
        resolve();
        return;
      }
      // readyState >= 3 (HAVE_FUTURE_DATA) / 4 is enough to start
      if (element.readyState >= 3) {
        resolve();
        return;
      }

      const timeout = window.setTimeout(() => {
        cleanup();
        // Soft-resolve: play() may still succeed with partial buffer
        if (element.readyState >= 2) resolve();
        else reject(new Error(`Timed out loading audio: ${element.src}`));
      }, 20000);

      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load audio: ${element.src}`));
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        element.removeEventListener("canplay", onReady);
        element.removeEventListener("loadeddata", onReady);
        element.removeEventListener("error", onError);
      };

      element.addEventListener("canplay", onReady, { once: true });
      element.addEventListener("loadeddata", onReady, { once: true });
      element.addEventListener("error", onError, { once: true });
    });
  }

  private withHandoff(fn: () => Promise<void>): Promise<void> {
    const run = this.handoffChain.then(fn, fn);
    this.handoffChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async attachAnalysis(): Promise<void> {
    if (!this.element || this.backgrounded || !this.analysisWanted) return;
    if (this.analyzer && (this.streamSource || this.source)) return;

    this.claimPlaybackSession();
    const context = this.ensureContext();
    if (context.state !== "running") {
      await context.resume().catch(() => undefined);
    }

    const stream = this.tryCaptureStream(this.element);
    if (stream) {
      this.captureStream = stream;
      this.streamSource = context.createMediaStreamSource(stream);
      this.analyzer = new AudioAnalyzer(context);
      this.analyzer.connect(this.streamSource);
      // Element keeps native speaker output — do not connect to destination.
      return;
    }

    // Fallback: MediaElementSource steals native output (Chrome/Safari older).
    this.source = context.createMediaElementSource(this.element);
    this.analyzer = new AudioAnalyzer(context);
    this.analyzer.connect(this.source);
    this.source.connect(context.destination);
    this.usingMediaElementSource = true;
  }

  private async detachAnalysis(options: {
    restoreNativeOutput: boolean;
  }): Promise<void> {
    const hadMediaElementSource = this.usingMediaElementSource;
    const time = this.element?.currentTime ?? 0;
    const url = this.trackUrl;
    const wasPlaying =
      this.status === "playing" || (!!this.element && !this.element.paused);

    this.detachCaptureTap();

    try {
      this.source?.disconnect();
    } catch {
      // already disconnected
    }
    this.source = null;
    this.analyzer = null;

    if (
      options.restoreNativeOutput &&
      hadMediaElementSource &&
      url &&
      this.element
    ) {
      await this.rebuildElement(url, time, wasPlaying);
      this.usingMediaElementSource = false;
      if (wasPlaying && this.element && !this.element.paused) {
        this.setStatus("playing");
      }
      return;
    }

    if (!hadMediaElementSource) {
      this.usingMediaElementSource = false;
    }
  }

  private detachCaptureTap(): void {
    try {
      this.streamSource?.disconnect();
    } catch {
      // ignore
    }
    this.streamSource = null;

    if (this.captureStream) {
      for (const track of this.captureStream.getTracks()) {
        track.stop();
      }
      this.captureStream = null;
    }

    if (!this.usingMediaElementSource) {
      this.analyzer = null;
    }
  }

  private tryCaptureStream(element: HTMLAudioElement): MediaStream | null {
    const media = element as CaptureCapableMedia;
    try {
      if (typeof media.captureStream === "function") {
        return media.captureStream();
      }
      if (typeof media.mozCaptureStream === "function") {
        return media.mozCaptureStream();
      }
    } catch {
      return null;
    }
    return null;
  }

  private createElement(url: string): HTMLAudioElement {
    const element = new Audio();
    element.crossOrigin = "anonymous";
    element.loop = false;
    element.preload = "auto";
    element.setAttribute("playsinline", "");
    element.setAttribute("webkit-playsinline", "");
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
    if (this.endedBound && this.element === element) return;
    element.addEventListener("ended", () => {
      if (this.element !== element) return;
      this.analyzer?.reset();
      if (this.status === "playing") {
        this.setStatus("ready");
      }
      this.endedHandler?.();
    });
    this.endedBound = true;
  }

  private async rebuildElement(
    url: string,
    time: number,
    autoplay: boolean,
  ): Promise<void> {
    const previous = this.element;
    const element = this.createElement(url);
    document.body.appendChild(element);
    this.endedBound = false;
    this.bindEnded(element);

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
      try {
        await element.play();
      } catch {
        // iOS may block play() after hide — UI can resume on next tap
      }
    }

    if (previous) {
      this.destroyElementNode(previous);
    }

    this.element = element;
    this.usingMediaElementSource = false;
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
      const AC =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      this.context = AC ? new AC() : new AudioContext();
      this.source = null;
      this.streamSource = null;
      this.analyzer = null;
      this.usingMediaElementSource = false;
    }
    return this.context;
  }

  private consumePreloadIfMatch(url: string): void {
    if (this.preloadUrl === url) {
      this.clearPreload();
    }
  }

  private clearPreload(): void {
    if (this.preloadEl) {
      this.destroyElementNode(this.preloadEl);
      this.preloadEl = null;
    }
    this.preloadUrl = null;
  }

  private destroyElementNode(element: HTMLAudioElement): void {
    element.pause();
    element.removeAttribute("src");
    try {
      element.load();
    } catch {
      // ignore
    }
    element.remove();
  }

  private teardownElement(): void {
    if (this.element) {
      this.destroyElementNode(this.element);
      this.element = null;
    }
    this.endedBound = false;
    this.usingMediaElementSource = false;
  }

  private setStatus(status: AudioEngineStatus, error?: string): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status, error);
    }
  }
}
