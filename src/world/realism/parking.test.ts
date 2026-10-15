import assert from "node:assert/strict";
import { test } from "node:test";
import { lotFullness } from "./parking.ts";

test("lots are fuller at the two rush hours than at night", () => {
  const night = lotFullness(3 * 60);
  const morning = lotFullness(8.5 * 60);
  const evening = lotFullness(17.5 * 60);
  assert.ok(morning > night);
  assert.ok(evening > night);
  assert.ok(morning <= 0.72 && evening <= 0.72);
  assert.ok(night >= 0.18);
});
