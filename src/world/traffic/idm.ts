/**
 * Intelligent Driver Model (IDM) car-following algorithm.
 * Reference: Treiber, Hennecke, & Helbing (2000).
 */

export type IdmParams = {
  desiredSpeedMps: number; // v0
  safeTimeHeadwayS: number; // T (typically 1.2 - 1.8s)
  maxAccelMps2: number;     // a (typically 1.0 - 2.5 m/s^2)
  comfortableDecelMps2: number; // b (typically 1.5 - 3.0 m/s^2)
  minDistanceM: number;     // s0 (jam distance, typically 2.0m)
  accelExponent: number;    // delta (usually 4)
};

export const DEFAULT_IDM_PARAMS: IdmParams = {
  desiredSpeedMps: 11.1, // ~40 km/h
  safeTimeHeadwayS: 1.5,
  maxAccelMps2: 1.8,
  comfortableDecelMps2: 2.2,
  minDistanceM: 2.5,
  accelExponent: 4,
};

/**
 * Calculates IDM acceleration.
 * @param v Current vehicle speed (m/s)
 * @param vLead Speed of leading vehicle in m/s (or null if free road)
 * @param gap Distance to leading vehicle in meters (or null/Infinity if free road)
 * @param params Optional IDM tuning parameters
 */
export function calculateIdmAcceleration(
  v: number,
  vLead: number | null,
  gap: number | null,
  params: Partial<IdmParams> = {}
): number {
  const p = { ...DEFAULT_IDM_PARAMS, ...params };
  const vClamped = Math.max(0, v);

  // Free road acceleration component: a * (1 - (v / v0)^delta)
  const freeRatio = p.desiredSpeedMps > 0 ? vClamped / p.desiredSpeedMps : 1;
  const freeTerm = 1 - Math.pow(Math.min(freeRatio, 2), p.accelExponent);

  if (gap === null || gap <= 0 || vLead === null || !Number.isFinite(gap)) {
    return Math.max(-p.comfortableDecelMps2 * 2, Math.min(p.maxAccelMps2, p.maxAccelMps2 * freeTerm));
  }

  // Interaction component:
  // s*(v, delta_v) = s0 + max(0, v*T + (v * delta_v) / (2 * sqrt(a * b)))
  const deltaV = vClamped - Math.max(0, vLead);
  const sqrtAB = Math.sqrt(p.maxAccelMps2 * p.comfortableDecelMps2);
  const dynTerm = (vClamped * deltaV) / (2 * sqrtAB);
  const desiredGap = p.minDistanceM + Math.max(0, vClamped * p.safeTimeHeadwayS + dynTerm);

  const interactTerm = Math.pow(desiredGap / Math.max(0.1, gap), 2);
  const accel = p.maxAccelMps2 * (freeTerm - interactTerm);

  // Clamp acceleration within realistic physical limits
  const maxDecel = p.comfortableDecelMps2 * 3.5; // emergency braking cap
  return Math.max(-maxDecel, Math.min(p.maxAccelMps2, accel));
}

/**
 * Step vehicle forward in time using Euler integration.
 */
export function stepVehiclePhysics(
  v: number,
  accel: number,
  dtSeconds: number
): { v: number; distanceM: number } {
  const dt = Math.max(0, Math.min(1.0, dtSeconds));
  const newV = Math.max(0, v + accel * dt);
  const avgV = (v + newV) / 2;
  const dist = avgV * dt;
  return { v: newV, distanceM: dist };
}
