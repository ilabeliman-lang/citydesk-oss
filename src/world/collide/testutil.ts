import { readFileSync } from "node:fs";
import { toBuildings, toEntrances, type OverpassEl } from "../realism/buildingsData.ts";
import { makeFrame, toXY } from "./enu.ts";
import { CollisionWorld } from "./world.ts";

/** Test helpers (node only). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
export const LAT0 = 4.8156;
export const LNG0 = 7.0498;
export function fixture(): { elements: OverpassEl[] } {
  return JSON.parse(readFileSync(new URL("./fixtures/ph-cell.json", import.meta.url), "utf8"));
}
export function fixtureWorld(): CollisionWorld {
  const fx = fixture();
  const w = new CollisionWorld();
  w.setFrame(LAT0, LNG0);
  w.ingest({ buildings: toBuildings(fx.elements).features, entrances: toEntrances(fx.elements) });
  w.rebuild({ lat: LAT0, lng: LNG0 });
  return w;
}
/** A world from plain metre rectangles/rings (x,y) around LAT0/LNG0. */
export function ringsWorld(rings: [number, number][][], props: { h?: number; b?: number; kind?: string }[] = []): CollisionWorld {
  const f = makeFrame(LAT0, LNG0);
  const feats = rings.map((r, i) => ({
    type: "Feature",
    id: i + 1,
    properties: { osm: i + 1, h: props[i]?.h ?? 10, b: props[i]?.b ?? 0, lv: 3, kind: props[i]?.kind ?? "yes", name: `B${i + 1}`, part: 0, src: "osm" },
    geometry: { type: "Polygon", coordinates: [[...r, r[0]].map(([x, y]) => [LNG0 + x / f.kx, LAT0 + y / f.ky])] },
  }));
  const w = new CollisionWorld();
  w.setFrame(LAT0, LNG0);
  w.ingest({ buildings: feats });
  w.rebuild({ lat: LAT0, lng: LNG0 });
  return w;
}
export const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
export { toXY };
