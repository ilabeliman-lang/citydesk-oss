// NDU-FP (FPXR-14): HRTF vehicle hums around the first-person listener. Pure maths on top, adapter below.
export type Enu = { e: number; n: number; u: number };
const RAD = Math.PI / 180;
/** ENU metres -> Web Audio (right-handed, y up, -z forward = north at yaw 0). */
export const enuToWebAudio = (p: Enu) => ({ x: p.e, y: p.u, z: -p.n });
export function listenerForward(yawDeg: number, pitchUpDeg = 0) {
  const c = Math.cos(pitchUpDeg * RAD);
  return { x: Math.sin(yawDeg * RAD) * c, y: Math.sin(pitchUpDeg * RAD), z: -Math.cos(yawDeg * RAD) * c };
}
export const poolSize = (tier: "A" | "B" | "C") => (tier === "A" ? 16 : tier === "B" ? 8 : 0);
export type VehicleKind = "car" | "keke" | "bus";
const HUM: Record<VehicleKind, [number, number]> = { car: [55, 0.05], keke: [95, 0.06], bus: [42, 0.07] };

type Src = { id: string; panner: PannerNode; osc: OscillatorNode; gain: GainNode; seen: boolean };
export class SpatialBus {
  private ctx: AudioContext;
  private out: GainNode;
  private max: number;
  private srcs = new Map<string, Src>();
  private lastPos = 0;
  constructor(ctx: AudioContext, maxSources: number) {
    this.ctx = ctx;
    this.max = maxSources;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(ctx.destination);
  }
  setMax(n: number) {
    this.max = n;
    if (this.srcs.size > n) [...this.srcs.keys()].slice(n).forEach((id) => this.drop(id));
  }
  setListener(yawDeg: number, pitchUpDeg: number) {
    const l = this.ctx.listener;
    const f = listenerForward(yawDeg, pitchUpDeg);
    const t = this.ctx.currentTime;
    if (l.forwardX) {
      l.forwardX.setTargetAtTime(f.x, t, 0.05);
      l.forwardY.setTargetAtTime(f.y, t, 0.05);
      l.forwardZ.setTargetAtTime(f.z, t, 0.05);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else (l as unknown as { setOrientation?: (...a: number[]) => void }).setOrientation?.(f.x, f.y, f.z, 0, 1, 0);
  }
  /** enu relative to the listener (metres). Position updates are throttled to 20 Hz. */
  upsert(id: string, enu: Enu, kind: VehicleKind) {
    if (this.max <= 0) return;
    let s = this.srcs.get(id);
    if (!s) {
      if (this.srcs.size >= this.max) return;
      const panner = new PannerNode(this.ctx, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 3, maxDistance: 60, rolloffFactor: 1.2 });
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = HUM[kind][0] * (0.95 + Math.random() * 0.1);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(HUM[kind][1], this.ctx.currentTime, 0.2);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      osc.connect(lp).connect(gain).connect(panner).connect(this.out);
      osc.start();
      s = { id, panner, osc, gain, seen: true };
      this.srcs.set(id, s);
    }
    s.seen = true;
    const p = enuToWebAudio(enu);
    const t = this.ctx.currentTime;
    s.panner.positionX.setTargetAtTime(p.x, t, 0.05);
    s.panner.positionY.setTargetAtTime(p.y, t, 0.05);
    s.panner.positionZ.setTargetAtTime(p.z, t, 0.05);
  }
  /** Due for a 20 Hz position update? */
  due(nowMs: number) {
    if (nowMs - this.lastPos < 50) return false;
    this.lastPos = nowMs;
    return true;
  }
  prune(liveIds: Set<string>) {
    for (const id of [...this.srcs.keys()]) if (!liveIds.has(id)) this.drop(id);
  }
  private drop(id: string) {
    const s = this.srcs.get(id);
    if (!s) return;
    this.srcs.delete(id);
    const t = this.ctx.currentTime;
    s.gain.gain.setTargetAtTime(0, t, 0.08);
    s.osc.stop(t + 0.4);
    window.setTimeout(() => s.panner.disconnect(), 500);
  }
  dispose() {
    for (const id of [...this.srcs.keys()]) this.drop(id);
    window.setTimeout(() => this.out.disconnect(), 600);
  }
}
