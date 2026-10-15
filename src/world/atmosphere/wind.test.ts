import assert from "node:assert/strict";
import { test } from "node:test";
import { puddleOpacity } from "./puddles.ts";
import { SWAY_PERIOD_SECONDS, sway, windVector } from "./wind.ts";

const dry = puddleOpacity(0);
assert.equal(dry, 0);
assert.equal(puddleOpacity(-2), 0);
assert.equal(puddleOpacity(Number.NaN), 0);
assert.equal(puddleOpacity(1), 0.45);
assert.equal(puddleOpacity(3), 0.45);
assert.ok(puddleOpacity(0.5) > 0 && puddleOpacity(0.5) < 0.45);

const wind = { east: 4, north: 0 };
const sample = sway(SWAY_PERIOD_SECONDS / 4, wind);
assert.equal(sample.east, 0.125);
assert.equal(sample.north, 0);
assert.ok(Math.hypot(sample.east, sample.north) <= 0.25);

const again = sway(SWAY_PERIOD_SECONDS / 4 + SWAY_PERIOD_SECONDS, wind);
assert.ok(Math.abs(again.east - sample.east) < 1e-9);
assert.ok(Math.abs(again.north - sample.north) < 1e-9);

const calm = sway(1, { east: 0, north: 0 });
assert.deepEqual(calm, { east: 0, north: 0 });

const origin = sway(0, wind);
assert.equal(origin.east, 0);
assert.equal(origin.north, 0);

console.log("dry", dry);
console.log("sway", JSON.stringify(sample));

test("a north wind blows south", () => {
  const v = windVector(36, 0);
  assert.ok(Math.abs(v.east) < 0.2);
  assert.ok(v.north < -9);
});
