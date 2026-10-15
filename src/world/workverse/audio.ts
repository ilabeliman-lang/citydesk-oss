/**
 * Procedural Web Audio soundscape engine for CityDesk's Jarvis Verse.
 * Synthesizes all sounds cleanly using the Web Audio API without external audio files.
 */

import { footstep, type Surface } from "@/world/audio/footsteps";
import { bankFor, type FootstepBank } from "@/world/audio/footstepBank"; // NDU-UPG u-074: pooled step voices

// Module-level Web Audio instances
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let stepCount = 0;
let stepBank: FootstepBank | null = null; // NDU-UPG u-074: lazy pooled footstep bank (bound to the live context)

// Ambient drone state tracking
interface AmbientDroneState {
  floor: number;
  gainNode: GainNode;
  oscillators: OscillatorNode[];
  filters: BiquadFilterNode[];
  noiseSource?: AudioBufferSourceNode;
}

let activeDrone: AmbientDroneState | null = null;
let droneFadeTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Returns or creates the singleton AudioContext and master bus safely.
 */
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtxClass) return null;

  if (!audioCtx || audioCtx.state === "closed") {
    try {
      audioCtx = new AudioCtxClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    } catch {
      return null;
    }
  }

  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

/**
 * Generates a procedural white noise buffer for friction, textures, and key clicks.
 */
function getNoiseBuffer(context: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) {
    return noiseBuffer;
  }

  const length = context.sampleRate * 1.5;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  noiseBuffer = buffer;
  return buffer;
}

/**
 * Initializes or resumes AudioContext upon user gesture.
 */
export async function initAudio(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
    }
  } catch {
    // Autoplay restrictions or unavailable audio device
  }
}

/**
 * Short, gentle low-frequency acoustic tap, randomized pitch (80-120Hz).
 * Non-intrusive and subtle with micro-friction texture.
 */
/** A key or a tap already happened. Resume so the next step can be heard. */
export function unlockStreetSteps(): void {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/** NDU-FP: the shared context (first-person footsteps and spatial vehicles reuse it). */
export function getSharedAudioContext(): AudioContext | null {
  return getContext();
}
// NDU-FP (FPXR-13): outdoor surfaces. [pitch lo, pitch span, peak, dur, noise lowpass Hz, noise mix]
const OUTDOOR: Record<string, [number, number, number, number, number, number]> = {
  asphalt: [85, 30, 0.04, 0.06, 900, 0.5],
  laterite: [70, 25, 0.034, 0.07, 1400, 0.9],
  concrete: [100, 30, 0.042, 0.06, 1100, 0.55],
  grass: [60, 20, 0.022, 0.08, 2200, 1.2],
  gravel: [75, 25, 0.03, 0.09, 3200, 1.4],
  wet: [80, 30, 0.036, 0.09, 2600, 1.3],
  wood: [120, 35, 0.045, 0.07, 700, 0.35],
};

export function playFootstep(surface?: string, opts?: { pan?: number; gain?: number }): void {
  const ctx = getContext();
  if (!ctx || !masterGain || ctx.state !== "running") return;

  try {
    const t = ctx.currentTime;

    // Pitch randomization & surface modulation
    let basePitch = 80 + Math.random() * 40; // 80 - 120Hz
    let peakVol = 0.038;
    let dur = 0.065;

    if (surface === "asphalt" || surface === "stone" || surface === "grass" || surface === "wood") {
      // NDU-UPG u-074: route these surfaces through the pooled FootstepBank.
      // The bank renders each (surface, variant) sample once and reuses pooled
      // gain/panner chain nodes, so a 60s walk allocates only one one-shot
      // BufferSource per step instead of a fresh osc+gain+panner+filter chain.
      // The bank is bound to the live context; rebuild if the context changed.
      const step = stepCount;
      stepCount += 1;
      if (!stepBank || stepBank.context !== ctx) stepBank = bankFor(ctx);
      if (stepBank) {
        stepBank.play(surface as Surface, step, opts?.pan ?? 0, masterGain ?? undefined);
        return; // bank path done — skip the per-step synth chain below
      }
      // No bank (no window / closed context): fall through to the inline synth.
      const voice = footstep(surface as Surface, step);
      basePitch = voice.hz;
      peakVol = Math.min(0.05, voice.gain * 0.08);
      dur = voice.ms / 1000;
    } else if (surface === "carpet") {
      basePitch = 70 + Math.random() * 25;
      peakVol = 0.026;
      dur = 0.055;
    } else if (surface === "metal" || surface === "tile") {
      basePitch = 105 + Math.random() * 30;
      peakVol = 0.042;
      dur = 0.075;
    }
    const outdoor = surface ? OUTDOOR[surface] : undefined;
    if (outdoor) {
      basePitch = outdoor[0] + Math.random() * outdoor[1];
      peakVol = outdoor[2];
      dur = outdoor[3];
    }
    if (opts?.gain !== undefined) peakVol *= Math.max(0, Math.min(1.5, opts.gain));

    // Voice Gain Node
    const footGain = ctx.createGain();
    footGain.gain.setValueAtTime(0.0001, t);
    footGain.gain.linearRampToValueAtTime(peakVol, t + 0.003);
    footGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // Subtle stereo panning for left/right step feel
    let finalNode: AudioNode = footGain;
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      const pan = opts?.pan ?? (Math.random() - 0.5) * 0.35; // gentle pan [-0.175, 0.175]
      panner.pan.setValueAtTime(pan, t);
      footGain.connect(panner);
      finalNode = panner;
    }
    finalNode.connect(masterGain);

    // 1. Acoustic body thump (pitch envelope: drops from basePitch * 1.3 to basePitch * 0.6)
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(basePitch * 1.3, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, basePitch * 0.6), t + dur * 0.8);
    osc.connect(footGain);
    osc.start(t);
    osc.stop(t + dur);

    // 2. Soft floor surface friction impulse (low-passed noise burst)
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.loop = false;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(outdoor ? outdoor[4] : surface === "metal" ? 600 : 320, t);
    noiseFilter.Q.setValueAtTime(0.7, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.linearRampToValueAtTime(peakVol * (outdoor ? outdoor[5] : 0.4), t + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(finalNode);

    noise.start(t);
    noise.stop(t + 0.04);
  } catch {
    // Graceful fallback
  }
}

/**
 * Crisp, short mechanical keyboard tick (high-frequency filtered burst, ~1500-2500Hz).
 */
export function playKeyClick(volumeFactor: number = 1.0, pan: number = 0): void {
  const ctx = getContext();
  if (!ctx || !masterGain || ctx.state !== "running") return;

  try {
    const t = ctx.currentTime;
    const factor = Math.max(0, Math.min(2.0, volumeFactor));
    const peakVol = 0.024 * factor;
    if (peakVol < 0.0005) return;

    // Optional panning
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
    panner.connect(masterGain);

    // Randomize center frequency within 1500 - 2500Hz band
    const centerFreq = 1600 + Math.random() * 800;
    const dur = 0.018;

    // 1. Tactile snap noise burst (Bandpass filtered white noise)
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(centerFreq, t);
    bandpass.Q.setValueAtTime(3.8, t);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, t);
    clickGain.gain.linearRampToValueAtTime(peakVol, t + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    noise.connect(bandpass);
    bandpass.connect(clickGain);
    clickGain.connect(panner);

    noise.start(t);
    noise.stop(t + dur + 0.005);

    // 2. Bottom-out mechanical micro-tone
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(centerFreq * 0.9, t);
    osc.frequency.exponentialRampToValueAtTime(centerFreq * 0.45, t + 0.012);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.linearRampToValueAtTime(peakVol * 0.4, t + 0.001);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);

    osc.connect(oscGain);
    oscGain.connect(panner);

    osc.start(t);
    osc.stop(t + 0.015);
  } catch {
    // Graceful fallback
  }
}

/**
 * Two-tone pleasant elevator bell chime (523Hz C5 -> 659Hz E5).
 * Luxurious, warm, and resonant.
 */
export function playElevatorChime(): void {
  const ctx = getContext();
  if (!ctx || !masterGain || ctx.state !== "running") return;

  try {
    const t = ctx.currentTime;

    const playBellTone = (freq: number, startTime: number, duration: number, peak: number) => {
      // Warm filter for acoustic chime resonance
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(4200, startTime);

      const toneGain = ctx.createGain();
      toneGain.gain.setValueAtTime(0.0001, startTime);
      toneGain.gain.linearRampToValueAtTime(peak, startTime + 0.005);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      filter.connect(toneGain);
      toneGain.connect(masterGain!);

      // Fundamental sine
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freq, startTime);
      osc1.connect(filter);
      osc1.start(startTime);
      osc1.stop(startTime + duration);

      // Warm octave overtone (bell harmonic)
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, startTime);

      const harmGain = ctx.createGain();
      harmGain.gain.setValueAtTime(0.24, startTime);
      harmGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.7);

      osc2.connect(harmGain);
      harmGain.connect(filter);
      osc2.start(startTime);
      osc2.stop(startTime + duration * 0.75);
    };

    // Note 1: C5 (523.25 Hz)
    playBellTone(523.25, t, 0.75, 0.036);

    // Note 2: E5 (659.25 Hz) after 260ms
    playBellTone(659.25, t + 0.26, 0.95, 0.040);
  } catch {
    // Graceful fallback
  }
}

/**
 * Clean retro computer terminal beep (880Hz A5 sine with soft decay).
 */
export function playTerminalBeep(): void {
  const ctx = getContext();
  if (!ctx || !masterGain || ctx.state !== "running") return;

  try {
    const t = ctx.currentTime;
    const dur = 0.095;
    const peak = 0.026;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t); // A5

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(t);
    osc.stop(t + dur + 0.01);
  } catch {
    // Graceful fallback
  }
}

/**
 * Very subtle low-frequency ambient drone.
 * Floor 0: warm room hum (Council floor).
 * Floor 1: sci-fi computational sub-bass drone at 0.02 gain (Coding floor).
 */
export function startAmbientHum(floor: number = 0): void {
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  // If drone is already running for the exact same floor, keep playing smoothly
  if (activeDrone && activeDrone.floor === floor) {
    return;
  }

  // Clear any pending fade out timer
  if (droneFadeTimeout) {
    clearTimeout(droneFadeTimeout);
    droneFadeTimeout = null;
  }

  // If another floor drone is active, smoothly stop it before starting new one
  if (activeDrone) {
    stopAmbientHum(0.4);
  }

  try {
    const t = ctx.currentTime;
    const oscillators: OscillatorNode[] = [];
    const filters: BiquadFilterNode[] = [];

    // Master drone gain node for smooth entry and exits
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.0001, t);

    let noiseSource: AudioBufferSourceNode | undefined;

    if (floor === 0) {
      // ── Floor 0: Warm Room Hum (60Hz HVAC / slow beating acoustic warmth) ──
      const targetGain = 0.016;
      droneGain.gain.linearRampToValueAtTime(targetGain, t + 1.2);

      // Lowpass filter for smooth warmth
      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.frequency.setValueAtTime(175, t);
      lpFilter.Q.setValueAtTime(0.65, t);
      filters.push(lpFilter);

      // Dual detuned 60Hz oscillators (59.6Hz & 60.4Hz for a soft 0.8Hz spatial beat)
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(59.6, t);
      osc1.connect(lpFilter);
      osc1.start(t);
      oscillators.push(osc1);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(60.4, t);
      osc2.connect(lpFilter);
      osc2.start(t);
      oscillators.push(osc2);

      // Faint 120Hz warmth overtone
      const osc3 = ctx.createOscillator();
      osc3.type = "sine";
      osc3.frequency.setValueAtTime(120, t);
      const osc3Gain = ctx.createGain();
      osc3Gain.gain.setValueAtTime(0.25, t);
      osc3.connect(osc3Gain);
      osc3Gain.connect(lpFilter);
      osc3.start(t);
      oscillators.push(osc3);

      lpFilter.connect(droneGain);
    } else {
      // ── Floor 1: Sci-Fi Computational Sub-Bass Drone (0.02 gain) ──
      const targetGain = 0.02;
      droneGain.gain.linearRampToValueAtTime(targetGain, t + 1.2);

      // Resonant lowpass for sub-bass server chamber vibe
      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.frequency.setValueAtTime(220, t);
      lpFilter.Q.setValueAtTime(1.15, t);
      filters.push(lpFilter);

      // Detuned 55Hz sub-bass pair (A1 fundamental)
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(54.7, t);
      osc1.connect(lpFilter);
      osc1.start(t);
      oscillators.push(osc1);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(55.3, t);
      osc2.connect(lpFilter);
      osc2.start(t);
      oscillators.push(osc2);

      // Subtle computational harmonic (110Hz triangle wave)
      const osc3 = ctx.createOscillator();
      osc3.type = "triangle";
      osc3.frequency.setValueAtTime(110, t);
      const osc3Gain = ctx.createGain();
      osc3Gain.gain.setValueAtTime(0.32, t);
      osc3.connect(osc3Gain);
      osc3Gain.connect(lpFilter);
      osc3.start(t);
      oscillators.push(osc3);

      // Faint server airflow whisper
      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);
      noise.loop = true;

      const airFilter = ctx.createBiquadFilter();
      airFilter.type = "bandpass";
      airFilter.frequency.setValueAtTime(680, t);
      airFilter.Q.setValueAtTime(2.2, t);

      const airGain = ctx.createGain();
      airGain.gain.setValueAtTime(0.003, t);

      noise.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(droneGain);
      noise.start(t);
      noiseSource = noise;

      lpFilter.connect(droneGain);
    }

    droneGain.connect(masterGain);

    activeDrone = {
      floor,
      gainNode: droneGain,
      oscillators,
      filters,
      noiseSource,
    };
  } catch {
    // Graceful fallback
  }
}

/**
 * Fades out and stops ambient drone.
 * @param fadeDurationSeconds Optional fade out duration in seconds (default: 0.6s).
 */
export function stopAmbientHum(fadeDurationSeconds: number = 0.6): void {
  const ctx = audioCtx;
  const drone = activeDrone;

  if (!drone || !ctx) {
    activeDrone = null;
    return;
  }

  // Clear active drone reference immediately so new calls know it's stopping
  activeDrone = null;

  try {
    const t = ctx.currentTime;
    const fadeDur = Math.max(0.05, fadeDurationSeconds);

    drone.gainNode.gain.cancelScheduledValues(t);
    drone.gainNode.gain.setValueAtTime(drone.gainNode.gain.value, t);
    drone.gainNode.gain.linearRampToValueAtTime(0.0001, t + fadeDur);

    droneFadeTimeout = setTimeout(() => {
      try {
        drone.oscillators.forEach((osc) => {
          try {
            osc.stop();
            osc.disconnect();
          } catch {
            // Already stopped
          }
        });
        if (drone.noiseSource) {
          try {
            drone.noiseSource.stop();
            drone.noiseSource.disconnect();
          } catch {
            // Already stopped
          }
        }
        drone.filters.forEach((f) => f.disconnect());
        drone.gainNode.disconnect();
      } catch {
        // Disconnect cleanup
      }
    }, (fadeDur + 0.05) * 1000);
  } catch {
    // Graceful fallback
  }
}
