// NDU-UPG inspect (#04): what is under the finger? Life agents → own scans → buildings.
// Map access goes through a tiny interface so the priority rules unit-test without MapLibre.
import { REAL_BUILDINGS, tappableBuildingLayers } from "../realism/layers.ts";
import { osmIdOfFeature } from "./profile.ts";
import type { InspectTarget, VehicleKind } from "./types.ts";

export type Pt = { x: number; y: number };
export type LifeHit = { agentId: string; kind: "walker" | "vehicle"; vkind?: VehicleKind; lngLat: [number, number] };
export type ScanHit = { scanId: string; model: [number, number, number] | null; distanceM: number };
export type HitFeature = { id?: unknown; layer?: { id?: string }; properties?: Record<string, unknown> | null; geometry?: unknown };
export type PickMap = {
  queryRenderedFeatures(box: [[number, number], [number, number]], opts: { layers: string[] }): HitFeature[];
  unproject(p: [number, number]): { lng: number; lat: number };
  getBearing(): number;
  getLayer?(id: string): unknown;
};
export type PickCtx = {
  scans?: { isPlacing(): boolean; pick?: (p: Pt) => ScanHit | null } | null;
  lifePickAt?: ((p: Pt) => LifeHit | null) | null;
  /** Camera distance (m) to a building's top at p, when known; scans within 1.5 m of it win. */
  buildingDistanceM?: (hit: HitFeature, p: Pt) => number;
  layers?: string[];
};

export const PICK_PX = 6;
export const RETRY_PX = 22;

const areaOf = (g: unknown): number => {
  const geom = g as { type?: string; coordinates?: number[][][] | number[][][][] } | null;
  if (!geom?.coordinates) return Infinity;
  const ring = (geom.type === "MultiPolygon" ? (geom.coordinates as number[][][][])[0]?.[0] : (geom.coordinates as number[][][])[0]) ?? [];
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2) || Infinity;
};

export const osmIdOf = (f: HitFeature): number | null => osmIdOfFeature(f);

/** One hit per OSM id; the live realism layer wins over the vector-tile twin. */
export function dedupeBuildings(hits: HitFeature[]): HitFeature[] {
  const by = new Map<string, HitFeature>();
  hits.forEach((h, i) => {
    const id = osmIdOf(h);
    const key = id === null ? `anon:${i}` : String(id);
    const prev = by.get(key);
    if (!prev || (h.layer?.id === REAL_BUILDINGS && prev.layer?.id !== REAL_BUILDINGS)) by.set(key, h);
  });
  return [...by.values()];
}

/** Prefer the realism layer, then Simple 3D Buildings parts, then the smallest footprint. */
export function choosePart(hits: HitFeature[]): HitFeature | null {
  if (!hits.length) return null;
  return [...hits].sort((a, b) => {
    const ra = Number(a.layer?.id === REAL_BUILDINGS), rb = Number(b.layer?.id === REAL_BUILDINGS);
    if (ra !== rb) return rb - ra;
    const pa = Number(a.properties?.part === 1), pb = Number(b.properties?.part === 1);
    if (pa !== pb) return pb - pa;
    return areaOf(a.geometry) - areaOf(b.geometry);
  })[0];
}

function query(map: PickMap, p: Pt, r: number, layers: string[]): HitFeature[] {
  if (!layers.length) return [];
  try {
    return map.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], { layers });
  } catch {
    return [];
  }
}

export function pickBuilding(map: PickMap, p: Pt, layers?: string[]): HitFeature | null {
  const ls = layers ?? tappableBuildingLayers(map);
  let hits = query(map, p, PICK_PX, ls);
  if (!hits.length) hits = query(map, p, RETRY_PX, ls); // intent tolerance
  return choosePart(dedupeBuildings(hits));
}

export function buildingTarget(map: PickMap, hit: HitFeature, p: Pt): InspectTarget {
  const ll = map.unproject([p.x, p.y]);
  return { kind: "building", osmId: osmIdOf(hit), layer: hit.layer?.id ?? "", feature: hit, lngLat: [ll.lng, ll.lat], bearing: map.getBearing() };
}

export function pickAt(map: PickMap, p: Pt, ctx: PickCtx = {}): InspectTarget | null {
  if (ctx.scans?.isPlacing()) return null; // placing owns the pointer
  const mark = typeof performance !== "undefined" && typeof performance.mark === "function";
  if (mark) performance.mark("ndu:inspect-pick:start");
  try {
    const life = ctx.lifePickAt?.(p) ?? null;
    if (life) {
      return life.kind === "vehicle" && life.vkind
        ? { kind: "vehicle", agentId: life.agentId, vkind: life.vkind, lngLat: life.lngLat }
        : { kind: "walker", agentId: life.agentId, lngLat: life.lngLat };
    }
    const scan = ctx.scans?.pick?.(p) ?? null;
    const hit = pickBuilding(map, p, ctx.layers);
    if (scan && hit) {
      const bd = ctx.buildingDistanceM?.(hit, p) ?? Infinity;
      if (scan.distanceM <= bd + 1.5) return { kind: "scan", scanId: scan.scanId, model: scan.model };
      return buildingTarget(map, hit, p);
    }
    if (scan) return { kind: "scan", scanId: scan.scanId, model: scan.model };
    if (hit) return buildingTarget(map, hit, p);
    return null;
  } finally {
    if (mark) {
      try {
        performance.measure("ndu:inspect-pick", "ndu:inspect-pick:start");
      } catch {
        // measure unsupported: ignore
      }
    }
  }
}
