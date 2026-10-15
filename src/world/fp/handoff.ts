// NDU-FP (FPXR-07): the 650 ms third <-> first blend. Pure. PLAN.md §4.5.
import { wrap180 } from "../orbit/orbitCore.ts";
import { eyeOf, streetCamera, type StreetView } from "../orbit/streetCam.ts";
import { M_PER_DEG } from "./rig.ts";

export type Pose = { lng: number; lat: number; altM: number; yawDeg: number; pitchUpDeg: number; vFovDeg: number };
const RAD = Math.PI / 180;

/** The eye the third-person street camera actually has (so the blend starts exactly on screen). */
export function thirdPose(avatar: { lng: number; lat: number }, bearing: number, view: StreetView, groundM: number): Pose {
  const cam = streetCamera(avatar, bearing, view);
  const e = eyeOf({ zoom: cam.zoom, pitch: cam.pitch, lat: cam.center[1] }, view);
  const b = cam.bearing * RAD;
  const coslat = Math.cos(cam.center[1] * RAD) || 1;
  return {
    lng: cam.center[0] - (e.back * Math.sin(b)) / (M_PER_DEG * coslat),
    lat: cam.center[1] - (e.back * Math.cos(b)) / M_PER_DEG,
    altM: groundM + e.height,
    yawDeg: cam.bearing,
    pitchUpDeg: cam.pitch - 90,
    vFovDeg: view.fov,
  };
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const u = Math.min(1, Math.max(0, t));
  const e = easeInOut(u);
  return {
    lng: a.lng + (b.lng - a.lng) * e,
    lat: a.lat + (b.lat - a.lat) * e,
    altM: a.altM + (b.altM - a.altM) * e + 0.4 * Math.sin(Math.PI * e),
    yawDeg: a.yawDeg + wrap180(b.yawDeg - a.yawDeg) * e,
    pitchUpDeg: a.pitchUpDeg + (b.pitchUpDeg - a.pitchUpDeg) * e,
    vFovDeg: a.vFovDeg + (b.vFovDeg - a.vFovDeg) * u,
  };
}
export function spriteOpacity(t: number): number {
  if (t <= 0.55) return 1;
  if (t >= 0.8) return 0;
  return 1 - (t - 0.55) / 0.25;
}
export class Handoff {
  private from: Pose | null = null;
  private to: () => Pose = () => this.from as Pose;
  private dur = 650;
  private reduced = false;
  t = 1;
  last: Pose | null = null;
  start(from: Pose, to: () => Pose, durMs = 650, reduced = false) {
    this.from = { ...from };
    this.to = to;
    this.dur = Math.max(1, durMs);
    this.reduced = reduced;
    this.t = 0;
    this.last = { ...from };
  }
  /** Turn around from the current blended pose (no snap). Default target: where the blend started. */
  reverse(to?: () => Pose) {
    if (!this.from || !this.last) return;
    const back = { ...this.from };
    this.start(this.last, to ?? (() => back), this.dur, this.reduced);
  }
  running() {
    return this.from !== null && this.t < 1;
  }
  step(dtMs: number): { pose: Pose; t: number; done: boolean } {
    if (!this.from) throw new Error("handoff not started");
    this.t = this.reduced ? 1 : Math.min(1, this.t + dtMs / this.dur);
    const pose = blendPose(this.from, this.to(), this.t);
    this.last = pose;
    return { pose, t: this.t, done: this.t >= 1 };
  }
}
