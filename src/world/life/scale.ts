// NDU-UPG life / follow: how big the crowd is drawn (alias-free so node tests can import it).

/** Readability boost: true scale from z19.5 in; larger further out (people ≤2.6x, vehicles ≤1.5x) so the street still reads on a phone. */
export const walkerScale = (z: number) => Math.max(1, Math.min(2.6, 1 + (19.5 - z) * 0.7));
export const vehicleScale = (z: number) => 1 + (walkerScale(z) - 1) * 0.3;
/** NDU-UPG follow: street-level (near-horizontal) view = true scale, like the avatar and the buildings (1 unit = 1 m). */
export const STREET_TILT = 72;
export const lifeScales = (z: number, pitch: number) => (pitch >= STREET_TILT ? { scale: 1, vscale: 1 } : { scale: walkerScale(z), vscale: vehicleScale(z) });
/** NDU-UPG follow: you can say hello to a walker within this many metres of your avatar. */
export const GREET_M = 15;
/** Horizon-style personal boundary. Another figure should not stand inside this. */
export const PERSONAL_M = 1.2;
