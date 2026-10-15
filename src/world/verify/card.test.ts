import assert from "node:assert/strict";
import { verifyCard } from "./card.ts";

const hash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const matched = verifyCard({ hash, expected: hash });

assert.equal(matched.status, "matched");
assert.equal(matched.chain, "unavailable");
assert.equal(matched instanceof Promise, false);
assert.deepEqual(Object.keys(matched).sort(), ["chain", "status"]);

for (const name of ["signature", "sig", "network", "tx", "mint", "proof"]) {
  assert.equal(Object.hasOwn(matched, name), false, name);
}

const different = verifyCard({ hash, expected: `${hash.slice(0, -1)}b` });
assert.equal(different.status, "unmatched");
assert.equal(different.chain, "unavailable");

const empty = verifyCard({ hash: "", expected: "" });
assert.equal(empty.status, "matched");
assert.equal(empty.chain, "unavailable");

console.log(JSON.stringify({ status: matched.status, chain: matched.chain }));
