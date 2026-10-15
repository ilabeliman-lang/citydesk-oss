/**
 * Wet-street puddle darkening. Opacity only — no map, no reflection pass.
 * `rain` is a 0..1 rate (weather precipitation). Dry is 0. Full rain is 0.45.
 */

export const PUDDLE_OPACITY_MAX = 0.45;

/** Puddle layer opacity in [0, 0.45]. Rain of 0 is fully dry. */
export function puddleOpacity(rain: number): number {
  if (!Number.isFinite(rain) || rain <= 0) return 0;
  const amount = rain >= 1 ? 1 : rain;
  return PUDDLE_OPACITY_MAX * amount;
}
