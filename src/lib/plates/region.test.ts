import assert from "node:assert/strict";
import { blurBox } from "./region.ts";

function near(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ~= ${expected}`);
}

const box = blurBox(10, 10, 20, 8);
near(box.x, 8, "x");
near(box.y, 9.2, "y");
near(box.w, 24, "w");
near(box.h, 9.6, "h");

const edge = blurBox(0, 0, 20, 8);
assert.equal(edge.x, 0);
assert.equal(edge.y, 0);
near(edge.w, 22, "clamped width keeps the far edge");
near(edge.h, 8.8, "clamped height keeps the far edge");

const gone = blurBox(-30, -30, 10, 10);
assert.deepEqual(gone, { x: 0, y: 0, w: 0, h: 0 });

for (const value of [box.x, box.y, box.w, box.h, edge.x, edge.y, edge.w, edge.h]) {
  assert.ok(value >= 0, "clamped at 0");
}

console.log(JSON.stringify(box));
console.log("region ok");
