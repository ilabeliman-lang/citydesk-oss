import assert from "node:assert/strict";
import { speakChunks } from "./stream.ts";

const empty = speakChunks("");
const street = speakChunks("walk the street");

assert.deepEqual(empty, []);
assert.deepEqual(street, ["walk", "the", "street"]);
assert.deepEqual(speakChunks("walk  the   street"), ["walk", "the", "street"]);
assert.deepEqual(speakChunks("one"), ["one"]);

console.log(JSON.stringify(street));
console.log("speakChunks ok");
