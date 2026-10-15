/**
 * NDU-AI avatar-bot assistant: tiny eager bridge. CityBuildings hands over the live map, a way to find
 * the player, and the nearby places list; the lazily loaded assistant reads them from here. No logic,
 * no imports, so it costs nothing on the first map.
 */
export type BridgePlace = { name: string; lat: number; lng: number; kind?: string };
type Bridge = {
  map: unknown;
  home: () => { lat: number; lng: number } | null;
  places: BridgePlace[];
};

const bridge: Bridge = { map: null, home: () => null, places: [] };
const subs = new Set<() => void>();

export function registerAssistantMap(
  map: unknown,
  home: () => { lat: number; lng: number } | null,
): () => void {
  bridge.map = map;
  bridge.home = home;
  subs.forEach((fn) => fn());
  return () => {
    if (bridge.map === map) {
      bridge.map = null;
      bridge.home = () => null;
      subs.forEach((fn) => fn());
    }
  };
}

export function setAssistantPlaces(places: BridgePlace[]) {
  bridge.places = places;
}

export function getBridge(): Readonly<Bridge> {
  return bridge;
}

export function onBridge(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** Event the scan panel listens for; the assistant fires it only after the player taps "Yes". */
export const OPEN_SCANS_EVENT = "ndu:assistant:open-scans";
