import { test } from "node:test";
import assert from "node:assert/strict";
import { footstep, stepSurface, type Surface } from "./footsteps.ts";

const surfaces = ["asphalt", "stone", "grass", "wood"] as const satisfies readonly Surface[];

const gains: Record<Surface, number> = {
  asphalt: 0,
  stone: 0,
  grass: 0,
  wood: 0,
};

for (const surface of surfaces) {
  const left = footstep(surface, 0);
  const right = footstep(surface, 1);
  const leftAgain = footstep(surface, 2);

  assert.notEqual(left.hz, right.hz, `${surface}: alternate steps differ in hz`);
  assert.ok(Math.abs(left.hz - right.hz) <= 12, `${surface}: the hz difference stays slight`);
  assert.equal(leftAgain.hz, left.hz, `${surface}: every other step repeats`);
  assert.equal(left.gain, right.gain);
  assert.equal(left.ms, right.ms);
  assert.ok(left.hz > 0 && right.hz > 0);
  assert.ok(left.gain > 0 && left.gain <= 1);
  assert.ok(left.ms > 0);
  gains[surface] = left.gain;
}

assert.ok(gains.grass < gains.stone, "grass is quieter than stone");
assert.ok(footstep("grass", 0).ms > footstep("stone", 0).ms, "grass lasts longer than a stone click");
assert.ok(footstep("stone", 0).hz > footstep("grass", 0).hz, "stone rings higher than grass");

console.log(
  `gains asphalt=${gains.asphalt} stone=${gains.stone} grass=${gains.grass} wood=${gains.wood}`,
);
console.log("footsteps ok");

test("a path is soft and steps are stone", () => {
  assert.equal(stepSurface("path"), "grass");
  assert.equal(stepSurface("steps"), "stone");
  assert.equal(stepSurface("residential"), "asphalt");
});
