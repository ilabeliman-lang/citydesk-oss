// NDU-FP (FPXR-09): comfort maths. Pure. PLAN.md §4.7.
export type VignetteMode = "off" | "auto" | "strong";
const K: Record<VignetteMode, number> = { off: 0, auto: 0.25, strong: 0.4 };
export function vignetteStrength(angVelDegS: number, linAccMS2: number, mode: VignetteMode): number {
  return K[mode] * Math.min(1, Math.max(0, Math.abs(angVelDegS) / 120 + Math.abs(linAccMS2) / 3));
}
/** Ramp the shown vignette: in over 120 ms, out over 300 ms. */
export function rampVignette(shown: number, target: number, dtS: number): number {
  const tau = target > shown ? 0.12 : 0.3;
  return shown + (target - shown) * Math.min(1, dtS / tau);
}
export const reticleDefault = (pointerCoarse: boolean) => pointerCoarse;
