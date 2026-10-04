export type AudioBands = {
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  energy: number;
};

export type AudioAnalyzerOptions = {
  fftSize?: number;
  smoothingTimeConstant?: number;
  /** Attack (0–1). Higher = snappier rise toward the music. */
  attack?: number;
  /** Release (0–1). Higher = faster fall when the music drops. */
  release?: number;
  /** Levels below this collapse toward 0 (noise gate). */
  noiseFloor?: number;
  waveformSize?: number;
};

const EMPTY_BANDS: AudioBands = {
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  treble: 0,
  energy: 0,
};

export const WAVEFORM_SIZE = 128;

/**
 * Frequency bands + waveform with attack/release envelopes.
 * Quiet → near zero. Hits → snappy. No floating “always on” energy.
 */
export class AudioAnalyzer {
  readonly analyser: AnalyserNode;
  readonly bands: AudioBands = { ...EMPTY_BANDS };
  readonly waveform: Float32Array;

  private readonly frequencyData: Uint8Array;
  private readonly timeDomainData: Uint8Array;
  private readonly attack: number;
  private readonly release: number;
  private readonly noiseFloor: number;
  private readonly waveformSize: number;

  constructor(context: AudioContext, options: AudioAnalyzerOptions = {}) {
    const {
      fftSize = 2048,
      // Lower = more 1:1 with the track (less smeared FFT)
      smoothingTimeConstant = 0.55,
      attack = 0.55,
      release = 0.28,
      noiseFloor = 0.04,
      waveformSize = WAVEFORM_SIZE,
    } = options;

    this.analyser = context.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = smoothingTimeConstant;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.fftSize);
    this.attack = attack;
    this.release = release;
    this.noiseFloor = noiseFloor;
    this.waveformSize = waveformSize;
    this.waveform = new Float32Array(waveformSize);
  }

  connect(source: AudioNode): AnalyserNode {
    source.connect(this.analyser);
    return this.analyser;
  }

  update(): AudioBands {
    this.analyser.getByteFrequencyData(
      this.frequencyData as Uint8Array<ArrayBuffer>,
    );
    this.analyser.getByteTimeDomainData(
      this.timeDomainData as Uint8Array<ArrayBuffer>,
    );

    const sampleRate = this.analyser.context.sampleRate;
    const binCount = this.frequencyData.length;
    const nyquist = sampleRate / 2;
    const binHz = nyquist / binCount;

    const bass = this.gate(this.averageRange(20, 140, binHz));
    const lowMid = this.gate(this.averageRange(140, 400, binHz));
    const mid = this.gate(this.averageRange(400, 1200, binHz));
    const highMid = this.gate(this.averageRange(1200, 4000, binHz));
    const treble = this.gate(this.averageRange(4000, 12000, binHz));
    const energy = this.gate(
      bass * 0.35 + lowMid * 0.2 + mid * 0.2 + highMid * 0.15 + treble * 0.1,
    );

    this.envelope("bass", bass);
    this.envelope("lowMid", lowMid);
    this.envelope("mid", mid);
    this.envelope("highMid", highMid);
    this.envelope("treble", treble);
    this.envelope("energy", energy);

    this.updateWaveform(energy);

    return this.bands;
  }

  reset(): void {
    Object.assign(this.bands, EMPTY_BANDS);
    this.waveform.fill(0);
  }

  private updateWaveform(energy: number): void {
    const src = this.timeDomainData;
    const dest = this.waveform;
    const len = this.waveformSize;
    const step = Math.floor(src.length / len);
    // Waveform collapses in quiet — no fake motion from noise
    const live = smoothstep(0.03, 0.18, energy);
    const follow = 0.45 + live * 0.35;

    for (let i = 0; i < len; i++) {
      const sample = ((src[i * step] ?? 128) / 128 - 1) * live;
      dest[i] = dest[i]! + (sample - dest[i]!) * follow;
    }
  }

  private averageRange(minHz: number, maxHz: number, binHz: number): number {
    const start = Math.max(0, Math.floor(minHz / binHz));
    const end = Math.min(
      this.frequencyData.length - 1,
      Math.ceil(maxHz / binHz),
    );

    if (end <= start) return 0;

    let sum = 0;
    for (let i = start; i <= end; i++) {
      sum += this.frequencyData[i] ?? 0;
    }

    const raw = sum / (end - start + 1) / 255;
    // Mild expand — keeps quiet quiet, opens loud without crushing
    return Math.pow(Math.min(raw * 1.25, 1), 1.05);
  }

  private gate(value: number): number {
    if (value < this.noiseFloor) return 0;
    return (value - this.noiseFloor) / (1 - this.noiseFloor);
  }

  private envelope(key: keyof AudioBands, next: number): void {
    const prev = this.bands[key];
    const rate = next > prev ? this.attack : this.release;
    this.bands[key] = prev + (next - prev) * rate;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
