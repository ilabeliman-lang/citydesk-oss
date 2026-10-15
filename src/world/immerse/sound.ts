import { thunderPan } from "./thunder";
import { soundLevels, type Fx } from "./weather";

/**
 * NDU-UPG immerse ambient soundscape (#315 #341 #305 + city/wind/birds/night beds).
 * 100% procedural Web Audio — no audio files, so nothing to license or download. Off by default;
 * created only after the player taps the sound bubble (autoplay rules). Levels follow the weather
 * and the sun (soundLevels in weather.ts); ducks under speech (TTS) and suspends when the tab hides.
 * Sunday bells: a soft three-toll bell at 9 AM and 6 PM ward time on Sundays (#341), mutable with the rest.
 */

type Bed = { gain: GainNode; stop: () => void };

// NDU-FP (FPXR-14): the listener's facing, so ambient birds pan relative to where first person looks.
let listenerYaw = 0;
export function setListenerYaw(deg: number) {
  listenerYaw = Number.isFinite(deg) ? deg : 0;
}
export const yawPan = (rawPan: number, yawDeg = listenerYaw) => Math.max(-0.9, Math.min(0.9, rawPan - Math.sin((yawDeg * Math.PI) / 180) * 0.5));

export class Soundscape {
  private ctx: AudioContext;
  private master: GainNode;
  private beds: Record<"city" | "rain" | "wind" | "night", Bed>;
  private birdsLevel = 0;
  private timers: number[] = [];
  private volume = 0.6;
  private duck = 1;
  private lastBell = "";
  private onThunder = (e: Event) =>
    this.thunder((e as CustomEvent<{ distanceKm?: number }>).detail?.distanceKm ?? 3);
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
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    const noise = this.noiseBuffer();
    this.beds = {
      city: this.noiseBed(noise, [{ type: "lowpass", f: 320, q: 0.5 }]),
      rain: this.noiseBed(noise, [
        { type: "highpass", f: 900, q: 0.4 },
        { type: "lowpass", f: 7000, q: 0.3 },
      ]),
      wind: this.windBed(noise),
      night: this.crickets(),
    };
    this.timers.push(window.setInterval(() => this.maybeBird(), 900));
    this.timers.push(
      window.setInterval(() => {
        const speaking = typeof speechSynthesis !== "undefined" && speechSynthesis.speaking;
        const want = speaking ? 0.3 : 1;
        if (want !== this.duck) {
          this.duck = want;
          this.applyMaster();
        }
      }, 1000),
    );
    window.addEventListener("ndu:thunder", this.onThunder);
    document.addEventListener("visibilitychange", this.onVis);
  }

  async start(volume: number) {
    this.volume = volume;
    await this.ctx.resume().catch(() => undefined);
    this.applyMaster(1.2);
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyMaster();
  }

  /** Follow weather + time; `zone`/`at` drive the Sunday bells. */
  update(fx: Fx, sunAltitude: number, zone: string, at: Date) {
    const lv = soundLevels(fx, sunAltitude);
    const t = this.ctx.currentTime;
    this.beds.city.gain.gain.setTargetAtTime(lv.city * 0.5, t, 1.5);
    this.beds.rain.gain.gain.setTargetAtTime(lv.rain * 0.55, t, 1.5);
    this.beds.wind.gain.gain.setTargetAtTime(lv.wind * 0.5, t, 2);
    this.beds.night.gain.gain.setTargetAtTime(lv.night * 0.05, t, 2);
    this.birdsLevel = lv.birds;
    this.maybeBell(zone, at);
  }

  async stop() {
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    this.timers.forEach((id) => window.clearInterval(id));
    window.removeEventListener("ndu:thunder", this.onThunder);
    document.removeEventListener("visibilitychange", this.onVis);
    await new Promise((r) => window.setTimeout(r, 700));
    Object.values(this.beds).forEach((b) => b.stop());
    await this.ctx.close().catch(() => undefined);
  }

  private applyMaster(tc = 0.4) {
    this.master.gain.setTargetAtTime(
      this.volume * this.volume * 0.9 * this.duck,
      this.ctx.currentTime,
      tc,
    );
  }

  private noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * white; // a little pink so it is not harsh
      d[i] = white * 0.6 + b * 2.4;
    }
    return buf;
  }

  private noiseBed(
    buf: AudioBuffer,
    filters: { type: BiquadFilterType; f: number; q: number }[],
  ): Bed {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    let node: AudioNode = src;
    for (const f of filters) {
      const bq = this.ctx.createBiquadFilter();
      bq.type = f.type;
      bq.frequency.value = f.f;
      bq.Q.value = f.q;
      node.connect(bq);
      node = bq;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain).connect(this.master);
    src.start();
    return { gain, stop: () => src.stop() };
  }

  private windBed(buf: AudioBuffer): Bed {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.8;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = this.ctx.createGain();
    depth.gain.value = 260;
    lfo.connect(depth).connect(bp.frequency);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    return {
      gain,
      stop: () => {
        src.stop();
        lfo.stop();
      },
    };
  }

  /** Crickets: a 4.4 kHz tone gated by a fast pulse train, in bursts. */
  private crickets(): Bed {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = 4400;
    const gate = this.ctx.createGain();
    gate.gain.value = 0;
    const pulse = this.ctx.createOscillator();
    pulse.type = "square";
    pulse.frequency.value = 28;
    const pulseDepth = this.ctx.createGain();
    pulseDepth.gain.value = 0.5;
    pulse.connect(pulseDepth).connect(gate.gain);
    // bursts: on/off about once a second
    const burst = this.ctx.createGain();
    burst.gain.value = 0.5;
    const slow = this.ctx.createOscillator();
    slow.type = "square";
    slow.frequency.value = 0.7;
    const slowDepth = this.ctx.createGain();
    slowDepth.gain.value = 0.5;
    slow.connect(slowDepth).connect(burst.gain);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gate).connect(burst).connect(gain).connect(this.master);
    osc.start();
    pulse.start();
    slow.start();
    return {
      gain,
      stop: () => {
        osc.stop();
        pulse.stop();
        slow.stop();
      },
    };
  }

  private maybeBird() {
    if (this.birdsLevel < 0.05 || Math.random() > this.birdsLevel * 0.6) return;
    const t = this.ctx.currentTime + Math.random() * 0.3;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1600;
    const pan = this.ctx.createStereoPanner?.();
    for (let i = 0; i < notes; i += 1) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const s = t + i * (0.09 + Math.random() * 0.05);
      osc.frequency.setValueAtTime(base, s);
      osc.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.4), s + 0.06);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05 * this.birdsLevel, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
      osc.connect(g);
      if (pan) {
        pan.pan.value = yawPan(Math.random() * 1.6 - 0.8);
        g.connect(pan).connect(this.master);
      } else g.connect(this.master);
      osc.start(s);
      osc.stop(s + 0.1);
    }
  }

  private thunder(distanceKm: number) {
    const side = thunderPan(distanceKm);
    const t = this.ctx.currentTime;
    const len = 3.5;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i += 1) {
      b = 0.995 * b + 0.005 * (Math.random() * 2 - 1);
      d[i] = b * 12;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900 / Math.max(1, distanceKm / 2), t);
    lp.frequency.exponentialRampToValueAtTime(90, t + len);
    const g = this.ctx.createGain();
    const peak = Math.min(0.9, 1.4 / distanceKm);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const pan = this.ctx.createStereoPanner?.();
    if (pan) {
      pan.pan.setValueAtTime(side, t);
      src.connect(lp).connect(g).connect(pan).connect(this.master);
    } else src.connect(lp).connect(g).connect(this.master);
    src.start(t);
  }

  /** #341: Sunday bells, 9:00 and 18:00 ward time (first five minutes), once each. */
  private maybeBell(zone: string, at: Date) {
    let parts: Record<string, string>;
    try {
      parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          weekday: "short",
          hour: "numeric",
          minute: "numeric",
          hourCycle: "h23",
        })
          .formatToParts(at)
          .map((p) => [p.type, p.value]),
      );
    } catch {
      return;
    }
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (parts.weekday !== "Sun" || (hour !== 9 && hour !== 18) || minute > 5) return;
    const tag = `${at.toDateString()}-${hour}`;
    if (tag === this.lastBell) return;
    this.lastBell = tag;
    for (let i = 0; i < 3; i += 1) this.bell(this.ctx.currentTime + 0.5 + i * 2.6);
  }

  /** A soft church bell from a few inharmonic partials. */
  private bell(t: number) {
    const f0 = 392;
    for (const [ratio, amp, decay] of [
      [0.5, 0.35, 5],
      [1, 0.5, 4],
      [1.19, 0.25, 3],
      [1.5, 0.2, 2.5],
      [2, 0.15, 2],
      [2.74, 0.08, 1.5],
    ]) {
      const osc = this.ctx.createOscillator();
      osc.frequency.value = f0 * ratio;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06 * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + decay + 0.1);
    }
  }
}
