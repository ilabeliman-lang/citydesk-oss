// NDU-FP (FPXR-06): mixes mouse, pad, keys and gyro into one yaw / pitch-up. Pure. PLAN.md §4.3.
import type { Limits } from "./limits.ts";

export const PAD_DEAD = 0.15;
const PAD_YAW = 140;
const PAD_PITCH = 90;
const TURN_DEG_S = 90;

export class LookMixer {
  yaw = 0; // unbounded
  pitchUp = -6;
  gyroYaw = 0;
  gyroPitch = 0;
  gyroOffYaw = 0;
  gyroOffPitch = 0;
  gyroOn = false;
  private limits: Limits = { min: -70, max: 70 };
  set(yaw: number, pitchUp: number) {
    this.yaw = yaw;
    this.pitchUp = pitchUp;
  }
  setLimits(l: Limits) {
    this.limits = l;
    this.pitchUp = Math.min(l.max, Math.max(l.min, this.pitchUp));
  }
  private addPitch(d: number) {
    this.pitchUp = Math.min(this.limits.max, Math.max(this.limits.min, this.pitchUp + d));
  }
  applyMouse(dx: number, dy: number, prefs: { sensitivity: number; invertY: boolean }) {
    this.yaw += dx * prefs.sensitivity;
    this.addPitch(-dy * prefs.sensitivity * (prefs.invertY ? -1 : 1));
  }
  /** Touch: degrees already computed by the caller (1:1). */
  applyDeg(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.addPitch(dPitch);
  }
  applyPad(rx: number, ry: number, dt: number) {
    const shape = (v: number) => {
      const m = Math.abs(v);
      if (m < PAD_DEAD) return 0;
      const n = (m - PAD_DEAD) / (1 - PAD_DEAD);
      return Math.sign(v) * n * n;
    };
    this.yaw += shape(rx) * PAD_YAW * dt;
    this.addPitch(-shape(ry) * PAD_PITCH * dt);
  }
  /** Keys / pad turn: smooth at 90°/s, or one snap of snapDeg per call (caller edge-detects). */
  applyTurn(dir: number, dt: number, snapDeg = 0) {
    if (!dir) return;
    if (snapDeg > 0) this.yaw = Math.round((this.yaw + Math.sign(dir) * snapDeg) / snapDeg) * snapDeg;
    else this.yaw += dir * TURN_DEG_S * dt;
  }
  /** Gyro (relative mode): the first sample after enabling captures the offset so nothing jumps. */
  setGyro(yaw: number, pitch: number) {
    if (!this.gyroOn) {
      this.gyroOn = true;
      this.gyroOffYaw = this.yaw - yaw;
      this.gyroOffPitch = this.pitchUp - pitch;
    }
    this.gyroYaw = yaw;
    this.gyroPitch = pitch;
    this.yaw = yaw + this.gyroOffYaw;
    this.pitchUp = Math.min(this.limits.max, Math.max(this.limits.min, pitch + this.gyroOffPitch));
  }
  gyroOff() {
    this.gyroOn = false;
  }
  output(limits: Limits = this.limits): { yaw: number; pitchUp: number } {
    return { yaw: this.yaw, pitchUp: Math.min(limits.max, Math.max(limits.min, this.pitchUp)) };
  }
}
