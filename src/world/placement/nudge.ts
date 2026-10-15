// NDU-UPG placement: local equirectangular metres. 111_320 m per degree of latitude.

export type PlacementPose = { lng: number; lat: number; rotation: number; scale: number };

/** Metres per degree of latitude. Longitude is scaled by cos(lat). */
export const METRES_PER_DEG_LAT = 111_320;

const LNG_MIN = -180;
const LNG_MAX = 180;
const LAT_MIN = -85;
const LAT_MAX = 85;
/** Same bounds as `placeScan` in scans.ts (scale 0.01–100, heading normalised). */
export const SCALE_MIN = 0.01;
export const SCALE_MAX = 100;

export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  if (scale < SCALE_MIN) return SCALE_MIN;
  if (scale > SCALE_MAX) return SCALE_MAX;
  return scale;
}

export function clampLngLat(lng: number, lat: number): { lng: number; lat: number } {
  const x = Number.isFinite(lng) ? lng : 0;
  const y = Number.isFinite(lat) ? lat : 0;
  return {
    lng: Math.min(LNG_MAX, Math.max(LNG_MIN, x)),
    lat: Math.min(LAT_MAX, Math.max(LAT_MIN, y)),
  };
}

/** Pose clamped to the ranges `placeScan` accepts. Rotation is normalised into [0, 360). */
export function clampPose(pose: PlacementPose): PlacementPose {
  const at = clampLngLat(pose.lng, pose.lat);
  return {
    lng: at.lng,
    lat: at.lat,
    rotation: normalizeRotation(pose.rotation),
    scale: clampScale(pose.scale),
  };
}

/**
 * Shift a pose by metres. East increases longitude (cos(lat) > 0 away from the poles);
 * north increases latitude. Rotation and scale are left unchanged.
 */
export function offsetMetres(pose: PlacementPose, eastM: number, northM: number): PlacementPose {
  const east = Number.isFinite(eastM) ? eastM : 0;
  const north = Number.isFinite(northM) ? northM : 0;
  const latRad = (pose.lat * Math.PI) / 180;
  const metresPerDegLng = METRES_PER_DEG_LAT * Math.cos(latRad);
  const dLat = north / METRES_PER_DEG_LAT;
  const dLng = metresPerDegLng === 0 ? 0 : east / metresPerDegLng;
  const at = clampLngLat(pose.lng + dLng, pose.lat + dLat);
  return { ...pose, lng: at.lng, lat: at.lat };
}
