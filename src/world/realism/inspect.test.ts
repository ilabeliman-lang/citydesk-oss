import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectLine } from "./inspect.ts";

test("an unnamed building shows floors, material, and hours", () => {
  assert.equal(inspectLine({ "building:levels": "4", "building:material": "concrete", opening_hours: "Mo-Fr 09:00-17:00" }), "4 floors · concrete · Mo-Fr 09:00-17:00");
  assert.equal(inspectLine({}), "");
  assert.equal(inspectLine(null), "");
});
