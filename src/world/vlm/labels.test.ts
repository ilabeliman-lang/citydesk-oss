import assert from "node:assert/strict";
import { roomLabel } from "./labels.ts";

const bed = roomLabel(["bed"]);
const cook = roomLabel(["cook"]);
const empty = roomLabel([]);
const other = roomLabel(["lamp"]);
const both = roomLabel(["bed", "cook"]);
const cookThenBed = roomLabel(["cook", "bed"]);

assert.equal(bed, "bedroom");
assert.equal(cook, "kitchen");
assert.equal(empty, "room");
assert.equal(other, "room");
assert.equal(both, "bedroom");
assert.equal(cookThenBed, "bedroom");
assert.equal(roomLabel(["cooking"]), "room");
assert.equal(roomLabel(["bedroom"]), "room");

console.log(bed);
