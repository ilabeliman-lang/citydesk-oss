let ctx: AudioContext | null = null;

/** Each voice peaks here, under the 0.05 ceiling. */
const PEAK = 0.04;

export function unlockChime(): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof AudioContext === "undefined") return;
    if (!ctx || ctx.state === "closed") ctx = new AudioContext();
    void ctx.resume().catch(() => {});
  } catch {
    // Construction failed; later chimes stay silent.
  }
}

export function chime(kind: "done" | "act"): void {
  const audio = ctx;
  if (!audio || audio.state !== "running") return;
  try {
    const t = audio.currentTime;
    if (kind === "done") {
      // C5 → G5, a short rising fifth. The second note starts as the first fades.
      voice(audio, t, 523.25, 0.16, PEAK * 0.72);
      voice(audio, t + 0.11, 783.99, 0.26, PEAK);
      return;
    }
    voice(audio, t, 1560, 0.042, PEAK * 0.65, 540);
  } catch {
    // Missing, closed, or suspended context — stay quiet.
  }
}

function voice(
  audio: AudioContext,
  when: number,
  freq: number,
  dur: number,
  peak: number,
  endFreq?: number,
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const level = Math.min(PEAK, Math.max(0.0002, peak));
  const attack = Math.min(0.01, Math.max(0.003, dur * 0.2));
  const end = when + Math.max(dur, attack + 0.01);

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, end);
  }

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(level, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(when);
  osc.stop(end + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Node already torn down.
    }
  };
}
