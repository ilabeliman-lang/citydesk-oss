// NDU-FP (FPXR-03): eye pose <-> MapLibre camera. Pure (node-testable). PLAN.md §4.1/§4.2.
import { clamp, wrap180 } from "../orbit/orbitCore.ts";
import { eyeFromStature } from "../orbit/streetCam.ts";

export const EARTH_M = 40075016.686;
export const M_PER_DEG = 111320;
const RAD = Math.PI / 180;
export const FP_D_M = 30; // eye -> map center along the view ray
export const FP_ZOOM_CAP = 24;

export type PostureId = "stand" | "wheelchair" | "seat-car" | "seat-keke" | "tall-look";
export type Posture = { eyeM: number; maxWalk: number; maxJog: number; bobScale: number };
export function posture(id: PostureId, statureM = 1.75): Posture {
  switch (id) {
    case "wheelchair":
      return { eyeM: 1.2, maxWalk: 1.1, maxJog: 1.1, bobScale: 0.2 };
    case "seat-car":
      return { eyeM: 1.2, maxWalk: 0, maxJog: 0, bobScale: 0 };
    case "seat-keke":
      return { eyeM: 1.35, maxWalk: 0, maxJog: 0, bobScale: 0.1 };
    case "tall-look":
      return { eyeM: 2.5, maxWalk: 1.4, maxJog: 1.4, bobScale: 0 };
    default:
      return { eyeM: eyeFromStature(statureM), maxWalk: 1.4, maxJog: 3.5, bobScale: 1 };
  }
}
export const POSTURES: Record<PostureId, Posture> = {
  stand: posture("stand"),
  wheelchair: posture("wheelchair"),
  "seat-car": posture("seat-car"),
  "seat-keke": posture("seat-keke"),
  "tall-look": posture("tall-look"),
};

export const pitchUpToMap = (phi: number) => 90 + phi;
export const mapToPitchUp = (p: number) => p - 90;

const vFromH = (hDeg: number, aspect: number) => (2 * Math.atan(Math.tan((hDeg * RAD) / 2) / aspect)) / RAD;
/** Hor+ vertical FOV with clamps, plus the jog kick (0 under reduced motion). */
export function fpFov(w: number, h: number, hFovDeg = 90, speed = 0, reduced = false): number {
  const aspect = Math.max(1, w) / Math.max(1, h);
  const base = aspect >= 1 ? clamp(vFromH(hFovDeg, aspect), 50, 65) : clamp(vFromH(60, aspect), 62, 72);
  const kick = reduced ? 0 : Math.min(4, 1.9 * Math.max(0, speed - 1.4));
  return base + kick;
}

export type Eye = { lng: number; lat: number; altM: number };
export type FpCam = { center: [number, number]; zoom: number; pitch: number; bearing: number; roll: number; elevation: number; lookDistM: number };

const camPxOf = (viewportH: number, vFovDeg: number) => (0.5 * Math.max(1, viewportH)) / Math.tan((vFovDeg * RAD) / 2);
const zoomFor = (lat: number, camPx: number, d: number) => Math.log2((EARTH_M * Math.cos(lat * RAD) * camPx) / (512 * d));

/** The map camera whose eye is exactly `eye`, looking along yaw / pitchUp. */
export function fpCamera(eye: Eye, yawDeg: number, pitchUpDeg: number, vFovDeg: number, viewportH: number, rollDeg = 0): FpCam {
  const camPx = camPxOf(viewportH, vFovDeg);
  const phi = pitchUpDeg * RAD;
  const psi = yawDeg * RAD;
  const coslat = Math.cos(eye.lat * RAD) || 1;
  const centerOf = (d: number) => {
    const horiz = d * Math.cos(phi);
    return [eye.lng + (horiz * Math.sin(psi)) / (M_PER_DEG * coslat), eye.lat + (horiz * Math.cos(psi)) / M_PER_DEG] as [number, number];
  };
  let d = FP_D_M;
  let center = centerOf(d);
  let zoom = zoomFor(center[1], camPx, d);
  for (let i = 0; i < 4 && zoom > FP_ZOOM_CAP; i++) {
    // eye never moves: grow D until the zoom fits under the cap
    d = (EARTH_M * Math.cos(center[1] * RAD) * camPx) / (512 * 2 ** (FP_ZOOM_CAP - 1e-6));
    center = centerOf(d);
    zoom = zoomFor(center[1], camPx, d);
  }
  return {
    center,
    zoom,
    pitch: pitchUpToMap(pitchUpDeg),
    bearing: wrap180(yawDeg),
    roll: rollDeg,
    elevation: eye.altM + d * Math.sin(phi),
    lookDistM: d,
  };
}

/** Inverse of fpCamera (QA / tests): where the eye is for a map camera. */
export function eyeOfFp(cam: { center: [number, number]; zoom: number; pitch: number; bearing: number; elevation: number }, viewportH: number, vFovDeg: number) {
  const camPx = camPxOf(viewportH, vFovDeg);
  const d = (EARTH_M * Math.cos(cam.center[1] * RAD) * camPx) / (512 * 2 ** cam.zoom);
  const phi = mapToPitchUp(cam.pitch) * RAD;
  const psi = cam.bearing * RAD;
  const horiz = d * Math.cos(phi);
  const lat = cam.center[1] - (horiz * Math.cos(psi)) / M_PER_DEG;
  const coslat = Math.cos(lat * RAD) || 1;
  const lng = cam.center[0] - (horiz * Math.sin(psi)) / (M_PER_DEG * coslat);
  return { lng, lat, altM: cam.elevation - d * Math.sin(phi), yawDeg: cam.bearing, pitchUpDeg: mapToPitchUp(cam.pitch), lookDistM: d };
}
