import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_M, parseLength, parseLevels, resolveHeight } from "./heights.ts";
import { coveredIds, fromTileFeatures, inside, toBuildings, type OverpassEl } from "./buildingsData.ts";

// NDU-UPG #100: height resolver for tag combinations.

test("parseLength handles metres, units, commas, feet and junk", () => {
  assert.equal(parseLength("12"), 12);
  assert.equal(parseLength("12 m"), 12);
  assert.equal(parseLength("12.5m"), 12.5);
  assert.equal(parseLength("12,5"), 12.5);
  assert.ok(Math.abs((parseLength("40'") ?? 0) - 12.192) < 1e-9);
  assert.ok(Math.abs((parseLength("13'6\"") ?? 0) - 4.1148) < 1e-9);
  assert.equal(parseLength("0"), null); // height=0 is a tagging error, not a flat building
  assert.equal(parseLength("tall"), null);
  assert.equal(parseLength(undefined), null);
  assert.equal(parseLevels("3"), 3);
  assert.equal(parseLevels("2;3"), 2);
  assert.equal(parseLevels("x"), null);
});

test("height tag wins ('12 m')", () => {
  const r = resolveHeight({ building: "yes", height: "12 m", "building:levels": "5" });
  assert.equal(r.height, 12);
  assert.equal(r.source, "height");
  assert.equal(r.tagged, true);
});

test("levels × 3.0 m + roof allowance", () => {
  assert.equal(resolveHeight({ building: "yes", "building:levels": "3" }).height, 3 * LEVEL_M + 0.6);
  assert.equal(resolveHeight({ building: "yes", "building:levels": "3", "roof:shape": "gabled" }).height, 3 * LEVEL_M + 1.5);
  assert.equal(resolveHeight({ building: "yes", "building:levels": "2", "roof:levels": "1" }).height, 2 * LEVEL_M + 2.3);
  assert.equal(resolveHeight({ building: "yes", "building:levels": "2", "roof:height": "2" }).height, 8);
});

test("height=0 with levels=10 is not flat (vector tiles draw it at 0 m)", () => {
  const r = resolveHeight({ building: "yes", height: "0", "building:levels": "10" });
  assert.equal(r.height, 30.6);
  assert.equal(r.source, "levels");
});

test("min_level / min_height lift the base (overhangs, parts)", () => {
  const r = resolveHeight({ "building:part": "yes", "building:levels": "5", "building:min_level": "1" });
  assert.equal(r.base, 3);
  assert.equal(r.height, 15.6);
  const m = resolveHeight({ building: "yes", height: "20", min_height: "12" });
  assert.equal(m.base, 12);
  assert.equal(m.height, 20);
});

test("missing tags fall back to type, then landuse priors, then the default (#56)", () => {
  assert.equal(resolveHeight({ building: "apartments" }).height, 4 * LEVEL_M + 0.6);
  assert.equal(resolveHeight({ building: "apartments" }).source, "type");
  assert.equal(resolveHeight({ building: "yes" }, "residential").height, 2 * LEVEL_M + 0.6);
  assert.equal(resolveHeight({ building: "yes" }, "commercial").height, 3 * LEVEL_M + 0.6);
  assert.equal(resolveHeight({ building: "yes" }, "industrial").height, 7.6); // 1 tall level
  assert.equal(resolveHeight({ building: "yes" }, "industrial").source, "landuse");
  assert.equal(resolveHeight({ building: "yes" }).source, "default");
  assert.equal(resolveHeight({ building: "yes" }).tagged, false);
});

test("canopies (building=roof) float above the ground", () => {
  const r = resolveHeight({ building: "roof" });
  assert.ok(r.base > 3 && r.height > r.base);
});

const sq = (x: number, y: number, s: number) => [
  { lat: y, lon: x },
  { lat: y, lon: x + s },
  { lat: y + s, lon: x + s },
  { lat: y + s, lon: x },
  { lat: y, lon: x },
];

test("toBuildings: landuse prior by centroid, parts replace their outline (#62)", () => {
  const els: OverpassEl[] = [
    { type: "way", id: 1, tags: { landuse: "commercial" }, geometry: sq(0, 0, 0.01) },
    { type: "way", id: 2, tags: { building: "yes" }, geometry: sq(0.001, 0.001, 0.0005) },
    { type: "way", id: 3, tags: { building: "yes", name: "Tower" }, geometry: sq(0.005, 0.005, 0.001) },
    { type: "way", id: 4, tags: { "building:part": "yes", "building:levels": "20" }, geometry: sq(0.0052, 0.0052, 0.0004) },
    { type: "way", id: 5, tags: { building: "yes", "building:colour": "#aabbcc" }, geometry: sq(0.02, 0.02, 0.0005) },
  ];
  const fc = toBuildings(els);
  const byId = new Map(fc.features.map((f) => [f.id, f.properties]));
  assert.equal(byId.get(2)?.src, "landuse");
  assert.equal(byId.get(2)?.h, 9.6);
  assert.equal(byId.has(3), false, "outline with parts is drawn by its parts");
  assert.equal(byId.get(4)?.h, 60.6);
  assert.equal(byId.get(5)?.src, "default");
  assert.equal(byId.get(5)?.c, "#aabbcc");
  assert.deepEqual(coveredIds(els).sort(), [2, 3, 4, 5]);
  assert.equal(inside([0.5, 0.5], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]), true);
});

test("tile fallback: only 0 m / untagged 5 m tile heights get landuse priors", () => {
  const ring = (x: number) => [[[x, 0], [x + 0.0004, 0], [x + 0.0004, 0.0004], [x, 0.0004], [x, 0]]];
  const out = fromTileFeatures(
    [
      { id: 4881854650, props: { render_height: 0, render_min_height: 0 }, rings: ring(0.001) },
      { id: 1230, props: { render_height: 5, render_min_height: 0 }, rings: ring(0.002) },
      { id: 4560, props: { render_height: 42, render_min_height: 0 }, rings: ring(0.003) },
      { id: 7890, props: { render_height: 5, render_min_height: 0, hide_3d: true }, rings: ring(0.004) },
      { id: 1230, props: { render_height: 5, render_min_height: 0 }, rings: ring(0.002) }, // overscaled duplicate
    ],
    [{ cls: "commercial", rings: [[[0, -1], [1, -1], [1, 1], [0, 1], [0, -1]]] }],
  );
  assert.deepEqual(out.covered.sort((a, b) => a - b), [123, 488185465]);
  assert.equal(out.features.length, 2, "duplicate piece dropped");
  assert.ok(out.features.every((f) => f.properties.h === 9.6 && f.properties.src === "landuse"));
});
