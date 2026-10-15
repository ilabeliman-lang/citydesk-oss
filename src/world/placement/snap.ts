// NDU-UPG placement: snap a pose onto a centre and an optional longest-edge bearing.
import {
  clampLngLat,
  clampScale,
  METRES_PER_DEG_LAT,
  normalizeRotation,
  type PlacementPose,
} from "./nudge.ts";

export type { PlacementPose };

/**
 * Pose sitting on `centre`. `bearing` (degrees clockwise from north) becomes the yaw.
 * When bearing is omitted, rotation is left unchanged. Scale is kept, then clamped.
 */
export function snap(
  centre: { lng: number; lat: number },
  bearing: number | null | undefined,
  pose: PlacementPose,
): PlacementPose {
  const at = clampLngLat(centre.lng, centre.lat);
  const rotation =
    bearing == null || !Number.isFinite(bearing) ? pose.rotation : normalizeRotation(bearing);
  return { lng: at.lng, lat: at.lat, rotation, scale: clampScale(pose.scale) };
}

/**
 * Bearing (degrees clockwise from north) of the longest edge in a ring.
 * Rings are [lng, lat]. A missing or tiny ring returns null so the caller can keep yaw.
 * Pass a centre from `footprintCentre` (scanLayer) — this file does not recompute it.
 */
export function longestEdgeBearing(
  ring: ReadonlyArray<readonly number[]> | null | undefined,
): number | null {
  if (!ring || ring.length < 2) return null;
  let best = 0;
  let bearing: number | null = null;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a == null || b == null || a.length < 2 || b.length < 2) continue;
    const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
    const east = (b[0] - a[0]) * METRES_PER_DEG_LAT * Math.cos(midLat);
    const north = (b[1] - a[1]) * METRES_PER_DEG_LAT;
    const len2 = east * east + north * north;
    if (len2 > best) {
      best = len2;
      bearing = normalizeRotation((Math.atan2(east, north) * 180) / Math.PI);
    }
  }
  return bearing;
}
