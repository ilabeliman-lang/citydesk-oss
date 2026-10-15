import type { GroundHandle, Spot } from "./types.ts";

/**
 * NDU realism 02: the tiny static bridge between eager code (CityBuildings, terrain.ts, scanLayer)
 * and the lazily loaded ground provider. Every call is a no-op until mountGround() sets a handle.
 */
let handle: GroundHandle | null = null;
const listeners = new Set<() => void>();

export function setGroundHandle(h: GroundHandle | null) {
  handle = h;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // a consumer failed: others still hear about it
    }
  }
}

export function groundHandle(): GroundHandle | null {
  return handle;
}

/** Hear when the handle appears or goes away (consumers then subscribe to the handle itself). */
export function onGroundHandle(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onPlayerSpot(spot: Spot) {
  try {
    handle?.onPlayerSpot(spot);
  } catch {
    // never break the avatar
  }
}
