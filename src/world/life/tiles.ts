import type { LngLat, LPoi, LRoad, LWalk, PoiKind, Streets } from "./parse.ts";
import { classKmh } from "./parse.ts";

/**
 * NDU-UPG life: the street graph straight from the map's own vector tiles (OpenMapTiles schema,
 * OSM-derived, ODbL): `transportation` lines and `poi` points. No network, instant, and aligned with
 * the roads the player sees. Lanes/maxspeed fall back to class defaults; traffic signals come from the
 * optional Overpass enrichment. Tile clipping leaves lines cut at tile buffers, so endpoints are
 * stitched onto the nearest line within 3 m (`stitch`, pure + unit tested).
 */

type Geo = { type: string; coordinates: unknown };
type Feat = { geometry: Geo; properties: Record<string, unknown> | null };
export type TileMap = {
  querySourceFeatures: (source: string, options: { sourceLayer: string }) => Feat[];
  getStyle: () => { layers?: { id: string; source?: string; "source-layer"?: string }[] } | undefined;
};

const M = 111320;
const DRIVE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]);
const WALK_SUB = new Set(["footway", "pedestrian", "path", "steps", "living_street"]);
const NOT_A_PULL = new Set(["park", "school", "college", "kindergarten", "hospital", "town_hall", "police", "fire_station", "parking", "toilets", "drinking_water", "information", "office", "attraction", "campsite"]);

export function sourceOf(map: TileMap, layer = "transportation"): string | null {
  for (const l of map.getStyle()?.layers ?? []) if (l["source-layer"] === layer && l.source) return l.source;
  return null;
}

const lines = (g: Geo): LngLat[][] =>
  g.type === "LineString" ? [g.coordinates as LngLat[]] : g.type === "MultiLineString" ? (g.coordinates as LngLat[][]) : [];

function poiKindOf(cls: string, sub: string): PoiKind | null {
  if (cls === "bus" || sub === "bus_stop") return sub === "bus_station" ? "station" : "bus";
  if (cls === "place_of_worship") return "church";
  if (sub === "marketplace" || sub === "supermarket" || sub === "mall" || cls === "grocery") return "market";
  if (cls === "restaurant" || cls === "fast_food" || cls === "cafe" || cls === "food_court" || cls === "ice_cream" || cls === "bar") return "food";
  if (NOT_A_PULL.has(cls)) return null;
  return "shop";
}

/** NDU realism 02 T8: OpenMapTiles brunnel/layer → vertical tags (tunnels are dropped before this; ford = ground). */
export function tileVertical(p: Record<string, unknown>): { deck?: "bridge"; layer?: number } {
  const out: { deck?: "bridge"; layer?: number } = {};
  if (p.brunnel === "bridge") out.deck = "bridge";
  const layer = Number(p.layer);
  if (Number.isFinite(layer) && layer !== 0) out.layer = Math.max(-5, Math.min(5, Math.round(layer)));
  return out;
}

export function streetsFromTiles(map: TileMap, lat: number, lng: number, radius = 520): Streets {
  const src = sourceOf(map);
  const empty: Streets = { lat, lng, roads: [], walks: [], pois: [] };
  if (!src) return empty;
  const kx = M * Math.cos((lat * Math.PI) / 180);
  const inside = (p: LngLat) => Math.hypot((p[0] - lng) * kx, (p[1] - lat) * M) < radius;
  const seen = new Set<string>();
  const roads: LRoad[] = [];
  const walks: LWalk[] = [];
  let feats: Feat[] = [];
  try {
    feats = map.querySourceFeatures(src, { sourceLayer: "transportation" });
  } catch {
    return empty;
  }
  for (const f of feats) {
    const p = f.properties ?? {};
    const cls = String(p.class ?? "");
    const sub = String(p.subclass ?? "");
    if (p.brunnel === "tunnel" || p.indoor === 1 || p.level) continue;
    for (const raw of lines(f.geometry)) {
      const pts = raw.filter(inside).length ? raw : null;
      if (!pts || pts.length < 2) continue;
      const key = `${cls}|${pts.map((q) => `${q[0].toFixed(6)},${q[1].toFixed(6)}`).join(";")}`;
      if (seen.has(key)) continue; // the same feature from two overlapping tiles
      seen.add(key);
      if (DRIVE.has(cls) && !(cls === "service" && ["parking_aisle", "driveway", "drive-through"].includes(String(p.service ?? "")))) {
        const hw = cls === "minor" ? (sub === "living_street" ? "living_street" : "residential") : p.ramp === 1 ? `${cls}_link` : cls;
        const oneway = p.oneway === 1 ? 1 : p.oneway === -1 ? -1 : 0;
        const big = cls === "motorway" || cls === "trunk" || cls === "primary";
        roads.push({ cls: hw, oneway, lanes: oneway ? (big ? 2 : 1) : big ? 4 : 2, maxKmh: classKmh(hw), name: "", pts, ...(p.brunnel === "bridge" ? { deck: "bridge" as const } : {}), ...tileVertical(p) });
      } else if (cls === "path" && (WALK_SUB.has(sub) || sub === "") && p.foot !== "no") {
        walks.push({ kind: sub || "path", pts, ...tileVertical(p) });
      }
    }
  }
  const pois: LPoi[] = [];
  try {
    const psrc = sourceOf(map, "poi") ?? src;
    for (const f of map.querySourceFeatures(psrc, { sourceLayer: "poi" })) {
      if (f.geometry.type !== "Point") continue;
      const at = f.geometry.coordinates as LngLat;
      if (!inside(at)) continue;
      const p = f.properties ?? {};
      const kind = poiKindOf(String(p.class ?? ""), String(p.subclass ?? ""));
      if (!kind) continue;
      const name = String(p.name ?? p["name:latin"] ?? "").slice(0, 60);
      if (pois.some((q) => q.kind === kind && q.name === name && Math.hypot((q.lng - at[0]) * kx, (q.lat - at[1]) * M) < 12)) continue;
      pois.push({ kind, name, lng: at[0], lat: at[1] });
    }
  } catch {
    // no poi layer: the crowd just spreads evenly
  }
  const stitched = stitch([...roads.map((r) => r.pts), ...walks.map((w) => w.pts)], lat, lng);
  roads.forEach((r, i) => (r.pts = stitched[i]));
  walks.forEach((w, i) => (w.pts = stitched[roads.length + i]));
  return { lat, lng, roads: roads.slice(0, 600), walks: walks.slice(0, 400), pois: pois.slice(0, 260) };
}

/**
 * Join line endpoints that stop on (not at a vertex of) another line within `tol` metres by inserting
 * the endpoint into that line, so tile-clipped streets and footway ends connect into one graph.
 */
export function stitch(input: LngLat[][], lat0: number, lng0: number, tol = 3): LngLat[][] {
  const kx = M * Math.cos((lat0 * Math.PI) / 180);
  const xy = (p: LngLat) => ({ x: (p[0] - lng0) * kx, y: (p[1] - lat0) * M });
  const key = (p: LngLat) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const shared = new Map<string, number>();
  input.forEach((line) => new Set(line.map(key)).forEach((k) => shared.set(k, (shared.get(k) ?? 0) + 1)));
  const CELL = 25;
  const grid = new Map<string, [number, number][]>();
  input.forEach((line, li) => {
    for (let si = 1; si < line.length; si += 1) {
      const a = xy(line[si - 1]);
      const b = xy(line[si]);
      const x0 = Math.floor((Math.min(a.x, b.x) - tol) / CELL);
      const x1 = Math.floor((Math.max(a.x, b.x) + tol) / CELL);
      const y0 = Math.floor((Math.min(a.y, b.y) - tol) / CELL);
      const y1 = Math.floor((Math.max(a.y, b.y) + tol) / CELL);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) continue;
      for (let gx = x0; gx <= x1; gx += 1) for (let gy = y0; gy <= y1; gy += 1) {
        const k = `${gx},${gy}`;
        const list = grid.get(k) ?? [];
        list.push([li, si]);
        grid.set(k, list);
      }
    }
  });
  const inserts = new Map<number, { si: number; t: number; p: LngLat }[]>();
  const snaps = new Map<number, { first?: LngLat; last?: LngLat }>();
  input.forEach((line, li) => {
    for (const [which, end] of [["first", line[0]], ["last", line[line.length - 1]]] as const) {
      if ((shared.get(key(end)) ?? 0) > 1) continue;
      const e = xy(end);
      let best: { li: number; si: number; t: number; d: number } | null = null;
      for (const [lj, sj] of grid.get(`${Math.floor(e.x / CELL)},${Math.floor(e.y / CELL)}`) ?? []) {
        if (lj === li) continue;
        const a = xy(input[lj][sj - 1]);
        const b = xy(input[lj][sj]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((e.x - a.x) * dx + (e.y - a.y) * dy) / len2));
        const d = Math.hypot(a.x + dx * t - e.x, a.y + dy * t - e.y);
        if (d <= tol && (!best || d < best.d)) best = { li: lj, si: sj, t, d };
      }
      const hit = best as { li: number; si: number; t: number; d: number } | null;
      if (!hit) continue;
      shared.set(key(end), 2);
      const a = input[hit.li][hit.si - 1];
      const b = input[hit.li][hit.si];
      const segLen = Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * M);
      if (hit.t * segLen < 1 || (1 - hit.t) * segLen < 1) {
        // next to an existing vertex: move our endpoint onto it instead of adding a sliver edge
        const snap = snaps.get(li) ?? {};
        snap[which] = hit.t * segLen < 1 ? a : b;
        snaps.set(li, snap);
        continue;
      }
      const list = inserts.get(hit.li) ?? [];
      list.push({ si: hit.si, t: hit.t, p: end });
      inserts.set(hit.li, list);
    }
  });
  return input.map((line, li) => {
    const add = inserts.get(li) ?? [];
    const snap = snaps.get(li);
    const out: LngLat[] = [line[0]];
    for (let si = 1; si < line.length; si += 1) {
      for (const ins of add.filter((x) => x.si === si).sort((a, b) => a.t - b.t)) out.push(ins.p);
      out.push(line[si]);
    }
    if (snap?.first) out[0] = snap.first;
    if (snap?.last) out[out.length - 1] = snap.last;
    return out;
  });
}

/** The road name nearest a point (from `transportation_name`), for the vehicle card. */
export function roadNameNear(map: TileMap, lng: number, lat: number, maxM = 18): string {
  const src = sourceOf(map, "transportation_name") ?? sourceOf(map);
  if (!src) return "";
  const kx = M * Math.cos((lat * Math.PI) / 180);
  let best = "";
  let bestD = maxM;
  try {
    for (const f of map.querySourceFeatures(src, { sourceLayer: "transportation_name" })) {
      const name = String(f.properties?.name ?? "");
      if (!name) continue;
      for (const line of lines(f.geometry)) {
        for (let i = 1; i < line.length; i += 1) {
          const ax = (line[i - 1][0] - lng) * kx;
          const ay = (line[i - 1][1] - lat) * M;
          const dx = (line[i][0] - line[i - 1][0]) * kx;
          const dy = (line[i][1] - line[i - 1][1]) * M;
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
          const d = Math.hypot(ax + dx * t, ay + dy * t);
          if (d < bestD) {
            bestD = d;
            best = name;
          }
        }
      }
    }
  } catch {
    return "";
  }
  return best.slice(0, 40);
}

/** Overpass enrichment: its POIs (incl. traffic signals) win; tile POIs fill in when it is empty. */
export function mergePois(tiles: LPoi[], osm: LPoi[] | null | undefined): LPoi[] {
  return osm && osm.length ? osm : tiles;
}
