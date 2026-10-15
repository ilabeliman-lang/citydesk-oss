/**
 * NDU-FP (FPXR-15 / upg-u-074): footstep sample bank + pooled voice nodes.
 *
 * A 60 s walk is ~170 steps at a natural cadence. The old path built a fresh
 * oscillator, biquad, gain and panner per step *and* re-rendered its noise; that
 * churn is what spikes GC mid-walk. Here the expensive half is done once:
 *
 *  - each `(surface, variant)` sample is rendered into an `AudioBuffer` exactly
 *    once and cached, so a walk never decodes/allocates sample memory again;
 *  - the gain/panner chain nodes come from a bounded free-list
 *    (`./pool.ts`) instead of a fresh pair per step;
 *  - only the one-shot `AudioBufferSourceNode` is created per play — that is
 *    cheap, cannot be restarted, and is the documented Web Audio pattern.
 *
 * DOM-guarded: importing this in node touches no audio device, and every entry
 * point is a no-op without a live context, so the pure parts stay testable.
 */

import { footstep, type Surface } from "./footsteps.ts";
import { createNodePool, type NodePool } from "./pool.ts";

/** Distinct pitch shavings rendered per surface. Two keeps L/R ears apart. */
export const VARIANTS = 2;

/** Pick which pre-rendered sample a step uses. Pure — no audio device. */
export function pickVariant(surface: Surface, step: number, variants = VARIANTS): number {
  const voice = footstep(surface, step);
  const base = footstep(surface, 0);
  // Deterministic bucketing on the voice's pitch so the same step always maps
  // to the same cached sample, and the two feet alternate between variants.
  const bucket = Math.round((voice.hz - base.hz + 32) / 8);
  return ((bucket % variants) + variants) % variants;
}

/** Cache key for a rendered sample. Pure. */
export function sampleKey(surface: Surface, variant: number): string {
  return `${surface}#${variant}`;
}

/** A pooled output chain: volume + optional stereo placement. */
export interface FootstepVoice {
  gain: GainNode;
  panner: StereoPannerNode | null;
}

export interface FootstepBankOptions {
  /** Idle chain nodes kept for reuse. */
  maxIdle?: number;
  /** Distinct rendered samples kept before the oldest is evicted. */
  maxSamples?: number;
  /** Seconds of audio rendered per sample. */
  seconds?: number;
}

/** Small deterministic noise generator, so a key renders identically every time. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Render one footstep sample: pitch-dropping body thump over a noise scuff. */
function renderSample(
  ctx: AudioContext,
  hz: number,
  gain: number,
  ms: number,
  seconds: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const frames = Math.max(1, Math.round(rate * seconds));
  const buffer = ctx.createBuffer(1, frames, rate);
  const data = buffer.getChannelData(0);
  const dur = ms / 1000;
  const rand = lcg(Math.round(hz * 1000 + dur * 1e6));

  let phase = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    if (t >= dur) break;
    // Body: sine whose pitch falls from hz*1.3 to hz*0.6 across the step.
    const f = hz * (1.3 - 0.7 * Math.min(1, t / (dur * 0.8)));
    phase += (2 * Math.PI * f) / rate;
    const env = Math.exp(-t * (6 / dur));
    const body = Math.sin(phase) * env;
    // Scuff: short, bright noise burst that dies within the first 35 ms.
    const scuff = t < 0.035 ? (rand() * 2 - 1) * Math.exp(-t / 0.008) : 0;
    data[i] = Math.max(-1, Math.min(1, (body * 0.8 + scuff * 0.35) * gain * 2.2));
  }
  return buffer;
}

export class FootstepBank {
  private ctx: AudioContext | null;
  private samples = new Map<string, AudioBuffer>();
  private voices: NodePool<FootstepVoice>;
  private maxSamples: number;
  private seconds: number;

  /** The context this bank is bound to (so callers can detect a context swap). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  constructor(ctx: AudioContext | null, opts: FootstepBankOptions = {}) {
    this.ctx = ctx;
    this.maxSamples = Math.max(1, opts.maxSamples ?? 12);
    this.seconds = Math.max(0.01, opts.seconds ?? 0.12);
    this.voices = createNodePool<FootstepVoice>(Math.max(1, opts.maxIdle ?? 8));
  }

  /** Idle chain nodes held for reuse — bounded, so a walk cannot grow this. */
  get idleVoices(): number {
    return this.voices.idle;
  }

  /** Chain nodes ever built — stops growing once the pool warms up. */
  get createdVoices(): number {
    return this.voices.created;
  }

  /** Distinct samples currently rendered. Bounded by `maxSamples`. */
  get cachedSamples(): number {
    return this.samples.size;
  }

  /** The rendered sample for a step, rendering it at most once per key. */
  sample(surface: Surface, step: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const key = sampleKey(surface, pickVariant(surface, step));
    const hit = this.samples.get(key);
    if (hit) return hit;

    const voice = footstep(surface, step);
    const rendered = renderSample(this.ctx, voice.hz, voice.gain, voice.ms, this.seconds);
    if (this.samples.size >= this.maxSamples) {
      const oldest = this.samples.keys().next();
      if (!oldest.done) this.samples.delete(oldest.value);
    }
    this.samples.set(key, rendered);
    return rendered;
  }

  /**
   * Play one step. Returns the voice it used, or null when there is no context.
   * The caller owns disconnecting; `endVoice` returns it to the pool.
   */
  play(surface: Surface, step: number, pan = 0, out?: AudioNode): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const buffer = this.sample(surface, step);
    if (!buffer) return null;

    const voice = this.voices.acquire(() => {
      const gain = ctx.createGain();
      const panner =
        typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
      if (panner) gain.connect(panner);
      return { gain, panner };
    });

    voice.gain.gain.value = 1;
    if (voice.panner) voice.panner.pan.value = Math.max(-1, Math.min(1, pan));
    const tail = voice.panner ?? voice.gain;
    try {
      tail.connect(out ?? ctx.destination);
    } catch {
      // Destination unavailable (suspended/closed context): play anyway.
    }

    // The source node is one-shot, so it is the one per-step allocation left.
    // When it ends, its chain node goes straight back to the free list.
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(voice.gain);
    src.onended = () => this.endVoice(voice);
    src.start();
    return src;
  }

  /** Return a finished chain node to the free list. */
  endVoice(voice: FootstepVoice): void {
    const tail = voice.panner ?? voice.gain;
    try {
      tail.disconnect();
    } catch {
      // Already disconnected.
    }
    this.voices.release(voice);
  }

  /** Total chain nodes alive in the bank right now (in flight + idle). */
  get liveVoices(): number {
    return this.voices.created - this.voices.idle;
  }

  /** Drop every cached sample and pooled node (context teardown). */
  dispose(): void {
    this.samples.clear();
  }
}

/** DOM guard: no window, no audio. */
export function bankFor(ctx: AudioContext | null): FootstepBank | null {
  if (typeof window === "undefined") return null;
  return new FootstepBank(ctx);
}
