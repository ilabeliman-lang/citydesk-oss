import assert from "node:assert/strict";
import { groundShadow } from "./cast.ts";

const high = groundShadow({ width: 10, depth: 8, height: 12 }, { east: 0, north: 1, up: 2 });
const low = groundShadow({ width: 10, depth: 8, height: 12 }, { east: 0, north: 1, up: 0.2 });

assert.ok(low.ry > high.ry, "a low sun stretches the shadow");
assert.ok(Math.abs(high.east) < 0.01, "a north light does not shift the shadow east");
assert.ok(high.north < 0, "the shadow falls opposite the light");
assert.ok(high.opacity < 0.42 && high.opacity > 0.1, "opacity stays in range");

const side = groundShadow({ width: 4, depth: 4, height: 6 }, { east: 1, north: 0, up: 1 });
assert.ok(side.east < 0, "an east light throws the shadow west");

console.log("cast ok");
