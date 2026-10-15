import assert from "node:assert/strict";
import { test } from "node:test";
import { toBuildings } from "./buildingsData.ts";
import { materialColour } from "./material.ts";

test("a named material tints the wall, and a painted colour wins", () => {
  assert.equal(materialColour("brick"), "#8d4b3a");
  assert.equal(materialColour(" Concrete "), "#b7b1a8");
  assert.equal(materialColour("marble"), "");
  assert.equal(materialColour(null), "");
  const ring = [
    { lat: 4.8, lon: 7 },
    { lat: 4.8001, lon: 7 },
    { lat: 4.8001, lon: 7.0001 },
    { lat: 4.8, lon: 7.0001 },
  ];
  const brick = toBuildings([{ type: "way", id: 1, tags: { building: "yes", "building:material": "brick" }, geometry: ring }]);
  assert.equal(brick.features[0]?.properties.c, "#8d4b3a");
  const painted = toBuildings([{ type: "way", id: 2, tags: { building: "yes", "building:material": "brick", "building:colour": "#112233" }, geometry: ring }]);
  assert.equal(painted.features[0]?.properties.c, "#112233");
});
