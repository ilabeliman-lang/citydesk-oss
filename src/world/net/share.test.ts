import assert from "node:assert/strict";
import { shareConsent } from "./share.ts";

const offNull = shareConsent(null);
const offFalse = shareConsent(false);
const onTrue = shareConsent(true);

assert.deepEqual(offNull, { on: false, remoteExec: false });
assert.deepEqual(offFalse, { on: false, remoteExec: false });
assert.deepEqual(onTrue, { on: true, remoteExec: false });
assert.equal(onTrue.remoteExec, false);
assert.equal(offNull.remoteExec, false);
assert.equal(offFalse.remoteExec, false);

console.log(JSON.stringify(onTrue));
