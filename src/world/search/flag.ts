/**
 * NDU-AI search flag. Default ON. Off with `?search=0` or `localStorage["ndu.search.off"] = "1"`.
 * Plain, dependency-free, alias-free.
 */
const KEY = "ndu.search.off";

export function searchOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (new URLSearchParams(window.location.search).get("search") === "0") return false;
    if (localStorage.getItem(KEY) === "1") return false;
  } catch {
    // private mode: stay on
  }
  return true;
}
