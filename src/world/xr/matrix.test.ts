import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deviceMatrix } from "./matrix.ts";

const rows = deviceMatrix();

assert.equal(rows.length, 3);
assert.deepEqual(
  rows.map((row) => row.name),
  ["phone", "headset", "glasses"],
);
for (const row of rows) {
  assert.equal(row.status, "untested", `${row.name} stays untested`);
}

const glasses = rows.find((row) => row.name === "glasses");
assert.ok(glasses);
assert.equal(glasses.status, "untested");

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "matrix.ts"), "utf8");
assert.equal(/requestSession|navigator\.xr|immersive-vr|immersive-ar/.test(src), false);

console.log(`glasses ${glasses.status}`);
console.log("matrix ok");
