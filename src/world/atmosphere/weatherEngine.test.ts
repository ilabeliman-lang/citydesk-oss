import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeWindVector } from "./weatherEngine.ts";

describe("computeWindVector (first test)", () => {
  it("a wind FROM the east blows towards the west", () => {
    const w = computeWindVector(90, 10);
    assert.ok(Math.abs(w.east + 10) < 1e-9 && Math.abs(w.north) < 1e-9);
    assert.ok(Math.abs(w.vx + 10) < 1e-9);
  });
  it("a wind FROM the north blows south (+Z)", () => {
    const w = computeWindVector(0, 5);
    assert.ok(Math.abs(w.north + 5) < 1e-9);
    assert.ok(Math.abs(w.vz - 5) < 1e-9);
  });
  it("normalises direction and floors speed at 0", () => {
    const w = computeWindVector(-90, -3);
    assert.equal(w.directionDegrees, 270);
    assert.equal(w.speedMps, 0);
  });
});
