import assert from "node:assert/strict";
import { test } from "node:test";
import { isWalkable } from "./nav.ts";

test("the office door is a way out, the wall beside it is not", () => {
  assert.equal(isWalkable(0, 1.5), true);
  assert.equal(isWalkable(0, -8), true);
  assert.equal(isWalkable(-4, -7.2), false);
  assert.equal(isWalkable(0, -9.2), false);
});
