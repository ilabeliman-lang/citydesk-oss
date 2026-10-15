// NDU-FP (FPXR-08): the pure per-frame maths the controller runs (gait -> move -> ground -> bob -> camera).
import { bobOffsets, newGait, stepGait, type GaitState } from "./gait.ts";
import { groundSpring, clampEye, pitchLimits, type Spring } from "./limits.ts";
import { fpCamera, fpFov, posture, M_PER_DEG, type FpCam, type PostureId } from "./rig.ts";

const RAD = Math.PI / 180;
export type FrameState = {
  pos: { lng: number; lat: number };
  yaw: number;
  pitchUp: number;
  gait: GaitState;
  ground: Spring;
  eyeM: number; // eased posture eye height
  posture: PostureId;
  eye: { lng: number; lat: number; altM: number };
  vFov: number;
};
export type FrameInputs = {
  move: { x: number; y: number };
  run: boolean;
  kind: string;
  groundM: number;
  prefs: { statureM: number; bob: number; hFovDeg?: number };
  viewport: { w: number; h: number };
  reduced: boolean;
  tier: "A" | "B" | "C";
  /** When the app moves the avatar (network walk), pass its position; else the frame integrates it. */
  pos?: { lng: number; lat: number };
};
export function newFrameState(pos: { lng: number; lat: number }, yaw: number, groundM: number, p: PostureId = "stand", statureM = 1.75): FrameState {
  const eyeM = posture(p, statureM).eyeM;
  return { pos: { ...pos }, yaw, pitchUp: -6, gait: newGait(), ground: { y: groundM, v: 0 }, eyeM, posture: p, eye: { ...pos, altM: groundM + eyeM }, vFov: 58.7 };
}
/** Gait only (CityBuildings calls this through stepMetres). Returns metres to walk this tick. */
export function gaitTick(s: FrameState, dt: number, move: { x: number; y: number }, run: boolean, kind: string, statureM: number) {
  const r = stepGait(s.gait, dt, { mag: Math.min(1, Math.hypot(move.x, move.y)), run, kind, posture: s.posture, statureM });
  s.gait = r.state;
  return r;
}
/** Camera from the current state (no gait step). Mutates s.eye / s.ground / s.eyeM / s.vFov. */
export function viewOf(s: FrameState, inp: FrameInputs, dt: number): FpCam {
  if (inp.pos) s.pos = { lng: inp.pos.lng, lat: inp.pos.lat };
  s.ground = groundSpring(s.ground, inp.groundM, dt);
  const target = posture(s.posture, inp.prefs.statureM);
  s.eyeM += (target.eyeM - s.eyeM) * Math.min(1, dt / 0.3);
  const b = bobOffsets(s.gait, inp.prefs.bob * target.bobScale, inp.prefs.statureM);
  const coslat = Math.cos(s.pos.lat * RAD) || 1;
  const right = (s.yaw + 90) * RAD;
  const altM = clampEye(s.ground.y + s.eyeM + b.y, s.ground.y, s.eyeM);
  s.eye = { lng: s.pos.lng + (b.x * Math.sin(right)) / (M_PER_DEG * coslat), lat: s.pos.lat + (b.x * Math.cos(right)) / M_PER_DEG, altM };
  const lim = pitchLimits(inp.tier);
  s.pitchUp = Math.min(lim.max, Math.max(lim.min, s.pitchUp));
  s.vFov = fpFov(inp.viewport.w, inp.viewport.h, inp.prefs.hFovDeg ?? 90, s.gait.speed, inp.reduced);
  const pu = Math.min(lim.max, Math.max(lim.min, s.pitchUp + b.pitchDeg));
  return fpCamera(s.eye, s.yaw, pu, s.vFov, inp.viewport.h, b.rollDeg);
}
export function computeFrame(s0: FrameState, inp: FrameInputs, dt: number): { cam: FpCam; state: FrameState; steps: ("L" | "R")[] } {
  const s: FrameState = { ...s0, pos: { ...s0.pos }, eye: { ...s0.eye }, ground: { ...s0.ground }, gait: { ...s0.gait } };
  const r = gaitTick(s, dt, inp.move, inp.run, inp.kind, inp.prefs.statureM);
  if (!inp.pos && r.metres > 0) {
    const m = Math.hypot(inp.move.x, inp.move.y) || 1;
    const dir = s.yaw * RAD + Math.atan2(inp.move.x / m, inp.move.y / m);
    const coslat = Math.cos(s.pos.lat * RAD) || 1;
    s.pos = { lng: s.pos.lng + (r.metres * Math.sin(dir)) / (M_PER_DEG * coslat), lat: s.pos.lat + (r.metres * Math.cos(dir)) / M_PER_DEG };
  }
  const cam = viewOf(s, inp, dt);
  return { cam, state: s, steps: r.steps };
}
