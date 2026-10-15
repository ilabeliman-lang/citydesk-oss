/**
 * Distance LOD bands. Pure numbers — no GPU, no scene, no imports —
 * so `node --experimental-strip-types` can run the test.
 *
 * under 40 m → near
 * under 120 m → mid
 * otherwise → far
 */

export type LodBand = "near" | "mid" | "far";

/** Band for a camera-to-subject distance in metres. */
export function lodBand(metres: number): LodBand {
  if (metres < 40) return "near";
  if (metres < 120) return "mid";
  return "far";
}

/** Draw scale for that band. Near is unchanged. */
export function lodScale(metres: number): number {
  const band = lodBand(metres);
  return band === "near" ? 1 : band === "mid" ? 0.72 : 0.45;
}
