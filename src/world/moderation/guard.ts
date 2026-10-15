/**
 * In-memory chat gate. Five messages per user inside ten seconds; the sixth is refused.
 * Nothing is written to disk or the network.
 */

const WINDOW_MS = 10_000;
const MAX_IN_WINDOW = 5;

const hits = new Map<string, number[]>();

/** True when this user may send at nowMs. The sixth stamp inside the window is false. */
export function allowMessage(userId: string, nowMs: number): boolean {
  const key = typeof userId === "string" ? userId : "";
  const now = typeof nowMs === "number" ? nowMs : Number.NaN;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS && now - t >= 0);
  if (!Number.isFinite(now) || recent.length >= MAX_IN_WINDOW) {
    if (Number.isFinite(now)) hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
