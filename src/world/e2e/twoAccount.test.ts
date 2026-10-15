/** node --experimental-strip-types src/world/e2e/twoAccount.test.ts */
import assert from "node:assert/strict";
import { createAccount, putRecord, readRecord } from "./twoAccount.ts";

const a = createAccount("A");
const b = createAccount("B");
putRecord(a, { id: "rec-a", text: "only A" });

const seen = readRecord(b, "rec-a");
assert.equal(seen, null);
assert.deepEqual(readRecord(a, "rec-a"), { id: "rec-a", text: "only A" });

console.log("B reads A's record:", seen);
