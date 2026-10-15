import assert from "node:assert/strict";
import { test } from "node:test";
import { lifeBodies, setLifeBodies } from "./bodies.ts";

test("a bad disc is dropped and the list stays short", () => {
  setLifeBodies([
    { lng: 7, lat: 4.8, r: 1 },
    { lng: Number.NaN, lat: 4.8, r: 1 },
    { lng: 7, lat: 4.8, r: 0 },
  ]);
  assert.deepEqual(lifeBodies(), [{ lng: 7, lat: 4.8, r: 1 }]);
  setLifeBodies([]);
  assert.equal(lifeBodies().length, 0);
});
