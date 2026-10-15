import assert from "node:assert/strict";
import { allowMessage } from "./guard.ts";

const t0 = 1_700_000_000_000;
const burst: boolean[] = [];
for (let i = 0; i < 6; i += 1) burst.push(allowMessage("ada", t0 + i));
assert.deepEqual(burst, [true, true, true, true, true, false]);

assert.equal(allowMessage("bea", t0), true, "other users have their own window");
assert.equal(allowMessage("ada", t0 + 9_999), false, "still inside the ten seconds");
assert.equal(allowMessage("ada", t0 + 10_000), true, "the oldest stamp leaves the window");

for (let i = 0; i < 5; i += 1) assert.equal(allowMessage("cat", 50_000), true);
assert.equal(allowMessage("cat", 50_000), false);

const sixth = burst[5];
assert.equal(sixth, false);
console.log(String(sixth));
