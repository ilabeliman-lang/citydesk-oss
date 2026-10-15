/**
 * NDU-UPG kids: gentle sounds made in the browser with Web Audio (no audio files, nothing to license).
 * Off by default; the AudioContext is only created after a grown-up or child taps the sound bubble.
 * Quiet by design: master gain 0.18, soft attacks, no sudden loud noises.
 */
export type KidsSfx = "pop" | "chime" | "boing" | "sizzle" | "stir" | "whoosh" | "hug" | "tick";

export class KidsSound {
  private ctx: AudioContext;
  private master: GainNode;
  private lullabyTimer = 0;
  private onVis = () => {
    if (document.visibilityState === "hidden") void this.ctx.suspend();
    else void this.ctx.resume();
  };

  constructor() {
    const AC =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
    document.addEventListener("visibilitychange", this.onVis);
  }

  private tone(
    freq: number,
    at: number,
    dur: number,
    type: OscillatorType = "sine",
    vol = 0.6,
    slide = 0,
  ) {
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(at: number, dur: number, freq: number, vol: number) {
    const t = this.ctx.currentTime + at;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  play(fx: KidsSfx) {
    void this.ctx.resume();
    switch (fx) {
      case "pop":
        this.tone(520, 0, 0.12, "sine", 0.7, 300);
        break;
      case "chime":
        [784, 988, 1175].forEach((f, i) => this.tone(f, i * 0.09, 0.5, "triangle", 0.45));
        break;
      case "boing":
        this.tone(220, 0, 0.35, "sine", 0.6, 260);
        break;
      case "sizzle":
        this.noise(0, 1.2, 3500, 0.25);
        break;
      case "stir":
        this.noise(0, 0.4, 900, 0.35);
        break;
      case "whoosh":
        this.noise(0, 0.5, 600, 0.3);
        break;
      case "hug":
        [523, 659, 784].forEach((f) => this.tone(f, 0, 0.9, "sine", 0.25));
        break;
      case "tick":
        this.tone(1200, 0, 0.05, "square", 0.15);
        break;
    }
  }

  /** A slow, soft music-box lullaby (an original 8-note phrase) while bedtime is on. */
  lullaby(on: boolean) {
    window.clearInterval(this.lullabyTimer);
    if (!on) return;
    const phrase = [392, 330, 349, 294, 330, 262, 294, 196];
    const playOnce = () => phrase.forEach((f, i) => this.tone(f, i * 0.55, 1.1, "triangle", 0.3));
    playOnce();
    this.lullabyTimer = window.setInterval(playOnce, 6000);
  }

  dispose() {
    window.clearInterval(this.lullabyTimer);
    document.removeEventListener("visibilitychange", this.onVis);
    void this.ctx.close();
  }
}
