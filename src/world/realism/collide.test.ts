import assert from "node:assert/strict";
import { test } from "node:test";
import { blocksBuilding, slideMeters } from "./collide.ts";

test("a car on the axis stops the walk, a clear side still slides", () => {
  const car = [{ x: 3, y: 0, r: 2.2 }];
  const stopped = slideMeters({ x: 0, y: 0 }, { x: 3, y: 0 }, car, 0.4);
  assert.deepEqual(stopped, { x: 0, y: 0 });
  const aside = slideMeters({ x: 0, y: 0 }, { x: 3, y: 0.5 }, car, 0.4);
  assert.equal(aside.x, 0);
  assert.equal(aside.y, 0.5);
  const open = slideMeters({ x: 0, y: 0 }, { x: 0, y: 4 }, car, 0.4);
  assert.deepEqual(open, { x: 0, y: 4 });
});

test("doors and passages are not walls", () => {
  assert.equal(blocksBuilding({ building: "yes" }), true);
  assert.equal(blocksBuilding({ entrance: "yes" }), false);
  assert.equal(blocksBuilding({ tunnel: "building_passage" }), false);
  assert.equal(blocksBuilding(null), true);
});
