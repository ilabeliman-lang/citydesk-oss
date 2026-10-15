// NDU-FP (FPXR-04): distance-driven gait, head bob and step events. Pure. PLAN.md §4.4.
import { posture, type PostureId } from "./rig.ts";

export type GaitState = { speed: number; phase: number; stride: number; foot: "L" | "R"; distance: number };
export const WALK = 1.4;
export const JOG = 3.5;
const ACCEL = 3.0;
const DECEL = 5.0;

export const newGait = (): GaitState => ({ speed: 0, phase: 0, stride: 0, foot: "R", distance: 0 });
export const paceFp = (kind: string) => (kind === "steps" || kind === "path" || kind === "track" ? 0.8 : 1.0);
export const stepLength = (statureM: number, speed: number) => 0.415 * statureM * (1 + (0.25 * Math.max(0, speed - WALK)) / (JOG - WALK));

export function stepGait(
  s: GaitState,
  dt: number,
  input: { mag: number; run: boolean; kind: string; posture: PostureId; statureM: number },
): { state: GaitState; steps: ("L" | "R")[]; metres: number } {
  const p = posture(input.posture, input.statureM);
  const cap = input.run ? p.maxJog : p.maxWalk;
  const mag = Math.min(1, Math.max(0, input.mag));
  const target = mag * Math.min(cap, input.run ? JOG : WALK) * paceFp(input.kind);
  let speed = s.speed;
  if (speed < target) speed = Math.min(target, speed + ACCEL * dt);
  else speed = Math.max(target, speed - DECEL * dt);
  const metres = speed * dt;
  const len = stepLength(input.statureM, speed);
  let phase = s.phase + metres / len;
  let stride = s.stride + metres / len / 2;
  let foot = s.foot;
  const steps: ("L" | "R")[] = [];
  while (phase >= 1) {
    phase -= 1;
    foot = foot === "L" ? "R" : "L";
    steps.push(foot);
  }
  stride -= Math.floor(stride);
  if (speed === 0 && metres === 0) {
    // standing: let the step settle at the trough so the next start lands cleanly
  }
  return { state: { speed, phase, stride, foot, distance: s.distance + metres }, steps, metres };
}

/** Bob offsets in metres / degrees. The eye is lowest at heel strike (phase 0, the step event). */
export function bobOffsets(s: GaitState, bob: number, statureM: number): { y: number; x: number; pitchDeg: number; rollDeg: number } {
  if (bob <= 0 || s.speed <= 0) return { y: 0, x: 0, pitchDeg: 0, rollDeg: 0 };
  const k = statureM / 1.75;
  const ay = 0.022 * bob * Math.min(1.5, s.speed / WALK) * k;
  const y = (-ay * (1 + Math.cos(2 * Math.PI * s.phase))) / 2;
  const sw = Math.sin(2 * Math.PI * s.stride);
  const x = 0.01 * bob * sw;
  const pitchDeg = (-Math.atan2(y, 10) * 180) / Math.PI;
  return { y, x, pitchDeg, rollDeg: 0.25 * bob * sw };
}
