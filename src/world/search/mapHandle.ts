/**
 * NDU-AI search: a tiny handle on the live 3D map so search results can fly the camera, drop a
 * pin and (on request) walk the figure there. CityBuildings registers the map on load. No deps.
 */
type LngLatLike = [number, number];
export type FlyMap = {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  flyTo(opts: { center: LngLatLike; zoom?: number; duration?: number; essential?: boolean }): unknown;
  jumpTo(opts: { center: LngLatLike; zoom?: number }): unknown;
};
type MarkerLike = { setLngLat(p: LngLatLike): MarkerLike; addTo(map: never): MarkerLike; remove(): void };
type MarkerCtor = new (opts: { element: HTMLElement; anchor?: string }) => MarkerLike;
type Go = (goal: { lat: number; lng: number; name: string }) => Promise<boolean>;

let live: { map: FlyMap; Marker: MarkerCtor; go?: Go } | null = null;
let pin: MarkerLike | null = null;
let pinTimer = 0;

export function registerSearchMap(map: FlyMap | null, Marker?: unknown, go?: Go) {
  pin?.remove();
  pin = null;
  live = map && Marker ? { map, Marker: Marker as MarkerCtor, go } : null;
}

export function mapCenter(): { lat: number; lng: number } | null {
  try {
    const c = live?.map.getCenter();
    return c ? { lat: c.lat, lng: c.lng } : null;
  } catch {
    return null;
  }
}

export const canWalk = () => Boolean(live?.go);

/** Fly the camera to a hit and mark it with a pulsing embossed pin for a few seconds. */
export function flyToHit(hit: { lat: number; lng: number; name: string }): boolean {
  if (!live) return false;
  const { map, Marker } = live;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const zoom = Math.max(map.getZoom(), 17.2);
  try {
    if (reduce) map.jumpTo({ center: [hit.lng, hit.lat], zoom });
    else map.flyTo({ center: [hit.lng, hit.lat], zoom, duration: 1400, essential: true });
  } catch {
    return false;
  }
  pin?.remove();
  window.clearTimeout(pinTimer);
  const el = document.createElement("div");
  el.className = "ndu-search-pin";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", hit.name);
  const label = document.createElement("span");
  label.textContent = hit.name.slice(0, 28);
  el.appendChild(label);
  try {
    pin = new Marker({ element: el, anchor: "bottom" }).setLngLat([hit.lng, hit.lat]).addTo(map as never);
    pinTimer = window.setTimeout(() => {
      pin?.remove();
      pin = null;
    }, 9000);
  } catch {
    pin = null;
  }
  return true;
}

/** Walk the figure to the hit along the street graph (the existing trip planner). */
export function walkToHit(hit: { lat: number; lng: number; name: string }): Promise<boolean> {
  pin?.remove();
  pin = null;
  return live?.go ? live.go(hit) : Promise.resolve(false);
}
