/**
 * NDU-UPG immerse #350: one switch for the whole immersion module (weather, terrain, water, sound).
 * Off with `?immerse=0`, localStorage `ndu.immerse.off=1` (the bubble's "Effects off"), or the build
 * env `VITE_NDU_IMMERSE=off`. Tiny and dependency-free: CityBuildings imports it eagerly.
 */
export const FLAG_KEY = "ndu.immerse.off";

/** Hard switch (build env or URL): when false nothing of the module loads, not even the bubble. */
export function immerseAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_NDU_IMMERSE === "off") return false;
  const q = new URLSearchParams(window.location.search).get("immerse");
  return !(q === "0" || q === "off");
}

/** Soft switch (the player's "Effects" toggle, remembered): the bubble stays so they can turn it back on. */
export function effectsOn(): boolean {
  if (!immerseAllowed()) return false;
  try {
    return localStorage.getItem(FLAG_KEY) !== "1";
  } catch {
    return true;
  }
}
