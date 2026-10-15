import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStreets } from "./parse.ts";
import { buildGraph } from "./graph.ts";
import { poiPull } from "./density.ts";
import { lampHalo } from "./lamps.ts";

test("doors, lamps, benches and bins are read, and a bench in the lane is dropped", () => {
  const lat = 4.8;
  const lng = 7;
  const d = 0.001;
  const st = parseStreets(lat, lng, [
    { type: "way", tags: { highway: "residential" }, geometry: [{ lat, lon: lng }, { lat, lon: lng + d }] },
    { type: "node", lat, lon: lng, tags: { entrance: "yes" } },
    { type: "node", lat: lat + 0.0004, lon: lng + 0.0004, tags: { highway: "street_lamp" } },
    { type: "node", lat, lon: lng, tags: { amenity: "bench" } },
    { type: "node", lat: lat + 0.0004, lon: lng - 0.0003, tags: { amenity: "waste_basket" } },
  ]);
  assert.deepEqual(st.pois.map((p) => p.kind).sort(), ["bench", "bin", "door", "lamp"]);
  const g = buildGraph(st);
  assert.equal(g.pois.some((p) => p.kind === "bench"), false);
  assert.equal(g.pois.some((p) => p.kind === "door"), true);
  assert.equal(g.pois.some((p) => p.kind === "lamp"), true);
  assert.ok(poiPull("door", 10 * 60, 2) > poiPull("door", 2 * 60, 2));
  assert.equal(lampHalo(0.2), 0);
  assert.ok(lampHalo(0.8) > 0.4);
});
