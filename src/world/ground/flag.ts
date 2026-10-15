import { immerseAllowed } from "@/world/immerse/flag";

/**
 * NDU realism 02: terrain + ground clamping switch. Tiny and static (CityBuildings may import it).
 *   hard off: build env VITE_NDU_GROUND=off, `?ground=0|off`, or the immerse module off
 *   soft on:  `?ground=1` (remembered in localStorage "ndu.ground" = "1"); `?ground=0` stores "0"
 * Default OFF until T12 of the plan (docs/realism/02-terrain-ground).
 */
export const GROUND_KEY = "ndu.ground";

function query(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("ground");
  } catch {
    return null;
  }
}

export function groundAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_NDU_GROUND === "off") return false;
  const q = query();
  if (q === "0" || q === "off") return false;
  return immerseAllowed();
}

export function groundOn(): boolean {
  if (!groundAllowed()) return false;
  const q = query();
  try {
    if (q === "1" || q === "on") localStorage.setItem(GROUND_KEY, "1");
    return localStorage.getItem(GROUND_KEY) === "1";
  } catch {
    return q === "1" || q === "on";
  }
}

if (typeof window !== "undefined") {
  const q = query();
  try {
    if (q === "0" || q === "off") localStorage.setItem(GROUND_KEY, "0");
  } catch {
    // storage blocked
  }
}
