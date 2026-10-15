// NDU-UPG u-169: StreetPlay isolation switch. StreetPlay is the legacy Leaflet
// street simulator; it is NOT mounted anywhere by default (docs/golive/leaflet-retire
// plans its retirement). This flag keeps it isolated: default OFF, opt-in only.
//
//   hard off: build env VITE_NDU_STREETPLAY=off, or ?streetplay=0|off
//   on:       ?streetplay=1|on, or VITE_NDU_STREETPLAY=on (build-time opt-in)
//
// Mirrors the ground/flag.ts pattern (query override + env gate + default off).
export const STREETPLAY_KEY = "ndu.streetplay";

function query(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("streetplay");
  } catch {
    return null;
  }
}

/** Whether StreetPlay is allowed at all (env gate; no window -> off). */
export function streetPlayAllowed(): boolean {
  if (typeof window === "undefined") return false;
  // import.meta.env only exists under Vite; guard it so SSR/node tests don't crash.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_NDU_STREETPLAY === "off") return false;
  const q = query();
  if (q === "0" || q === "off") return false;
  return true;
}

/** Whether StreetPlay should mount now. Default OFF: only ?streetplay=1|on or a
 *  saved soft switch turns it on. The URL query is remembered in localStorage so
 *  a reload keeps the opt-in. */
export function streetPlayOn(): boolean {
  if (!streetPlayAllowed()) return false;
  const q = query();
  try {
    if (q === "1" || q === "on") localStorage.setItem(STREETPLAY_KEY, "1");
    if (q === "0" || q === "off") localStorage.setItem(STREETPLAY_KEY, "0");
    return localStorage.getItem(STREETPLAY_KEY) === "1";
  } catch {
    return q === "1" || q === "on";
  }
}
