// NDU-UPG follow: street-level, human-eye default camera (Wei 3:18 AM). Pure maths, no map import (unit tested).

/**
 * The world is metres 1:1: MapLibre extrudes OSM building heights in metres (a storey ~3 m), the YOU
 * figure and other people are sized at HUMAN_M = 1.75 m, the life crowd and cars are modelled in metres
 * (person ~1.7 m, car 4.3 m x 1.5 m). The avatar sits in the middle of the screen on a flat tilt
 * (about 46°, not the old 80° dive). The camera is behind them, and the point it looks at is their feet,
 * so a finger drag turns and tilts instead of rushing the ground like a zoom.
 *
 * MapLibre has no free camera in its gestures, so the rig is expressed as the map camera it equals:
 * the camera looks at `center` on the ground, `eye * tan(pitch)` metres ahead of the eye, from a
 * distance of `eye / cos(pitch)` metres; zoom is chosen so that distance comes out in metres:
 *   cameraToCenter(px) = 0.5 * height / tan(fov / 2),  metres per px = distance / cameraToCenter,
 *   zoom = log2(earth * cos(lat) / (512 * metresPerPx)).
 */
/** NDU-FP: eye height is 0.936 x stature (anthropometric mean), 1.75 m -> 1.64 (shown 1.65). */
export const EYE_RATIO = 0.936;
export const eyeFromStature = (m: number) => Math.round(m * EYE_RATIO * 20) / 20; // nearest 5 cm: 1.75 -> 1.65
export const STREET_EYE_M = 48; // high enough to see the block of 3D buildings, still on the avatar
export const STREET_PITCH = 58; // tilted enough that walls and roofs both read; avatar stays centred
// Looking at the avatar's feet. behind = eye * tan(pitch) puts the look-at point on them, not up the street.
/** Low tier (Tier C caps the tilt at 60°): from eye height that would only show pavement, so the camera sits higher and further back. */
export const LOW_RIG = { eye: 6, behind: 9 };
export const STREET_MAX_ZOOM = 23.5;
/** Nav rig (street level off): Maps-style follow, high and behind, the avatar ~62% down the screen. */
export const NAV_RIG = { eye: 200, behind: 290, pitch: 40 }; // 40° overview pitch
const EARTH_M = 40075016.686;
const M_PER_DEG = 111320;
const RAD = Math.PI / 180;

export type Rig = { eye: number; behind: number; pitch: number };
export type PersonView = "third" | "second" | "first";
export type StreetView = { height: number; fov: number; maxPitch: number; maxZoom: number; street?: boolean; person?: PersonView };
export type StreetCamera = { center: [number, number]; zoom: number; pitch: number; bearing: number; rig: Rig };

/** Vertical field of view: 60° on phones (portrait), 46° on wide screens (similar horizontal reach). */
export const streetFov = (w: number, h: number) => (h >= w ? 60 : 46);

/** Held stick keeps the street camera on, even when street level was saved off (that path is the 200 m overview). */
export function streetWhileHeld(streetOn: boolean, stickHeld: boolean): boolean {
  return streetOn || stickHeld;
}

export function rigFor(maxPitch: number, street = true): Rig {
  if (!street) return { eye: NAV_RIG.eye, behind: NAV_RIG.behind, pitch: Math.min(NAV_RIG.pitch, maxPitch) };
  const pitch = Math.min(STREET_PITCH, maxPitch);
  if (pitch < 40) return { ...LOW_RIG, pitch };
  const behind = STREET_EYE_M * Math.tan((pitch * Math.PI) / 180);
  return { eye: STREET_EYE_M, behind, pitch };
}

/** Second person: a few metres in front of the face, looking back, still at human height. */
export const SECOND_RIG = { eye: 1.65, behind: 2.8, pitch: 76 };
/** First person, used in a car or hail: eye height, looking forward, zoomed in. */
export const FIRST_RIG = { eye: 1.55, behind: 0.45, pitch: 18 };

export function streetCamera(at: { lng: number; lat: number }, bearing: number, view: StreetView): StreetCamera {
  const street = view.street ?? true;
  const second = street && view.person === "second";
  const first = street && view.person === "first";
  let rig = rigFor(view.maxPitch, street);
  let face = bearing;
  if (first) {
    const pitch = Math.min(FIRST_RIG.pitch, view.maxPitch);
    rig = { eye: FIRST_RIG.eye, behind: FIRST_RIG.behind, pitch };
    face = bearing;
  } else if (second) {
    const pitch = Math.min(SECOND_RIG.pitch, view.maxPitch);
    rig = pitch >= 70 ? { eye: SECOND_RIG.eye, behind: SECOND_RIG.behind, pitch } : { eye: 4, behind: 6, pitch };
    face = bearing + 180;
  }
  const p = rig.pitch * RAD;
  const ahead = rig.eye * Math.tan(p) - rig.behind; // avatar -> look-at point on the ground (metres)
  const dist = rig.eye / Math.cos(p); // eye -> look-at point
  const camPx = (0.5 * Math.max(1, view.height)) / Math.tan((view.fov * RAD) / 2);
  const coslat = Math.cos(at.lat * RAD) || 1;
  const zoom = Math.log2((EARTH_M * coslat) / (512 * (dist / camPx)));
  const b = face * RAD;
  const center: [number, number] = [at.lng + (ahead * Math.sin(b)) / (M_PER_DEG * coslat), at.lat + (ahead * Math.cos(b)) / M_PER_DEG];
  return { center, zoom: Math.min(zoom, view.maxZoom), pitch: rig.pitch, bearing: face, rig };
}

/** Where the eye actually is for a map camera (inverse of the above): QA reads eye height and distance behind. */
export function eyeOf(cam: { zoom: number; pitch: number; lat: number }, view: { height: number; fov: number }) {
  const camPx = (0.5 * view.height) / Math.tan((view.fov * RAD) / 2);
  const mpp = (EARTH_M * Math.cos(cam.lat * RAD)) / (512 * 2 ** cam.zoom);
  const dist = camPx * mpp;
  return { height: dist * Math.cos(cam.pitch * RAD), back: dist * Math.sin(cam.pitch * RAD) };
}

/**
 * Street-level is the default: third person, human height, real metres. ?street=0 or a saved "0"
 * keeps the old high follow. ?street=1 turns it back on.
 */
export const STREET_KEY = "ndu.street.v1";
export function streetEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const q = new URLSearchParams(location.search).get("street");
    if (q === "1" || q === "0") {
      localStorage.setItem(STREET_KEY, q);
      return q === "1";
    }
    return localStorage.getItem(STREET_KEY) !== "0";
  } catch {
    return true;
  }
}
