import assert from "node:assert/strict";
import { nextFloor } from "./floors.ts";

const downFromGround = nextFloor(0, "down", 4);
const upFromOne = nextFloor(1, "up", 4);

assert.equal(downFromGround, 0);
assert.equal(upFromOne, 2);
assert.equal(nextFloor(3, "up", 4), 3);
assert.equal(nextFloor(2, "down", 4), 1);
assert.equal(nextFloor(0, "up", 4), 1);
assert.equal(nextFloor(3, "down", 4), 2);

console.log(`nextFloor(0, "down", 4) ${downFromGround}`);
console.log(`nextFloor(1, "up", 4) ${upFromOne}`);
