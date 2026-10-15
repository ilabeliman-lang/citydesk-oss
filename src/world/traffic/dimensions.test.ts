import assert from "node:assert/strict";
import { fitsLane, sizeOf } from "./dimensions.ts";

assert.deepEqual(sizeOf("car"), { width: 1.8, length: 4.2 });
assert.deepEqual(sizeOf("bus"), { width: 2.5, length: 12 });

const carLane = fitsLane("car", 3.5);
const busLane = fitsLane("bus", 2.4);
assert.equal(carLane, true);
assert.equal(busLane, false);
assert.equal(fitsLane("car", 1.8), false);
assert.equal(fitsLane("bus", 2.5), false);

console.log('fitsLane("car", 3.5)', carLane);
console.log('fitsLane("bus", 2.4)', busLane);
