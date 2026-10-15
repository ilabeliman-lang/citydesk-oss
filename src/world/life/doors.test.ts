import assert from "node:assert/strict";
import { test } from "node:test";
import { doorWithin, setDoors } from "./doors.ts";

test("a mapped door is a passage, a step away from it is still a wall", () => {
  setDoors([{ lng: 7, lat: 4.8 }]);
  assert.equal(doorWithin(7, 4.8), true);
  assert.equal(doorWithin(7.001, 4.8), false);
  setDoors([]);
});
