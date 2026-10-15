import { driveRoute } from "@/world/carto";
import { netRoute, snapPose, type Net, type Pt } from "@/world/paths";

/** Where a trip's line came from — shown to the player so a straight line is never passed off as a road. */
export type TripSource = "paths" | "road" | "line";

export type TripPlan = { points: Pt[]; source: TripSource };

export const TRIP_NOTE: Record<TripSource, string> = {
  paths: "Along OpenStreetMap paths",
  road: "Road route (CARTO)",
  line: "Straight line · not road-snapped",
};

/** Ground distance in meters (haversine). */
export function metersBetween(a: Pt, b: Pt): number {
  const r = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Running distance at each vertex; the last entry is the route length. */
export function cumulative(points: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i += 1) out.push(out[i - 1] + metersBetween(points[i - 1], points[i]));
  return out;
}

/** The route split at `d` meters: the travelled part, the part still to go, and the point itself. */
export function splitAt(points: Pt[], cum: number[], d: number): { done: Pt[]; left: Pt[]; at: Pt } {
  const total = cum[cum.length - 1] ?? 0;
  const dist = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < points.length - 1 && cum[i] < dist) i += 1;
  const a = points[i - 1];
  const b = points[i] ?? a;
  const span = cum[i] - cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (dist - cum[i - 1]) / span));
  const at = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return { done: [...points.slice(0, i), at], left: [at, ...points.slice(i)], at };
}

function tidy(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const last = out[out.length - 1];
    if (!last || metersBetween(last, p) > 0.5) out.push(p);
  }
  return out;
}

/**
 * Plan a trip, best source first: the OSM path network already loaded around the player (no API
 * call), then the CARTO road route the app already has a key for, then a plain straight line.
 */
export async function planTrip(net: Net | null, from: Pt, to: Pt): Promise<TripPlan> {
  if (net) {
    const a = snapPose(net, from.lat, from.lng, 60);
    const b = snapPose(net, to.lat, to.lng, 60);
    const walk = a && b ? netRoute(net, a, b) : null;
    if (walk && walk.length > 1) return { points: tidy([from, ...walk, to]), source: "paths" };
  }
  try {
    const road = await driveRoute({ data: { fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng } });
    if (road.ok && road.points.length > 1) return { points: tidy([from, ...road.points, to]), source: "road" };
  } catch {
    // fall through to the straight line
  }
  return { points: tidy([from, to]), source: "line" };
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function distanceLabel(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(meters))} m`;
}
