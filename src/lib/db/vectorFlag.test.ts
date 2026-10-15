import assert from "node:assert/strict";
import { vectorEnabled } from "./vectorFlag.ts";

const on = vectorEnabled("on");
const empty = vectorEnabled("");

assert.equal(on, true);
assert.equal(empty, false);
assert.equal(vectorEnabled("ON"), false);
assert.equal(vectorEnabled("on "), false);
assert.equal(vectorEnabled(" off"), false);
assert.equal(vectorEnabled("off"), false);
assert.equal(vectorEnabled("true"), false);
assert.equal(vectorEnabled("1"), false);

console.log(`vectorEnabled("on") ${on}`);
console.log(`vectorEnabled("") ${empty}`);
