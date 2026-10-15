import assert from "node:assert/strict";
import { groundShadow } from "./cast.ts";
import { scanShadow } from "./scans.ts";

const dims = { width: 4, depth: 4, height: 6 };
const light = { east: 1, north: 0, up: 1 };
const pose = scanShadow(dims, light);
const blob = groundShadow(dims, light);

assert.ok(pose.x < 0, "an east light yields x < 0");
assert.equal(pose.x, blob.east);
assert.equal(pose.z, -blob.north);
assert.equal(pose.y, 0.02);
assert.equal(pose.rx, blob.rx);
assert.equal(pose.ry, blob.ry);
assert.equal(pose.opacity, blob.opacity);

console.log("scans ok", pose.x);
