import type { AltMode } from "./types.ts";

/** NDU realism 02: pure pose maths for vehicles (PLAN §5.5) and scans on slopes (§5.6). */

/** Vehicle footprint (length, width m), same numbers as traffic/types.ts VEHICLE_DIMENSIONS. */
export const VEHICLE_BOX: Record<string, [number, number]> = { car: [4.5, 1.8], keke: [2.6, 1.3], bus: [10.5, 2.5], danfo: [5.2, 2.0], okada: [2.1, 0.8] };

export const MAX_TILT = (14 * Math.PI) / 180;
const clampTilt = (a: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, a));

/** Four wheel contacts → body height (mean), pitch (nose up +) and roll (left up +), clamped to ±14°. */
export function contactPose(zf: number, zr: number, zl: number, zrt: number, wheelbase: number, track: number) {
  const ok = (v: number) => Number.isFinite(v);
  if (![zf, zr, zl, zrt].every(ok)) {
    const vals = [zf, zr, zl, zrt].filter(ok);
    return { z: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, pitch: 0, roll: 0 };
  }
  return {
    z: (zf + zr + zl + zrt) / 4,
    pitch: clampTilt(Math.atan2(zf - zr, Math.max(0.5, wheelbase))),
    roll: clampTilt(Math.atan2(zl - zrt, Math.max(0.5, track))),
  };
}

/**
 * Vehicle pose on a height field `zAt(x, y)` (local metres, x east, y north) at `p`, heading (dx, dy).
 * `centreOnly` (degrade rung ≥ 3) skips the 4-contact work.
 */
export function vehiclePose(
  zAt: (x: number, y: number) => number,
  p: { x: number; y: number },
  dx: number,
  dy: number,
  len: number,
  width: number,
  centreOnly = false,
) {
  if (centreOnly) return { z: zAt(p.x, p.y), pitch: 0, roll: 0 };
  const half = 0.35 * len;
  const w = width / 2;
  // right of travel = (dy, -dx)
  const zf = zAt(p.x + dx * half, p.y + dy * half);
  const zr = zAt(p.x - dx * half, p.y - dy * half);
  const zl = zAt(p.x - dy * w, p.y + dx * w);
  const zrt = zAt(p.x + dy * w, p.y - dx * w);
  return contactPose(zf, zr, zl, zrt, 2 * half, width);
}

/** Exponential smoothing factor for time constant tau (s). */
export const ease = (dt: number, tau: number) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));

export const PLINTH_SPREAD_M = 0.5;

/**
 * Scan base height. cornersZ/centreZ are ground heights (drawn anchor + DEM deltas).
 *   ground:   centre + alt; if the corner spread > 0.5 m, min(corners) + alt and a plinth up to centre
 *   relative: centre + alt, no plinth;  absolute: alt (metres above sea level)
 */
export function scanBase(cornersZ: number[], centreZ: number, mode: AltMode = "ground", alt = 0): { base: number; plinth: number } {
  const a = Number.isFinite(alt) ? alt : 0;
  if (mode === "absolute") return { base: a, plinth: 0 };
  const c = Number.isFinite(centreZ) ? centreZ : 0;
  if (mode === "relative") return { base: c + a, plinth: 0 };
  const zs = cornersZ.filter(Number.isFinite);
  if (zs.length < 2) return { base: c + a, plinth: 0 };
  const lo = Math.min(...zs, c);
  const hi = Math.max(...zs, c);
  if (hi - lo <= PLINTH_SPREAD_M) return { base: c + a, plinth: 0 };
  return { base: lo + a, plinth: c - lo };
}

/** Footprint corners (lng/lat) of a scan of size [x, _, z] metres × scale rotated by `rotation` degrees clockwise. */
export function footprintCorners(lng: number, lat: number, sizeX: number, sizeZ: number, scale: number, rotation: number): [number, number][] {
  const kx = 111320 * (Math.cos((lat * Math.PI) / 180) || 1);
  const hx = (sizeX * scale) / 2;
  const hz = (sizeZ * scale) / 2;
  const r = (rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ].map(([x, y]) => {
    const ex = x * c + y * s;
    const ny = -x * s + y * c;
    return [lng + ex / kx, lat + ny / 111320] as [number, number];
  });
}
