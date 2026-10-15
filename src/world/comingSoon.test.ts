import { test } from "node:test";
import assert from "node:assert/strict";
import { COMING_SOON } from "./comingSoon.ts";

test("every blocked product item is marked coming soon and says what it waits on", () => {
  assert.ok(COMING_SOON.length >= 8);
  for (const item of COMING_SOON) {
    assert.ok(item.id && item.title && item.detail.length > 20, item.id);
  }
  assert.ok(COMING_SOON.some((item) => /3D tiles|Photoreal/.test(item.title + item.detail)));
  assert.ok(COMING_SOON.every((item) => !/api[_-]?key|password|secret/i.test(item.detail)));
});
