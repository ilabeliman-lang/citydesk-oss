/**
 * Empty-state shapes: turns whatever was tapped on the 3D map (a MapLibre building feature, or a
 * place pin with maybe a building under it) into a small local-metre model the isometric view can
 * draw. Pure functions — no three.js, no DOM — so the map path never pays for them.
 */

import { facadeColour } from "../buildings/facade.ts";

/** What CityBuildings hands `onEnter`. `feature` / `bearing` / `kind` are optional extras. */
export type EnterSpot = {
  name: string;
  lat: number;
  lng: number;
  /** Raw rendered feature from `queryRenderedFeatures` (building under the tap / pin), if any. */
  feature?: unknown;
  /** Map bearing (degrees) at tap time, so the isometric view faces the same way as the map. */
  bearing?: number;
  /** Place kind for pins (eat / shift / rest / wash / care) — helps pick object vs building. */
  kind?: string;
  /** Stable id of a tapped place pin, if any. */
  placeId?: string;
  /** Whether user tapped into Jarvis Verse 3D mode */
  workverse?: boolean;
  /** NDU-UPG collide: the street door walked through (CD-COL-09), for spawn/exit at the same door. */
  door?: { lat: number; lng: number; bearing: number; kind: string; synthetic: boolean; locked: boolean };
  /** NDU-UPG collide: OSM way id of the entered building. */
  buildingOsm?: number;
};

/** One polygon in local metres: x = east, y = north; first ring outer, rest holes. */
export type Ring = [number, number][];
export type Poly = Ring[];

export type Shape =
  | {
      type: "building";
      key: string;
      name: string;
      polys: Poly[];
      /** Base and top in metres above ground (OSM min_height / height). */
      minH: number;
      maxH: number;
      levels: number;
      /** Footprint bounding box in metres. */
      size: { w: number; d: number };
      areaM2: number;
      color: string | null;
      /** Where the numbers came from, shown honestly in the sheet. */
      heightSource: "osm" | "levels" | "default";
      bearing: number;
    }
  | {
      type: "object";
      key: string;
      name: string;
      kind: string;
      bearing: number;
    };

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320;
const FLOOR_M = 3;

/** Small things that get a pedestal/slot instead of a building, even if a roof is under the pin. */
const SMALL = /\b(stall|kiosk|stand|standpipe|tap|pump|bench|stop|keke|bus|okada|bin|well|booth|cart|table|sign|tree|post|shade)\b/i;

type Feature = {
  id?: string | number;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function rings(geometry: Feature["geometry"]): [number, number][][][] {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates as [number, number][][]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as [number, number][][][];
  return [];
}

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return a / 2;
}

/** Point-in-polygon on the outer ring minus holes (local metres). */
export function insidePoly(poly: Poly, x: number, y: number): boolean {
  const hit = (ring: Ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  if (!poly[0] || !hit(poly[0])) return false;
  return !poly.slice(1).some(hit);
}

/**
 * Stable key for owner overrides. Tile feature ids are shared by every building merged into one
 * MultiPolygon, so a building is keyed by its own footprint centre (5 dp ≈ 1 m) instead.
 */
export function shapeKeyFor(spot: EnterSpot, centroid?: { lat: number; lng: number }): string {
  if (centroid) return `bld:${centroid.lat.toFixed(5)},${centroid.lng.toFixed(5)}`;
  if (spot.placeId) return `place:${spot.placeId}`;
  return `pt:${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`;
}

/** Build the shape for a tap. Never throws: anything unreadable becomes an object slot. */
export function shapeFromSpot(spot: EnterSpot): Shape {
  const bearing = Number.isFinite(spot.bearing) ? Number(spot.bearing) : 0;
  const feature = (spot.feature && typeof spot.feature === "object" ? spot.feature : null) as Feature | null;
  const small = SMALL.test(spot.name) || spot.kind === "wash";
  const asObject = (): Shape => ({
    type: "object",
    key: spot.placeId ? `place:${spot.placeId}` : shapeKeyFor(spot),
    name: spot.name,
    kind: spot.kind ?? "thing",
    bearing,
  });
  if (!feature || (small && spot.placeId)) return asObject();
  let geo: [number, number][][][] = [];
  try {
    geo = rings(feature.geometry);
  } catch {
    geo = [];
  }
  if (!geo.length) return asObject();
  // Vector tiles merge neighbouring buildings with the same tags into ONE MultiPolygon (one id for
  // a whole block). Keep only the part under the tap (or nearest to it) so the shell is that building.
  if (geo.length > 1) {
    const at: [number, number] = [spot.lng, spot.lat];
    // A tap on a roof or wall lands on the ground BEHIND the building (the 3D map is tilted), so walk
    // back toward the viewer (opposite the bearing) until the point falls inside a part.
    const b = ((Number.isFinite(spot.bearing) ? Number(spot.bearing) : 0) * Math.PI) / 180;
    const kx0 = M_PER_DEG_LNG * (Math.cos((spot.lat * Math.PI) / 180) || 1);
    let hit: [number, number][][] | undefined;
    for (let t = 0; t <= 90 && !hit; t += 1.5) {
      const x = at[0] - (Math.sin(b) * t) / kx0;
      const y = at[1] - (Math.cos(b) * t) / M_PER_DEG_LAT;
      hit = geo.find((poly) => insidePoly(poly as Poly, x, y));
    }
    if (hit) geo = [hit];
    else {
      let best = geo[0];
      let bestD = Infinity;
      for (const poly of geo) {
        for (const [x, y] of poly[0] ?? []) {
          const d = (x - at[0]) ** 2 + (y - at[1]) ** 2;
          if (d < bestD) {
            bestD = d;
            best = poly;
          }
        }
      }
      geo = [best];
    }
  }

  // Local tangent plane around the footprint's bbox centre.
  let lngMin = Infinity;
  let lngMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  for (const poly of geo)
    for (const ring of poly)
      for (const [x, y] of ring) {
        lngMin = Math.min(lngMin, x);
        lngMax = Math.max(lngMax, x);
        latMin = Math.min(latMin, y);
        latMax = Math.max(latMax, y);
      }
  if (!Number.isFinite(lngMin)) return asObject();
  const lat0 = (latMin + latMax) / 2;
  const lng0 = (lngMin + lngMax) / 2;
  const kx = M_PER_DEG_LNG * (Math.cos((lat0 * Math.PI) / 180) || 1);
  const polys: Poly[] = geo
    .map((poly) =>
      poly
        .map((ring) => ring.map(([x, y]) => [(x - lng0) * kx, (y - lat0) * M_PER_DEG_LAT] as [number, number]))
        .filter((ring) => ring.length >= 3),
    )
    .filter((poly) => poly.length > 0);
  if (!polys.length) return asObject();
  // Phones: a huge mapped compound can carry tens of thousands of vertices. Keep at most ~1500
  // points (evenly decimated) and drop holes if over budget, so the shell still builds instantly.
  const total = polys.reduce((n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0), 0);
  if (total > 1500) {
    const keep = 1500 / total;
    for (let i = 0; i < polys.length; i += 1) {
      polys[i] = [polys[i][0]]; // outer ring only
      const ring = polys[i][0];
      const stride = Math.max(1, Math.round(1 / keep));
      if (stride > 1) polys[i][0] = ring.filter((_, k) => k % stride === 0 || k === ring.length - 1);
      if (polys[i][0].length < 3) polys[i][0] = ring;
    }
  }
  const areaM2 = polys.reduce((sum, poly) => sum + Math.abs(ringArea(poly[0])) - poly.slice(1).reduce((s, h) => s + Math.abs(ringArea(h)), 0), 0);

  const p = feature.properties ?? {};
  const levelsTag = num(p["building:levels"] ?? p.levels ?? p.lv); // NDU-UPG collide: realism keys too
  const minLevel = num(p["building:min_level"] ?? p.min_level);
  const hTag = num(p.render_height ?? p.height ?? p.h);
  const minTag = num(p.render_min_height ?? p.min_height ?? p.b);
  let heightSource: "osm" | "levels" | "default" = "default";
  let maxH = 6;
  if (hTag !== null && hTag > 0) {
    maxH = hTag;
    heightSource = "osm";
  } else if (levelsTag !== null && levelsTag > 0) {
    maxH = levelsTag * FLOOR_M;
    heightSource = "levels";
  }
  const minH = Math.max(0, Math.min(maxH - 1, minTag ?? (minLevel !== null ? minLevel * FLOOR_M : 0)));
  const levels = Math.max(1, Math.min(200, Math.round(levelsTag ?? (maxH - minH) / FLOOR_M)));
  const color =
    typeof p.colour === "string"
      ? facadeColour(p.colour)
      : typeof p["building:colour"] === "string"
        ? facadeColour(String(p["building:colour"]))
        : null;
  const nameTag = typeof p.name === "string" && p.name ? p.name : typeof p["name:en"] === "string" ? String(p["name:en"]) : "";
  return {
    type: "building",
    key: shapeKeyFor(spot, { lat: lat0, lng: lng0 }),
    name: spot.name && spot.name !== "This building" ? spot.name : nameTag || "This building",
    polys,
    minH,
    maxH,
    levels,
    size: { w: (lngMax - lngMin) * kx, d: (latMax - latMin) * M_PER_DEG_LAT },
    areaM2,
    color,
    heightSource,
    bearing,
  };
}
