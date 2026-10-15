/**
 * NDU-UPG drag360: one camera "orbit" controller shared by the 3D map and the inside (isometric) view.
 * Horizontal drag → yaw (unbounded, so it wraps past 360° with no stops); vertical drag → pitch
 * (clamped to the caller's live limits). The shown camera follows the finger through a short spring,
 * and on release keeps gliding with the finger's speed and eases to a stop (inertia). Reduced motion:
 * the camera tracks the finger exactly and stops dead on release.
 * Pure (no DOM): the caller feeds pointer positions and a frame clock; tests drive it directly.
 */
export type OrbitView = { yaw: number; pitch: number };
export type OrbitLimits = { min: number; max: number };
export type OrbitOptions = {
  /** Degrees of yaw per pixel dragged sideways (drag left → +yaw). */
  yawPerPx?: number;
  /** Degrees of pitch per pixel dragged up/down (drag up → more pitch, i.e. toward the horizon). */
  pitchPerPx?: number;
  /** No spring and no glide. */
  reduced?: boolean;
};

export const YAW_PER_PX = 0.45; // a phone-width swipe (~390px) is about half a turn
export const PITCH_PER_PX = 0.3; // a full phone-height swipe covers the whole 0-85° range
const FOLLOW_S = 0.06; // spring time constant while the finger is down
const GLIDE_S = 0.35; // inertia decay time constant after release
const MAX_YAW_V = 900; // deg/s
const MAX_PITCH_V = 300;
const SAMPLE_MS = 100; // release speed = movement over the last 100 ms

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Wrap any angle into (-180, 180], like MapLibre's bearing. */
export const wrap180 = (deg: number) => {
  const r = (((deg + 180) % 360) + 360) % 360 - 180;
  return r === -180 ? 180 : r;
};

export class Orbit {
  /** What the camera shows now. */
  view: OrbitView = { yaw: 0, pitch: 0 };
  private target: OrbitView = { yaw: 0, pitch: 0 };
  private v = { yaw: 0, pitch: 0 };
  private grab: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private samples: { t: number; x: number; y: number }[] = [];
  private readonly yawPerPx: number;
  private readonly pitchPerPx: number;
  reduced: boolean;

  constructor(opts: OrbitOptions = {}) {
    this.yawPerPx = opts.yawPerPx ?? YAW_PER_PX;
    this.pitchPerPx = opts.pitchPerPx ?? PITCH_PER_PX;
    this.reduced = Boolean(opts.reduced);
  }

  get dragging() {
    return this.grab !== null;
  }

  /** Start a drag from the camera's real current view (it may have been moved by buttons/pinch). */
  down(x: number, y: number, now: number, from: OrbitView) {
    this.view = { ...from };
    this.target = { ...from };
    this.v = { yaw: 0, pitch: 0 };
    this.grab = { x, y, yaw: from.yaw, pitch: from.pitch };
    this.samples = [{ t: now, x, y }];
  }

  move(x: number, y: number, now: number, lim: OrbitLimits) {
    if (!this.grab) return;
    this.target.yaw = this.grab.yaw - (x - this.grab.x) * this.yawPerPx;
    this.target.pitch = clamp(this.grab.pitch - (y - this.grab.y) * this.pitchPerPx, lim.min, lim.max);
    this.samples.push({ t: now, x, y });
    while (this.samples.length > 2 && now - this.samples[0].t > SAMPLE_MS) this.samples.shift();
    if (this.reduced) this.view = { ...this.target };
  }

  up(now: number) {
    if (!this.grab) return;
    this.grab = null;
    if (this.reduced) return;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = Math.max(16, b.t - a.t) / 1000;
    // A finger that stopped before lifting (> SAMPLE_MS idle) gets no glide.
    const fresh = now - b.t < SAMPLE_MS;
    this.v.yaw = fresh ? clamp((-(b.x - a.x) * this.yawPerPx) / dt, -MAX_YAW_V, MAX_YAW_V) : 0;
    this.v.pitch = fresh ? clamp((-(b.y - a.y) * this.pitchPerPx) / dt, -MAX_PITCH_V, MAX_PITCH_V) : 0;
  }

  /** Stop any glide where it is (another gesture or camera move took over). */
  halt() {
    this.grab = null;
    this.v = { yaw: 0, pitch: 0 };
    this.target = { ...this.view };
  }

  /** Advance dt seconds. Returns true while the camera still needs frames. */
  step(dt: number, lim: OrbitLimits): boolean {
    if (this.reduced) {
      this.view.pitch = clamp(this.view.pitch, lim.min, lim.max);
      return false;
    }
    dt = clamp(dt, 0, 0.25); // exact exponentials: stable on slow frames, so a 10 fps phone does not lag
    if (!this.grab) {
      const decay = Math.exp(-dt / GLIDE_S);
      this.target.yaw += this.v.yaw * GLIDE_S * (1 - decay);
      this.target.pitch += this.v.pitch * GLIDE_S * (1 - decay);
      this.v.yaw *= decay;
      this.v.pitch *= decay;
      if (this.target.pitch <= lim.min || this.target.pitch >= lim.max) this.v.pitch = 0;
    }
    this.target.pitch = clamp(this.target.pitch, lim.min, lim.max);
    const k = 1 - Math.exp(-dt / FOLLOW_S);
    this.view.yaw += (this.target.yaw - this.view.yaw) * k;
    this.view.pitch += (this.target.pitch - this.view.pitch) * k;
    const settled =
      Math.abs(this.v.yaw) < 1 &&
      Math.abs(this.v.pitch) < 1 &&
      Math.abs(this.target.yaw - this.view.yaw) < 0.02 &&
      Math.abs(this.target.pitch - this.view.pitch) < 0.02;
    if (settled && !this.grab) {
      this.view = { ...this.target };
      this.v = { yaw: 0, pitch: 0 };
      return false;
    }
    return true;
  }
}

/** Shared by the map and the inside view. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}
