/**
 * Wind lean for trees and street props.
 * A metres offset in the same east/north frame as the weather wind. Pure.
 */

export type WindMetresPerSecond = { east: number; north: number };

/** Displacement of a crown or sign, in metres. */
export type SwayMetres = { east: number; north: number };

/** One gust cycle. The offset repeats every this many seconds. */
export const SWAY_PERIOD_SECONDS = 2.4;

/** Hard cap so a storm still only leans a quarter of a metre. */
const MAX_METRES = 0.25;

/** 1/32 m of lean per 1 m/s of wind, before the cap. */
const METRES_PER_MPS = 0.03125;

const ZERO: SwayMetres = { east: 0, north: 0 };

/**
 * Periodic downwind offset at `tSeconds`.
 * Calm air, or a bad clock, stays at the origin. The result is always small.
 */
/** Weather gives km/h and the direction it blows from. Trees want metres per second, blowing toward. */
export function windVector(kmh: number, fromDeg: number): WindMetresPerSecond {
  const speed = Number(kmh) / 3.6;
  if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(fromDeg)) return { east: 0, north: 0 };
  const toward = ((fromDeg + 180) * Math.PI) / 180;
  return { east: Math.sin(toward) * speed, north: Math.cos(toward) * speed };
}

let street: WindMetresPerSecond = { east: 1.2, north: 0.4 };

export function setStreetWind(kmh: number, fromDeg: number) {
  street = windVector(kmh, fromDeg);
}

export function streetWind(): WindMetresPerSecond {
  return street;
}

export function sway(tSeconds: number, wind: WindMetresPerSecond): SwayMetres {
  const east = Number(wind.east);
  const north = Number(wind.north);
  if (!Number.isFinite(tSeconds) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return ZERO;
  }
  const speed = Math.hypot(east, north);
  if (speed < 1e-6) return ZERO;
  const amp = Math.min(MAX_METRES, speed * METRES_PER_MPS);
  const along = Math.sin((tSeconds / SWAY_PERIOD_SECONDS) * Math.PI * 2);
  const scale = (amp * along) / speed;
  return { east: east * scale, north: north * scale };
}
