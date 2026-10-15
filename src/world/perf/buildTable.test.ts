import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTable } from "./buildTable.ts";

test("buildTable sorts two fixture rows by bytes descending", () => {
  const rows = [
    { file: "fixture-small.js", bytes: 12 },
    { file: "fixture-large.js", bytes: 40 },
  ];
  assert.equal(buildTable(rows), "fixture-large.js 40\nfixture-small.js 12");
});
