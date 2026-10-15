import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeFromSpot } from "./footprint.ts";

// NDU-UPG collide CD-COL-09: realism features (h/b/lv) give real heights, not the 6 m default.
const sq = (lat: number, lng: number, d = 0.00015) => ({ type: "Polygon", coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] });

test("realism-style feature uses h/b/lv", () => {
  const s = shapeFromSpot({ name: "Shop", lat: 4.81565, lng: 7.04985, feature: { type: "Feature", properties: { h: 12.5, b: 0, lv: 4 }, geometry: sq(4.8156, 7.0498) } }) as { type: string; maxH?: number; heightSource?: string };
  assert.equal(s.type, "building");
  assert.equal(s.maxH, 12.5);
  assert.equal(s.heightSource, "osm");
});

test("tile-style feature behaves as before", () => {
  const s = shapeFromSpot({ name: "Shop", lat: 4.81565, lng: 7.04985, feature: { type: "Feature", properties: { render_height: 9, render_min_height: 0 }, geometry: sq(4.8156, 7.0498) } }) as { maxH?: number; heightSource?: string };
  assert.equal(s.maxH, 9);
  const d = shapeFromSpot({ name: "Shop", lat: 4.81565, lng: 7.04985, feature: { type: "Feature", properties: {}, geometry: sq(4.8156, 7.0498) } }) as { maxH?: number; heightSource?: string };
  assert.equal(d.maxH, 6);
  assert.equal(d.heightSource, "default");
});
