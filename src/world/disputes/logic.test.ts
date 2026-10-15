import assert from "node:assert/strict";
import { challenge, openDispute, settle } from "./logic.ts";

const opened = openDispute("parcel-7", "disp-1");
assert.equal(opened.status, "open");
assert.equal(opened.subjectId, "parcel-7");
assert.equal(opened.id, "disp-1");
assert.throws(() => settle(opened), /still open/);
assert.equal(opened.status, "open", "settle from open does not change the row");

const challenged = challenge(opened);
assert.equal(challenged.status, "challenged");
assert.equal(opened.status, "open");

const settled = settle(challenged);
assert.equal(settled.status, "settled");
assert.equal(challenged.status, "challenged");
assert.throws(() => challenge(settled), /settled/);
assert.throws(() => settle(settled), /settled/);

console.log(settled.status);
