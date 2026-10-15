// NDU-FP (FPXR-01): who drives the MapLibre camera right now. Pure, no imports, so the always-loaded cost stays < 1 kB.
// "follow" = the follow camera / drag-orbit / gestures (today's behaviour); "fp" = first person; "handoff" = the
// 650 ms blend between them. Other builders (01 collision, 03 props) should read fpOwns() before moving the camera.
export type CameraOwner = "follow" | "fp" | "handoff";
export type PitchCap = { min: number; max: number };

let owner: CameraOwner = "follow";
let fpCap: PitchCap | null = null;
const subs = new Set<(o: CameraOwner) => void>();

export function cameraOwner(): CameraOwner {
  return owner;
}
export function claimCamera(o: CameraOwner): void {
  if (o === owner) return;
  owner = o;
  subs.forEach((fn) => fn(owner));
}
/** Only the current owner can release; the camera then goes back to "follow". */
export function releaseCamera(o: CameraOwner): void {
  if (o !== owner || owner === "follow") return;
  owner = "follow";
  subs.forEach((fn) => fn(owner));
}
export function onCameraOwner(fn: (o: CameraOwner) => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
export function fpOwns(): boolean {
  return owner === "fp" || owner === "handoff";
}
export function setFpPitchCap(cap: PitchCap | null): void {
  fpCap = cap ? { min: cap.min, max: cap.max } : null;
}
/** Map pitch limits for a tier: the FP cap while FP owns the camera, else today's 0..85 (Tier C 0..60). */
export function pitchCapFor(tier: "A" | "B" | "C"): PitchCap {
  if (fpCap && fpOwns()) return { ...fpCap };
  return { min: 0, max: tier === "C" ? 60 : 85 };
}
