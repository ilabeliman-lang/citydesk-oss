// NDU-FP (FPXR-05): pitch caps, eased limits, ground spring, eye clearance. Pure. PLAN.md §4.6.
export type Limits = { min: number; max: number };
export const ZOOM_CAP = 24;
export const EYE_CLEAR_M = 0.3;

export function pitchLimits(tier: "A" | "B" | "C"): Limits {
  return tier === "C" ? { min: -60, max: 35 } : { min: -70, max: 70 };
}
/** Map-pitch cap that matches pitchLimits (pitch-up + 90). */
export const mapPitchCap = (tier: "A" | "B" | "C"): Limits => {
  const l = pitchLimits(tier);
  return { min: 90 + l.min, max: 90 + l.max };
};
/** Move `from` toward `to` at a rate that covers the largest tier change (35°) in ~300 ms. */
export function easeLimits(from: Limits, to: Limits, dt: number, tauS = 0.3): Limits {
  const rate = 35 / tauS;
  const step = (a: number, b: number) => (Math.abs(b - a) <= rate * dt ? b : a + Math.sign(b - a) * rate * dt);
  return { min: step(from.min, to.min), max: step(from.max, to.max) };
}
export type Spring = { y: number; v: number };
/** Critically damped ground follow (ω = 8), vertical speed capped +1.2 / −2.0 m/s. */
export function groundSpring(s: Spring, target: number, dt: number, omega = 8): Spring {
  let { y, v } = s;
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = omega * omega * (target - y) - 2 * omega * v;
    v = Math.min(1.2, Math.max(-2.0, v + a * h));
    y += v * h;
  }
  return { y, v };
}
export function clampEye(altM: number, groundM: number, eyeM: number): number {
  void eyeM;
  return Math.max(altM, groundM + EYE_CLEAR_M);
}
