import { test } from "node:test";
import assert from "node:assert/strict";
import { enuToWebAudio, listenerForward, poolSize } from "./spatial.ts";
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
test("spatial: ENU -> Web Audio axes", () => {
  assert.deepEqual(enuToWebAudio({ e: 1, n: 2, u: 3 }), { x: 1, y: 3, z: -2 });
});
test("spatial: listener forward for yaw 0 / 90 / 180", () => {
  let f = listenerForward(0); near(f.x, 0); near(f.z, -1);
  f = listenerForward(90); near(f.x, 1); near(f.z, 0);
  f = listenerForward(180); near(f.x, 0); near(f.z, 1);
  f = listenerForward(0, 90); near(f.y, 1);
});
test("spatial: pool sizes per tier", () => {
  assert.equal(poolSize("A"), 16); assert.equal(poolSize("B"), 8); assert.equal(poolSize("C"), 0);
});
