import assert from "node:assert/strict";
import { test } from "node:test";
import { terrainKind } from "./terrainKind.ts";

test("only a strong device raises the mesh; a weak one stays flat", () => {
  assert.equal(terrainKind("A"), "full");
  assert.equal(terrainKind("B"), "shade");
  assert.equal(terrainKind("C"), "flat");
});
