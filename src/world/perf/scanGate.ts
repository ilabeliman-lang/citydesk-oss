import { listMyScans, type ScanPose } from "@/world/scans";

/**
 * NDU-UPG 504: three.js + scanLayer load only when one of the owner's placed scans is near the view
 * or the player opens Scans. Map-only players (and signed-out visitors) never download three.js.
 * Interface-agnostic: it only decides WHEN CityBuildings' existing `import("@/world/scanLayer")` runs.
 */
type GateMap = {
  getCenter: () => { lng: number; lat: number };
  on: (event: string, fn: () => void) => unknown;
  off: (event: string, fn: () => void) => unknown;
};

const NEAR_M = 1500;
let opened = false;
const waiting = new Set<() => void>();

/** Called by the Scans button: load the scan layer now (placing needs it). */
export function requestScans() {
  opened = true;
  for (const go of [...waiting]) go();
}

function metres(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const k = 111320;
  return Math.hypot((a.lng - b.lng) * k * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * k);
}

/** Runs `mount` once, when scans are needed. Returns cancel. */
export function gateScans(map: GateMap, mount: () => void): () => void {
  let done = false;
  let poses: ScanPose[] = [];
  const near = () => poses.some((p) => metres(p, map.getCenter()) <= NEAR_M);
  const onMove = () => {
    if (near()) go();
  };
  const cancel = () => {
    done = true;
    waiting.delete(go);
    map.off("moveend", onMove);
  };
  function go() {
    if (done) return;
    cancel();
    mount();
  }
  if (opened) {
    go();
    return cancel;
  }
  waiting.add(go);
  listMyScans()
    .then((list) => {
      if (done) return;
      poses = list.flatMap((s) => (s.pose ? [s.pose] : []));
      if (!poses.length) return;
      if (near()) go();
      else map.on("moveend", onMove);
    })
    .catch(() => undefined); // signed out or offline: wait for the Scans button
  return cancel;
}
