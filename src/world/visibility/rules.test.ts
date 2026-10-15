import assert from "node:assert/strict";
import { canSee } from "./rules.ts";

const ownerId = "owner-1";
const strangerId = "stranger-9";

const privateRecord = { ownerId, visibility: "private" as const };
const publicRecord = { ownerId, visibility: "public" as const };

assert.equal(canSee(ownerId, privateRecord), true);
assert.equal(canSee(ownerId, publicRecord), true);
assert.equal(canSee(strangerId, publicRecord), true);

const strangerOnPrivate = canSee(strangerId, privateRecord);
assert.equal(strangerOnPrivate, false);

assert.equal(canSee("", privateRecord), false);
assert.equal(canSee("", publicRecord), true);
assert.equal(canSee(strangerId, { ownerId, visibility: "private" }), false);
assert.equal(privateRecord.visibility, "private");
assert.equal(privateRecord.ownerId, ownerId);

console.log(strangerOnPrivate);
