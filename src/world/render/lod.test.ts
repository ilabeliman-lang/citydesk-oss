import assert from "node:assert/strict";
import { test } from "node:test";
import { gyroLook } from "../orbit/viewRig.ts";
import { lodScale } from "./lod.ts";

test("a far crowd draws smaller, and a phone tilt stays inside a small turn", () => {
  assert.equal(lodScale(10), 1);
  assert.ok(lodScale(80) < 1);
  assert.ok(lodScale(200) < lodScale(80));
  const look = gyroLook(70, 40);
  assert.ok(look);
  assert.ok(Math.abs(look.bearing) <= 35);
  assert.equal(gyroLook(null, 10), null);
});
