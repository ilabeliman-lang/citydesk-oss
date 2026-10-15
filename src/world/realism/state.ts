import { atLocalMinutes, localMinutes, palette, sunAt, zoneFor, type Palette, type Sun } from "./sun.ts";

/**
 * NDU-UPG #7: shared realism state — the viewed place, the dial's time override, and the sun +
 * palette derived from them. A tiny external store so the map, the three.js scans and the
 * TimeDial UI all read one sun. The override persists in localStorage; null = real local time.
 */

export type RealismState = {
  lat: number;
  lng: number;
  zone: string;
  /** Local minutes after midnight chosen on the dial, or null to follow the real clock. */
  override: number | null;
  /** The instant being shown. */
  at: Date;
  sun: Sun;
  pal: Palette;
  version: number;
};

const KEY = "ndu.sun.v1";
const listeners = new Set<() => void>();

function readOverride(): number | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as { override?: unknown };
    return typeof raw.override === "number" && raw.override >= 0 && raw.override < 1440 ? raw.override : null;
  } catch {
    return null;
  }
}

// NDU-UPG immerse: optional palette filter (live weather tint: cloud dims the sun, overcast/storm sky).
type PaletteFilter = (pal: Palette, sun: Sun) => Palette;
let paletteFilter: PaletteFilter | null = null;

function build(lat: number, lng: number, override: number | null, version: number): RealismState {
  const zone = zoneFor(lat, lng);
  const now = new Date();
  const at = override == null ? now : atLocalMinutes(now, override, zone);
  const sun = sunAt(at, lat, lng);
  const base = palette(sun);
  return { lat, lng, zone, override, at, sun, pal: paletteFilter ? paletteFilter(base, sun) : base, version }; // NDU-UPG immerse
}

let state: RealismState = build(4.8156, 7.0498, null, 0);
let hydrated = false;

export function getRealism(): RealismState {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    state = build(state.lat, state.lng, readOverride(), state.version + 1);
  }
  return state;
}

export function subscribeRealism(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit(next: RealismState) {
  state = next;
  listeners.forEach((fn) => fn());
}

/** Re-evaluate the sun (real clock moved, place changed). Skips no-op updates under 0.05°. */
export function refreshRealism(lat = state.lat, lng = state.lng) {
  const cur = getRealism();
  const next = build(lat, lng, cur.override, cur.version + 1);
  const same = Math.abs(next.sun.altitude - cur.sun.altitude) < 0.05 && Math.abs(next.sun.azimuth - cur.sun.azimuth) < 0.05 && next.zone === cur.zone;
  if (!same) commit(next);
}

export function setTimeOverride(minutes: number | null) {
  const cur = getRealism();
  const value = minutes == null ? null : ((Math.round(minutes) % 1440) + 1440) % 1440;
  try {
    localStorage.setItem(KEY, JSON.stringify({ override: value }));
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  commit(build(cur.lat, cur.lng, value, cur.version + 1));
}

/** Local clock minutes currently shown on the dial. */
export function shownMinutes(s = getRealism()): number {
  return s.override ?? localMinutes(s.at, s.zone);
}

// NDU-UPG immerse: set/clear the palette filter and re-light everything that reads the sun.
export function setPaletteFilter(fn: PaletteFilter | null) {
  paletteFilter = fn;
  const cur = getRealism();
  commit(build(cur.lat, cur.lng, cur.override, cur.version + 1));
}
