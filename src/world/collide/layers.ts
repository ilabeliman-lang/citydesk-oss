import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import { toLL } from "./enu.ts";
import type { Door, Frame } from "./types.ts";
import type { CollisionWorld } from "./world.ts";

/** NDU-UPG collide: door slabs/dots (+ debug edges) on the street map (PLAN §5.13). */
export const DOORS_SRC = "ndu-doors-src";
export const DOORS_3D = "ndu-doors-3d";
export const DOORS_DOT = "ndu-doors-dot";
export const EDGES_SRC = "ndu-collide-edges-src";
export const EDGES = "ndu-collide-edges";
const ATTR = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> (ODbL)';
const EMPTY = { type: "FeatureCollection" as const, features: [] };

const colour = ["case", ["get", "locked"], "#5b4b38", ["match", ["get", "kind"], "main", "#e8843a", "yes", "#f0c14a", "secondary", "#f0c14a", "service", "#8a8178", "synthetic", "#f6efe2", "#f0c14a"]];

export function addLayers(map: MapLibreMap, opts: { tierC: boolean; debug: boolean }): () => void {
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* style not ready / layer exists */
    }
  };
  safe(() => map.addSource(DOORS_SRC, { type: "geojson", data: EMPTY, attribution: ATTR, promoteId: "fid" }));
  if (!opts.tierC)
    safe(() =>
      map.addLayer({
        id: DOORS_3D,
        type: "fill-extrusion",
        source: DOORS_SRC,
        minzoom: 16,
        filter: ["==", ["get", "shape"], "slab"],
        paint: {
          "fill-extrusion-height": ["case", ["==", ["get", "kind"], "garage"], 2.6, 2.1],
          "fill-extrusion-base": 0,
          "fill-extrusion-color": ["case", ["boolean", ["feature-state", "near"], false], "#ffd27a", colour] as never,
          "fill-extrusion-opacity": 0.9,
        },
      }),
    );
  safe(() =>
    map.addLayer({
      id: DOORS_DOT,
      type: "circle",
      source: DOORS_SRC,
      minzoom: 17,
      filter: ["==", ["get", "shape"], "dot"],
      paint: { "circle-radius": ["case", ["boolean", ["feature-state", "near"], false], 6, 4], "circle-color": colour as never, "circle-stroke-color": "#1a1511", "circle-stroke-width": 1.5 },
    }),
  );
  if (opts.debug) {
    safe(() => map.addSource(EDGES_SRC, { type: "geojson", data: EMPTY }));
    safe(() => map.addLayer({ id: EDGES, type: "line", source: EDGES_SRC, paint: { "line-color": ["case", ["get", "blocking"], "#ff3b30", "#9a9a9a"], "line-width": 2 } }));
  }
  return () => {
    for (const id of [EDGES, DOORS_DOT, DOORS_3D]) safe(() => map.getLayer(id) && map.removeLayer(id));
    for (const id of [EDGES_SRC, DOORS_SRC]) safe(() => map.getSource(id) && map.removeSource(id));
  };
}

export function doorFeatures(frame: Frame, doors: Door[], centre: { x: number; y: number }, max = 400, radius = 300): GeoJSON.Feature[] {
  const near = doors.filter((d) => Math.hypot(d.at.x - centre.x, d.at.y - centre.y) < radius && d.kind !== "emergency").slice(0, max);
  const out: GeoJSON.Feature[] = [];
  near.forEach((d, i) => {
    const tx = -d.normal.y;
    const ty = d.normal.x;
    const hw = d.widthM / 2;
    const ll = (x: number, y: number) => {
      const p = toLL(frame, x, y);
      return [p.lng, p.lat];
    };
    const a = d.at;
    const ring = [ll(a.x - tx * hw, a.y - ty * hw), ll(a.x + tx * hw, a.y + ty * hw), ll(a.x + tx * hw - d.normal.x * 0.18, a.y + ty * hw - d.normal.y * 0.18), ll(a.x - tx * hw - d.normal.x * 0.18, a.y - ty * hw - d.normal.y * 0.18)];
    ring.push(ring[0]);
    const props = { fid: i * 2 + 1, id: d.id, kind: d.kind, locked: d.locked, synthetic: d.synthetic, name: d.name };
    out.push({ type: "Feature", id: i * 2 + 1, properties: { ...props, shape: "slab" }, geometry: { type: "Polygon", coordinates: [ring] } });
    out.push({ type: "Feature", id: i * 2 + 2, properties: { ...props, fid: i * 2 + 2, shape: "dot" }, geometry: { type: "Point", coordinates: ll(a.x + d.normal.x * 0.3, a.y + d.normal.y * 0.3) } });
  });
  return out;
}

export function setDoors(map: MapLibreMap, feats: GeoJSON.Feature[]): void {
  try {
    (map.getSource(DOORS_SRC) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
  } catch {
    /* ignore */
  }
}

export function setDebugEdges(map: MapLibreMap, world: CollisionWorld): void {
  const feats: GeoJSON.Feature[] = [];
  for (const c of world.colliders)
    for (const r of c.rings) {
      const coords: number[][] = [];
      for (let i = 0; i < r.length; i += 2) {
        const p = toLL(world.frame, r[i], r[i + 1]);
        coords.push([p.lng, p.lat]);
      }
      feats.push({ type: "Feature", properties: { blocking: c.blocking }, geometry: { type: "LineString", coordinates: coords } });
    }
  try {
    (map.getSource(EDGES_SRC) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
  } catch {
    /* ignore */
  }
}
