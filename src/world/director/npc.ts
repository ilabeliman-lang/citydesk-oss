/**
 * Street NPC day beat. Pure function — no scene, no GPU —
 * so `node --experimental-strip-types` can run the test.
 *
 * 7 to 9 → commute
 * 10 to 16 → errands
 * 17 to 19 → commute
 * otherwise → quiet
 *
 * Hour is an integer 0..23.
 */

export type CityBeat = "commute" | "errands" | "quiet";

/** Beat for a clock hour. 7–9 and 17–19 commute, 10–16 errands, else quiet. */
export function cityBeat(hour: number): CityBeat {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError("hour must be an integer 0..23");
  }
  if (hour >= 7 && hour <= 9) return "commute";
  if (hour >= 10 && hour <= 16) return "errands";
  if (hour >= 17 && hour <= 19) return "commute";
  return "quiet";
}

/** NDU-UPG wiring: walking pace multiplier per beat (commuters hurry, night is slow). */
export const BEAT_PACE: Record<CityBeat, number> = { commute: 1.18, errands: 1, quiet: 0.85 };

/** Beat for a minutes-of-day clock (wraps safely). */
export function beatAt(minutes: number): CityBeat {
  const h = Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
  return cityBeat(h);
}

export const BEAT_NOTE: Record<CityBeat, string> = {
  commute: "Rush hour: people hurry to work or home",
  errands: "Daytime: errands and market runs",
  quiet: "Quiet hours: a few late walkers",
};
