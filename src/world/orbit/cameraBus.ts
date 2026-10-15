import { wrap180 } from "./orbitCore";

/**
 * NDU-UPG drag360: tiny bridge between the live map camera and the compass bubble, so the bubble can
 * show the bearing and reset the view without the map component passing props through the UI.
 */
export type CameraView = { bearing: number; pitch: number };
/** Jarvis Verse 40° look-down pitch standard (was 55°). */
export const DEFAULT_ISO_PITCH = 40;

let view: CameraView = { bearing: 0, pitch: DEFAULT_ISO_PITCH };
let reset: (() => void) | null = null;
const subs = new Set<(v: CameraView) => void>();

export function publishView(next: CameraView) {
  view = next;
  subs.forEach((fn) => fn(view));
}
export function onView(fn: (v: CameraView) => void): () => void {
  subs.add(fn);
  fn(view);
  return () => {
    subs.delete(fn);
  };
}
export function setViewReset(fn: (() => void) | null) {
  reset = fn;
}
/** Face north at the default isometric tilt. */
export function resetView() {
  reset?.();
}
export function isDefaultView(v: CameraView) {
  return Math.abs(wrap180(v.bearing)) < 2 && Math.abs(v.pitch - DEFAULT_ISO_PITCH) < 2;
}
