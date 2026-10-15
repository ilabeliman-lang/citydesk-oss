import assert from "node:assert/strict";
import { test } from "node:test";
import { thunderPan } from "./thunder.ts";

test("near thunder is quieter in the stereo field than far thunder", () => {
  assert.ok(Math.abs(thunderPan(1)) < Math.abs(thunderPan(8)));
  assert.ok(Math.abs(thunderPan(8)) <= 0.7);
  assert.equal(thunderPan(Number.NaN), 0);
});
